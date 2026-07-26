/**
 * Tier 2 OCR — scanned / sparse PDFs via tesseract.js (Apache-2.0).
 * Never use scribe.js (AGPL). Ollama vision is optional later (prefer: auto → still tesseract here).
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { definePDFJSModule, getDocumentProxy, renderPageAsImage } from 'unpdf'

import { markdownFromPages } from './extractedPages.js'
import { parsePdf } from './pdf.js'
import type { ParsedDocument, ParsedPage } from './types.js'

export type OcrMethod = 'tesseract' | 'ollama-vision' | 'none'

export interface OcrOptions {
  /** auto = tesseract (vision deferred). ollama-vision not implemented in this slice. */
  prefer?: 'auto' | OcrMethod
  ollamaUrl?: string
  /** Max sparse pages to OCR (thin default: 3). */
  maxPages?: number
  /** Chars below this → page is sparse (default 50). */
  sparseThreshold?: number
  /** Directory with eng.traineddata(.gz) + pol.traineddata(.gz). */
  langPath?: string
  /** Render scale for pdf → image (default 2). */
  scale?: number
  /** Tesseract langs (default eng+pol). */
  langs?: string
  /** Progress callback (0-based index among pages being OCR'd). */
  onProgress?: (ev: { done: number; total: number; page: number }) => void
}

export interface OcrResult {
  method: OcrMethod
  pages: { page: number; text: string }[]
  /** Pages that were sent to OCR. */
  ocrPageNumbers: number[]
}

const DEFAULT_SPARSE = 50
const DEFAULT_MAX_PAGES = 3
const DEFAULT_LANGS = 'eng+pol'

let pdfjsReady: Promise<void> | null = null

async function ensurePdfjsForRender(): Promise<void> {
  if (!pdfjsReady) {
    pdfjsReady = definePDFJSModule(() => import('pdfjs-dist/legacy/build/pdf.mjs')).catch(async () => {
      // Fallback for environments without legacy build path.
      await definePDFJSModule(() => import('pdfjs-dist'))
    })
  }
  await pdfjsReady
}

/** Resolve packaged / repo tessdata directory. */
export function resolveTessdataPath(explicit?: string): string | undefined {
  if (explicit && existsSync(explicit)) return explicit

  const candidates: string[] = []
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) candidates.push(join(resourcesPath, 'tessdata'))

  // Dev: packages/doc-parser → repo resources/tessdata
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    candidates.push(join(here, '..', '..', '..', 'resources', 'tessdata'))
    candidates.push(join(here, '..', '..', 'resources', 'tessdata'))
  } catch {
    /* bundled without import.meta.url */
  }
  if (typeof process.cwd === 'function') {
    candidates.push(join(process.cwd(), 'resources', 'tessdata'))
  }

  for (const c of candidates) {
    if (
      existsSync(join(c, 'eng.traineddata.gz')) ||
      existsSync(join(c, 'eng.traineddata'))
    ) {
      return c
    }
  }
  return undefined
}

function pageIsSparse(text: string, threshold: number): boolean {
  return text.trim().length < threshold
}

/** Pick sparse page numbers, capped by maxPages (first sparse pages). */
export function selectSparsePages(
  pages: ParsedPage[],
  opts?: { sparseThreshold?: number; maxPages?: number },
): number[] {
  const threshold = opts?.sparseThreshold ?? DEFAULT_SPARSE
  const maxPages = opts?.maxPages ?? DEFAULT_MAX_PAGES
  const sparse = pages.filter((p) => pageIsSparse(p.text, threshold)).map((p) => p.page)
  return sparse.slice(0, Math.max(1, maxPages))
}

/** Merge OCR page texts into an existing page list (OCR wins when non-empty). */
export function mergeOcrPages(
  base: ParsedPage[],
  ocrPages: { page: number; text: string }[],
): ParsedPage[] {
  const byPage = new Map(ocrPages.map((p) => [p.page, p.text.trim()]))
  return base.map((p) => {
    const ocr = byPage.get(p.page)
    if (ocr) return { page: p.page, text: ocr }
    return { ...p }
  })
}

