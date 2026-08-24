// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  assertFingerprint,
  compareFingerprint,
  ensureFingerprintTable,
  readFingerprint,
  writeFingerprint,
  type IndexFingerprint,
} from './indexFingerprint.js'

const NOMIC: IndexFingerprint = {
  backend: 'ollama',
  model: 'nomic-embed-text',
  dims: 768,
  docPrefix: 'search_document: ',
  queryPrefix: 'search_query: ',
  chunker: 'v1',
}

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  ensureFingerprintTable(db)
})

describe('what an index remembers about how it was built', () => {
  it('round-trips the stamp', () => {
    writeFingerprint(db, NOMIC)
    expect(readFingerprint(db)).toMatchObject(NOMIC)
  })

  it('accepts the same settings', () => {
    writeFingerprint(db, NOMIC)
    expect(() => assertFingerprint(db, NOMIC)).not.toThrow()
  })

  it('refuses a different model and says which', () => {
    writeFingerprint(db, NOMIC)
    expect(() => assertFingerprint(db, { ...NOMIC, model: 'mxbai-embed-large' }))
      .toThrow(/embedding model was "nomic-embed-text", now "mxbai-embed-large"/)
  })

  it('refuses a changed prefix, which is the failure nobody sees', () => {
    // Dropping the trailing space took cosine from 0.99996 to 0.92 the last
    // time this happened, and an incremental reindex reported success over it.
    writeFingerprint(db, NOMIC)
    expect(() => assertFingerprint(db, { ...NOMIC, docPrefix: 'search_document:' }))
      .toThrow(/document prefix/)
  })

  it('refuses a changed dimension', () => {
    writeFingerprint(db, NOMIC)
    expect(() => assertFingerprint(db, { ...NOMIC, dims: 1024 })).toThrow(/dimensions/)
  })

  it('refuses a rechunked corpus', () => {
    writeFingerprint(db, NOMIC)
    expect(() => assertFingerprint(db, { ...NOMIC, chunker: 'v2' })).toThrow(/chunker/)
  })

  it('names every difference at once rather than the first', () => {
    writeFingerprint(db, NOMIC)
    try {
      assertFingerprint(db, { ...NOMIC, model: 'other', dims: 1024, chunker: 'v2' })
      throw new Error('should have thrown')
    } catch (e) {
      const m = (e as Error).message
      expect(m).toMatch(/embedding model/)
      expect(m).toMatch(/dimensions/)
      expect(m).toMatch(/chunker/)
    }
  })

  it('tells the reader that an incremental reindex will not fix it', () => {
    writeFingerprint(db, NOMIC)
    expect(() => assertFingerprint(db, { ...NOMIC, dims: 1024 }))
      .toThrow(/incremental reindex will NOT repair this/)
  })

  it('lets the two backends read each other, because the weights are the same', () => {
    // Measured interchangeable at cosine 0.99996. Refusing this would stop an
    // appliance opening an index a desktop built, which is the point of the
    // vault being portable.
    writeFingerprint(db, NOMIC)
    expect(() => assertFingerprint(db, { ...NOMIC, backend: 'fastembed' })).not.toThrow()
  })

  it('does not strand an index built before stamping existed', () => {
    expect(readFingerprint(db)).toBeNull()
    expect(() => assertFingerprint(db, NOMIC)).not.toThrow()
  })

  it('survives a database with no index_meta table at all', () => {
    const bare = new Database(':memory:')
    expect(readFingerprint(bare)).toBeNull()
    expect(compareFingerprint(null, NOMIC)).toEqual([])
  })

  it('ignores a field the older stamp never wrote', () => {
    writeFingerprint(db, NOMIC)
    db.prepare('DELETE FROM index_meta WHERE key = ?').run('chunker_version')
    expect(() => assertFingerprint(db, { ...NOMIC, chunker: 'v9' })).not.toThrow()
  })
})
