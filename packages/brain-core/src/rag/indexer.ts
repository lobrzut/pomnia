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
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type Database from 'better-sqlite3'

import { chunkText } from './chunk.js'
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

export interface IndexStats {
  files: number
  chunks: number
  /** Files whose content produced zero chunks (empty after collapse). */
  empty: number
  /** DB rows removed because their file vanished from disk (prune pass). */
  prunedFiles: number
}

export interface IndexProgressEvent {
  file: string
  /** Files fully indexed so far. */
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

/**
 * (Re)index a set of in-memory documents. Existing rows for each path are
 * dropped first — same "re-index from scratch per file" semantics as Python.
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

  const stats: IndexStats = { files: 0, chunks: 0, empty: 0, prunedFiles: 0 }
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
      done += 1
      onProgress?.({ file: name, done, total: files.length })
      continue
    }

    for (let i = 0; i < chunks.length; i += BATCH) {
      if (signal?.aborted) throwIfAborted(signal, 'reindex aborted')
      const batch = chunks.slice(i, i + BATCH)
      // Embedding happens OUTSIDE the write transaction — Ollama can take
      // seconds per batch and holding a write lock that long is rude to
      // any concurrent search. No nomic prefixes here: Ollama's model
      // template adds them itself (see embed.ts header, verified Phase 0).
      const vecs = await embedder.embedBatch(batch, signal)
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
  const stats: IndexStats = { files: 0, chunks: 0, empty: 0, prunedFiles: 0 }

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

  if (pending.length === 0) {
    stats.empty = 1
    onProgress?.({ file: name, done: 1, total: 1 })
    return stats
  }

  for (let i = 0; i < pending.length; i += BATCH) {
    if (signal?.aborted) throwIfAborted(signal, 'index aborted')
    const batch = pending.slice(i, i + BATCH)
    const texts = batch.map((b) => b.text)
    const vecs = await embedder.embedBatch(texts, signal)
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
const SKIP_DIRS = new Set([
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
const INDEX_SUBDIRS = new Set(['distilled', 'sessions', 'library'])

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
 * Index every .md/.txt under `rootDir` (distilled / sessions / library only when
 * those dirs exist; never skills/) and prune DB rows whose files are gone.
 * Also drops orphan rows from a previous vault root (e.g. AppData after portable
 * vault open) so search only reflects the current root.
 * This is the "reindex" the embedded brain runs after each distill.
 */
export async function indexDir(
  db: Database.Database,
  embedder: EmbedClient,
  rootDir: string,
  onProgress?: (p: IndexProgressEvent) => void,
  signal?: AbortSignal,
): Promise<IndexStats> {
  const paths = listTextFiles(rootDir)
  const files: IndexFileInput[] = paths.map((p) => ({ path: p, text: readFileSync(p, 'utf8') }))
  const stats = await indexFiles(db, embedder, files, onProgress, signal)

  // Prune: missing files under current root + any path outside current root.
  const present = new Set(paths.map(normalizeIndexPathKey))
  const known = db.prepare('SELECT DISTINCT pdf_path AS p FROM chunks').all() as { p: string }[]
  const delVec = db.prepare('DELETE FROM chunks_vec WHERE rowid = ?')
  const selIds = db.prepare('SELECT id FROM chunks WHERE pdf_path = ?')
  const delChunks = db.prepare('DELETE FROM chunks WHERE pdf_path = ?')
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
    })
    wipe()
    stats.prunedFiles += 1
  }

  return stats
}
