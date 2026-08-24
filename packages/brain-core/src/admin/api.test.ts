import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { handleAdmin, type AdminDeps, type RuntimeSettings } from './api.js'
import { createToken, readTokens } from './tokens.js'
import { readSettings } from './settings.js'

let dir: string
let tokensFile: string
let deps: AdminDeps
let live: { ollamaUrl: string; embedModel: string }
let readOnlyFlag: boolean
let runtime: RuntimeSettings
let dropped: string[]

const call = (method: string, path: string, body?: unknown, actor = 'admin-token') =>
  handleAdmin({ method, path, body: body ?? null, actor }, deps)

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pomnia-adminapi-'))
  tokensFile = join(dir, 'mcp-tokens.json')
  live = { ollamaUrl: 'http://127.0.0.1:11434', embedModel: 'nomic-embed-text' }
  readOnlyFlag = false
  runtime = {
    handshakePhrase: 'OK to Go Go Go',
    handshakeEnabled: true,
    autoCheckpointEnabled: true,
    instanceLabel: 'pomnia-server',
  }
  dropped = []
  deps = {
    dataDir: dir,
    tokensFile,
    runtime: {
      get: () => ({ ...runtime }),
      set: (n) => Object.assign(runtime, n),
    },
    dropSessionsFor: vi.fn((u: string) => {
      dropped.push(u)
      return 2
    }),
    overview: vi.fn(async () => ({ index: { files: 1, chunks: 2 }, unindexed: 0 })),
    applyOllama: vi.fn((n) => {
      if (n.ollamaUrl) live.ollamaUrl = n.ollamaUrl
      if (n.embedModel) live.embedModel = n.embedModel
    }),
    currentOllama: () => ({ ...live }),
    claimVault: vi.fn(async () => ({ previous: 'Pomnia Desktop', owner: 'pomnia-server' })),
    startReindex: vi.fn(() => ({ started: true })),
    vaultState: () => ({
      // Default = replica held by Desktop (the case claim is for).
      writable: false,
      owner: 'Pomnia Desktop',
      readOnlyFlag,
      path: '/var/lib/pomnia/vault',
      hostPath: '/share/Container/pomnia-kvm/vault',
      label: null,
      where: null,
      smbPath: null,
    }),
    health: vi.fn(async () => ({
      ok: true,
      status: 'ok',
      index: { files: 10, chunks: 44 },
      checks: { ollama: { state: 'ok' } },
      writable: false,
      vaultOwner: 'Pomnia Desktop',
    })),
    distill: {
      status: vi.fn(() => ({
        phase: 'idle',
        enabled: true,
        runnable: false,
        reason: 'vault not writable',
        model: 'qwen2.5:14b',
        ollamaUrl: 'http://127.0.0.1:11434',
        dryRun: false,
        startedAt: null,
        finishedAt: null,
        done: 0,
        total: 0,
        ok: 0,
        stubs: 0,
        garbage: 0,
        skipped: 0,
        failed: 0,
        written: [],
        lastError: null,
      })),
      start: vi.fn(() => ({
        started: false,
        reason: 'vault not writable',
        status: { phase: 'idle' },
      })),
      cancel: vi.fn(() => ({ cancelled: false })),
    },
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

describe('health', () => {
  it('returns the full report the panel Stan tab needs', async () => {
    const r = await call('GET', '/admin/health')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({
      status: 'ok',
      index: { files: 10, chunks: 44 },
      vaultOwner: 'Pomnia Desktop',
      writable: false,
    })
    expect(deps.health).toHaveBeenCalled()
  })
})

describe('vault', () => {
  it('reports ownership and vault paths without e2e junk', async () => {
    expect((await call('GET', '/admin/vault')).body).toMatchObject({
      owner: 'Pomnia Desktop',
      path: '/var/lib/pomnia/vault',
      hostPath: '/share/Container/pomnia-kvm/vault',
      label: null,
      where: null,
      smbPath: null,
    })
  })

  it('claims the vault and warns about the previous owner', async () => {
    const r = await call('POST', '/admin/vault/claim')
    expect(r.status).toBe(200)
    expect(deps.claimVault).toHaveBeenCalled()
    expect((r.body as { warning: string }).warning).toMatch(/Pomnia Desktop/)
  })

  it('no-ops without rewriting when this host already owns the vault', async () => {
    deps.vaultState = () => ({
      writable: true,
      owner: 'pomnia-server',
      readOnlyFlag: false,
      path: '/var/lib/pomnia/vault',
    })
    const r = await call('POST', '/admin/vault/claim')
    expect(r.status).toBe(200)
    expect(deps.claimVault).not.toHaveBeenCalled()
    expect(r.body).toMatchObject({ alreadyOwner: true, owner: 'pomnia-server' })
    expect((r.body as { warning?: string }).warning).toBeUndefined()
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

describe('behaviour', () => {
  it('reports the running values', async () => {
    expect((await call('GET', '/admin/behaviour')).body).toMatchObject({
      handshakePhrase: 'OK to Go Go Go',
      autoCheckpointEnabled: true,
    })
  })

  it('applies a change without a restart', async () => {
    const r = await call('PUT', '/admin/behaviour', { handshakePhrase: 'Pomnia gotowa' })
    expect(r.status).toBe(200)
    expect(runtime.handshakePhrase).toBe('Pomnia gotowa')
  })

  it('accepts false, which a truthiness check would drop', async () => {
    await call('PUT', '/admin/behaviour', { autoCheckpointEnabled: false, handshakeEnabled: false })
    expect(runtime.autoCheckpointEnabled).toBe(false)
    expect(runtime.handshakeEnabled).toBe(false)
  })

  /** The phrase is injected into every tool description an agent reads. */
  it('refuses a phrase that is empty, huge or multi-line', async () => {
    for (const p of ['', 'x'.repeat(80), 'two\nlines']) {
      expect((await call('PUT', '/admin/behaviour', { handshakePhrase: p })).status, p).toBe(400)
    }
    expect(runtime.handshakePhrase).toBe('OK to Go Go Go')
  })

  it('refuses an empty instance label', async () => {
    expect((await call('PUT', '/admin/behaviour', { instanceLabel: '   ' })).status).toBe(400)
  })
})

describe('users', () => {
  const PW = 'correct horse battery staple'

  it('creates and lists without ever exposing a hash', async () => {
    expect((await call('POST', '/admin/users', { username: 'helluk', password: PW, role: 'admin' })).status).toBe(201)
    const list = await call('GET', '/admin/users')
    expect(JSON.stringify(list.body)).not.toContain('scrypt$')
    expect(JSON.stringify(list.body)).not.toContain(PW)
  })

  it('refuses a weak password', async () => {
    const r = await call('POST', '/admin/users', { username: 'weak', password: 'short', role: 'admin' })
    expect(r.status).toBe(400)
  })

  /** A password change that leaves old sessions alive has changed nothing. */
  it('ends every session for the account when the password changes', async () => {
    await call('POST', '/admin/users', { username: 'helluk', password: PW, role: 'admin' })
    const r = await call('PUT', '/admin/users/helluk/password', { password: 'a different long one' })
    expect(r.status).toBe(200)
    expect(dropped).toContain('helluk')
    expect((r.body as { sessionsEnded: number }).sessionsEnded).toBe(2)
  })

  it('refuses to delete the last admin account', async () => {
    await call('POST', '/admin/users', { username: 'only', password: PW, role: 'admin' })
    expect((await call('DELETE', '/admin/users/only')).status).toBe(400)
  })

  it('ends sessions when an account is deleted', async () => {
    await call('POST', '/admin/users', { username: 'a1', password: PW, role: 'admin' })
    await call('POST', '/admin/users', { username: 'a2', password: PW, role: 'admin' })
    expect((await call('DELETE', '/admin/users/a1')).status).toBe(200)
    expect(dropped).toContain('a1')
  })
})

describe('accounts are always admins', () => {
  /** Login refuses a non-admin, so such an account could never sign in. */
  it('refuses to create an account that could never log in', async () => {
    const r = await call('POST', '/admin/users', {
      username: 'agentacct',
      password: 'correct horse battery staple',
      role: 'agent',
    })
    expect(r.status).toBe(400)
    expect((r.body as { detail: string }).detail).toMatch(/token/)
  })

  it('creates an admin when the role is omitted', async () => {
    const r = await call('POST', '/admin/users', {
      username: 'someone',
      password: 'correct horse battery staple',
    })
    expect(r.status).toBe(201)
    expect((r.body as { role: string }).role).toBe('admin')
  })
})

describe('health', () => {
  it('returns the full report the panel needs (not the redacted probe)', async () => {
    const r = await call('GET', '/admin/health')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({
      status: 'ok',
      index: { files: 10, chunks: 44 },
      vaultOwner: 'Pomnia Desktop',
    })
    expect(deps.health).toHaveBeenCalled()
  })
})

describe('distill admin API', () => {
  it('returns status', async () => {
    const r = await call('GET', '/admin/distill')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ phase: 'idle', model: 'qwen2.5:14b' })
  })

  it('posts start and surfaces refusal when not runnable', async () => {
    const r = await call('POST', '/admin/distill', { dryRun: false })
    expect(r.status).toBe(409)
    expect(r.body).toMatchObject({ started: false })
  })
})
