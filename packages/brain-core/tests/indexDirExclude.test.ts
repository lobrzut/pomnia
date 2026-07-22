import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { EMBED_DIMS } from '../src/rag/embed.js'
import type { EmbedClient } from '../src/rag/embed.js'
import { indexDir } from '../src/rag/indexer.js'
import { openDb } from '../src/storage/db.js'

function mockEmbedder(): EmbedClient {
  return {
    embedBatch: async (texts: string[]) => texts.map(() => new Array<number>(EMBED_DIMS).fill(0.01)),
  } as EmbedClient
}

describe('indexDir excludes skills/', () => {
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

  it('indexes distilled + sessions + root USER.md, skips skills and _review', async () => {
    vaultDir = mkdtempSync(join(tmpdir(), 'pomnia-vault-'))
    dbDir = mkdtempSync(join(tmpdir(), 'pomnia-brain-index-'))

    mkdirSync(join(vaultDir, 'distilled'), { recursive: true })
    mkdirSync(join(vaultDir, 'sessions'), { recursive: true })
    mkdirSync(join(vaultDir, 'skills', 'cli', 'foo'), { recursive: true })
    mkdirSync(join(vaultDir, 'distilled', '_review'), { recursive: true })
    mkdirSync(join(vaultDir, '_quarantine_stubs'), { recursive: true })

    writeFileSync(join(vaultDir, 'USER.md'), 'User profile note with enough text to form a chunk.')
    writeFileSync(
      join(vaultDir, 'distilled', 'note.md'),
      'Distilled knowledge note with enough text to form a chunk for indexing.',
    )
    writeFileSync(
      join(vaultDir, 'sessions', 'sess.md'),
      'Saved session note with enough text to form a chunk for indexing.',
    )
    writeFileSync(
      join(vaultDir, 'skills', 'cli', 'foo', 'example_usage.md'),
      'Skill example_usage should NEVER enter library.db RAG index.',
    )
    writeFileSync(
      join(vaultDir, 'skills', 'cli', 'foo', 'SKILL.md'),
      'Skill body should NEVER enter library.db RAG index either.',
    )
    writeFileSync(
      join(vaultDir, 'distilled', '_review', 'stub.md'),
      'Review stub should NEVER enter library.db RAG index.',
    )
    writeFileSync(
      join(vaultDir, '_quarantine_stubs', 'bad.md'),
      'Quarantine stub should NEVER enter library.db RAG index.',
    )

    const db = openDb({ dbPath: join(dbDir, 'library.db') })
    const stats = await indexDir(db, mockEmbedder(), vaultDir)

    expect(stats.files).toBe(3)

    const names = (
      db.prepare('SELECT DISTINCT pdf_name AS n FROM chunks ORDER BY n').all() as { n: string }[]
    ).map((r) => r.n)
    expect(names).toEqual(['USER.md', 'note.md', 'sess.md'])
    expect(names).not.toContain('example_usage.md')
    expect(names).not.toContain('SKILL.md')
    expect(names).not.toContain('stub.md')
    expect(names).not.toContain('bad.md')

    db.close()
  })

  it('prunes previously indexed skills paths on next reindex', async () => {
    vaultDir = mkdtempSync(join(tmpdir(), 'pomnia-vault-'))
    dbDir = mkdtempSync(join(tmpdir(), 'pomnia-brain-index-'))

    mkdirSync(join(vaultDir, 'distilled'), { recursive: true })
    writeFileSync(
      join(vaultDir, 'distilled', 'keep.md'),
      'Keep this distilled note with enough text to form a chunk.',
    )

    const db = openDb({ dbPath: join(dbDir, 'library.db') })
    // Simulate pollution from an older indexer that walked skills/
    const skillPath = join(vaultDir, 'skills', 'example_usage.md')
    db.prepare(
      'INSERT INTO chunks (pdf_path, pdf_name, page_num, chunk_idx, text, char_count) VALUES (?, ?, 1, 0, ?, 10)',
    ).run(skillPath, 'example_usage.md', 'old skill junk')

    const stats = await indexDir(db, mockEmbedder(), vaultDir)
    expect(stats.prunedFiles).toBeGreaterThanOrEqual(1)

    const skillRows = db
      .prepare('SELECT COUNT(*) AS c FROM chunks WHERE pdf_name = ?')
      .get('example_usage.md') as { c: number }
    expect(Number(skillRows.c)).toBe(0)

    const keep = db
      .prepare('SELECT COUNT(*) AS c FROM chunks WHERE pdf_name = ?')
      .get('keep.md') as { c: number }
    expect(Number(keep.c)).toBeGreaterThan(0)

    db.close()
  })

  it('prunes orphan paths from a previous AppData vault root', async () => {
    vaultDir = mkdtempSync(join(tmpdir(), 'pomnia-portable-'))
    const legacyDir = mkdtempSync(join(tmpdir(), 'pomnia-appdata-vault-'))
    dbDir = mkdtempSync(join(tmpdir(), 'pomnia-brain-index-'))

    mkdirSync(join(vaultDir, 'distilled'), { recursive: true })
    writeFileSync(
      join(vaultDir, 'distilled', 'portable.md'),
      'Portable vault note with enough text to form a chunk for indexing.',
    )

    const db = openDb({ dbPath: join(dbDir, 'library.db') })
    const legacyPath = join(legacyDir, 'distilled', 'stale.md')
    db.prepare(
      'INSERT INTO chunks (pdf_path, pdf_name, page_num, chunk_idx, text, char_count) VALUES (?, ?, 1, 0, ?, 12)',
    ).run(legacyPath, 'stale.md', 'old appdata junk')

    // Logical library path under the NEW root must survive prune.
    const libPath = `${vaultDir.replace(/\\/g, '/')}/library/doc-keep`
    db.prepare(
      'INSERT INTO chunks (pdf_path, pdf_name, page_num, chunk_idx, text, char_count) VALUES (?, ?, 1, 0, ?, 10)',
    ).run(libPath, 'paper.pdf', 'library doc')

    const stats = await indexDir(db, mockEmbedder(), vaultDir)
    expect(stats.prunedFiles).toBeGreaterThanOrEqual(1)

    const stale = db
      .prepare('SELECT COUNT(*) AS c FROM chunks WHERE pdf_name = ?')
      .get('stale.md') as { c: number }
    expect(Number(stale.c)).toBe(0)

    const portable = db
      .prepare('SELECT COUNT(*) AS c FROM chunks WHERE pdf_name = ?')
      .get('portable.md') as { c: number }
    expect(Number(portable.c)).toBeGreaterThan(0)

    const lib = db.prepare('SELECT COUNT(*) AS c FROM chunks WHERE pdf_path = ?').get(libPath) as {
      c: number
    }
    expect(Number(lib.c)).toBeGreaterThan(0)

    db.close()
    try {
      rmSync(legacyDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })
})
