// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * What an index was built with, recorded so a mismatch cannot pass silently.
 *
 * Vectors are only comparable to vectors made the same way. Change the model,
 * the dimension, or the two nomic prefixes, and every stored vector becomes
 * meaningless — while everything keeps working: the daemon starts, `/healthz`
 * says ok, and searches return confident nonsense.
 *
 * Incremental reindex cannot rescue it either, and that is the trap. The
 * indexer skips a file whose bytes have not changed, so re-running it over a
 * vault embedded with different settings walks the whole corpus, changes
 * nothing, and reports success over a broken index.
 *
 * This matters more once the index can live beside the vault rather than on
 * one machine: a folder carried to a second computer meets whatever embedder
 * that machine happens to run. Refusing is the only honest response, and it
 * has to name what differs, because "search is bad lately" is not a diagnosis
 * anybody arrives at on their own.
 */

import type Database from 'better-sqlite3'

export interface IndexFingerprint {
  backend: string
  model: string
  dims: number
  /** Both nomic prefixes, byte for byte. A trailing space is load-bearing. */
  docPrefix: string
  queryPrefix: string
  /** Bumped whenever chunk boundaries or chunk text composition change. */
  chunker: string
}

export class IndexFingerprintMismatch extends Error {
  constructor(
    readonly differences: string[],
    readonly stored: Partial<IndexFingerprint>,
    readonly current: IndexFingerprint,
  ) {
    super(
      `This index was not built with the embedder now configured, so every ` +
        `stored vector is meaningless to it: ${differences.join('; ')}. ` +
        `Rebuild it from the vault (--reindex after deleting library.db) or ` +
        `point this instance back at the settings it was built with. An ` +
        `incremental reindex will NOT repair this — the files have not ` +
        `changed, so the indexer would skip all of them and report success.`,
    )
    this.name = 'IndexFingerprintMismatch'
  }
}

export function ensureFingerprintTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS index_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `)
}

const KEYS: Array<[keyof IndexFingerprint, string]> = [
  ['backend', 'embed_backend'],
  ['model', 'embed_model'],
  ['dims', 'embed_dims'],
  ['docPrefix', 'embed_prefix_document'],
  ['queryPrefix', 'embed_prefix_query'],
  ['chunker', 'chunker_version'],
]

export function readFingerprint(db: Database.Database): Partial<IndexFingerprint> | null {
  let rows: Array<{ key: string; value: string }>
  try {
    rows = db.prepare('SELECT key, value FROM index_meta').all() as typeof rows
  } catch {
    return null // pre-fingerprint index
  }
  if (rows.length === 0) return null
  const byKey = new Map(rows.map((r) => [r.key, r.value]))
  const out: Partial<IndexFingerprint> = {}
  for (const [field, key] of KEYS) {
    const v = byKey.get(key)
    if (v === undefined) continue
    if (field === 'dims') out.dims = Number(v)
    else (out as Record<string, unknown>)[field] = v
  }
  return out
}

export function writeFingerprint(db: Database.Database, fp: IndexFingerprint): void {
  ensureFingerprintTable(db)
  const put = db.prepare('INSERT OR REPLACE INTO index_meta (key, value) VALUES (?, ?)')
  const tx = db.transaction(() => {
    for (const [field, key] of KEYS) put.run(key, String(fp[field]))
    put.run('built_at', new Date().toISOString())
  })
  tx()
}

/**
 * Compare, naming every field that differs.
 *
 * A missing fingerprint is not a mismatch: indexes built before this existed
 * are common and usually fine. Refusing to open them would strand working
 * installs over a bookkeeping gap, so they pass and get stamped on the next
 * write instead.
 */
export function compareFingerprint(
  stored: Partial<IndexFingerprint> | null,
  current: IndexFingerprint,
): string[] {
  if (!stored) return []
  const diffs: string[] = []
  const say = (label: string, was: unknown, now: unknown): void => {
    if (was === undefined) return // field absent in an older stamp
    if (String(was) !== String(now)) diffs.push(`${label} was ${JSON.stringify(was)}, now ${JSON.stringify(now)}`)
  }
  say('embedding model', stored.model, current.model)
  say('dimensions', stored.dims, current.dims)
  say('document prefix', stored.docPrefix, current.docPrefix)
  say('query prefix', stored.queryPrefix, current.queryPrefix)
  say('chunker', stored.chunker, current.chunker)
  // Backend is deliberately not compared: ollama and fastembed run the same
  // nomic weights and were measured interchangeable (cosine 0.99996). Refusing
  // that swap would block the appliance from reading a desktop-built index,
  // which is the whole point of the vault being portable.
  return diffs
}

/** Throw when the stored stamp and the running embedder cannot agree. */
export function assertFingerprint(
  db: Database.Database,
  current: IndexFingerprint,
): void {
  const stored = readFingerprint(db)
  const diffs = compareFingerprint(stored, current)
  if (diffs.length > 0) throw new IndexFingerprintMismatch(diffs, stored ?? {}, current)
}
