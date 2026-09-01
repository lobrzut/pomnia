import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createToken, readTokens, readTokensOrEmpty } from './tokens.js'

let dir = ''
let file = ''
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pomnia-tok-'))
  file = join(dir, 'mcp-tokens.json')
})
afterEach(async () => {
  await chmod(file, 0o600).catch(() => {})
  await rm(dir, { recursive: true, force: true })
})

describe('token store — a failed read must not look like an empty store', () => {
  it('treats a missing file as empty, because it is', async () => {
    await expect(readTokens(file)).resolves.toEqual([])
  })

  it('throws on a store it cannot parse', async () => {
    // Previously this returned [] — and three callers read then write, so one
    // unreadable moment during createToken persisted a store holding only the
    // new token, erasing every other credential without an error anywhere.
    await writeFile(file, '{ this is not json')
    await expect(readTokens(file)).rejects.toThrow()
  })

  it('refuses to create a token on top of a store it could not read', async () => {
    await writeFile(file, 'not json at all')
    await expect(createToken(file, { name: 'new', role: 'agent' })).rejects.toThrow()
  })

  it('keeps existing tokens when a new one is added to a readable store', async () => {
    const a = await createToken(file, { name: 'first', role: 'agent' })
    const b = await createToken(file, { name: 'second', role: 'admin' })
    expect(a.ok && b.ok).toBe(true)
    const all = await readTokens(file)
    expect(all.map((t) => t.name).sort()).toEqual(['first', 'second'])
  })

  it('fails closed for read-only callers', async () => {
    // An auth gate that cannot read the store must authorise nobody, which is
    // the opposite direction from a writer and equally deliberate.
    await writeFile(file, 'not json at all')
    await expect(readTokensOrEmpty(file)).resolves.toEqual([])
  })
})
