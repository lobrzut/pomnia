import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { collectOverview, createActivityRing, indexBreakdown, vaultBreakdown } from './overview.js'

let root: string

const put = async (rel: string, body: string): Promise<void> => {
  await mkdir(join(root, rel, '..'), { recursive: true })
  await writeFile(join(root, rel), body, 'utf8')
}

function db(files: number, chunks: number, withMtime = true): Database.Database {
  const d = new Database(':memory:')
  d.exec(
    withMtime
      ? 'CREATE TABLE indexed_files (p TEXT, mtime_ms INTEGER); CREATE TABLE chunks (p TEXT)'
      : 'CREATE TABLE indexed_files (p TEXT); CREATE TABLE chunks (p TEXT)',
  )
  for (let i = 0; i < files; i++) {
    if (withMtime) d.prepare('INSERT INTO indexed_files VALUES (?, ?)').run(`f${i}`, 1_700_000_000_000 + i)
    else d.prepare('INSERT INTO indexed_files VALUES (?)').run(`f${i}`)
  }
  for (let i = 0; i < chunks; i++) d.prepare('INSERT INTO chunks VALUES (?)').run(`c${i}`)
  return d
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pomnia-overview-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('activity ring', () => {
  it('returns newest first', () => {
    const r = createActivityRing()
    r.push({ tool: 'a', ts: 1 })
    r.push({ tool: 'b', ts: 2 })
    expect(r.recent().map((e) => e.tool)).toEqual(['b', 'a'])
  })

  /** It is a window, not a log: it must not grow without bound. */
  it('keeps only the last N', () => {
    const r = createActivityRing(5)
    for (let i = 0; i < 50; i++) r.push({ tool: `t${i}`, ts: i })
    expect(r.recent()).toHaveLength(5)
    expect(r.recent()[0].tool).toBe('t49')
  })

  it('counts within a window', () => {
    const r = createActivityRing()
    r.push({ tool: 'now', ts: Date.now() })
    r.push({ tool: 'old', ts: Date.now() - 2 * 60 * 60_000 })
    expect(r.countSince(60 * 60_000)).toBe(1)
    expect(r.countSince(24 * 60 * 60_000)).toBe(2)
  })

  it('groups actors and counts their calls', () => {
    const r = createActivityRing()
    const now = Date.now()
    r.push({ tool: 'search_library', ts: now - 1000, actor: 'laptop' })
    r.push({ tool: 'search_library', ts: now - 500, actor: 'laptop' })
    r.push({ tool: 'get_user_profile', ts: now, actor: 'phone' })
    const actors = r.actors(60 * 60_000)
    expect(actors.map((a) => a.name)).toEqual(['phone', 'laptop'])
    expect(actors.find((a) => a.name === 'laptop')!.calls).toBe(2)
  })

  it('ignores calls with no actor rather than inventing one', () => {
    const r = createActivityRing()
    r.push({ tool: 'x', ts: Date.now() })
    expect(r.actors(60 * 60_000)).toEqual([])
  })
})

describe('vaultBreakdown', () => {
  /**
   * The indexer never walks skills/ — it is served by get_skill, not searched.
   * Counting it made the live dashboard report an 851-file gap that did not
   * exist, which is how a metric earns being ignored.
   */
  it('marks which directories the indexer would actually visit', async () => {
    await put('sessions/a.md', 'a')
    await put('distilled/b.md', 'b')
    await put('skills/brain/x/SKILL.md', 'c')
    await put('notes/n.md', 'n')
    const by = Object.fromEntries((await vaultBreakdown(root)).map((v) => [v.dir, v.indexable]))
    expect(by).toEqual({ sessions: true, distilled: true, skills: false, notes: false })
  })

  /** _review and _quarantine_stubs sit *inside* distilled/. */
  it('skips quarantine folders at any depth', async () => {
    await put('distilled/good.md', 'g')
    await put('distilled/_review/bad.md', 'b')
    await put('distilled/_quarantine_stubs/stub.md', 's')
    expect((await vaultBreakdown(root)).find((v) => v.dir === 'distilled')!.files).toBe(1)
  })

  it('counts per directory and skips empty ones', async () => {
    await put('sessions/a.md', 'aaa')
    await put('sessions/b.md', 'bb')
    await put('distilled/c.md', 'c')
    const b = await vaultBreakdown(root)
    expect(b.map((x) => x.dir)).toEqual(['sessions', 'distilled'])
    expect(b[0]).toMatchObject({ files: 2, bytes: 5 })
  })

  it('recurses into subdirectories', async () => {
    await put('skills/brain/x/SKILL.md', 'hello')
    expect((await vaultBreakdown(root))[0]).toMatchObject({ dir: 'skills', files: 1 })
  })

  /** Blobs and snapshots are not memory and must not inflate the count. */
  it('ignores directories that are not memory', async () => {
    await put('blobs/ab/cd.bin', 'x')
    await put('snapshots/s.json', '{}')
    await put('sessions/a.md', 'a')
    expect((await vaultBreakdown(root)).map((x) => x.dir)).toEqual(['sessions'])
  })

  it('ignores non-text files inside a counted directory', async () => {
    await put('sessions/a.md', 'a')
    await put('sessions/photo.png', 'x')
    expect((await vaultBreakdown(root))[0].files).toBe(1)
  })

  it('treats a missing vault as empty rather than throwing', async () => {
    await expect(vaultBreakdown(join(root, 'gone'))).resolves.toEqual([])
  })
})

describe('indexBreakdown', () => {
  it('reports counts', () => {
    expect(indexBreakdown(db(10, 44))).toMatchObject({ files: 10, chunks: 44 })
  })

  /** Absent, not zero — zero renders as 1970 and reads as a broken index. */
  it('reports null rather than 0 when the schema has no timestamp', () => {
    expect(indexBreakdown(db(3, 3, false)).lastIndexedAt).toBeNull()
  })

  it('survives a database with no tables', () => {
    expect(indexBreakdown(new Database(':memory:'))).toEqual({ files: 0, chunks: 0, lastIndexedAt: null })
  })

  it('handles a closed handle without throwing', () => {
    expect(indexBreakdown(null)).toEqual({ files: 0, chunks: 0, lastIndexedAt: null })
  })
})

describe('collectOverview', () => {
  /**
   * The number that matters: notes on disk the index has never seen. It is the
   * state a failed reindex leaves behind while every counter it wrote says
   * success, and you can only see it by measuring both sides.
   */
  // Writes 710 files, so it is slow by nature and was sitting just under
  // vitest's 5s default: any extra load elsewhere in the suite tipped it into
  // a timeout that said nothing about the gap arithmetic it actually checks.
  it('reports the gap between disk and index', { timeout: 30_000 }, async () => {
    for (let i = 0; i < 10; i++) await put(`sessions/n${i}.md`, 'x')
    // Not indexable, so it must not widen the gap.
    for (let i = 0; i < 700; i++) await put(`skills/s${i}.md`, 'x')
    const o = await collectOverview({
      db: db(4, 12),
      vaultRoot: root,
      ring: createActivityRing(),
      startedAt: Date.now() - 5000,
      version: '0.1.7',
    })
    expect(o.unindexed).toBe(6)
  })

  it('never reports a negative gap when the index holds stale rows', async () => {
    await put('sessions/a.md', 'x')
    const o = await collectOverview({
      db: db(40, 100),
      vaultRoot: root,
      ring: createActivityRing(),
      startedAt: Date.now(),
      version: '0.1.7',
    })
    expect(o.unindexed).toBe(0)
  })

  it('carries the activity window through', async () => {
    const ring = createActivityRing()
    ring.push({ tool: 'search_library', detail: 'pomnia', ts: Date.now(), actor: 'laptop' })
    const o = await collectOverview({
      db: db(1, 1),
      vaultRoot: root,
      ring,
      startedAt: Date.now(),
      version: '0.1.7',
    })
    expect(o.activity.lastHour).toBe(1)
    expect(o.activity.actors[0].name).toBe('laptop')
    expect(o.activity.recent[0].tool).toBe('search_library')
  })
})
