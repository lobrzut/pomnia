import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyFile, sha256 } from './receive.js'

/**
 * The failure these cover: a conflict is recorded but not resolved, so the very
 * same disagreement was re-detected and re-copied on every subsequent sync.
 * Two checkpoints on a live vault reached -9 in a day and a half.
 */
describe('applyFile — a conflict is recorded once, not once per sync', () => {
  let vaultRoot: string
  const rel = 'sessions/checkpoints/note.md'

  beforeEach(async () => {
    vaultRoot = await mkdtemp(join(tmpdir(), 'pomnia-conflict-'))
    await mkdir(join(vaultRoot, 'sessions', 'checkpoints'), { recursive: true })
    await writeFile(join(vaultRoot, rel), 'local version\n')
  })
  afterEach(async () => {
    await rm(vaultRoot, { recursive: true, force: true })
  })

  const send = (body: string) =>
    applyFile({ vaultRoot, path: rel, content: Buffer.from(body), sha256: sha256(Buffer.from(body)) })

  async function copies(): Promise<string[]> {
    const all = await readdir(join(vaultRoot, 'sessions', 'checkpoints'))
    return all.filter((n) => /-\d+\.md$/.test(n)).sort()
  }

  it('writes the copy the first time', async () => {
    const r = await send('incoming version\n')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.conflict?.wrote).toBe('sessions/checkpoints/note-2.md')
    expect(await copies()).toEqual(['note-2.md'])
  })

  it('does not write a second copy of the same disagreement', async () => {
    await send('incoming version\n')
    const again = await send('incoming version\n')
    expect(again.ok).toBe(true)
    if (again.ok) {
      expect(again.conflict?.wrote).toBe('sessions/checkpoints/note-2.md')
      expect(again.unchanged).toBe(true)
    }
    expect(await copies()).toEqual(['note-2.md'])
  })

  it('stays at one copy across many syncs — this is the actual incident', async () => {
    for (let i = 0; i < 9; i++) await send('incoming version\n')
    expect(await copies()).toEqual(['note-2.md'])
  })

  it('still records a genuinely different incoming version', async () => {
    await send('incoming version\n')
    await send('a third, different version\n')
    expect(await copies()).toEqual(['note-2.md', 'note-3.md'])
  })

  it('treats a CRLF-only difference as the same disagreement', async () => {
    // Same reason the conflict test itself ignores CR: two machines that
    // disagree about line endings have not disagreed about content.
    await send('incoming version\n')
    await send('incoming version\r\n')
    expect(await copies()).toEqual(['note-2.md'])
  })

  it('leaves the local file untouched when pointing at an existing copy', async () => {
    await send('incoming version\n')
    await send('incoming version\n')
    expect(await readFile(join(vaultRoot, rel), 'utf8')).toBe('local version\n')
  })

  it('recognises a copy recorded before this fix shipped', async () => {
    // Vaults already carry -2..-9 from the old behaviour; the first sync after
    // upgrading must not add a -10 on top of them.
    for (let n = 2; n <= 9; n++) {
      await writeFile(join(vaultRoot, 'sessions', 'checkpoints', `note-${n}.md`), 'incoming version\n')
    }
    await send('incoming version\n')
    expect((await copies()).length).toBe(8)
  })
})
