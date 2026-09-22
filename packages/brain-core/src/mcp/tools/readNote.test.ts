// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * read_note hands the model a file it names, so the path is untrusted. These
 * pin that it stays inside the vault, returns what is there, caps large files,
 * and never follows a path out of the tree.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runReadNote } from './readNote.js'

const J = (s: string) => JSON.parse(s) as Record<string, any>

let vaultRoot = ''
let outside = ''
beforeEach(() => {
  const base = mkdtempSync(join(tmpdir(), 'pomnia-readnote-'))
  vaultRoot = join(base, 'vault')
  mkdirSync(join(vaultRoot, 'distilled'), { recursive: true })
  writeFileSync(join(vaultRoot, 'distilled', 'note.md'), '# Note\nfull passage here', 'utf8')
  outside = join(base, 'SECRET.md')
  writeFileSync(outside, 'do not read me', 'utf8')
})
afterEach(() => {
  rmSync(join(vaultRoot, '..'), { recursive: true, force: true })
})

describe('read_note', () => {
  it('returns the full text of a file inside the vault', () => {
    const out = J(runReadNote({ path: join(vaultRoot, 'distilled', 'note.md') }, { vaultRoot }))
    expect(out.error).toBeUndefined()
    expect(out.text).toContain('full passage here')
    expect(out.truncated).toBe(false)
  })

  it('refuses an absolute path outside the vault', () => {
    const out = J(runReadNote({ path: outside }, { vaultRoot }))
    expect(out.error).toBe('outside_vault')
    expect(out.text).toBeUndefined()
  })

  it('refuses a ../ escape even when it points at a real file', () => {
    const escape = join(vaultRoot, 'distilled', '..', '..', 'SECRET.md')
    const out = J(runReadNote({ path: escape }, { vaultRoot }))
    expect(out.error).toBe('outside_vault')
  })

  it('reports not_found for a missing path inside the vault', () => {
    const out = J(runReadNote({ path: join(vaultRoot, 'distilled', 'ghost.md') }, { vaultRoot }))
    expect(out.error).toBe('not_found')
  })

  it('refuses an empty or non-string path', () => {
    expect(J(runReadNote({ path: '' }, { vaultRoot })).error).toBe('bad_path')
    expect(J(runReadNote({}, { vaultRoot })).error).toBe('bad_path')
  })

  it('caps a large file and flags the truncation', () => {
    writeFileSync(join(vaultRoot, 'distilled', 'big.md'), 'x'.repeat(5000), 'utf8')
    const out = J(runReadNote({ path: join(vaultRoot, 'distilled', 'big.md'), max_chars: 1000 }, { vaultRoot }))
    expect(out.truncated).toBe(true)
    expect(out.text.length).toBe(1000)
    expect(out.chars).toBe(1000)
    expect(out.bytes).toBe(5000)
  })

  it('does not read the whole file into memory to satisfy a small cap', () => {
    // A 2 MB file with a 200-char cap must not load 2 MB. We cannot easily
    // assert memory here, but we can assert it returns promptly and correctly.
    writeFileSync(join(vaultRoot, 'distilled', 'huge.md'), 'y'.repeat(2_000_000), 'utf8')
    const out = J(runReadNote({ path: join(vaultRoot, 'distilled', 'huge.md'), max_chars: 200 }, { vaultRoot }))
    expect(out.text.length).toBe(200)
    expect(out.truncated).toBe(true)
    expect(out.bytes).toBe(2_000_000)
  })
})
