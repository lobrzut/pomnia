import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { EMBED_DIMS } from '../src/rag/embed.js'
import type { EmbedClient } from '../src/rag/embed.js'
import { indexDocument } from '../src/rag/indexer.js'
import { openDb } from '../src/storage/db.js'

function mockEmbedder(): EmbedClient {
  return {
    embedBatch: async (texts: string[]) => texts.map(() => new Array<number>(EMBED_DIMS).fill(0.01)),
  } as EmbedClient
}

describe('indexDocument', () => {
  let dbPath = ''
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

  it('stores page_num per PDF page', async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'pomnia-brain-index-'))
    dbPath = join(dbDir, 'library.db')
    const db = openDb({ dbPath })

    const stats = await indexDocument(db, mockEmbedder(), {
      path: '/vault/library/sources/abc_paper.pdf',
      name: 'paper.pdf',
      pages: [
        { page: 1, text: 'Introduction paragraph with enough text to chunk properly for the test case.' },
        { page: 2, text: 'Methods section describing experimental setup and evaluation metrics used.' },
      ],
    })

    expect(stats.files).toBe(1)
    expect(stats.chunks).toBeGreaterThan(0)

    const rows = db
      .prepare('SELECT page_num, chunk_idx FROM chunks WHERE pdf_path = ? ORDER BY chunk_idx')
      .all('/vault/library/sources/abc_paper.pdf') as { page_num: number | bigint; chunk_idx: number | bigint }[]

    const pageNums = rows.map((r) => Number(r.page_num))
    expect(pageNums).toContain(1)
    expect(pageNums).toContain(2)
    db.close()
  })

  it('removeDocumentChunks deletes rows for one path only', async () => {
    const { removeDocumentChunks } = await import('../src/rag/indexer.js')
    dbDir = mkdtempSync(join(tmpdir(), 'pomnia-brain-rmdoc-'))
    dbPath = join(dbDir, 'library.db')
    const db = openDb({ dbPath })

    await indexDocument(db, mockEmbedder(), {
      path: '/vault/library/doc-a',
      name: 'a.pdf',
      pages: [{ page: 1, text: 'Document A has enough characters to form at least one embedding chunk.' }],
    })
    await indexDocument(db, mockEmbedder(), {
      path: '/vault/library/doc-b',
      name: 'b.pdf',
      pages: [{ page: 1, text: 'Document B also needs enough characters to form at least one embedding chunk.' }],
    })

    const removed = removeDocumentChunks(db, '/vault/library/doc-a')
    expect(removed).toBeGreaterThan(0)
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM chunks WHERE pdf_path = ?').get('/vault/library/doc-a') as { n: number })
        .n,
    ).toBe(0)
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM chunks WHERE pdf_path = ?').get('/vault/library/doc-b') as { n: number })
        .n,
    ).toBeGreaterThan(0)
    db.close()
  })
})
