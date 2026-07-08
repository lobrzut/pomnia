/**
 * Document import pipeline — parse → encrypted vault blobs → index in library.db.
 *
 * Source PDF/DOCX and extracted markdown are stored as AES-256-GCM blobs in the
 * open `.pomnia` vault (same crypto as chat snapshots). Parsing and embedding
 * happen once at import; search reads chunks from library.db only.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { app } from 'electron'
import {
  buildExtractedMarkdown,
  extractionPathLabel,
  parseDocument,
  suggestOcr,
} from '@pomnia/doc-parser'
import { defaultVaultConfig, ensureLibraryDirs } from '@pomnia/brain-core'
import { libraryDocLogicalPath, Vault } from '@core/vault.js'
import { brainCore } from './brainCore.js'

export interface DocImportResult {
  docId: string
  sourcePath: string
  extractedPath: string
  format: string
  pages: number
  chunks: number
  sparse: boolean
  extractionPath: string
  suggestOcr: boolean
  indexed: boolean
  brainRunning: boolean
  encrypted: boolean
}

export function brainCoreDataDir(): string {
  return join(app.getPath('userData'), 'brain-core-data')
}

export async function importDocument(
  vault: Vault,
  vaultDir: string,
  filePath: string,
  onProgress?: (e: { phase: string; done: number; total: number; detail?: string }) => void,
): Promise<DocImportResult> {
  const dataDir = brainCoreDataDir()
  const vaultCfg = defaultVaultConfig(dataDir)
  ensureLibraryDirs(vaultCfg)

  const raw = readFileSync(filePath)
  const contentSha = createHash('sha256').update(raw).digest('hex')
  const sha16 = contentSha.slice(0, 16)
  const baseName = basename(filePath)
  const docId = `${sha16}_${baseName}`

  onProgress?.({ phase: 'parse', done: 0, total: 1, detail: baseName })
  const parsed = await parseDocument(filePath)
  onProgress?.({ phase: 'parse', done: 1, total: 1, detail: extractionPathLabel(parsed) })

  const md = buildExtractedMarkdown(parsed.markdown, {
    source_file: baseName,
    source_sha256: sha16,
    format: parsed.format,
    extraction_tier: parsed.meta.tier,
    extraction_sparse: parsed.meta.sparse,
    extraction_path: extractionPathLabel(parsed),
    pages: parsed.meta.pageCount,
    imported_at: new Date().toISOString(),
    imported_via: 'pomnia',
  })

  onProgress?.({ phase: 'encrypt', done: 0, total: 2, detail: 'vault…' })
  await vault.addLibraryDocument(
    {
      id: docId,
      originalName: baseName,
      format: parsed.format,
      contentSha,
      pages: parsed.meta.pageCount,
      sparse: parsed.meta.sparse,
      extractionPath: extractionPathLabel(parsed),
      importedAt: new Date().toISOString(),
    },
    raw,
    Buffer.from(md, 'utf8'),
  )
  onProgress?.({ phase: 'encrypt', done: 2, total: 2 })

  const logicalPath = libraryDocLogicalPath(vaultDir, docId)

  const brainRunning = brainCore.status().running
  let chunks = 0
  if (brainRunning) {
    onProgress?.({ phase: 'index', done: 0, total: parsed.pages.length, detail: 'embedding…' })
    const stats = (await brainCore.indexDocument({
      path: logicalPath,
      name: baseName,
      pages: parsed.pages,
    })) as { chunks?: number }
    chunks = stats?.chunks ?? 0
    onProgress?.({ phase: 'index', done: parsed.pages.length, total: parsed.pages.length })
  }

  return {
    docId,
    sourcePath: logicalPath,
    extractedPath: `${logicalPath}/extracted.md`,
    format: parsed.format,
    pages: parsed.meta.pageCount,
    chunks,
    sparse: parsed.meta.sparse,
    extractionPath: extractionPathLabel(parsed),
    suggestOcr: suggestOcr(parsed),
    indexed: brainRunning && chunks > 0,
    brainRunning,
    encrypted: true,
  }
}

/** File extensions accepted by the document import picker. */
export const DOC_IMPORT_EXTENSIONS = ['pdf', 'docx', 'md', 'txt', 'epub']

export function isDocImportPath(p: string): boolean {
  return DOC_IMPORT_EXTENSIONS.includes(extname(p).slice(1).toLowerCase())
}
