/**
 * Document import pipeline — parse → vault/library → index in library.db.
 */

import { createHash } from 'node:crypto'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { app } from 'electron'
import {
  buildExtractedMarkdown,
  extractionPathLabel,
  parseDocument,
  suggestOcr,
} from '@pomnia/doc-parser'
import { defaultVaultConfig, ensureLibraryDirs } from '@pomnia/brain-core'

import { brainCore } from './brainCore.js'

export interface DocImportResult {
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
}

export function brainCoreDataDir(): string {
  return join(app.getPath('userData'), 'brain-core-data')
}

export async function importDocument(
  filePath: string,
  onProgress?: (e: { phase: string; done: number; total: number; detail?: string }) => void,
): Promise<DocImportResult> {
  const dataDir = brainCoreDataDir()
  const vault = defaultVaultConfig(dataDir)
  ensureLibraryDirs(vault)

  const raw = readFileSync(filePath)
  const sha = createHash('sha256').update(raw).digest('hex').slice(0, 16)
  const baseName = basename(filePath)
  const storedName = `${sha}_${baseName}`
  const sourcePath = join(vault.librarySourcesDir, storedName)
  copyFileSync(filePath, sourcePath)

  onProgress?.({ phase: 'parse', done: 0, total: 1, detail: baseName })
  const parsed = await parseDocument(sourcePath)
  onProgress?.({ phase: 'parse', done: 1, total: 1, detail: extractionPathLabel(parsed) })

  const stem = baseName.replace(/\.[^.]+$/, '') || baseName
  const extractedName = `${sha}_${stem}.md`
  const extractedPath = join(vault.libraryExtractedDir, extractedName)
  const body = parsed.markdown
  const md = buildExtractedMarkdown(body, {
    source_file: baseName,
    source_sha256: sha,
    format: parsed.format,
    extraction_tier: parsed.meta.tier,
    extraction_sparse: parsed.meta.sparse,
    extraction_path: extractionPathLabel(parsed),
    pages: parsed.meta.pageCount,
    imported_at: new Date().toISOString(),
    imported_via: 'pomnia',
  })
  writeFileSync(extractedPath, md, 'utf8')

  const brainRunning = brainCore.status().running
  let chunks = 0
  if (brainRunning) {
    onProgress?.({ phase: 'index', done: 0, total: parsed.pages.length, detail: 'embedding…' })
    const stats = (await brainCore.indexDocument({
      path: sourcePath,
      name: baseName,
      pages: parsed.pages,
    })) as { chunks?: number }
    chunks = stats?.chunks ?? 0
    onProgress?.({ phase: 'index', done: parsed.pages.length, total: parsed.pages.length })
  }

  return {
    sourcePath,
    extractedPath,
    format: parsed.format,
    pages: parsed.meta.pageCount,
    chunks,
    sparse: parsed.meta.sparse,
    extractionPath: extractionPathLabel(parsed),
    suggestOcr: suggestOcr(parsed),
    indexed: brainRunning && chunks > 0,
    brainRunning,
  }
}

/** File extensions accepted by the document import picker. */
export const DOC_IMPORT_EXTENSIONS = ['pdf', 'docx', 'md', 'txt']

export function isDocImportPath(p: string): boolean {
  return DOC_IMPORT_EXTENSIONS.includes(extname(p).slice(1).toLowerCase())
}
