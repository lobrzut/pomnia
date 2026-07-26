/**
 * Library document indexing — embed vault docs in library.db.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pagesFromExtractedMarkdown, parseDocument } from '@pomnia/doc-parser'
import { libraryDocLogicalPath, type Vault } from '@core/vault.js'
import { brainCore } from './brainCore.js'
import { ensureBrainForIndexing } from './ensureBrain.js'

export type LibraryIndexProgress = {
  phase: string
  done: number
  total: number
  detail?: string
}

export { ensureBrainForIndexing } from './ensureBrain.js'

/** Parse a vault library doc from its encrypted source blob and index in library.db. */
export async function indexVaultDocument(
  vault: Vault,
  vaultDir: string,
  docId: string,
  onProgress?: (e: LibraryIndexProgress) => void,
): Promise<number> {
  const doc = vault.getLibraryDocument(docId)
  if (!doc) throw new Error(`Library document not found: ${docId}`)

  const source = await vault.readLibrarySource(docId)
  const tmpDir = await mkdtemp(join(tmpdir(), 'pomnia-doc-'))
  const tmpPath = join(tmpDir, doc.originalName)
  try {
    await writeFile(tmpPath, source)
    onProgress?.({ phase: 'parse', done: 0, total: 1, detail: doc.originalName })

    // Prefer vault extracted.md (keeps OCR merges); fall back to Tier 1 re-parse.
    let pages = pagesFromExtractedMarkdown(
      (await vault.readLibraryExtracted(docId)).toString('utf8'),
    )
    if (!pages || pages.length === 0) {
      const parsed = await parseDocument(tmpPath)
      pages = parsed.pages
    }
    onProgress?.({ phase: 'parse', done: 1, total: 1 })

    const logicalPath = libraryDocLogicalPath(vaultDir, docId)
    onProgress?.({ phase: 'index', done: 0, total: pages.length, detail: doc.originalName })
    const stats = (await brainCore.indexDocument({
      path: logicalPath,
      name: doc.originalName,
      pages,
    })) as { chunks?: number }
    const chunks = stats?.chunks ?? 0
    onProgress?.({ phase: 'index', done: pages.length, total: pages.length })
    await vault.markLibraryDocIndexed(docId)
    return chunks
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

export interface PendingIndexResult {
  indexed: number
  chunks: number
  errors: string[]
}

/** Index every vault document still marked pendingIndex (optionally skip one just handled). */
export async function indexPendingLibraryDocuments(
  vault: Vault,
  vaultDir: string,
  opts?: {
    skipDocId?: string
    ollamaUrl?: string
    /** When true, require embedded brain already running — do not auto-start. */
    skipEnsure?: boolean
    onProgress?: (e: LibraryIndexProgress) => void
  },
): Promise<PendingIndexResult> {
  const pending = vault.getPendingIndexDocuments().filter((d) => d.id !== opts?.skipDocId)
  if (pending.length === 0) return { indexed: 0, chunks: 0, errors: [] }

  if (opts?.skipEnsure) {
    if (!brainCore.status().running) {
      return { indexed: 0, chunks: 0, errors: ['Wyszukiwarka niedostępna'] }
    }
  } else {
    const ensured = await ensureBrainForIndexing(opts?.ollamaUrl, opts?.onProgress, vaultDir)
    if (!ensured.running) {
      return {
        indexed: 0,
        chunks: 0,
        errors: [ensured.error ?? 'Wyszukiwarka niedostępna'],
      }
    }
  }

  let indexed = 0
  let chunks = 0
  const errors: string[] = []
  for (let i = 0; i < pending.length; i++) {
    const doc = pending[i]!
    try {
      const n = await indexVaultDocument(vault, vaultDir, doc.id, opts?.onProgress)
      chunks += n
      indexed++
    } catch (err) {
      errors.push(`${doc.originalName}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { indexed, chunks, errors }
}
