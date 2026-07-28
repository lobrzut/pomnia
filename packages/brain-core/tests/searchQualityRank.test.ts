// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { EMBED_DIMS } from '../src/rag/embed.js'
import type { EmbedClient } from '../src/rag/embed.js'
import { indexDir } from '../src/rag/indexer.js'
import { search } from '../src/rag/search.js'
import { openDb } from '../src/storage/db.js'
import { vecToBlob } from '../src/rag/vec.js'

function mockEmbedder(vec?: number[]): EmbedClient {
  const v = vec ?? new Array<number>(EMBED_DIMS).fill(0.01)
  return {
    embedOne: async () => v,
    embedBatch: async (texts: string[]) => texts.map(() => [...v]),
  } as EmbedClient
}

function insertChunk(
  db: ReturnType<typeof openDb>,
  opts: { path: string; name: string; text: string; vec: number[] },
): number {
  const info = db
    .prepare(
      'INSERT INTO chunks (pdf_path, pdf_name, page_num, chunk_idx, text, char_count) VALUES (?, ?, 1, 0, ?, ?)',
    )
    .run(opts.path, opts.name, opts.text, opts.text.length)
  const id = Number(info.lastInsertRowid)
  db.prepare('INSERT INTO chunks_vec (rowid, embedding) VALUES (?, ?)').run(
    BigInt(id),
    vecToBlob(opts.vec),
  )
  return id
}

describe('search quality path ranking', () => {
  let dbDir = ''

  afterEach(() => {
    if (dbDir) {
      try {
        rmSync(dbDir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
      dbDir = ''
    }
  })

  it('ranks non-_weak higher when sem_score is identical', async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'pomnia-search-rank-'))
    const db = openDb({ dbPath: join(dbDir, 'library.db') })
    const vec = new Array<number>(EMBED_DIMS).fill(0.02)
    // Identical embedding → identical sem_score; no keyword overlap with query.
    insertChunk(db, {
      path: 'C:/Vault/distilled/ok-note.md',
      name: 'ok-note.md',
      text: 'Generic distilled knowledge about networking topics without query tokens.',
      vec,
    })
    insertChunk(db, {
      path: 'C:/Vault/distilled/_weak/weak-note.md',
      name: 'weak-note.md',
      text: 'Generic distilled knowledge about networking topics without query tokens.',
      vec,
    })

    const hits = await search(db, mockEmbedder(vec), { query: 'zzzzunique', topK: 5 })
    expect(hits.length).toBe(2)
    expect(hits[0]!.path).toContain('ok-note.md')
    expect(hits[0]!.path).not.toContain('_weak')
    expect(hits[1]!.path).toContain('_weak')
    expect(hits[0]!.meta?.weakPenalty).toBe(0)
    expect(hits[1]!.meta?.weakPenalty).toBe(0.15)
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score)
    db.close()
  })

  it('applies sessions humanBoost in meta', async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'pomnia-search-boost-'))
    const db = openDb({ dbPath: join(dbDir, 'library.db') })
    const vec = new Array<number>(EMBED_DIMS).fill(0.03)
    insertChunk(db, {
      path: 'C:/Vault/sessions/human.md',
      name: 'human.md',
      text: 'Session save about foo bar baz uniquecontentxyz.',
      vec,
    })
    insertChunk(db, {
      path: 'C:/Vault/distilled/auto.md',
      name: 'auto.md',
      text: 'Distilled note about foo bar baz uniquecontentxyz.',
      vec,
    })

    const hits = await search(db, mockEmbedder(vec), { query: 'zzzzunique', topK: 5 })
    const sess = hits.find((h) => h.path.includes('sessions'))
    const dist = hits.find((h) => h.path.includes('distilled'))
    expect(sess?.meta?.humanBoost).toBe(0.05)
    expect(dist?.meta?.humanBoost).toBe(0)
    expect(sess!.score).toBeGreaterThan(dist!.score)
    db.close()
  })
})

describe('indexDir prune after move to _review', () => {
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

  it('prunes chunks when file moves to _review without re-embed of other files', async () => {
    vaultDir = mkdtempSync(join(tmpdir(), 'pomnia-prune-vault-'))
    dbDir = mkdtempSync(join(tmpdir(), 'pomnia-prune-db-'))
    mkdirSync(join(vaultDir, 'distilled'), { recursive: true })

    const keep = join(vaultDir, 'distilled', 'keep.md')
    const doomed = join(vaultDir, 'distilled', 'doomed.md')
    writeFileSync(keep, 'Keep this distilled note with enough text to form a chunk for indexing.')
    writeFileSync(
      doomed,
      'Doomed stub note with enough text to form a chunk for indexing before quarantine.',
    )

    const db = openDb({ dbPath: join(dbDir, 'library.db') })
    const emb = mockEmbedder()
    const first = await indexDir(db, emb, vaultDir)
    expect(first.files).toBe(2)

    const beforeDoomed = db
      .prepare('SELECT COUNT(*) AS c FROM chunks WHERE pdf_path = ?')
      .get(doomed) as { c: number }
    expect(Number(beforeDoomed.c)).toBeGreaterThan(0)

    mkdirSync(join(vaultDir, 'distilled', '_review'), { recursive: true })
    renameSync(doomed, join(vaultDir, 'distilled', '_review', 'doomed.md'))

    const second = await indexDir(db, emb, vaultDir)
    expect(second.prunedFiles).toBeGreaterThanOrEqual(1)
    // keep.md unchanged → skipped, no re-embed
    expect(second.skipped).toBeGreaterThanOrEqual(1)
    expect(second.files).toBe(0)

    const afterDoomed = db
      .prepare('SELECT COUNT(*) AS c FROM chunks WHERE pdf_name = ?')
      .get('doomed.md') as { c: number }
    expect(Number(afterDoomed.c)).toBe(0)

    const keepRows = db
      .prepare('SELECT COUNT(*) AS c FROM chunks WHERE pdf_name = ?')
      .get('keep.md') as { c: number }
    expect(Number(keepRows.c)).toBeGreaterThan(0)

    db.close()
  })
})
