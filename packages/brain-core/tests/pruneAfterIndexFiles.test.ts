import { mkdirSync, mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EMBED_DIMS } from '../src/rag/embed.js'
import type { EmbedClient } from '../src/rag/embed.js'
import { indexDir, indexFiles, pruneIndex } from '../src/rag/indexer.js'
import { openDb } from '../src/storage/db.js'

function mockEmbedder(): EmbedClient {
  return {
    embedBatch: vi.fn(async (texts: string[]) => texts.map(() => new Array<number>(EMBED_DIMS).fill(0.01))),
  } as unknown as EmbedClient
}

function indexedPaths(db: ReturnType<typeof openDb>): string[] {
  return (db.prepare('SELECT DISTINCT pdf_path AS p FROM chunks').all() as { p: string }[])
    .map((r) => r.p)
    .sort()
}

const BODY = 'A distilled note with enough prose in it to survive chunking and get embedded.'

/**
 * Regression from the project README: redistillation renames notes, so the
 * incremental pass that runs after distill kept appending while nothing ever
 * removed the old paths. Dead entries climbed 50 → 53 across runs that each
 * reported "reindexed", and they stayed searchable.
 */
describe('pruneIndex', () => {
  let dbDir = ''
  let vaultDir = ''

  afterEach(() => {
    for (const d of [dbDir, vaultDir]) {
      if (!d) continue
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
    dbDir = ''
    vaultDir = ''
  })

  function setup(): { db: ReturnType<typeof openDb>; distilled: string } {
    vaultDir = mkdtempSync(join(tmpdir(), 'pomnia-prune-'))
    dbDir = mkdtempSync(join(tmpdir(), 'pomnia-prune-db-'))
    const distilled = join(vaultDir, 'distilled')
    mkdirSync(distilled, { recursive: true })
    return { db: openDb({ dbPath: join(dbDir, 'library.db') }), distilled }
  }

  it('drops entries whose file was renamed away by redistillation', async () => {
    const { db, distilled } = setup()
    const embedder = mockEmbedder()

    const oldNote = join(distilled, '2026-07-30_old_title.md')
    writeFileSync(oldNote, BODY)
    await indexDir(db, embedder, vaultDir)
    expect(indexedPaths(db)).toEqual([oldNote])

    // Redistillation: same session, new filename. Old file is gone from disk.
    unlinkSync(oldNote)
    const newNote = join(distilled, '2026-07-31_new_title.md')
    writeFileSync(newNote, BODY)
    await indexFiles(db, embedder, [{ path: newNote, text: BODY }])

    // Append-only leaves both — that is the bug.
    expect(indexedPaths(db)).toEqual([oldNote, newNote].sort())

    expect(pruneIndex(db, vaultDir)).toBe(1)
    expect(indexedPaths(db)).toEqual([newNote])
  })

  it('keeps every note that is still on disk', async () => {
    const { db, distilled } = setup()
    const a = join(distilled, 'a.md')
    const b = join(distilled, 'b.md')
    writeFileSync(a, BODY)
    writeFileSync(b, BODY)
    await indexDir(db, mockEmbedder(), vaultDir)

    expect(pruneIndex(db, vaultDir)).toBe(0)
    expect(indexedPaths(db)).toEqual([a, b].sort())
  })

  it('removes leftovers from a previous vault root', async () => {
    const { db, distilled } = setup()
    const note = join(distilled, 'here.md')
    writeFileSync(note, BODY)
    await indexDir(db, mockEmbedder(), vaultDir)

    // Simulate a vault that moved: rows pointing outside the current root.
    const stale = join(tmpdir(), 'pomnia-old-vault', 'distilled', 'gone.md')
    db.prepare(
      'INSERT INTO chunks (pdf_path, pdf_name, page_num, chunk_idx, text, char_count) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(stale, 'gone.md', 1, 0, BODY, BODY.length)

    expect(pruneIndex(db, vaultDir)).toBe(1)
    expect(indexedPaths(db)).toEqual([note])
  })

  it('accepts a pre-walked path list instead of walking twice', async () => {
    const { db, distilled } = setup()
    const note = join(distilled, 'kept.md')
    writeFileSync(note, BODY)
    await indexDir(db, mockEmbedder(), vaultDir)

    // Claim nothing is on disk — prune must trust the list it was handed.
    expect(pruneIndex(db, vaultDir, { paths: [] })).toBe(1)
    expect(indexedPaths(db)).toEqual([])
  })
})
