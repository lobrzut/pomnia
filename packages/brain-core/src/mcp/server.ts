// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * MCP HTTP server — the entry point clients (Claude Code, Cursor, Antigravity, …)
 * hit at `POST /mcp` with JSON-RPC 2.0 messages.
 *
 * We use the low-level `Server` class from `@modelcontextprotocol/sdk` (not the
 * high-level `McpServer` wrapper) because our tool catalog is defined as plain
 * JSON schemas — the wrapper's `registerTool` expects Zod shapes, which would
 * force us to duplicate the schemas. Registering two request handlers
 * (ListTools + CallTool) is the same amount of code and keeps `tools/index.ts`
 * as the single source of truth for tool metadata.
 *
 * Transport: `StreamableHTTPServerTransport` in **stateless** mode
 * (`sessionIdGenerator: undefined`). SDK forbids reusing a stateless transport
 * across requests ("Stateless transport cannot be reused"), so we follow the
 * official `simpleStatelessStreamableHttp` pattern: **new Server + new
 * transport per POST/GET/DELETE `/mcp`**, then close both when the response
 * ends. Shared across requests: ToolContext (db/embedder) + `/healthz` /
 * `/mcp/activity`.
 */

import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http'
import { join } from 'node:path'

import { hostname } from 'node:os'

import { BRAIN_CORE_VERSION } from '../version.js'
import {
  claimVault as claimVaultFor,
  describeOwner,
  localWriterIdentity,
  resolveVaultOwnership,
  type OwnershipVerdict,
} from '../storage/vaultOwner.js'
import { MAX_FILE_BYTES, SYNC_DIRS } from '../sync/paths.js'
import { applyFile, planSync, type ManifestEntry } from '../sync/receive.js'
import { handleAdmin, readAdminBody, sendAdmin, type AdminDeps } from '../admin/api.js'
import { readSettings } from '../admin/settings.js'
import { touchToken } from '../admin/tokens.js'
import {
  CSRF_HEADER,
  SESSION_COOKIE,
  clearCookie,
  createSessionStore,
  readCookie,
  sessionCookie,
} from '../admin/sessions.js'
import { authenticate, touchLogin } from '../admin/users.js'
import { collectHealth, redactHealth } from '../health.js'
import { indexDir } from '../rag/indexer.js'
import { renderAdminPage } from './adminPage.js'
import { renderStatusPage } from './statusPage.js'

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import type { BrainConfig } from '../config/index.js'
import { EmbedClient } from '../rag/embed.js'
import { openDb } from '../storage/db.js'
import { defaultVaultConfig, vaultConfigFromRoot, type VaultConfig } from '../storage/vault.js'
import { createAuthGate } from './auth.js'
import { callTool, listTools, type ToolContext } from './tools/index.js'

/**
 * True when an existing brain-core already holds host:port.
 *
 * The question is identity, not health. This used to require `ok === true`,
 * which was harmless while `ok` meant "listening" — now that it means "can
 * actually answer", a brain-core with an empty index would fail to be
 * recognised, and the second instance would try to bind and die on EADDRINUSE
 * instead of adopting the first. So: 503 still counts, `service` decides.
 */
async function healthzOk(host: string, port: number): Promise<boolean> {
  const url = `http://${host}:${port}/healthz`
  try {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 1_500)
    try {
      const res = await fetch(url, { signal: ac.signal })
      const body = (await res.json().catch(() => null)) as { service?: string } | null
      return body?.service === 'brain-core'
    } finally {
      clearTimeout(t)
    }
  } catch {
    return false
  }
}

export interface McpQueryEvent {
  tool: string
  detail?: string
}

export interface BrainServerOptions {
  config: BrainConfig
  onMcpQuery?: (ev: McpQueryEvent) => void
}

export interface BrainServer {
  start(): Promise<void>
  stop(): Promise<void>
  /** Live URL for logging / health checks. */
  readonly url: string
  /**
   * True when start() found EADDRINUSE but /healthz already served brain-core —
   * we adopt that listener (no second bind). Reindex IPC still works on our DB handle.
   */
  readonly adopted: boolean
  /** Update skills root at runtime (e.g. vault opened after brain start). */
  setSkillsRoot(path: string): void
  /** Update knowledge vault root at runtime (USER.md / distilled / sessions). */
  setVaultRoot(path: string): void
  /** Update Handshake proof phrase for MCP tool descriptions / profile preamble. */
  setHandshake(opts: { phrase: string; enabled: boolean }): void
  /** Update auto-checkpoint setting (Settings → autoCheckpointEnabled). */
  setAutoCheckpoint(enabled: boolean): void
}

