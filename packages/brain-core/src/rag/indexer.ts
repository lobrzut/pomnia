// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Index builder — ingest markdown/text files into library.db.
 *
 * Node-side counterpart of Python `pipeline/rag.py::index_file` for the
 * formats the embedded brain produces: distilled .md notes, session saves,
 * and parsed documents (PDF/DOCX via @pomnia/doc-parser).
 *
 * Parity notes:
 *  - chunking: chunk.ts is byte-identical to Python `_chunk_text`
 *  - schema:   db.ts creates the same tables, insert shape matches
 *    (delete-then-insert per file, chunks row → chunks_vec rowid)
 *  - page_num: per PDF page; 1 for DOCX/MD/TXT (Python convention)
 *
 * Incremental: indexDir skips files whose mtime+size (or content hash) match
 * `indexed_files` — no DELETE+re-embed. Orphan prune still runs.
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type Database from 'better-sqlite3'

import { chunkText, CHUNKER_VERSION } from './chunk.js'
import { applyEmbedPrefix, EMBED_DIMS } from './embed.js'
import { assertFingerprint, writeFingerprint, type IndexFingerprint } from '../storage/indexFingerprint.js'
import type { EmbedClient } from './embed.js'
import { vecToBlob } from './vec.js'

/** Embed batch size — matches Python BATCH = 32. */
const BATCH = 32

/** File extensions the embedded indexer ingests as plain text. */
const TEXT_EXTS = new Set(['.md', '.txt', '.markdown'])

function throwIfAborted(signal?: AbortSignal, message = 'aborted'): void {
  if (!signal?.aborted) return
  const err = new Error(message)
  err.name = 'AbortError'
  throw err
}

/** SHA-256 of UTF-8 file content — stable skip key when mtime drifts. */
export function contentHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export interface IndexStats {
  /** Files newly embedded (delete+re-insert). */
  files: number
  chunks: number
  /** Files whose content produced zero chunks (empty after collapse). */
  empty: number
  /** DB rows removed because their file vanished from disk (prune pass). */
  prunedFiles: number
  /** Unchanged files skipped (no re-embed). */
  skipped: number
}

export interface IndexProgressEvent {
  file: string
  /** Files fully processed so far (indexed or skipped). */
  done: number
  total: number
}

export interface IndexFileInput {
  /** Absolute path — primary key in the chunks table (pdf_path). */
  path: string
  /** Display name (pdf_name). Defaults to basename(path). */
  name?: string
  text: string
}

export interface IndexDocumentInput {
  /** Absolute path to source file in vault/library/sources (pdf_path key). */
  path: string
  name?: string
  pages: { page: number; text: string }[]
}

type FileMetaRow = { content_hash: string; mtime_ms: number | null; size: number | null }

function upsertFileMeta(
  db: Database.Database,
  path: string,
  hash: string,
  mtimeMs: number | null,
  size: number | null,
): void {
  db.prepare(
    `INSERT INTO indexed_files (pdf_path, content_hash, mtime_ms, size, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(pdf_path) DO UPDATE SET
       content_hash = excluded.content_hash,
       mtime_ms = excluded.mtime_ms,
       size = excluded.size,
       updated_at = excluded.updated_at`,
  ).run(path, hash, mtimeMs, size, new Date().toISOString())
}

function deleteFileMeta(db: Database.Database, path: string): void {
  db.prepare('DELETE FROM indexed_files WHERE pdf_path = ?').run(path)
}

/**
 * Drop all chunks + vec rows + fingerprint for one logical document path
 * (e.g. `{vault}/library/{docId}`). Safe when the path was never indexed (0).
 */
export function removeDocumentChunks(db: Database.Database, pdfPath: string): number {
  const selIds = db.prepare('SELECT id FROM chunks WHERE pdf_path = ?')
  const delVec = db.prepare('DELETE FROM chunks_vec WHERE rowid = ?')
  const delChunks = db.prepare('DELETE FROM chunks WHERE pdf_path = ?')
  const ids = (selIds.all(pdfPath) as { id: number }[]).map((r) => r.id)
  if (ids.length === 0) {
    deleteFileMeta(db, pdfPath)
    return 0
  }
  const wipe = db.transaction((rowIds: number[]) => {
    for (const id of rowIds) delVec.run(BigInt(id))
    delChunks.run(pdfPath)
    deleteFileMeta(db, pdfPath)
  })
  wipe(ids)
  return ids.length
}

