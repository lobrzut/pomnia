// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Pomnia MCP "is it wired?" diagnostic.
 *
 * Walks each known MCP client (from snippet.ts CLIENTS), reads its config
 * file if present, and reports whether `pomnia` is configured (brain-core
 * single `/mcp`) or the legacy trio (`pomnia` + vault + library). Accepts
 * legacy `brain-rag` keys. No writes, no auto-fix.
 *
 * Companion to snippet.ts: snippet generates the config to paste, status
 * confirms the paste landed.
 */
import { promises as fs } from 'node:fs'
import {
  CLIENTS,
  MCP_LEGACY_RAG_KEY,
  MCP_POMNIA_KEY,
  MCP_POMNIA_LIBRARY_KEY,
  MCP_POMNIA_VAULT_KEY,
  type ClientId,
  type ClientSpec,
} from './snippet.js'
import { dashboardUrlFromBrainUrl } from './deploy.js'
import { urlsPointAtSameBrain } from './mcpUrl.js'

/**
 * `wired` means the config points at Pomnia — NOT that anything answers there.
 * `unreachable` is the config-is-right-but-nobody-home case: it is what a
 * machine move looks like, and reporting it as `wired` is how three clients
 * spent a session pointing at a brain host that no longer existed.
 */
export type WiredState = 'wired' | 'unreachable' | 'partial' | 'not_wired' | 'not_installed' | 'config_error'

/** Canonical keys written by new snippets. */
const POMNIA_KEYS = [MCP_POMNIA_KEY, MCP_POMNIA_VAULT_KEY, MCP_POMNIA_LIBRARY_KEY] as const

export interface ClientStatus {
  id: ClientId
  label: string
  configPath: string
  configExists: boolean
  state: WiredState
  /** Per-server status (canonical pomnia* keys; legacy aliases folded into present). */
  servers: Array<{
    key: (typeof POMNIA_KEYS)[number]
    present: boolean
    url?: string
    transport?: string
    hasToken?: boolean
  }>
  /** Issues found (missing keys, parse error, wrong shape, host not answering). */
  issues: string[]
  /** Present only when the caller asked for a reachability probe. */
  probe?: McpProbe
}

export interface BrainPing {
  url: string
  reachable: boolean
  status?: number
  data?: Record<string, unknown>
  error?: string
}

export interface McpProbe {
  url: string
  /** The host answered. A 401/404/405 still counts — something is listening. */
  reachable: boolean
  status?: number
  /** It answered as an MCP server (JSON-RPC `initialize` came back). */
  speaksMcp?: boolean
  error?: string
}

/**
 * Ask the URL a client is configured with whether anything is actually there.
 *
 * Deliberately POSTs `initialize` rather than probing /healthz: this is the
 * exact request the agent will make, so a pass here means the agent will
 * connect. A transport error (DNS, refused, timeout) is the interesting case —
 * that is a host that went away, which no amount of config reading can detect.
 */
