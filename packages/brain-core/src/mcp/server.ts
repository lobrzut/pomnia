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

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import type { BrainConfig } from '../config/index.js'
import { EmbedClient } from '../rag/embed.js'
import { openDb } from '../storage/db.js'
import { defaultVaultConfig } from '../storage/vault.js'
import { callTool, listTools, type ToolContext } from './tools/index.js'

/** True when an existing brain-core already answers /healthz on host:port. */
async function healthzOk(host: string, port: number): Promise<boolean> {
  const url = `http://${host}:${port}/healthz`
  try {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 1_500)
    try {
      const res = await fetch(url, { signal: ac.signal })
      if (!res.ok) return false
      const body = (await res.json()) as { ok?: boolean; service?: string }
      return body?.ok === true && body?.service === 'brain-core'
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
    { name: 'brain-core', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools() }))

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
  const vault = defaultVaultConfig(config.dataDir)
  const resolveSkillsRoot = (): string =>
    config.skillsRoot?.trim() || join(vault.root, 'skills')

  // Lazy resources — opened at start(), closed at stop().
  // MCP Server + transport are created per /mcp request (stateless SDK rule).
  let http: HttpServer | null = null
  let ctx: ToolContext | null = null
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

    async start() {
      // Open storage + embedder first so the MCP server refuses connections
      // if either is broken (fail-fast beats accepting requests we can't serve).
      const db = openDb({ dbPath: `${config.dataDir}/vectordb/library.db` })
      const embedder = new EmbedClient({
        ollamaUrl: config.ollamaUrl,
        embedModel: config.embedModel,
      })
      ctx = {
        db,
        embedder,
        vaultRoot: vault.root,
        userMdPath: vault.userProfilePath,
        skillsRoot: resolveSkillsRoot(),
      }

      http = createServer((req: IncomingMessage, res: ServerResponse) => {
        const pathOnly = req.url?.split('?')[0] ?? ''
        if (pathOnly === '/healthz' || pathOnly === '/healthz/') {
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: true, service: 'brain-core' }))
          return
        }
        if (pathOnly === '/mcp/activity' || pathOnly === '/mcp/activity/') {
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(getMcpActivitySnapshot()))
          return
        }
        // All MCP traffic goes through POST/GET/DELETE on `/mcp`. Anything
        // else gets a 404 — matches Python mcp-proxy behavior + means
        // `/register` / `/.well-known/*` OAuth discovery probes get a proper
        // 404 instead of stalling. See project memory desktop-mcp-remote-fix.
        if (!req.url?.startsWith('/mcp')) {
          res.statusCode = 404
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'not_found', hint: 'MCP endpoint is at /mcp' }))
          return
        }
        if (!ctx) {
          res.statusCode = 503
          res.end('mcp not ready')
          return
        }

        // Per-request Server + transport (SDK simpleStatelessStreamableHttp).
        // Fresh Server+transport each request avoids header/session reuse bugs
        // ("headers already sent" / "Stateless transport cannot be reused").
        void (async () => {
          const mcp = createMcpServer(ctx!, opts?.onMcpQuery)
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
          })
          await mcp.connect(transport)

          const cleanup = () => {
            void transport.close().catch(() => {})
            void mcp.close().catch(() => {})
          }
          res.on('close', cleanup)

          await transport.handleRequest(req, res)
        })().catch((err: unknown) => {
          console.error('[brain-core] transport error:', err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.end('internal error')
          }
        })
      })

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
        await new Promise<void>((resolve) => http?.close(() => resolve()))
        http = null
      }
      if (ctx?.db) {
        ctx.db.close()
      }
      ctx = null
      adopted = false
    },
  }
}