function fileStatMeta(path: string): { mtimeMs: number; size: number } | null {
  try {
    const st = statSync(path)
    return { mtimeMs: st.mtimeMs, size: st.size }
  } catch {
    return null
  }
}

/**
 * What this embedder would stamp on an index it built.
 *
 * The prefixes are read through `applyEmbedPrefix` rather than copied, so the
 * stamp cannot drift from the thing it describes: if someone edits the prefix
 * table, the fingerprint changes with it and every existing index correctly
 * stops matching.
 */
function currentFingerprint(embedder: EmbedClient): IndexFingerprint | null {
  // A double without a config is not a mismatch, it is an absence. Refusing to
  // index because a test stub carries no model metadata would break callers
  // over bookkeeping; a real EmbedClient always exposes this.
  const cfg = embedder.config as { modelId?: string } | undefined
  if (!cfg?.modelId) return null
  return {
    backend: embedder.backend,
    model: cfg.modelId,
    dims: EMBED_DIMS,
    docPrefix: applyEmbedPrefix('', 'document'),
    queryPrefix: applyEmbedPrefix('', 'query'),
    chunker: CHUNKER_VERSION,
  }
}

/**
 * (Re)index a set of in-memory documents. Existing rows for each path are
 * dropped first — same "re-index from scratch per file" semantics as Python.
 * Always embeds (no skip) — callers that want incremental use indexDir.
 */
