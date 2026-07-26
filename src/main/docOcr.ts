/**
 * On-demand OCR for a vault library PDF — merge text, update extracted blob, re-index that doc only.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyOcrToDocument,
  buildExtractedMarkdown,
  extractionPathLabel,
  parsePdf,
  runOcr,
  suggestOcr,
} from '@pomnia/doc-parser'
import { libraryDocLogicalPath, type Vault } from '@core/vault.js'
import { brainCore } from './brainCore.js'
import {
  ensureBrainForIndexing,
  type LibraryIndexProgress,
} from './libraryIndex.js'
import type { DocOcrResult } from './docImportTypes.js'

export async function runDocumentOcr(
  vault: Vault,
  vaultDir: string,
  docId: string,
  onProgress?: (e: LibraryIndexProgress) => void,
  ollamaUrl?: string,
): Promise<DocOcrResult> {
  const doc = vault.getLibraryDocument(docId)
  if (!doc) throw new Error(`Library document not found: ${docId}`)
  if (doc.format !== 'pdf') {
    throw new Error(`OCR supports PDF only (got ${doc.format})`)
  }

  const source = await vault.readLibrarySource(docId)
  const tmpDir = await mkdtemp(join(tmpdir(), 'pomnia-ocr-'))
  const tmpPath = join(tmpDir, doc.originalName)

  try {
    await writeFile(tmpPath, source)

    onProgress?.({ phase: 'parse', done: 0, total: 1, detail: doc.originalName })
    const tier1 = await parsePdf(tmpPath)
    onProgress?.({ phase: 'parse', done: 1, total: 1 })

    onProgress?.({ phase: 'ocr', done: 0, total: 1, detail: 'tesseract…' })
    const ocr = await runOcr(tmpPath, {
      prefer: 'tesseract',
      maxPages: 3,
      onProgress: (ev) =>
        onProgress?.({
          phase: 'ocr',
          done: ev.done,
          total: ev.total,
          detail: `str. ${ev.page}`,
        }),
    })
    if (ocr.method === 'none' || ocr.pages.length === 0) {
      throw new Error('OCR nie zwrócił tekstu — sprawdź tessdata (eng/pol) i @napi-rs/canvas')
    }

    const merged = applyOcrToDocument(tier1, ocr)
    const sha16 = doc.contentSha.slice(0, 16)
    const md = buildExtractedMarkdown(merged.markdown, {
      source_file: doc.originalName,
      source_sha256: sha16,
      format: merged.format,
      extraction_tier: merged.meta.tier,
      extraction_sparse: merged.meta.sparse,
      extraction_path: extractionPathLabel(merged),
      pages: merged.meta.pageCount,
      imported_at: doc.importedAt,
      imported_via: 'pomnia-ocr',
    })

    onProgress?.({ phase: 'encrypt', done: 0, total: 2, detail: 'vault…' })
    await vault.addLibraryDocument(
      {
        id: doc.id,
        originalName: doc.originalName,
        format: doc.format,
        contentSha: doc.contentSha,
        pages: merged.meta.pageCount,
        sparse: merged.meta.sparse,
        extractionPath: extractionPathLabel(merged),
        importedAt: doc.importedAt,
        pendingIndex: true,
      },
      source,
      Buffer.from(md, 'utf8'),
    )
    onProgress?.({ phase: 'encrypt', done: 2, total: 2 })

    const logicalPath = libraryDocLogicalPath(vaultDir, docId)
    let brainRunning = brainCore.status().running
    let brainAutoStarted = false
    let chunks = 0
    let indexed = false
    let indexError: string | undefined

    if (!brainRunning) {
      const ensured = await ensureBrainForIndexing(ollamaUrl, onProgress, vaultDir)
      brainRunning = ensured.running
      brainAutoStarted = ensured.autoStarted
      if (!brainRunning) indexError = ensured.error
    }

    if (brainRunning) {
      onProgress?.({ phase: 'index', done: 0, total: merged.pages.length, detail: 'embedding…' })
      const stats = (await brainCore.indexDocument({
        path: logicalPath,
        name: doc.originalName,
        pages: merged.pages,
      })) as { chunks?: number }
      chunks = stats?.chunks ?? 0
      indexed = true
      onProgress?.({ phase: 'index', done: merged.pages.length, total: merged.pages.length })
      await vault.markLibraryDocIndexed(docId)
    }

    return {
      docId,
      sourcePath: logicalPath,
      extractedPath: `${logicalPath}/extracted.md`,
      format: doc.format,
      pages: merged.meta.pageCount,
      chunks,
      sparse: merged.meta.sparse,
      extractionPath: extractionPathLabel(merged),
      suggestOcr: suggestOcr(merged),
      indexed,
      pendingIndex: !indexed,
      brainRunning,
      brainAutoStarted,
      indexError,
      encrypted: true,
      ocrMethod: ocr.method,
      ocrPages: ocr.ocrPageNumbers.length,
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
