import { mkdirSync, mkdtempSync, writeFileSync, rmSync, utimesSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EMBED_DIMS } from '../src/rag/embed.js'
import type { EmbedClient } from '../src/rag/embed.js'
import { indexDir } from '../src/rag/indexer.js'
import { openDb } from '../src/storage/db.js'

function mockEmbedder(embedBatch = vi.fn(async (texts: string[]) => texts.map(() => new Array<number>(EMBED_DIMS).fill(0.01)))): EmbedClient & {
  embedBatch: ReturnType<typeof vi.fn>
} {
  return { embedBatch } as EmbedClient & { embedBatch: ReturnType<typeof vi.fn> }
}

describe('indexDir incremental skip', () => {
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

  it('skips unchanged files on second indexDir (no re-embed)', async () => {
    vaultDir = mkdtempSync(join(tmpdir(), 'pomnia-incr-'))
    dbDir = mkdtempSync(join(tmpdir(), 'pomnia-incr-db-'))
    mkdirSync(join(vaultDir, 'distilled'), { recursive: true })
    const notePath = join(vaultDir, 'distilled', 'keep.md')
    writeFileSync(notePath, 'Stable distilled note with enough text to form a chunk for indexing.')

    const db = openDb({ dbPath: join(dbDir, 'library.db') })
    const embedder = mockEmbedder()

    const first = await indexDir(db, embedder, vaultDir)
    expect(first.files).toBe(1)
    expect(first.skipped).toBe(0)
    expect(first.chunks).toBeGreaterThan(0)
    const embedsAfterFirst = embedder.embedBatch.mock.calls.length
    expect(embedsAfterFirst).toBeGreaterThan(0)

    const chunkCount = (
      db.prepare('SELECT COUNT(*) AS c FROM chunks').get() as { c: number | bigint }
    ).c

    const second = await indexDir(db, embedder, vaultDir)
    expect(second.files).toBe(0)
    expect(second.skipped).toBe(1)
    expect(second.chunks).toBe(0)
    expect(embedder.embedBatch.mock.calls.length).toBe(embedsAfterFirst)

    const chunkCount2 = (
      db.prepare('SELECT COUNT(*) AS c FROM chunks').get() as { c: number | bigint }
    ).c
    expect(Number(chunkCount2)).toBe(Number(chunkCount))

    db.close()
  })

  it('re-embeds when file content changes', async () => {
    vaultDir = mkdtempSync(join(tmpdir(), 'pomnia-incr-chg-'))
    dbDir = mkdtempSync(join(tmpdir(), 'pomnia-incr-chg-db-'))
    mkdirSync(join(vaultDir, 'distilled'), { recursive: true })
    const notePath = join(vaultDir, 'distilled', 'note.md')
    writeFileSync(notePath, 'Original distilled note with enough text to form a chunk for indexing.')

    const db = openDb({ dbPath: join(dbDir, 'library.db') })
    const embedder = mockEmbedder()

    await indexDir(db, embedder, vaultDir)
    const embedsAfterFirst = embedder.embedBatch.mock.calls.length

    writeFileSync(
      notePath,
      'Changed distilled note with enough text to form a chunk for indexing — new content.',
    )
    // Ensure mtime/size differ on fast filesystems
    const st = statSync(notePath)
    utimesSync(notePath, st.atime, new Date(st.mtimeMs + 2000))

    const second = await indexDir(db, embedder, vaultDir)
    expect(second.files).toBe(1)
    expect(second.skipped).toBe(0)
    expect(embedder.embedBatch.mock.calls.length).toBeGreaterThan(embedsAfterFirst)

    const texts = (
      db.prepare('SELECT text FROM chunks WHERE pdf_path = ?').all(notePath) as { text: string }[]
    ).map((r) => r.text)
    expect(texts.some((t) => t.includes('Changed'))).toBe(true)

    db.close()
  })

  it('indexes only the new file when another is unchanged', async () => {
    vaultDir = mkdtempSync(join(tmpdir(), 'pomnia-incr-partial-'))
    dbDir = mkdtempSync(join(tmpdir(), 'pomnia-incr-partial-db-'))
    mkdirSync(join(vaultDir, 'distilled'), { recursive: true })
    writeFileSync(
      join(vaultDir, 'distilled', 'old.md'),
      'Old distilled note with enough text to form a chunk for indexing.',
    )

    const db = openDb({ dbPath: join(dbDir, 'library.db') })
    const embedder = mockEmbedder()
    await indexDir(db, embedder, vaultDir)
    const embedsAfterFirst = embedder.embedBatch.mock.calls.length

    writeFileSync(
      join(vaultDir, 'distilled', 'new.md'),
      'Brand new distilled note with enough text to form a chunk for indexing.',
    )

    const second = await indexDir(db, embedder, vaultDir)
    expect(second.files).toBe(1)
    expect(second.skipped).toBe(1)
    expect(embedder.embedBatch.mock.calls.length).toBeGreaterThan(embedsAfterFirst)

    const names = (
      db.prepare('SELECT DISTINCT pdf_name AS n FROM chunks ORDER BY n').all() as { n: string }[]
    ).map((r) => r.n)
    expect(names).toEqual(['new.md', 'old.md'])

    db.close()
  })
})
