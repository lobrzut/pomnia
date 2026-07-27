// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * SQLite + sqlite-vec bootstrap.
 *
 * Uses better-sqlite3 (native, synchronous — matches Python sqlite3 mental
 * model, no async everywhere). sqlite-vec is loaded as an extension via its
 * npm-shipped native binary (`sqlite-vec` package).
 *
 * Schema is byte-identical to Python `pipeline/rag.py::_open_db` so the
 * existing 54k-chunk library.db on the master is directly openable and
 * queryable by this code — no migration.
 */

import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { EMBED_DIMS } from '../rag/embed.js'

export interface OpenDbOptions {
  /** Path to library.db (created if missing). */
  dbPath: string
  /** Open read-only. Use for search-only workers that shouldn't touch the index. */
  readonly?: boolean
}

export type BrainDb = ReturnType<typeof openDb>

/**
 * Open (or create) the RAG SQLite database with sqlite-vec loaded and the
 * two schema objects the Python impl created.
 */
export function openDb(opts: OpenDbOptions): Database.Database {
  mkdirSync(dirname(opts.dbPath), { recursive: true })

  const db = new Database(opts.dbPath, { readonly: opts.readonly ?? false })

  // Load sqlite-vec extension. This is the async-native binary shipped in the
  // sqlite-vec npm package; the load call is synchronous.
  sqliteVec.load(db)

  if (!opts.readonly) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY,
        pdf_path TEXT NOT NULL,
        pdf_name TEXT NOT NULL,
        page_num INTEGER NOT NULL,
        chunk_idx INTEGER NOT NULL,
        text TEXT NOT NULL,
        char_count INTEGER NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
        embedding float[${EMBED_DIMS}]
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_pdf ON chunks(pdf_path);

      -- Fingerprints for incremental reindex (skip unchanged files). Additive;
      -- existing library.db opens fine without wipe.
      CREATE TABLE IF NOT EXISTS indexed_files (
        pdf_path TEXT PRIMARY KEY NOT NULL,
        content_hash TEXT NOT NULL,
        mtime_ms REAL,
        size INTEGER,
        updated_at TEXT NOT NULL
      );
    `)
  }

  return db
}