export async function indexFiles(
  db: Database.Database,
  embedder: EmbedClient,
  files: IndexFileInput[],
  onProgress?: (p: IndexProgressEvent) => void,
  signal?: AbortSignal,
): Promise<IndexStats> {
  const delVec = db.prepare('DELETE FROM chunks_vec WHERE rowid = ?')
  const selIds = db.prepare('SELECT id FROM chunks WHERE pdf_path = ?')
  const delChunks = db.prepare('DELETE FROM chunks WHERE pdf_path = ?')
  const insChunk = db.prepare(
    'INSERT INTO chunks (pdf_path, pdf_name, page_num, chunk_idx, text, char_count) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const insVec = db.prepare('INSERT INTO chunks_vec (rowid, embedding) VALUES (?, ?)')

  const stats: IndexStats = { files: 0, chunks: 0, empty: 0, prunedFiles: 0, skipped: 0 }
  let done = 0

  for (const f of files) {
    if (signal?.aborted) throwIfAborted(signal, 'reindex aborted')
    const name = f.name ?? basename(f.path)

    // Drop previous rows for this path (vec rows first — they key off chunk ids).
    // BigInt binds: better-sqlite3 v12 binds JS numbers as REAL, and vec0
    // rejects non-INTEGER rowids — BigInt forces INTEGER binding.
    const oldIds = (selIds.all(f.path) as { id: number }[]).map((r) => r.id)
    if (oldIds.length > 0) {
      const wipe = db.transaction((ids: number[]) => {
        for (const id of ids) delVec.run(BigInt(id))
        delChunks.run(f.path)
      })
      wipe(oldIds)
    }

    const chunks = chunkText(f.text)
    if (chunks.length === 0) {
      stats.empty += 1
      const st = fileStatMeta(f.path)
      upsertFileMeta(db, f.path, contentHash(f.text), st?.mtimeMs ?? null, st?.size ?? null)
      done += 1
      onProgress?.({ file: name, done, total: files.length })
      continue
    }

    for (let i = 0; i < chunks.length; i += BATCH) {
      if (signal?.aborted) throwIfAborted(signal, 'reindex aborted')
      const batch = chunks.slice(i, i + BATCH)
      // Embedding happens OUTSIDE the write transaction — Ollama can take
      // seconds per batch and holding a write lock that long is rude to
      // any concurrent search. The `search_document: ` prefix is applied by
      // EmbedClient; Ollama's template does NOT add it, contrary to what this
      // comment used to claim (measured: cosine 0.92 between prefixed and bare).
      const vecs = await embedder.embedBatch(batch, 'document', signal)
      if (vecs.length !== batch.length) {
        throw new Error(`embed count mismatch: got ${vecs.length} for ${batch.length} chunks (${name})`)
      }
      const write = db.transaction(() => {
        for (let j = 0; j < batch.length; j++) {
          const info = insChunk.run(f.path, name, 1n, BigInt(i + j), batch[j], BigInt(batch[j].length))
          insVec.run(BigInt(info.lastInsertRowid), vecToBlob(vecs[j]))
        }
      })
      write()
      stats.chunks += batch.length
    }

    const st = fileStatMeta(f.path)
    upsertFileMeta(db, f.path, contentHash(f.text), st?.mtimeMs ?? null, st?.size ?? null)

    stats.files += 1
    done += 1
    onProgress?.({ file: name, done, total: files.length })
  }

  return stats
}

/**
 * Index a parsed document with page_num per PDF page (or 1 for DOCX/MD/TXT).
 * New document imports should use this — not localIndex JSON (library.db only).
 */
export async function indexDocument(
  db: Database.Database,
  embedder: EmbedClient,
  doc: IndexDocumentInput,
  onProgress?: (p: IndexProgressEvent) => void,
  signal?: AbortSignal,
): Promise<IndexStats> {
  const delVec = db.prepare('DELETE FROM chunks_vec WHERE rowid = ?')
  const selIds = db.prepare('SELECT id FROM chunks WHERE pdf_path = ?')
  const delChunks = db.prepare('DELETE FROM chunks WHERE pdf_path = ?')
  const insChunk = db.prepare(
    'INSERT INTO chunks (pdf_path, pdf_name, page_num, chunk_idx, text, char_count) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const insVec = db.prepare('INSERT INTO chunks_vec (rowid, embedding) VALUES (?, ?)')

  const name = doc.name ?? basename(doc.path)
  const stats: IndexStats = { files: 0, chunks: 0, empty: 0, prunedFiles: 0, skipped: 0 }

  if (signal?.aborted) throwIfAborted(signal, 'index aborted')

  const oldIds = (selIds.all(doc.path) as { id: number }[]).map((r) => r.id)
  if (oldIds.length > 0) {
    const wipe = db.transaction((ids: number[]) => {
      for (const id of ids) delVec.run(BigInt(id))
      delChunks.run(doc.path)
    })
    wipe(oldIds)
  }

  const pending: { pageNum: number; chunkIdx: number; text: string }[] = []
  let chunkIdx = 0
  for (const page of doc.pages) {
    const chunks = chunkText(page.text)
    if (chunks.length === 0) continue
    for (const text of chunks) {
      pending.push({ pageNum: page.page, chunkIdx, text })
      chunkIdx += 1
    }
  }

  const joined = doc.pages.map((p) => p.text).join('\n\n')
  const st = fileStatMeta(doc.path)

  if (pending.length === 0) {
    stats.empty = 1
    upsertFileMeta(db, doc.path, contentHash(joined), st?.mtimeMs ?? null, st?.size ?? null)
    onProgress?.({ file: name, done: 1, total: 1 })
    return stats
  }

  for (let i = 0; i < pending.length; i += BATCH) {
    if (signal?.aborted) throwIfAborted(signal, 'index aborted')
    const batch = pending.slice(i, i + BATCH)
    const texts = batch.map((b) => b.text)
    const vecs = await embedder.embedBatch(texts, 'document', signal)
    if (vecs.length !== texts.length) {
      throw new Error(`embed count mismatch: got ${vecs.length} for ${texts.length} chunks (${name})`)
    }
    const write = db.transaction(() => {
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j]!
        const info = insChunk.run(
          doc.path,
          name,
          BigInt(row.pageNum),
          BigInt(row.chunkIdx),
          row.text,
          BigInt(row.text.length),
        )
        insVec.run(BigInt(info.lastInsertRowid), vecToBlob(vecs[j]!))
      }
    })
    write()
    stats.chunks += batch.length
    onProgress?.({ file: name, done: Math.min(i + batch.length, pending.length), total: pending.length })
  }

  upsertFileMeta(db, doc.path, contentHash(joined), st?.mtimeMs ?? null, st?.size ?? null)
  stats.files = 1
  onProgress?.({ file: name, done: pending.length, total: pending.length })
  return stats
}

/**
 * Directories never walked into library.db.
 * - `_review` / `_quarantine_stubs`: low-quality / quarantine distill stubs
 * - `skills`: skill repos (list_skills / get_skill) — not RAG content
 * - `blobs` / `snapshots`: encrypted vault sidecar (not markdown knowledge)
 * - `node_modules` / `.git`: deps / VCS (`.git` also caught by dot-prefix skip)
 */
