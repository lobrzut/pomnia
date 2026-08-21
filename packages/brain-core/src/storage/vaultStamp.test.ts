// SPDX-License-Identifier: AGPL-3.0-only
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkVaultPresence, countVaultNotes, readStamp, writeStamp } from './vaultStamp.js'

describe('vault presence guard', () => {
  let vault: string
  let data: string

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'pomnia-vault-'))
    data = mkdtempSync(join(tmpdir(), 'pomnia-data-'))
  })
  afterEach(() => {
    rmSync(vault, { recursive: true, force: true })
    rmSync(data, { recursive: true, force: true })
  })

  const addNotes = (n: number, sub = 'distilled') => {
    mkdirSync(join(vault, sub), { recursive: true })
    for (let i = 0; i < n; i++) writeFileSync(join(vault, sub, `n${i}.md`), '# note')
  }

  it('lets a first run through — there is nothing to compare against', () => {
    expect(checkVaultPresence(vault, data).ok).toBe(true)
  })

  it('lets an empty vault through when the last look was also empty', () => {
    writeStamp(data, vault, 0)
    expect(checkVaultPresence(vault, data).ok).toBe(true)
  })

  // The accident this exists for: --vault-root points at a share that has not
  // mounted, so the path is an ordinary empty directory. Every step after this
  // would handle it correctly, and the real share would then mount on top.
  it('refuses when a vault that held notes is suddenly empty', () => {
    writeStamp(data, vault, 2415)
    const v = checkVaultPresence(vault, data)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.message).toContain('2415')
    expect(v.message).toContain(vault)
    expect(v.message).toContain('not mounted yet')
  })

  it('says how to proceed when the vault really was emptied', () => {
    writeStamp(data, vault, 10)
    const v = checkVaultPresence(vault, data)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.message).toContain('vault-presence.json')
  })

  it('does not confuse a different vault at a different path', () => {
    writeStamp(data, join(vault, 'somewhere-else'), 500)
    expect(checkVaultPresence(vault, data).ok).toBe(true)
  })

  it('is satisfied as soon as the mount is actually there', () => {
    writeStamp(data, vault, 2415)
    addNotes(3)
    const v = checkVaultPresence(vault, data)
    expect(v.ok).toBe(true)
    expect(v.notes).toBe(3)
  })

  it('counts markdown across every corpus directory', () => {
    addNotes(2, 'distilled')
    addNotes(3, 'sessions')
    writeFileSync(join(vault, 'distilled', 'not-a-note.txt'), 'x')
    expect(countVaultNotes(vault)).toBe(5)
  })

  it('round-trips the stamp', () => {
    writeStamp(data, vault, 42)
    expect(readStamp(data)).toMatchObject({ root: vault, notes: 42 })
  })
})