/**
 * Assemble a `BrainServer`. Nothing binds/opens until you call `.start()` — so
 * this is safe to call from Pomnia's Electron main and the standalone daemon
 * without spending resources up front.
 */
const MCP_QUERY_TOOLS = new Set([
  'search_library',
  'get_skill',
  'run_skill',
  'list_skills',
  'list_cli_skills',
])

function mcpQueryDetail(tool: string, args: unknown): string | undefined {
  if (tool === 'search_library' && args && typeof args === 'object' && 'query' in args) {
    const q = String((args as { query: unknown }).query).trim()
    if (q) return q.length > 48 ? `${q.slice(0, 47)}…` : q
  }
  if (tool === 'get_skill' && args && typeof args === 'object' && 'name' in args) {
    const n = String((args as { name: unknown }).name).trim()
    if (n) return n.length > 48 ? `${n.slice(0, 47)}…` : n
  }
  return tool
}

let lastMcpActivity: { tool: string; detail?: string; ts: number } | null = null

function recordMcpActivity(ev: McpQueryEvent): void {
  lastMcpActivity = { tool: ev.tool, detail: ev.detail, ts: Date.now() }
}

export function getMcpActivitySnapshot(): { last: typeof lastMcpActivity; recent: boolean } {
  const recent = lastMcpActivity != null && Date.now() - lastMcpActivity.ts < 10_000
  return { last: lastMcpActivity, recent }
}

/** Build a fresh MCP Server wired to shared ToolContext (stateless per-request). */
function createMcpServer(
  ctx: ToolContext,
  onMcpQuery?: (ev: McpQueryEvent) => void,
): Server {
  const mcp = new Server(
    { name: 'brain-core', version: BRAIN_CORE_VERSION },
    { capabilities: { tools: {} } },
  )

  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools(ctx) }))

  mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
    const toolName = req.params.name
    const toolArgs = req.params.arguments ?? {}
    if (MCP_QUERY_TOOLS.has(toolName)) {
      const ev = { tool: toolName, detail: mcpQueryDetail(toolName, toolArgs) }
      recordMcpActivity(ev)
      onMcpQuery?.(ev)
    }
    try {
      const text = await callTool(toolName, toolArgs, ctx)
      return { content: [{ type: 'text', text }] }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text', text: `error: ${msg}` }],
        isError: true,
      }
    }
  })

  return mcp
}