export const SKIP_DIRS = new Set([
  '_review',
  '_quarantine_stubs',
  'skills',
  'blobs',
  'snapshots',
  'node_modules',
  '.git',
])

/**
 * When present as immediate children of the vault root, only these trees are
 * walked (plus any loose `.md`/`.txt` at the root, e.g. USER.md).
 * Skills live next to distilled/ but must never enter RAG.
 */
export const INDEX_SUBDIRS = new Set(['distilled', 'sessions', 'library'])

/** Basenames never indexed even if they appear outside skills/ (belt-and-suspenders). */
const SKIP_BASENAMES = new Set(['example_usage.md'])

/** Recursively list indexable text files under a vault/notes root. */
function listTextFiles(root: string): string[] {
  const out: string[] = []
  const rootEntries = readdirSync(root).filter((e) => !e.startsWith('.'))
  const restrictToAllow =
    rootEntries.some((e) => {
      try {
        return INDEX_SUBDIRS.has(e) && statSync(join(root, e)).isDirectory()
      } catch {
        return false
      }
    })

  const walk = (dir: string, depth: number): void => {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.')) continue
      if (SKIP_DIRS.has(entry)) continue
      const p = join(dir, entry)
      const st = statSync(p)
      if (st.isDirectory()) {
        if (depth === 0 && restrictToAllow && !INDEX_SUBDIRS.has(entry)) continue
        walk(p, depth + 1)
      } else if (
        TEXT_EXTS.has(entry.slice(entry.lastIndexOf('.')).toLowerCase()) &&
        !SKIP_BASENAMES.has(entry.toLowerCase())
      ) {
        out.push(p)
      }
    }
  }
  walk(root, 0)
  return out
}