export async function probeMcpUrl(url: string, token?: string, timeoutMs = 4_000): Promise<McpProbe> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'pomnia-status-probe', version: '1' },
    },
  })
  try {
    const r = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) })
    const text = await r.text().catch(() => '')
    return {
      url,
      reachable: true,
      status: r.status,
      speaksMcp: r.ok && /"result"|"protocolVersion"/.test(text),
    }
  } catch (e) {
    return { url, reachable: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface McpActivityRecord {
  tool: string
  detail?: string
  ts: number
}

export interface McpActivityResponse {
  last: McpActivityRecord | null
  recent: boolean
}

/** Detect a single server's URL across the various shapes clients use. */
function pickUrl(srv: any): { url?: string; transport?: string; hasToken?: boolean; token?: string } {
  if (!srv || typeof srv !== 'object') return {}
  const out: { url?: string; transport?: string; hasToken?: boolean; token?: string } = {}
  if (typeof srv.type === 'string') out.transport = srv.type
  if (typeof srv.url === 'string') out.url = srv.url
  else if (typeof srv.serverUrl === 'string') out.url = srv.serverUrl
  else if (
    typeof srv.command === 'string' &&
    /^npx(\.cmd)?$/i.test(srv.command.split(/[\\/]/).pop() || '') &&
    Array.isArray(srv.args)
  ) {
    const arg = srv.args.find((a: unknown) => typeof a === 'string' && /^https?:\/\//.test(a))
    if (arg) {
      out.url = arg as string
      out.transport = 'mcp-remote (stdio→http)'
    }
  }
  // The token this client would actually send.
  //
  // Read rather than merely detected, because the status probe used to test
  // each client's URL with *this app's* token. A client carrying a revoked one
  // therefore probed green: Pomnia substituted a working token and reported
  // that the config was fine. That is how a Claude Desktop entry answering 401
  // sat here looking connected.
  //
  // Three shapes, and the third is ours. 0.1.71 moved Windows entries to
  // `--header Authorization:${AUTH_HEADER}` with the value in `env`, because
  // cmd.exe splits `Authorization: Bearer …` on its space and sends an empty
  // header. Neither pattern below matched that, so the shape this app writes
  // itself was reported as having no token at all.
  const bearer = (v: unknown): string | undefined =>
    typeof v === 'string' && /^Bearer\s+\S/.test(v) ? v.replace(/^Bearer\s+/, '') : undefined

  if (srv.headers && typeof srv.headers === 'object') {
    out.token = bearer((srv.headers as Record<string, unknown>)['Authorization'])
  }
  if (!out.token && Array.isArray(srv.args)) {
    const i = srv.args.indexOf('--header')
    const arg = i >= 0 ? srv.args[i + 1] : undefined
    if (typeof arg === 'string') {
      out.token = bearer(arg.replace(/^Authorization:\s*/, ''))
      if (!out.token) {
        // `Authorization:${AUTH_HEADER}` -- the value lives in env.
        const m = /^Authorization:\s*\$\{(\w+)\}$/.exec(arg)
        const envVal = m && srv.env && typeof srv.env === 'object'
          ? (srv.env as Record<string, unknown>)[m[1]]
          : undefined
        out.token = bearer(envVal)
      }
    }
  }
  if (out.token) out.hasToken = true
  return out
}

/** Test seam: the token-reading rules above are the whole point of the check. */
export const __testPickUrl = pickUrl

function pickServer(
  mcp: Record<string, unknown>,
  canonical: string,
  legacy: string,
): { present: boolean; url?: string; transport?: string; hasToken?: boolean; token?: string } {
  const srv = mcp[canonical] ?? mcp[legacy]
  if (!srv) return { present: false }
  return { present: true, ...pickUrl(srv) }
}

async function readJson(p: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(p, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** Status for one client. Pure I/O, no exceptions thrown. */
export async function checkClient(spec: ClientSpec, opts?: CheckClientOptions): Promise<ClientStatus> {
  const targetOS = (process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux') as
    | 'win32'
    | 'darwin'
    | 'linux'
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const configPath = spec.configPath(targetOS, home)
  const configExists = await exists(configPath)

  if (!configExists) {
    return {
      id: spec.id,
      label: spec.label,
      configPath,
      configExists: false,
      state: 'not_wired',
      servers: POMNIA_KEYS.map((k) => ({ key: k, present: false })),
      issues: ['config file does not exist'],
    }
  }

  const data = await readJson(configPath)
  if (!data || typeof data !== 'object') {
    return {
      id: spec.id,
      label: spec.label,
      configPath,
      configExists: true,
      state: 'config_error',
      servers: POMNIA_KEYS.map((k) => ({ key: k, present: false })),
      issues: ['could not parse config file as JSON'],
    }
  }
  const root = data as Record<string, unknown>
  const mcp = (root[spec.mcpKey] as Record<string, unknown> | undefined) ?? {}
  if (typeof mcp !== 'object') {
    return {
      id: spec.id,
      label: spec.label,
      configPath,
      configExists: true,
      state: 'config_error',
      servers: POMNIA_KEYS.map((k) => ({ key: k, present: false })),
      issues: [`expected object at "${spec.mcpKey}"`],
    }
  }

  const servers = [
    { key: MCP_POMNIA_KEY as typeof MCP_POMNIA_KEY, ...pickServer(mcp, MCP_POMNIA_KEY, MCP_LEGACY_RAG_KEY) },
    {
      key: MCP_POMNIA_VAULT_KEY as typeof MCP_POMNIA_VAULT_KEY,
      ...pickServer(mcp, MCP_POMNIA_VAULT_KEY, 'brain-vault'),
    },
    {
      key: MCP_POMNIA_LIBRARY_KEY as typeof MCP_POMNIA_LIBRARY_KEY,
      ...pickServer(mcp, MCP_POMNIA_LIBRARY_KEY, 'brain-library'),
    },
  ]
  const present = servers.filter((s) => s.present).length
  const rag = servers.find((s) => s.key === MCP_POMNIA_KEY)
  // brain-core (embedded or remote): single `pomnia` → `/mcp` is complete.
  // Legacy Python hub: all three keys required.
  const brainCoreComplete =
    rag?.present && !!rag.url && rag.url.includes('/mcp')
  const legacyHubComplete = present === POMNIA_KEYS.length
  const complete = brainCoreComplete || legacyHubComplete
  let state: WiredState = complete
    ? 'wired'
    : present === 0
      ? 'not_wired'
      : 'partial'

  const issues: string[] = []
  for (const s of servers) {
    if (s.present && !s.url) issues.push(`${s.key}: no URL detected (config shape unknown)`)
    if (!brainCoreComplete && !s.present) issues.push(`${s.key}: missing`)
  }
  if (!brainCoreComplete && present > 0 && present < POMNIA_KEYS.length) {
    issues.unshift(
      'incomplete: brain-core needs pomnia → /mcp; legacy hub needs pomnia + pomnia-vault + pomnia-library',
    )
  }

  // A host that still answers is not "this app" if mcp.json points elsewhere
  // (stale LAN 192.168.1.201 while embedded Brain is 127.0.0.1:7862).
  if (opts?.expectedBaseUrl && rag?.present && rag.url && !urlsPointAtSameBrain(rag.url, opts.expectedBaseUrl)) {
    state = 'unreachable'
    issues.unshift(
      `${rag.url} is not this app's Brain (expected ${opts.expectedBaseUrl.replace(/\/+$/, '')})`,
    )
  }

  // Reading the file only proves the paste landed. Asking the URL proves the
  // agent will get an answer — the two diverge the moment a machine or network
  // changes, and that gap is invisible to every check above.
  let probe: McpProbe | undefined
  if (opts?.probe && rag?.present && rag.url) {
    // This client's own token, not ours.
    //
    // Probing every config with the app's working token answers a question
    // nobody asked: whether the server is up. What matters is whether *this
    // client* can reach it, and a config carrying a revoked token would report
    // connected right up until the agent tried to use it. Falling back to the
    // app's token only when the config has none keeps an unauthenticated local
    // brain probing as before.
    probe = await probeMcpUrl(rag.url, rag.token ?? opts.token, opts.probeTimeoutMs)
    // Not `!reachable`: a 401 means something answered, so the probe counts it
    // as reachable on purpose. Rejected credentials are a different failure
    // from a dead host and have to be named separately, or a client with a
    // revoked token reads as connected.
    if (rag.token && probe.status === 401) {
      state = 'unreachable'
      issues.unshift(
        `${spec.label}: the token in this config is not accepted by ${rag.url} — ` +
          `re-copy the snippet from Connect`,
      )
    }
    if (!probe.reachable && state === 'wired') {
      state = 'unreachable'
      issues.unshift(`${rag.url} is not answering (${probe.error ?? 'no response'})`)
    }
  }

  return { id: spec.id, label: spec.label, configPath, configExists: true, state, servers, issues, probe }
}

export interface CheckClientOptions {
  /** Also ask each configured URL whether anything answers. Costs one request per client. */
  probe?: boolean
  /** Bearer token for probing a remote, auth-gated brain. */
  token?: string
  probeTimeoutMs?: number
  /**
   * The Brain THIS Pomnia instance is running (embedded localhost or the
   * user-chosen remote). A config pointing at any other host is `unreachable`,
   * even if that other host still speaks MCP.
   */
  expectedBaseUrl?: string
}

export async function checkAllClients(opts?: CheckClientOptions): Promise<ClientStatus[]> {
  return Promise.all(CLIENTS.map((c) => checkClient(c, opts)))
}

/**
 * HTTP probe against the brain server. Tries /healthz (proxy) first, then
 * /stats (public dashboard endpoint), then root /. Optional Bearer token.
 */
export async function pingBrain(url: string, token?: string): Promise<BrainPing> {
  const base = url.replace(/\/+$/, '')
  const headers: Record<string, string> = { accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  for (const probe of ['/healthz', '/stats', '/']) {
    try {
      const r = await fetch(`${base}${probe}`, { headers, signal: AbortSignal.timeout(5000) })
      let data: Record<string, unknown> | undefined
      try {
        data = (await r.json()) as Record<string, unknown>
      } catch {
        /* non-JSON body is fine for plain /healthz */
      }
      return { url: base + probe, reachable: r.ok, status: r.status, data }
    } catch (e) {
      if (probe === '/') return { url: base, reachable: false, error: String(e) }
    }
  }
  return { url: base, reachable: false, error: 'no probe succeeded' }
}

/** How long a polled MCP hit stays "recent" on the Brain side (ms). */
export const MCP_ACTIVITY_RECENT_MS = 10_000
function normalizeMcpActivity(data: unknown): McpActivityResponse | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (typeof d.recent === 'boolean' && 'last' in d) {
    return d as unknown as McpActivityResponse
  }
  if (typeof d.tool === 'string' && typeof d.ts === 'number') {
    const ts = d.ts
    const recent = Date.now() - ts < MCP_ACTIVITY_RECENT_MS
    const detail = String(d.query_preview ?? d.detail ?? d.tool)
    return { last: { tool: d.tool, detail, ts }, recent }
  }
  return null
}

export async function fetchMcpActivity(baseUrl: string, token?: string): Promise<McpActivityResponse | null> {
  const base = baseUrl.replace(/\/+$/, '').replace(/\/mcp$/, '')
  const headers: Record<string, string> = { accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const probes = [
    `${base}/mcp/activity`,
    `${base}/api/mcp/last-activity`,
    `${dashboardUrlFromBrainUrl(base)}/api/mcp/last-activity`,
  ]
  for (const url of probes) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(3_000) })
      if (!r.ok) continue
      const normalized = normalizeMcpActivity(await r.json())
      if (normalized) return normalized
    } catch {
      // try next probe
    }
  }
  return null
}