export async function createBrainServer(
  config: BrainConfig,
  opts?: Pick<BrainServerOptions, 'onMcpQuery'>,
): Promise<BrainServer> {
  const resolveVault = (): VaultConfig =>
    config.vaultRoot?.trim()
      ? vaultConfigFromRoot(config.vaultRoot.trim())
      : defaultVaultConfig(config.dataDir)
  const resolveSkillsRoot = (vault: VaultConfig): string =>
    config.skillsRoot?.trim() || join(vault.root, 'skills')

  // Lazy resources — opened at start(), closed at stop().
  // MCP Server + transport are created per /mcp request (stateless SDK rule).
  let http: HttpServer | null = null
  let ctx: ToolContext | null = null
  let vaultOwnership: OwnershipVerdict | null = null
  let reindexing = false
  let startedAt = Date.now()
  const sessions = createSessionStore()
  /**
   * Failed logins per address. Separate from the bearer gate's counter: a
   * password is guessable in a way a 256-bit token is not, so this is the
   * endpoint that actually gets attacked and it gets a tighter budget.
   */
  const loginFails = new Map<string, number[]>()
  let adopted = false

  const url = `http://${config.host}:${config.port}/mcp`

  return {
    url,
    get adopted() {
      return adopted
    },

    setSkillsRoot(path: string) {
      config.skillsRoot = path
      if (ctx) ctx.skillsRoot = path
    },

    setVaultRoot(path: string) {
      config.vaultRoot = path
      const vault = vaultConfigFromRoot(path)
      if (ctx) {
        ctx.vaultRoot = vault.root
        ctx.userMdPath = vault.userProfilePath
      }
    },

    setHandshake(opts: { phrase: string; enabled: boolean }) {
      config.handshakePhrase = opts.phrase
      config.handshakeEnabled = opts.enabled
      if (ctx) {
        ctx.handshakePhrase = opts.phrase
        ctx.handshakeEnabled = opts.enabled
      }
    },

    setAutoCheckpoint(enabled: boolean) {
      config.autoCheckpointEnabled = enabled
      if (ctx) ctx.autoCheckpointEnabled = enabled
    },

    async start() {
      // Open storage + embedder first so the MCP server refuses connections
      // if either is broken (fail-fast beats accepting requests we can't serve).
      // library.db stays under dataDir (AppData) even when vaultRoot is portable.
      const vault = resolveVault()
      const db = openDb({ dbPath: `${config.dataDir}/vectordb/library.db` })

      // Saved settings win over the unit for the two fields the panel owns.
      // They are the more recent deliberate act; the unit still decides
      // everything structural, which a compromised panel therefore cannot move.
      const saved = await readSettings(config.dataDir)
      if (saved.ollamaUrl) config.ollamaUrl = saved.ollamaUrl
      if (saved.embedModel) config.embedModel = saved.embedModel

      const embedder = new EmbedClient({
        ollamaUrl: config.ollamaUrl,
        embedModel: config.embedModel,
      })
      // Who may write is decided by the vault, not by this process's flags.
      // `--read-only` still pins a replica, but an instance without it no
      // longer gets to assume it owns a corpus another instance is holding.
      const me = await localWriterIdentity(
        config.dataDir,
        config.instanceLabel ?? config.authoritativeVaultHint ?? hostname(),
      )
      const ownership = await resolveVaultOwnership({
        vaultRoot: vault.root,
        me,
        forceReadOnly: config.readOnly === true,
      })
      vaultOwnership = ownership

      ctx = {
        db,
        embedder,
        vaultRoot: vault.root,
        userMdPath: vault.userProfilePath,
        skillsRoot: resolveSkillsRoot(vault),
        handshakePhrase: config.handshakePhrase,
        handshakeEnabled: config.handshakeEnabled !== false,
        autoCheckpointEnabled: config.autoCheckpointEnabled !== false,
        readOnly: !ownership.writable,
        // Prefer the marker's own account of who holds the vault over a hint
        // someone typed into a unit file months ago — the hint is what went
        // stale last time and pointed at the wrong machine.
        authoritativeVaultHint: ownership.owner
          ? describeOwner(ownership.owner)
          : config.authoritativeVaultHint,
      }

      if (ownership.writable) {
        console.error(
          ownership.reason === 'claimed'
            ? `[brain-core] vault claimed by ${describeOwner(me)} — this instance owns writes`
            : `[brain-core] vault owner: ${describeOwner(me)} — writes enabled`,
        )
      } else {
        console.error(
          `[brain-core] READ-ONLY — save_conversation and checkpoint_session will refuse (` +
            (ownership.reason === 'read-only-flag'
              ? `--read-only${ownership.owner ? `; vault held by ${describeOwner(ownership.owner)}` : ''}`
              : `vault held by ${describeOwner(ownership.owner)}`) +
            ')',
        )
      }

      const gate = createAuthGate({
        host: config.host,
        tokensFile: config.auth.tokensFile,
        maxFailsPerMinute: config.auth.maxFailsPerMinute,
      })
      if (gate.required) {
        const n = await gate.tokenCount()
        console.error(
          n > 0
            ? `[brain-core] bearer auth ON (${n} token(s) from ${config.auth.tokensFile})`
            : `[brain-core] bearer auth ON but NO TOKENS in ${config.auth.tokensFile} — every request will be refused`,
        )
      }

      http = createServer((req: IncomingMessage, res: ServerResponse) => {
        const pathOnly = req.url?.split('?')[0] ?? ''
        // Public: systemd and Docker probe it before any token exists.
        //
        // It reports whether the server can actually answer, not merely whether
        // it is listening — a Pomnia with no embedding model or an empty index
        // used to answer here exactly like a working one, so every monitor and
        // every client badge showed green over a brain returning nothing.
        //
        // Counts and check reasons are the only things it adds, and none of
        // them is vault content. The status code carries the same verdict, so
        // a probe that reads nothing but the code still gets it right.
        if (pathOnly === '/healthz' || pathOnly === '/healthz/') {
          void (async () => {
            const health = await collectHealth({
              db: ctx?.db ?? null,
              embedder: ctx?.embedder ?? null,
              vaultRoot: ctx?.vaultRoot ?? '',
              version: BRAIN_CORE_VERSION,
              authRequired: gate.required,
              writable: vaultOwnership?.writable ?? false,
              // Same fallback the write refusal uses: a pinned replica has no
              // marker of its own, so the operator's hint is all there is, and
              // "read-only, owner unknown" helps nobody.
              vaultOwner: vaultOwnership?.owner
                ? describeOwner(vaultOwnership.owner)
                : (ctx?.authoritativeVaultHint ?? null),
              startedAt,
            })
            // The verdict is public — a monitor has to be able to see a broken
            // server. The reasons are not: they name the vault path, the Ollama
            // URL and the model, and the counts say how much is in there.
            const authed = await gate.peek(req)
            res.statusCode = health.ok ? 200 : 503
            res.setHeader('content-type', 'application/json')
            res.setHeader('cache-control', 'no-store')
            res.end(JSON.stringify(authed ? health : redactHealth(health)))
          })().catch((e: unknown) => {
            // The health check itself failing is a health answer.
            if (!res.headersSent) {
              res.statusCode = 503
              res.setHeader('content-type', 'application/json')
              res.end(
                JSON.stringify({
                  ok: false,
                  service: 'brain-core',
                  status: 'down',
                  error: (e as Error).message,
                }),
              )
            }
          })
          return
        }
        // The panel itself is a static page and carries no data: everything it
        // shows comes from /admin/* calls that need an admin token. Serving the
        // shell unauthenticated means a wrong token shows a login, not a 401
        // page nobody can act on.
        if (pathOnly === '/admin' || pathOnly === '/admin/') {
          const host = req.headers.host ?? `${config.host}:${config.port}`
          const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim()
          res.statusCode = 200
          res.setHeader('content-type', 'text/html; charset=utf-8')
          res.setHeader(
            'content-security-policy',
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
              "connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          )
          // Clickjacking: a panel with a "claim the vault" button must not be
          // frameable, and frame-ancestors above is ignored by older browsers.
          res.setHeader('x-frame-options', 'DENY')
          res.setHeader('referrer-policy', 'no-referrer')
          res.setHeader('x-content-type-options', 'nosniff')
          res.setHeader('cache-control', 'no-store')
          res.end(renderAdminPage(`${proto === 'https' ? 'https' : 'http'}://${host}`))
          return
        }
        // A human typing the address gets a page instead of `not_found`.
        // Exact paths only: `/.well-known/*` and `/register` must keep their
        // 404 (see below), and a prefix match would swallow them.
        if (pathOnly === '/' || pathOnly === '/index.html') {
          const host = req.headers.host ?? `${config.host}:${config.port}`
          const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim()
          void (async () => {
            const health = await collectHealth({
              db: ctx?.db ?? null,
              embedder: ctx?.embedder ?? null,
              vaultRoot: ctx?.vaultRoot ?? '',
              version: BRAIN_CORE_VERSION,
              authRequired: gate.required,
              writable: vaultOwnership?.writable ?? false,
              vaultOwner: vaultOwnership?.owner
                ? describeOwner(vaultOwnership.owner)
                : (ctx?.authoritativeVaultHint ?? null),
              startedAt,
            })
            // Per-check reasons name paths and models, so they follow the same
            // rule as every other detail: behind the token. The overall verdict
            // does not — a red dot tells an operator to look, and telling
            // nobody that the server is broken helps nobody.
            // peek, not check: a page view is not an auth attempt, and routing
            // it through the counting path would let ordinary visits burn the
            // rate-limit budget and lock the agents out.
            const authed = await gate.peek(req)
            res.statusCode = 200
            res.setHeader('content-type', 'text/html; charset=utf-8')
            // Everything is inline; the CSP says so, so a future edit that
            // reaches for a CDN font breaks visibly instead of phoning out.
            res.setHeader(
              'content-security-policy',
              "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
            )
            res.setHeader('referrer-policy', 'no-referrer')
            res.setHeader('x-content-type-options', 'nosniff')
            res.setHeader('cache-control', 'no-store')
            res.end(
              renderStatusPage({
                version: BRAIN_CORE_VERSION,
                authRequired: gate.required,
                origin: `${proto === 'https' ? 'https' : 'http'}://${host}`,
                state: health.status,
                writable: health.writable,
                vaultOwner: health.vaultOwner,
                uptimeSec: health.uptimeSec,
                ...(authed
                  ? {
                      index: health.index,
                      checks: [
                        { name: 'Database', ...health.checks.db },
                        { name: 'Index', ...health.checks.index },
                        { name: 'Vault', ...health.checks.vault },
                        { name: 'Embeddings (Ollama)', ...health.checks.ollama },
                      ],
                    }
                  : {}),
              }),
            )
          })().catch(() => {
            if (!res.headersSent) {
              res.statusCode = 500
              res.end('status page failed')
            }
          })
          return
        }
        // All MCP traffic goes through POST/GET/DELETE on `/mcp`. Anything
        // else gets a 404 — matches Python mcp-proxy behavior + means
        // `/register` / `/.well-known/*` OAuth discovery probes get a proper
        // 404 instead of stalling. See project memory desktop-mcp-remote-fix.
        const isSync =
          pathOnly === '/sync/plan' || pathOnly === '/sync/file' || pathOnly === '/sync/reindex'
        const isAdmin = pathOnly.startsWith('/admin/')
        if (!req.url?.startsWith('/mcp') && !isSync && !isAdmin) {
          res.statusCode = 404
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'not_found', hint: 'MCP endpoint is at /mcp' }))
          return
        }

        void (async () => {
          // The panel authenticates with a session cookie, so its requests
          // carry no Authorization header and would 401 at the bearer gate.
          // Handled first; the bearer path below still works for scripts and
          // for Pomnia Desktop driving the same API.
          if (isAdmin && (await serveAdminSession(pathOnly, req, res))) return

          // Gate everything under /mcp, activity included — that endpoint
          // echoes the last query text, which is vault content. /sync/* is
          // gated by the same token: it writes to the vault. /admin/* needs
          // more than that — an agent token must not be able to repoint the
          // embedder, mint itself credentials, or take the vault.
          const auth = await gate.check(req, isAdmin ? 'admin' : undefined)
          if (!auth.ok) {
            res.statusCode =
              auth.reason === 'rate_limited' ? 429 : auth.reason === 'forbidden' ? 403 : 401
            res.setHeader('content-type', 'application/json')
            if (auth.reason !== 'forbidden') {
              res.setHeader('www-authenticate', 'Bearer realm="brain-mcp"')
            }
            if (auth.retryAfterSec) res.setHeader('retry-after', String(auth.retryAfterSec))
            res.end(
              JSON.stringify(
                auth.reason === 'forbidden'
                  ? {
                      error: 'forbidden',
                      // The credential is real and the scope is wrong; telling
                      // them to try another token sends them hunting for a
                      // problem that is not there.
                      hint: 'this endpoint needs an admin token — `brain-core --add-token <name> --role admin`',
                    }
                  : {
                      error: auth.reason === 'rate_limited' ? 'rate_limited' : 'unauthorized',
                      hint: 'set Authorization: Bearer <token> header',
                    },
              ),
            )
            return
          }

          if (auth.name && auth.name !== 'loopback') {
            // Best-effort "last seen", so the panel can show which clients are
            // still alive. Never allowed to fail a request.
            void touchToken(config.auth.tokensFile, auth.name).catch(() => {})
          }

          if (isAdmin) {
            const body = await readAdminBody(req).catch(() => undefined)
            if (body === undefined) {
              sendAdmin(res, { status: 400, body: { error: 'bad_body' } })
              return
            }
            sendAdmin(
              res,
              await handleAdmin(
                { method: req.method ?? 'GET', path: pathOnly, body, actor: auth.name ?? '?' },
                adminDeps(),
              ),
            )
            return
          }

          if (isSync) {
            await serveSync(pathOnly, req, res)
            return
          }

          if (pathOnly === '/mcp/activity' || pathOnly === '/mcp/activity/') {
            res.statusCode = 200
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(getMcpActivitySnapshot()))
            return
          }
          if (!ctx) {
            res.statusCode = 503
            res.end('mcp not ready')
            return
          }
          await serveMcp(req, res)
        })().catch((err: unknown) => {
          console.error('[brain-core] request error:', err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.end('internal error')
          }
        })
      })

      /**
       * Rebuild the index in the background. Refuses to stack, so a double
       * click or a sync racing the panel costs nothing.
       */
      function startReindex(): { started: boolean; reason?: string } {
        if (reindexing) return { started: false, reason: 'already running' }
        if (!ctx) return { started: false, reason: 'server not started' }
        reindexing = true
        void (async () => {
          const t0 = Date.now()
          try {
            const stats = await indexDir(ctx!.db, ctx!.embedder, ctx!.vaultRoot)
            console.error(
              `[brain-core] reindex: ${stats.files} re-embedded, ${stats.chunks} chunk(s), ` +
                `${stats.skipped} unchanged, ${stats.prunedFiles} pruned in ` +
                `${((Date.now() - t0) / 1000).toFixed(1)}s`,
            )
          } catch (e) {
            console.error(`[brain-core] reindex failed: ${(e as Error).message}`)
          } finally {
            reindexing = false
          }
        })()
        return { started: true }
      }

      /**
       * Password login for the panel, and everything that hangs off a session.
       *
       * Returns true when it has answered the request; false means "not mine,
       * fall through to the bearer gate". Both credentials reach the same API
       * on purpose — a browser gets a session, a script keeps its token.
       */
      async function serveAdminSession(
        path: string,
        req: IncomingMessage,
        res: ServerResponse,
      ): Promise<boolean> {
        const isHttps = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https'
        const clientKey = (): string => {
          const fwd = req.headers['x-forwarded-for']
          const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]
          return (first?.trim() || req.socket.remoteAddress || 'unknown').toLowerCase()
        }

        if (path === '/admin/login') {
          if (req.method !== 'POST') {
            sendAdmin(res, { status: 405, body: { error: 'method_not_allowed' } })
            return true
          }
          // A password is guessable in a way a 256-bit token is not, so this
          // gets its own, tighter budget rather than sharing the bearer one.
          const key = clientKey()
          const t = Date.now()
          const win = (loginFails.get(key) ?? []).filter((ts) => t - ts < 15 * 60_000)
          if (win.length >= 10) {
            res.setHeader('retry-after', '900')
            sendAdmin(res, {
              status: 429,
              body: { error: 'rate_limited', detail: 'Za dużo prób. Spróbuj za kwadrans.' },
            })
            return true
          }

          const body = (await readAdminBody(req).catch(() => null)) as {
            username?: unknown
            password?: unknown
          } | null
          const r = await authenticate(
            config.dataDir,
            String(body?.username ?? ''),
            String(body?.password ?? ''),
          )
          if (!r.ok || r.user.role !== 'admin') {
            win.push(t)
            loginFails.set(key, win)
            console.error(`[brain-core] failed panel login from ${key}`)
            // One message for both cases: naming which half was wrong turns a
            // login form into an account enumerator.
            sendAdmin(res, {
              status: 401,
              body: { error: 'bad_credentials', detail: 'Nieprawidłowy login lub hasło.' },
            })
            return true
          }

          loginFails.delete(key)
          const s = sessions.create(r.user.username, r.user.role)
          void touchLogin(config.dataDir, r.user.username).catch(() => {})
          console.error(`[brain-core] panel login: ${r.user.username} from ${key}`)
          res.setHeader('set-cookie', sessionCookie(s.id, isHttps))
          // The CSRF token goes in the body, never in a cookie: the whole point
          // is that a cross-site page cannot read it.
          sendAdmin(res, {
            status: 200,
            body: { ok: true, username: r.user.username, role: r.user.role, csrf: s.csrf },
          })
          return true
        }

        const sid = readCookie(req.headers.cookie, SESSION_COOKIE)
        const session = sessions.get(sid)

        if (path === '/admin/logout') {
          sessions.destroy(sid)
          res.setHeader('set-cookie', clearCookie(isHttps))
          sendAdmin(res, { status: 200, body: { ok: true } })
          return true
        }

        if (path === '/admin/me') {
          sendAdmin(
            res,
            session
              ? { status: 200, body: { username: session.username, role: session.role, csrf: session.csrf } }
              : { status: 401, body: { error: 'no_session' } },
          )
          return true
        }

        if (!session) return false // no session — let the bearer gate try

        // SameSite=Strict already stops a cross-site POST in every browser that
        // matters; this covers the same-site-but-untrusted case and costs one
        // header. Reads are exempt: they change nothing.
        const mutating = req.method !== 'GET' && req.method !== 'HEAD'
        if (mutating && !sessions.checkCsrf(session, req.headers[CSRF_HEADER] as string | undefined)) {
          sendAdmin(res, {
            status: 403,
            body: { error: 'csrf', detail: 'Brak lub zły token CSRF — odśwież panel i zaloguj się ponownie.' },
          })
          return true
        }

        const body = await readAdminBody(req).catch(() => undefined)
        if (body === undefined) {
          sendAdmin(res, { status: 400, body: { error: 'bad_body' } })
          return true
        }
        sendAdmin(
          res,
          await handleAdmin(
            { method: req.method ?? 'GET', path, body, actor: session.username },
            adminDeps(),
          ),
        )
        return true
      }

      /**
       * Everything the admin surface is allowed to touch, in one place.
       *
       * A factory rather than an object literal built once: `ctx` and
       * `vaultOwnership` are reassigned at start(), and a captured snapshot
       * would keep answering with the state the server had at boot.
       */
      function adminDeps(): AdminDeps {
        return {
          dataDir: config.dataDir,
          tokensFile: config.auth.tokensFile,
          runtime: {
            get: () => ({
              handshakePhrase: config.handshakePhrase ?? 'OK to Go Go Go',
              handshakeEnabled: config.handshakeEnabled !== false,
              autoCheckpointEnabled: config.autoCheckpointEnabled !== false,
              instanceLabel: config.instanceLabel ?? hostname(),
            }),
            set(next) {
              if (next.handshakePhrase !== undefined) config.handshakePhrase = next.handshakePhrase
              if (next.handshakeEnabled !== undefined) config.handshakeEnabled = next.handshakeEnabled
              if (next.autoCheckpointEnabled !== undefined) {
                config.autoCheckpointEnabled = next.autoCheckpointEnabled
              }
              if (next.instanceLabel !== undefined) config.instanceLabel = next.instanceLabel
              // ToolContext feeds the tool descriptions agents read, so a change
              // that stops at `config` would look applied and do nothing.
              if (ctx) {
                if (next.handshakePhrase !== undefined) ctx.handshakePhrase = next.handshakePhrase
                if (next.handshakeEnabled !== undefined) ctx.handshakeEnabled = next.handshakeEnabled
                if (next.autoCheckpointEnabled !== undefined) {
                  ctx.autoCheckpointEnabled = next.autoCheckpointEnabled
                }
              }
            },
          },
          dropSessionsFor: (username) => sessions.destroyUser(username),
          applyOllama(next) {
            if (next.ollamaUrl) config.ollamaUrl = next.ollamaUrl
            if (next.embedModel) config.embedModel = next.embedModel
            ctx?.embedder.reconfigure(next)
          },
          currentOllama: () => ({ ollamaUrl: config.ollamaUrl, embedModel: config.embedModel }),
          async claimVault() {
            const me = await localWriterIdentity(
              config.dataDir,
              config.instanceLabel ?? hostname(),
            )
            const r = await claimVaultFor({ vaultRoot: ctx!.vaultRoot, me })
            vaultOwnership = { writable: true, reason: 'claimed', owner: r.owner }
            if (ctx) {
              ctx.readOnly = false
              ctx.authoritativeVaultHint = describeOwner(r.owner)
            }
            return {
              previous: r.previous ? describeOwner(r.previous) : null,
              owner: describeOwner(r.owner),
            }
          },
          startReindex: () => startReindex(),
          vaultState: () => ({
            writable: vaultOwnership?.writable ?? false,
            // Same fallback /healthz and the write refusal use: a pinned
            // replica has no marker of its own, so the operator's hint is all
            // there is, and showing "—" for the owner helps nobody.
            owner: vaultOwnership?.owner
              ? describeOwner(vaultOwnership.owner)
              : (ctx?.authoritativeVaultHint ?? null),
            readOnlyFlag: config.readOnly === true,
          }),
        }
      }

      /** Read a bounded JSON body. Anything larger is refused, not buffered. */
      async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
        const chunks: Buffer[] = []
        let total = 0
        for await (const c of req) {
          total += (c as Buffer).length
          if (total > limit) throw new Error(`body exceeds ${limit} bytes`)
          chunks.push(c as Buffer)
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'))
      }

      /**
       * Replication intake.
       *
       * Only a replica accepts a push. The instance that owns the vault must
       * never be writable over the network — otherwise a misconfigured peer
       * could overwrite the corpus everything else replicates *from*, which is
       * the one file set with no other copy.
       */
      async function serveSync(
        path: string,
        req: IncomingMessage,
        res: ServerResponse,
      ): Promise<void> {
        const json = (code: number, body: unknown): void => {
          res.statusCode = code
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
        if (vaultOwnership?.writable) {
          return json(409, {
            error: 'not_a_replica',
            hint: 'This instance owns the vault; replication only writes to replicas.',
          })
        }
        try {
          if (path === '/sync/reindex') {
            // Files a replica has but never indexed are files no agent can
            // find — the sync would report success over an unchanged search.
            if (reindexing) return json(200, { started: false, reason: 'already running' })
            reindexing = true
            void (async () => {
              const t0 = Date.now()
              try {
                const stats = await indexDir(ctx!.db, ctx!.embedder, ctx!.vaultRoot)
                console.error(
                  `[brain-core] post-sync reindex: ${stats.files} re-embedded, ` +
                    `${stats.chunks} chunk(s), ${stats.skipped} unchanged, ` +
                    `${stats.prunedFiles} pruned in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
                )
              } catch (e) {
                console.error(`[brain-core] post-sync reindex failed: ${(e as Error).message}`)
              } finally {
                reindexing = false
              }
            })()
            return json(202, { started: true })
          }
          if (path === '/sync/plan') {
            const body = (await readJsonBody(req, 32 * 1024 * 1024)) as {
              manifest?: ManifestEntry[]
              reportExtras?: boolean
            }
            if (!Array.isArray(body?.manifest)) return json(400, { error: 'manifest_required' })
            const plan = await planSync({
              vaultRoot: ctx!.vaultRoot,
              manifest: body.manifest,
              scanDirs: body.reportExtras ? SYNC_DIRS : undefined,
            })
            return json(200, plan)
          }
          // /sync/file
          const body = (await readJsonBody(req, MAX_FILE_BYTES * 2)) as {
            path?: string
            sha256?: string
            contentBase64?: string
          }
          if (!body?.path || !body?.sha256 || typeof body.contentBase64 !== 'string') {
            return json(400, { error: 'path_sha256_content_required' })
          }
          const result = await applyFile({
            vaultRoot: ctx!.vaultRoot,
            path: body.path,
            content: Buffer.from(body.contentBase64, 'base64'),
            sha256: body.sha256,
          })
          return json(result.ok ? 200 : 400, result)
        } catch (e) {
          return json(400, { error: 'bad_request', detail: (e as Error).message })
        }
      }

      /**
       * Per-request Server + transport (SDK simpleStatelessStreamableHttp).
       * Fresh Server+transport each request avoids header/session reuse bugs
       * ("headers already sent" / "Stateless transport cannot be reused").
       * Extracted from the handler so the auth path can await it.
       */
      async function serveMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const mcp = createMcpServer(ctx!, opts?.onMcpQuery)
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        })
        await mcp.connect(transport)

        const cleanup = (): void => {
          void transport.close().catch(() => {})
          void mcp.close().catch(() => {})
        }
        res.on('close', cleanup)

        try {
          await transport.handleRequest(req, res)
        } catch (err) {
          console.error('[brain-core] transport error:', err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.end('internal error')
          }
        }
      }

      try {
        await new Promise<void>((resolve, reject) => {
          const onErr = (err: NodeJS.ErrnoException): void => {
            http?.off('listening', onListening)
            reject(err)
          }
          const onListening = (): void => {
            http?.off('error', onErr)
            resolve()
          }
          http?.once('error', onErr)
          http?.once('listening', onListening)
          http?.listen(config.port, config.host)
        })
      } catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? String((err as NodeJS.ErrnoException).code) : ''
        if (code === 'EADDRINUSE' && (await healthzOk(config.host, config.port))) {
          // Orphan / previous instance already healthy — adopt instead of failing.
          console.warn(
            `[brain-core] port ${config.port} in use; adopting existing brain-core at ${url}`,
          )
          http?.removeAllListeners()
          http?.close()
          http = null
          adopted = true
          return
        }
        // Bind failed and nothing healthy to adopt — tear down db before rethrow.
        if (ctx?.db) {
          try {
            ctx.db.close()
          } catch {
            /* ignore */
          }
        }
        ctx = null
        http?.removeAllListeners()
        http?.close()
        http = null
        throw err
      }
    },

    async stop() {
      // Order matters: close inbound (http) first so no new requests land while
      // we're tearing down the db. When adopted, we do not own the listener.
      if (http) {
        const srv = http
        http = null
        // Keep-alive / MCP clients can make close() hang forever — drop them.
        const withAll = srv as typeof srv & { closeAllConnections?: () => void }
        try {
          withAll.closeAllConnections?.()
        } catch {
          /* ignore */
        }
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 2_000)
          srv.close(() => {
            clearTimeout(t)
            resolve()
          })
        })
      }
      if (ctx?.db) {
        ctx.db.close()
      }
      ctx = null
      adopted = false
    },
  }
}
