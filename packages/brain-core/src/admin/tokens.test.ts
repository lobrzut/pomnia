import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createToken,
  mintToken,
  readTokens,
  revokeToken,
  summarise,
  touchToken,
  validateTokenName,
} from './tokens.js'

let file: string
let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pomnia-tokens-'))
  file = join(dir, 'mcp-tokens.json')
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('mintToken', () => {
  it('is long, prefixed and never repeats', () => {
    const a = mintToken()
    expect(a.startsWith('btk_')).toBe(true)
    expect(a.length).toBeGreaterThan(40)
    const many = new Set(Array.from({ length: 500 }, mintToken))
    expect(many.size).toBe(500)
  })
})

describe('createToken', () => {
  it('adds an agent token by default', async () => {
    const r = await createToken(file, { name: 'laptop', role: 'agent' })
    expect(r.ok).toBe(true)
    const stored = await readTokens(file)
    expect(stored).toHaveLength(1)
    expect(stored[0].role).toBe('agent')
  })

  it('keeps existing tokens when adding one', async () => {
    await createToken(file, { name: 'a', role: 'agent' })
    await createToken(file, { name: 'b', role: 'admin' })
    expect((await readTokens(file)).map((t) => t.name)).toEqual(['a', 'b'])
  })

  /** Two entries with one name makes revocation ambiguous. */
  it('refuses a duplicate name, case-insensitively', async () => {
    await createToken(file, { name: 'Laptop', role: 'agent' })
    const r = await createToken(file, { name: 'laptop', role: 'agent' })
    expect(r.ok).toBe(false)
    expect((await readTokens(file))).toHaveLength(1)
  })

  it('refuses names that would be unusable or confusing', async () => {
    for (const name of ['', '   ', 'a\nb', 'x'.repeat(80), 'a/b']) {
      expect((await createToken(file, { name, role: 'agent' })).ok, name).toBe(false)
    }
  })

  it('anything not exactly admin is an agent', async () => {
    const r = await createToken(file, { name: 'x', role: 'ADMIN' as 'admin' })
    expect(r.ok).toBe(true)
    expect((await readTokens(file))[0].role).toBe('agent')
  })

  it('writes 0600', async () => {
    await createToken(file, { name: 'x', role: 'agent' })
    if (process.platform !== 'win32') {
      const st = await import('node:fs').then((m) => m.promises.stat(file))
      expect(st.mode & 0o777).toBe(0o600)
    }
  })
})

describe('revokeToken', () => {
  it('removes by name without needing the secret', async () => {
    await createToken(file, { name: 'a', role: 'agent' })
    await createToken(file, { name: 'b', role: 'admin' })
    expect(await revokeToken(file, 'a')).toEqual({ ok: true, name: 'a' })
    expect((await readTokens(file)).map((t) => t.name)).toEqual(['b'])
  })

  /** Locking yourself out is recoverable only over SSH. */
  it('refuses to remove the last admin', async () => {
    await createToken(file, { name: 'only-admin', role: 'admin' })
    await createToken(file, { name: 'agent', role: 'agent' })
    const r = await revokeToken(file, 'only-admin')
    expect(r.ok).toBe(false)
    expect((r as { detail: string }).detail).toMatch(/ostatni token administratora/)
    expect(await readTokens(file)).toHaveLength(2)
  })

  it('allows removing an admin once a second one exists', async () => {
    await createToken(file, { name: 'admin-1', role: 'admin' })
    await createToken(file, { name: 'admin-2', role: 'admin' })
    expect((await revokeToken(file, 'admin-1')).ok).toBe(true)
  })

  it('reports an unknown name instead of silently doing nothing', async () => {
    const r = await revokeToken(file, 'ghost')
    expect(r.ok).toBe(false)
  })
})

describe('summarise', () => {
  /** An endpoint that returns tokens turns one leak into every leak. */
  it('never carries the secret', async () => {
    await createToken(file, { name: 'laptop', role: 'agent' })
    const stored = (await readTokens(file))[0]
    const s = summarise(stored)
    expect(JSON.stringify(s)).not.toContain(stored.token)
    expect(s.hint.length).toBeLessThan(stored.token.length)
    expect(stored.token.startsWith(s.hint.replace('…', ''))).toBe(true)
  })
})

describe('touchToken', () => {
  it('records first use', async () => {
    await createToken(file, { name: 'a', role: 'agent' })
    await touchToken(file, 'a')
    expect((await readTokens(file))[0].lastUsed).toBeTruthy()
  })

  /** Rewriting on every request would defeat the auth gate's mtime cache. */
  it('does not rewrite within a minute', async () => {
    await createToken(file, { name: 'a', role: 'agent' })
    await touchToken(file, 'a')
    const first = (await readTokens(file))[0].lastUsed
    await touchToken(file, 'a')
    expect((await readTokens(file))[0].lastUsed).toBe(first)
  })

  it('ignores an unknown name', async () => {
    await createToken(file, { name: 'a', role: 'agent' })
    await expect(touchToken(file, 'ghost')).resolves.toBeUndefined()
  })
})

describe('readTokens', () => {
  it('treats a missing or corrupt file as empty, never as open', async () => {
    expect(await readTokens(file)).toEqual([])
    await writeFile(file, '{ not json', 'utf8')
    expect(await readTokens(file)).toEqual([])
  })

  /** Every token that exists today was issued for an agent. */
  it('defaults a role-less legacy entry to agent', async () => {
    await writeFile(file, JSON.stringify([{ name: 'old', token: 'btk_x', created: '2026-01-01' }]), 'utf8')
    expect((await readTokens(file))[0].role).toBe('agent')
  })

  it('does not accept a role it does not know', async () => {
    await writeFile(file, JSON.stringify([{ name: 'x', token: 'btk_x', role: 'root' }]), 'utf8')
    expect((await readTokens(file))[0].role).toBe('agent')
  })
})

describe('validateTokenName', () => {
  it('accepts what people name machines', () => {
    for (const n of ['laptop', 'claude-code', 'CI runner 2', 'ops@home']) {
      expect(validateTokenName(n).ok, n).toBe(true)
    }
  })
})
