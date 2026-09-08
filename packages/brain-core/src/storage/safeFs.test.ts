// SPDX-License-Identifier: AGPL-3.0-only
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyFile, readSyncFile, sha256 } from '../sync/receive.js'
import { resolveSafeVaultAbs } from './safeFs.js'

describe('resolveSafeVaultAbs (F09)', () => {
  let root: string
  let outside: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pomnia-safefs-'))
    outside = await mkdtemp(join(tmpdir(), 'pomnia-outside-'))
    await writeFile(join(outside, 'sentinel.md'), 'fixture outside vault', 'utf8')
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  })

  it('refuses a directory junction/symlink that leaves the vault', async () => {
    await symlink(outside, join(root, 'sessions'), process.platform === 'win32' ? 'junction' : 'dir')
    const r = await resolveSafeVaultAbs(root, 'sessions/sentinel.md')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('symlink-escape')
  })

  it('allows ordinary files under the root', async () => {
    await mkdir(join(root, 'sessions'), { recursive: true })
    await writeFile(join(root, 'sessions', 'a.md'), 'inside', 'utf8')
    const r = await resolveSafeVaultAbs(root, 'sessions/a.md')
    expect(r.ok).toBe(true)
  })

  it('allows a missing leaf when the parent stays inside', async () => {
    await mkdir(join(root, 'sessions'), { recursive: true })
    const r = await resolveSafeVaultAbs(root, 'sessions/new.md')
    expect(r.ok).toBe(true)
  })
})

describe('sync refuses symlink escape (F09)', () => {
  let root: string
  let outside: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pomnia-sync-escape-'))
    outside = await mkdtemp(join(tmpdir(), 'pomnia-out-escape-'))
    await writeFile(join(outside, 'sentinel.md'), 'fixture outside vault', 'utf8')
    await symlink(outside, join(root, 'sessions'), process.platform === 'win32' ? 'junction' : 'dir')
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  })

  it('does not read through a junction outside the vault', async () => {
    const escaped = await readSyncFile({ vaultRoot: root, path: 'sessions/sentinel.md' })
    expect(escaped.ok).toBe(false)
    if (!escaped.ok) expect(escaped.reason).toBe('path-escape')
  })

  it('does not write through a junction outside the vault', async () => {
    const content = Buffer.from('fixture write outside vault')
    const wrote = await applyFile({
      vaultRoot: root,
      path: 'sessions/new.md',
      content,
      sha256: sha256(content),
    })
    expect(wrote.ok).toBe(false)
    if (!wrote.ok) expect(wrote.reason).toBe('path-escape')
    await expect(readFile(join(outside, 'new.md'), 'utf8')).rejects.toThrow()
  })
})
