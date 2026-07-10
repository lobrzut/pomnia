/**
 * Brain "is it wired?" diagnostic.
 *
 * Walks each known MCP client (from snippet.ts CLIENTS), reads its config
 * file if present, and reports whether brain-rag/brain-vault/brain-library
 * are configured and where they point. No writes, no auto-fix.
 *
 * Companion to snippet.ts: snippet generates the config to paste, status
 * confirms the paste landed.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { CLIENTS, type ClientId, type ClientSpec } from './snippet.js'
import { dashboardUrlFromBrainUrl } from './deploy.js'

export type WiredState = 'wired' | 'partial' | 'not_wired' | 'not_installed' | 'config_error'

const BRAIN_KEYS = ['brain-rag', 'brain-vault', 'brain-library'] as const

export interface ClientStatus {
  id: ClientId
  label: string
  configPath: string
  configExists: boolean
  state: WiredState
  /** Per-server: which of brain-rag/brain-vault/brain-library is present + where it points. */
  servers: Array<{
    key: (typeof BRAIN_KEYS)[number]
    present: boolean
    url?: string
    transport?: string
    hasToken?: boolean
  }>
  /** Issues found (missing keys, parse error, wrong shape). */
  issues: string[]
}

export interface BrainPing {
  url: string
  reachable: boolean
  status?: number
  data?: Record<string, unknown>
  error?: string
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
function pickUrl(srv: any): { url?: string; transport?: string; hasToken?: boolean } {
  if (!srv || typeof srv !== 'object') return {}
  const out: { url?: string; transport?: string; hasToken?: boolean } = {}
  // type field (claude-code "http", antigravity "streamable-http", vscode "http")
  if (typeof srv.type === 'string') out.transport = srv.type
  // url or serverUrl (claude-code/cursor/vscode use `url`; antigravity/windsurf use `serverUrl`)
  if (typeof srv.url === 'string') out.url = srv.url
  else if (typeof srv.serverUrl === 'string') out.url = srv.serverUrl
  // claude-desktop wraps in `mcp-remote` subprocess — URL is in args. `command` is
  // a full path on Windows (e.g. "C:\Program Files\nodejs\npx.cmd"), not literally
  // "npx" — match on the basename instead of an exact string.
  else if (typeof srv.command === 'string' && /^npx(\.cmd)?$/i.test(srv.command.split(/[\\/]/).pop() || '') && Array.isArray(srv.args)) {
    const arg = srv.args.find((a: unknown) => typeof a === 'string' && /^https?:\/\//.test(a))
    if (arg) {
      out.url = arg as string
      out.transport = 'mcp-remote (stdio→http)'
    }
  }
  // Bearer token detection (headers field on the server OR --header CLI arg)
  if (srv.headers && typeof srv.headers === 'object') {
    const auth = (srv.headers as Record<string, unknown>)['Authorization']
    if (typeof auth === 'string' && /^Bearer\s+/.test(auth)) out.hasToken = true
  }
  if (Array.isArray(srv.args)) {
    const i = srv.args.indexOf('--header')
    if (i >= 0 && typeof srv.args[i + 1] === 'string' && /Bearer\s+/.test(srv.args[i + 1])) {
      out.hasToken = true
    }
  }
  return out
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
export async function checkClient(spec: ClientSpec): Promise<ClientStatus> {
  const targetOS = (process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux') as
    | 'win32'
    | 'darwin'
    | 'linux'
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const configPath = spec.configPath(targetOS, home)
  const configExists = await exists(configPath)

  if (!configExists) {
    // Client may still be installed but never configured — that's "not_wired",
    // not "not_installed". We don't probe binaries here; absence of the file
    // is the strongest signal we have without false positives.
    return {
      id: spec.id,
      label: spec.label,
      configPath,
      configExists: false,
      state: 'not_wired',
      servers: BRAIN_KEYS.map((k) => ({ key: k, present: false })),
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
      servers: BRAIN_KEYS.map((k) => ({ key: k, present: false })),
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
      servers: BRAIN_KEYS.map((k) => ({ key: k, present: false })),
      issues: [`expected object at "${spec.mcpKey}"`],
    }
  }

  const servers = BRAIN_KEYS.map((key) => {
    const srv = (mcp as Record<string, unknown>)[key]
    if (!srv) return { key, present: false }
    const picked = pickUrl(srv)
    return { key, present: true, ...picked }
  })
  const present = servers.filter((s) => s.present).length
  const rag = servers.find((s) => s.key === 'brain-rag')
  const embeddedLocal =
    rag?.present &&
    !!rag.url &&
    /127\.0\.0\.1|localhost/i.test(rag.url) &&
    rag.url.includes('/mcp')
  const state: WiredState = embeddedLocal
    ? 'wired'
    : present === BRAIN_KEYS.length
      ? 'wired'
      : present === 0
        ? 'not_wired'
        : 'partial'

  const issues: string[] = []
  for (const s of servers) {
    if (s.present && !s.url) issues.push(`${s.key}: no URL detected (config shape unknown)`)
    if (!embeddedLocal && !s.present) issues.push(`${s.key}: missing`)
  }
  if (!embeddedLocal && present > 0 && present < BRAIN_KEYS.length) {
    issues.unshift('incomplete: need brain-rag + brain-vault + brain-library (remote)')
  }

  return { id: spec.id, label: spec.label, configPath, configExists: true, state, servers, issues }
}

export async function checkAllClients(): Promise<ClientStatus[]> {
  return Promise.all(CLIENTS.map((c) => checkClient(c)))
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
      try { data = (await r.json()) as Record<string, unknown> } catch { /* non-JSON body is fine for plain /healthz */ }
      return { url: base + probe, reachable: r.ok, status: r.status, data }
    } catch (e) {
      // try next probe
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
    return d as McpActivityResponse
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