/** Apply OCR merge → ParsedDocument at tier 2. */
export function applyOcrToDocument(
  doc: ParsedDocument,
  ocr: OcrResult,
): ParsedDocument {
  const pages = mergeOcrPages(doc.pages, ocr.pages)
  const charCount = pages.reduce((n, p) => n + p.text.length, 0)
  const avg = pages.length > 0 ? charCount / pages.length : 0
  const sparse = pages.length > 0 && avg < DEFAULT_SPARSE
  return {
    ...doc,
    pages,
    markdown: markdownFromPages(pages),
    meta: {
      ...doc.meta,
      tier: 2,
      sparse,
      charCount,
      pageCount: pages.length,
    },
  }
}

async function recognizePng(
  png: Buffer,
  langs: string,
  langPath: string | undefined,
): Promise<string> {
  // Externalized in electron-vite — do not bundle worker/wasm into main.
  const { createWorker } = await import('tesseract.js')

  const gzip =
    langPath != null &&
    existsSync(join(langPath, 'eng.traineddata.gz')) &&
    !existsSync(join(langPath, 'eng.traineddata'))

  const workerOpts: Record<string, unknown> = {
    cacheMethod: langPath ? 'readOnly' : 'write',
  }
  if (langPath) {
    // Node fs path (not file://) — Electron main treats file:// poorly with node-fetch.
    workerOpts.langPath = langPath.replace(/[/\\]$/, '')
    workerOpts.cachePath = langPath
    workerOpts.gzip = gzip
  }

  const worker = await createWorker(langs, 1, workerOpts)
  try {
    const {
      data: { text },
    } = await worker.recognize(png)
    return (text ?? '').trim()
  } finally {
    await worker.terminate()
  }
}

/**
 * OCR sparse pages of a PDF (thin: first N sparse pages).
 * Renders via unpdf + @napi-rs/canvas, recognizes with tesseract.js.
 */
export async function runOcr(pdfPath: string, opts?: OcrOptions): Promise<OcrResult> {
  const prefer = opts?.prefer ?? 'auto'
  if (prefer === 'ollama-vision') {
    // Slice scope: vision deferred — fall through to tesseract.
  }
  if (prefer === 'none') {
    return { method: 'none', pages: [], ocrPageNumbers: [] }
  }

  const sparseThreshold = opts?.sparseThreshold ?? DEFAULT_SPARSE
  const maxPages = opts?.maxPages ?? DEFAULT_MAX_PAGES
  const scale = opts?.scale ?? 2
  const langs = opts?.langs ?? DEFAULT_LANGS
  const langPath = resolveTessdataPath(opts?.langPath)

  const parsed = await parsePdf(pdfPath, { sparseThreshold })
  const targets = selectSparsePages(parsed.pages, { sparseThreshold, maxPages })
  // If nothing marked sparse but caller still invoked OCR, do first page.
  const pageNums = targets.length > 0 ? targets : [1]

  await ensurePdfjsForRender()

  const { readFileSync } = await import('node:fs')
  const buffer = new Uint8Array(readFileSync(pdfPath))
  const pdf = await getDocumentProxy(buffer)

  const pages: { page: number; text: string }[] = []
  for (let i = 0; i < pageNums.length; i++) {
    const page = pageNums[i]
    opts?.onProgress?.({ done: i, total: pageNums.length, page })
    const ab = await renderPageAsImage(pdf, page, {
      canvasImport: () => import('@napi-rs/canvas'),
      scale,
    })
    const text = await recognizePng(Buffer.from(ab), langs, langPath)
    pages.push({ page, text })
    opts?.onProgress?.({ done: i + 1, total: pageNums.length, page })
  }

  return {
    method: pages.some((p) => p.text.length > 0) ? 'tesseract' : 'none',
    pages,
    ocrPageNumbers: pageNums,
  }
}

/** True when Tier 1 extraction looks like a scan (sparse text layer). */
export function suggestOcr(parsed: Pick<ParsedDocument, 'meta' | 'format'>): boolean {
  return parsed.meta.sparse && parsed.format === 'pdf'
}
