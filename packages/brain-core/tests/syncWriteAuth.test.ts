import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadConfig } from '../src/config/index.js'
import { createBrainServer, type BrainServer } from '../src/mcp/server.js'

/**
 * The first end-to-end test of this server over real HTTP.
 *
 * Everything else in this package tests a function. That is how the last
 * authorisation bug shipped: `check(req, need)` grew a role parameter and kept
 * the old body, every unit test around it passed, and an agent token minted
 * itself an admin token against a running server. authRoles.test.ts draws the
 * lesson — test the layer that enforces, not the layer that assumes — and the
 * layer that enforces here is an HTTP handler closed over inside
 * createBrainServer, reachable no other way.
 *
 * What it guards: pushing into a vault the server *owns* writes the source of
 * truth, so it takes an admin token. That rule replaced "only a replica accepts
 * a push", which protected the corpus but also made a server-owned vault
 * impossible to author into — the thing the whole server-as-brain direction
 * needs.
 */

// Deterministic per process, so two runs on one machine do not collide.
const PORT = 41000 + (process.pid % 4000)
const BASE = `http://127.0.0.1:${PORT}`

const AGENT = 'btk_agent_for_sync_test'
const ADMIN = 'btk_admin_for_sync_test'

let dir: string
let server: BrainServer

const push = async (path: string, token?: string): Promise<Response> =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ manifest: [] }),
  })

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pomnia-syncauth-'))
  const vault = join(dir, 'vault')
  await mkdir(join(vault, 'sessions'), { recursive: true })
  await writeFile(join(vault, 'sessions', 'a.md'), '# note\n', 'utf8')

  const tokensFile = join(dir, 'mcp-tokens.json')
  await writeFile(
    tokensFile,
    JSON.stringify([
      { name: 'bot', token: AGENT, role: 'agent' },
      { name: 'studio', token: ADMIN, role: 'admin' },
    ]),
    'utf8',
  )

  // host 0.0.0.0 is what turns auth on — a loopback bind is trusted by design,
  // and testing the gate through a trusted bind would test nothing.
  const config = await loadConfig(
    [
      '--host', '0.0.0.0',
      '--port', String(PORT),
      '--data-dir', dir,
      '--vault-root', vault,
      '--tokens-file', tokensFile,
    ],
    {},
  )
  server = await createBrainServer(config)
  await server.start()
}, 30_000)

afterAll(async () => {
  await server?.stop().catch(() => {})
  await rm(dir, { recursive: true, force: true })
})

describe('pushing into a vault this server owns', () => {
  it('refuses with no token at all', async () => {
    const r = await push('/sync/plan')
    expect(r.status).toBe(401)
  })

  it('refuses a wrong token', async () => {
    const r = await push('/sync/plan', 'btk_not_a_real_token')
    expect(r.status).toBe(401)
  })

  /**
   * The one that matters. An agent token is handed to every MCP client on the
   * network; it must not be able to rewrite the corpus they all read from.
   */
  it('refuses an agent token, and says why', async () => {
    const r = await push('/sync/plan', AGENT)
    expect(r.status).toBe(403)
    const body = (await r.json()) as { error?: string; hint?: string }
    expect(body.error).toBe('write_needs_admin')
    expect(body.hint).toMatch(/admin token/)
  })

  it('accepts an admin token', async () => {
    const r = await push('/sync/plan', ADMIN)
    expect(r.status).toBe(200)
    const body = (await r.json()) as { wanted?: unknown[]; unchanged?: number }
    expect(Array.isArray(body.wanted)).toBe(true)
  })

  it('refuses an agent token on the file endpoint too, not just plan', async () => {
    const r = await fetch(`${BASE}/sync/file`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${AGENT}` },
      body: JSON.stringify({ path: 'sessions/x.md', content: 'aGk=', sha256: 'deadbeef' }),
    })
    expect(r.status).toBe(403)
  })

  it('refuses an agent token on reindex — it rewrites what everyone searches', async () => {
    const r = await push('/sync/reindex', AGENT)
    expect(r.status).toBe(403)
  })
})

describe('the server still answers the things that are not writes', () => {
  it('serves /healthz without a token', async () => {
    const r = await fetch(`${BASE}/healthz`)
    const body = (await r.json()) as { service?: string; writable?: boolean }
    expect(body.service).toBe('brain-core')
    // Owning the vault is the precondition for every assertion above.
    expect(body.writable).toBe(true)
  })

  it('reports a non-negative uptime', async () => {
    const r = await fetch(`${BASE}/healthz`)
    const body = (await r.json()) as { uptimeSec?: number }
    expect(body.uptimeSec).toBeGreaterThanOrEqual(0)
  })
})
