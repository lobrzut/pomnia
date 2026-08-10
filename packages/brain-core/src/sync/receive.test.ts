import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyFile, planSync, sha256, MAX_MANIFEST_ENTRIES } from './receive.js'
import { MAX_FILE_BYTES } from './paths.js'

let root: string

const entry = (path: string, body: string): { path: string; sha256: string; size: number } => ({
  path,
  sha256: sha256(body),
  size: Buffer.byteLength(body),
})

const put = async (rel: string, body: string): Promise<void> => {
  await mkdir(join(root, rel, '..'), { recursive: true })
  await writeFile(join(root, rel), body, 'utf8')
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pomnia-sync-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('planSync', () => {
  it('asks only for what it does not already have', async () => {
    await put('sessions/same.md', 'identical')
    await put('sessions/old.md', 'stale')
    const plan = await planSync({
      vaultRoot: root,
      manifest: [
        entry('sessions/same.md', 'identical'),
        entry('sessions/old.md', 'fresh'),
        entry('sessions/new.md', 'brand new'),
      ],
    })
    expect(plan.unchanged).toBe(1)
    expect(plan.wanted.sort()).toEqual(['sessions/new.md', 'sessions/old.md'])
  })

  /** 1996 files to discover 3 changed is the difference between a sync that
   *  runs and one that nobody ever clicks. */
  it('costs one upload when one file changed', async () => {
    const manifest = []
    for (let i = 0; i < 200; i++) {
      await put(`sessions/n${i}.md`, `body ${i}`)
      manifest.push(entry(`sessions/n${i}.md`, `body ${i}`))
    }
    manifest[42] = entry('sessions/n42.md', 'edited')
    const plan = await planSync({ vaultRoot: root, manifest })
    expect(plan.wanted).toEqual(['sessions/n42.md'])
    expect(plan.unchanged).toBe(199)
  })

  it('reports extras but never touches them', async () => {
    await put('sessions/only-here.md', 'local')
    const plan = await planSync({
      vaultRoot: root,
      manifest: [entry('sessions/a.md', 'a')],
      scanDirs: ['sessions'],
    })
    expect(plan.extra).toEqual(['sessions/only-here.md'])
    expect(await readFile(join(root, 'sessions/only-here.md'), 'utf8')).toBe('local')
  })

  it('rejects bad paths with a reason instead of dropping them', async () => {
    const plan = await planSync({
      vaultRoot: root,
      manifest: [
        entry('../escape.md', 'x'),
        entry('blobs/a.md', 'x'),
        { path: 'sessions/a.md', sha256: 'not-a-hash', size: 1 },
        { path: 'sessions/b.md', sha256: sha256('x'), size: MAX_FILE_BYTES + 1 },
      ],
    })
    expect(plan.wanted).toEqual([])
    expect(plan.rejected.map((r) => r.reason).sort()).toEqual([
      'bad-hash',
      'not-synced-dir',
      'too-large',
      'traversal',
    ])
  })

  it('refuses an absurd manifest outright', async () => {
    const manifest = Array.from({ length: MAX_MANIFEST_ENTRIES + 1 }, (_, i) =>
      entry(`sessions/n${i}.md`, 'x'),
    )
    await expect(planSync({ vaultRoot: root, manifest })).rejects.toThrow(/manifest too large/)
  })
})

describe('applyFile', () => {
  it('writes a file the plan asked for', async () => {
    const body = Buffer.from('# note\n', 'utf8')
    const r = await applyFile({
      vaultRoot: root,
      path: 'sessions/x.md',
      content: body,
      sha256: sha256(body),
    })
    expect(r).toMatchObject({ ok: true, bytes: body.length })
    expect(await readFile(join(root, 'sessions/x.md'), 'utf8')).toBe('# note\n')
  })

  it('creates intermediate directories', async () => {
    const body = Buffer.from('skill', 'utf8')
    const r = await applyFile({
      vaultRoot: root,
      path: 'skills/brain/build-our-way/SKILL.md',
      content: body,
      sha256: sha256(body),
    })
    expect(r.ok).toBe(true)
  })

  /**
   * The failure that would poison the index while every counter said success:
   * a truncated upload landing under the right name.
   */
  it('refuses content that does not match its hash, and writes nothing', async () => {
    const r = await applyFile({
      vaultRoot: root,
      path: 'sessions/x.md',
      content: Buffer.from('truncated'),
      sha256: sha256('the whole thing'),
    })
    expect(r).toMatchObject({ ok: false, reason: 'hash-mismatch' })
    await expect(readFile(join(root, 'sessions/x.md'), 'utf8')).rejects.toThrow()
  })

  it('refuses to escape the vault root', async () => {
    for (const p of ['../outside.md', 'sessions/../../outside.md', '/etc/passwd', 'blobs/x.md']) {
      const body = Buffer.from('x')
      const r = await applyFile({ vaultRoot: root, path: p, content: body, sha256: sha256(body) })
      expect(r.ok, `${p} must be refused`).toBe(false)
    }
  })

  it('refuses oversized content even when the hash matches', async () => {
    const body = Buffer.alloc(MAX_FILE_BYTES + 1, 0x61)
    const r = await applyFile({
      vaultRoot: root,
      path: 'sessions/big.md',
      content: body,
      sha256: sha256(body),
    })
    expect(r).toMatchObject({ ok: false, reason: 'too-large' })
  })

  it('leaves no temp file behind on success', async () => {
    const body = Buffer.from('x')
    await applyFile({ vaultRoot: root, path: 'sessions/x.md', content: body, sha256: sha256(body) })
    await expect(readFile(join(root, 'sessions/x.md.sync-tmp'), 'utf8')).rejects.toThrow()
  })

  it('overwrites an older copy of the same note', async () => {
    await put('sessions/x.md', 'old')
    const body = Buffer.from('new', 'utf8')
    await applyFile({ vaultRoot: root, path: 'sessions/x.md', content: body, sha256: sha256(body) })
    expect(await readFile(join(root, 'sessions/x.md'), 'utf8')).toBe('new')
  })
})
