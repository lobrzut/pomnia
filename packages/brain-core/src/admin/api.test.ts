import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { handleAdmin, type AdminDeps } from './api.js'
import { createToken, readTokens } from './tokens.js'
import { readSettings } from './settings.js'

let dir: string
let tokensFile: string
let deps: AdminDeps
let live: { ollamaUrl: string; embedModel: string }
let readOnlyFlag: boolean

const call = (method: string, path: string, body?: unknown, actor = 'admin-token') =>
  handleAdmin({ method, path, body: body ?? null, actor }, deps)

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pomnia-adminapi-'))
  tokensFile = join(dir, 'mcp-tokens.json')
  live = { ollamaUrl: 'http://127.0.0.1:11434', embedModel: 'nomic-embed-text' }
  readOnlyFlag = false
  deps = {
    dataDir: dir,
    tokensFile,
    applyOllama: vi.fn((n) => {
      if (n.ollamaUrl) live.ollamaUrl = n.ollamaUrl
      if (n.embedModel) live.embedModel = n.embedModel
    }),
    currentOllama: () => ({ ...live }),
    claimVault: vi.fn(async () => ({ previous: 'Pomnia Desktop', owner: 'pomnia-server' })),
    startReindex: vi.fn(() => ({ started: true })),
    vaultState: () => ({ writable: !readOnlyFlag, owner: 'Pomnia Desktop', readOnlyFlag }),
  }
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('settings', () => {
  it('shows what is in effect and what is pinned, separately', async () => {
    const r = await call('GET', '/admin/settings')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({
      effective: { ollamaUrl: 'http://127.0.0.1:11434' },
      stored: { ollamaUrl: null },
    })
  })

  it('saves a valid Ollama URL and applies it live', async () => {
    const r = await call('PUT', '/admin/settings', { ollamaUrl: 'http://192.168.1.50:11434' })
    expect(r.status).toBe(200)
    expect(deps.applyOllama).toHaveBeenCalled()
    expect((await readSettings(dir)).ollamaUrl).toBe('http://192.168.1.50:11434')
  })

  /** The settings field the server fetches from is an SSRF primitive. */
  it('refuses an SSRF target and changes nothing', async () => {
    const r = await call('PUT', '/admin/settings', { ollamaUrl: 'http://169.254.169.254/' })
    expect(r.status).toBe(400)
    expect(r.body).toMatchObject({ error: 'invalid_ollama_url', reason: 'link-local' })
    expect(deps.applyOllama).not.toHaveBeenCalled()
    expect((await readSettings(dir)).ollamaUrl).toBeUndefined()
  })

  it('refuses a file: scheme', async () => {
    expect((await call('PUT', '/admin/settings', { ollamaUrl: 'file:///etc/passwd' })).status).toBe(400)
  })

  it('records who changed it', async () => {
    await call('PUT', '/admin/settings', { ollamaUrl: 'http://x:11434' }, 'laptop')
    expect((await readSettings(dir)).updatedBy).toBe('laptop')
  })

  /**
   * An incremental reindex after a model change skips every file — contents
   * did not change — and reports success over an index of stale vectors.
   */
  it('warns that a model change invalidates the index', async () => {
    const r = await call('PUT', '/admin/settings', { embedModel: 'mxbai-embed-large' })
    expect((r.body as { warning?: string }).warning).toMatch(/library\.db/)
  })

  it('does not warn when only the URL moved', async () => {
    const r = await call('PUT', '/admin/settings', { ollamaUrl: 'http://other:11434' })
    expect((r.body as { warning?: string }).warning).toBeUndefined()
  })
})

describe('tokens', () => {
  it('lists without ever returning a secret', async () => {
    await createToken(tokensFile, { name: 'laptop', role: 'agent' })
    const r = await call('GET', '/admin/tokens')
    const stored = (await readTokens(tokensFile))[0]
    expect(JSON.stringify(r.body)).not.toContain(stored.token)
  })

  it('returns the secret exactly once, at creation', async () => {
    const r = await call('POST', '/admin/tokens', { name: 'phone', role: 'agent' })
    expect(r.status).toBe(201)
    const created = (r.body as { token: string }).token
    expect(created.startsWith('btk_')).toBe(true)
    // …and never again.
    const list = await call('GET', '/admin/tokens')
    expect(JSON.stringify(list.body)).not.toContain(created)
  })

  it('defaults a new token to agent unless admin is asked for', async () => {
    await call('POST', '/admin/tokens', { name: 'a' })
    await call('POST', '/admin/tokens', { name: 'b', role: 'admin' })
    const roles = (await readTokens(tokensFile)).map((t) => t.role)
    expect(roles).toEqual(['agent', 'admin'])
  })

  it('revokes by name', async () => {
    await createToken(tokensFile, { name: 'a', role: 'agent' })
    await createToken(tokensFile, { name: 'keeper', role: 'admin' })
    expect((await call('DELETE', '/admin/tokens/a')).status).toBe(200)
    expect((await readTokens(tokensFile)).map((t) => t.name)).toEqual(['keeper'])
  })

  it('decodes a name with a space in the path', async () => {
    await createToken(tokensFile, { name: 'CI runner', role: 'agent' })
    await createToken(tokensFile, { name: 'keeper', role: 'admin' })
    expect((await call('DELETE', '/admin/tokens/CI%20runner')).status).toBe(200)
  })

  it('refuses to revoke the last admin', async () => {
    await createToken(tokensFile, { name: 'only', role: 'admin' })
    const r = await call('DELETE', '/admin/tokens/only')
    expect(r.status).toBe(400)
    expect(await readTokens(tokensFile)).toHaveLength(1)
  })
})

describe('vault', () => {
  it('reports ownership', async () => {
    expect((await call('GET', '/admin/vault')).body).toMatchObject({ owner: 'Pomnia Desktop' })
  })

  it('claims the vault and warns about the previous owner', async () => {
    const r = await call('POST', '/admin/vault/claim')
    expect(r.status).toBe(200)
    expect(deps.claimVault).toHaveBeenCalled()
    expect((r.body as { warning: string }).warning).toMatch(/Pomnia Desktop/)
  })

  /** The unit file is the operator's instruction, not a suggestion. */
  it('refuses to claim when the unit pins this host read-only', async () => {
    readOnlyFlag = true
    const r = await call('POST', '/admin/vault/claim')
    expect(r.status).toBe(409)
    expect(deps.claimVault).not.toHaveBeenCalled()
  })
})

describe('reindex', () => {
  it('starts one', async () => {
    expect((await call('POST', '/admin/reindex')).status).toBe(202)
  })

  it('does not pretend a refused start succeeded', async () => {
    deps.startReindex = vi.fn(() => ({ started: false, reason: 'already running' }))
    const r = await call('POST', '/admin/reindex')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ started: false })
  })
})

describe('routing', () => {
  it('404s an unknown path rather than falling through', async () => {
    expect((await call('GET', '/admin/nope')).status).toBe(404)
    expect((await call('POST', '/admin')).status).toBe(404)
  })

  it('does not act on the wrong method', async () => {
    expect((await call('POST', '/admin/settings')).status).toBe(404)
    expect((await call('GET', '/admin/reindex')).status).toBe(404)
  })
})