/** Normalize for root comparisons (Windows `\` vs `/`, trailing slash, case). */
export function normalizeIndexPathKey(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** True when `path` is exactly `root` or a descendant (slash-normalized). */
export function isIndexPathUnderRoot(path: string, root: string): boolean {
  const nRoot = normalizeIndexPathKey(root)
  const nPath = normalizeIndexPathKey(path)
  return nPath === nRoot || nPath.startsWith(`${nRoot}/`)
}

/**
 * Encrypted vault library docs use a logical pdf_path (`…/library/<id>`), not a
 * plaintext file on disk — never prune them as "missing" during text reindex.
 */
function isLibraryLogicalPath(path: string, root: string): boolean {
  const nRoot = normalizeIndexPathKey(root)
  const nPath = normalizeIndexPathKey(path)
  return nPath.startsWith(`${nRoot}/library/`)
}

/**
 * Decide whether a vault text file needs re-embed.
 * Fast path: mtime+size match. Else content-hash; if hash matches, refresh
 * mtime/size and skip embed. Missing fingerprint but chunks already present →
 * record current fingerprint and skip (upgrade path — no wipe/re-embed).
 */
function classifyForIndex(
  db: Database.Database,
  path: string,
  selMeta: Database.Statement,
  countChunks: Database.Statement,
): { action: 'skip' } | { action: 'index'; text: string } {
  const st = fileStatMeta(path)
  if (!st) return { action: 'skip' }

  const meta = selMeta.get(path) as FileMetaRow | undefined
  if (
    meta &&
    meta.mtime_ms != null &&
    meta.size != null &&
    Number(meta.mtime_ms) === st.mtimeMs &&
    Number(meta.size) === st.size
  ) {
    return { action: 'skip' }
  }

  const text = readFileSync(path, 'utf8')
  const hash = contentHash(text)

  if (meta && meta.content_hash === hash) {
    upsertFileMeta(db, path, hash, st.mtimeMs, st.size)
    return { action: 'skip' }
  }

  if (!meta) {
    const row = countChunks.get(path) as { c: number | bigint }
    if (Number(row.c) > 0) {
      upsertFileMeta(db, path, hash, st.mtimeMs, st.size)
      return { action: 'skip' }
    }
  }

  return { action: 'index', text }
}

/**
 * Index every .md/.txt under `rootDir` (distilled / sessions / library only when
 * those dirs exist; never skills/) and prune DB rows whose files are gone.
 * Also drops orphan rows from a previous vault root (e.g. AppData after portable
 * vault open) so search only reflects the current root.
 * Unchanged files are skipped (mtime+size / content-hash) — no re-embed.
 */
export async function indexDir(
  db: Database.Database,
  embedder: EmbedClient,
  rootDir: string,
  onProgress?: (p: IndexProgressEvent) => void,
  signal?: AbortSignal,
): Promise<IndexStats> {
  const fingerprint = currentFingerprint(embedder)
  if (fingerprint) assertFingerprint(db, fingerprint)
  const paths = listTextFiles(rootDir)
  const selMeta = db.prepare(
    'SELECT content_hash, mtime_ms, size FROM indexed_files WHERE pdf_path = ?',
  )
  const countChunks = db.prepare('SELECT COUNT(*) AS c FROM chunks WHERE pdf_path = ?')

  const toIndex: IndexFileInput[] = []
  let skipped = 0
  const total = paths.length
  let done = 0

  for (const p of paths) {
    if (signal?.aborted) throwIfAborted(signal, 'reindex aborted')
    const name = basename(p)
    const decision = classifyForIndex(db, p, selMeta, countChunks)
    if (decision.action === 'skip') {
      skipped += 1
      done += 1
      onProgress?.({ file: name, done, total })
      continue
    }
    toIndex.push({ path: p, text: decision.text })
  }

  // Progress for the embed pass continues from skipped count.
  const embedProgress = onProgress
    ? (p: IndexProgressEvent): void => {
        onProgress({ file: p.file, done: skipped + p.done, total })
      }
    : undefined

  const stats = await indexFiles(db, embedder, toIndex, embedProgress, signal)
  stats.skipped = skipped

  // Stamped after the run, not before: a crash halfway leaves the index
  // unstamped and the next pass treats it as legacy rather than trusting a
  // claim the run never earned.
  if (fingerprint) writeFingerprint(db, fingerprint)

  stats.prunedFiles = pruneIndex(db, rootDir, { paths, signal })
  return stats
}

/**
 * Drop rows whose file is gone from disk, plus anything left behind by an
 * earlier vault root.
 *
 * Split out of indexDir because it needs no embedder — it is a path walk
 * against the DB, cheap enough to run after an incremental pass. Without that,
 * the only thing that ever pruned was a full reindex, so notes deleted or
 * renamed by redistillation piled up as dead entries (50 → 53 across runs that
 * each reported success) and kept surfacing in search.
 *
 * @param paths pre-walked file list; omit and it walks `rootDir` itself.
 */
export function pruneIndex(
  db: Database.Database,
  rootDir: string,
  opts?: { paths?: string[]; signal?: AbortSignal },
): number {
  const signal = opts?.signal
  const present = new Set((opts?.paths ?? listTextFiles(rootDir)).map(normalizeIndexPathKey))
  const known = db.prepare('SELECT DISTINCT pdf_path AS p FROM chunks').all() as { p: string }[]
  const delVec = db.prepare('DELETE FROM chunks_vec WHERE rowid = ?')
  const selIds = db.prepare('SELECT id FROM chunks WHERE pdf_path = ?')
  const delChunks = db.prepare('DELETE FROM chunks WHERE pdf_path = ?')
  let pruned = 0
  for (const { p } of known) {
    if (signal?.aborted) throwIfAborted(signal, 'reindex aborted')
    const underRoot = isIndexPathUnderRoot(p, rootDir)
    if (underRoot) {
      if (isLibraryLogicalPath(p, rootDir)) continue
      if (present.has(normalizeIndexPathKey(p))) continue
    }
    // else: orphan from a previous vault root (AppData, old folder, etc.)
    const ids = (selIds.all(p) as { id: number }[]).map((r) => r.id)
    const wipe = db.transaction(() => {
      for (const id of ids) delVec.run(BigInt(id))
      delChunks.run(p)
      deleteFileMeta(db, p)
    })
    wipe()
    pruned += 1
  }

  // Drop fingerprints for paths no longer on disk / outside root (even if chunks
  // already gone — keeps indexed_files tidy).
  const metaPaths = db.prepare('SELECT pdf_path AS p FROM indexed_files').all() as { p: string }[]
  for (const { p } of metaPaths) {
    const underRoot = isIndexPathUnderRoot(p, rootDir)
    if (underRoot && (isLibraryLogicalPath(p, rootDir) || present.has(normalizeIndexPathKey(p)))) {
      continue
    }
    if (!underRoot || !present.has(normalizeIndexPathKey(p))) {
      deleteFileMeta(db, p)
    }
  }

  return pruned
}
