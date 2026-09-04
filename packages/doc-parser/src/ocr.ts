// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
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

/**
 * How the text was produced.
 *
 * `ollama-vision` used to sit here beside them, and nothing implemented it:
 * asking for it fell through to tesseract. A type that offers a choice the
 * code cannot make is a promise the caller has no way to check.
 */
export type OcrMethod = 'tesseract' | 'none'

export interface OcrOptions {
  /** Only tesseract today; `auto` means the same thing. */
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
  /** Pages that survived the quality floor. */
  pages: { page: number; text: string }[]
  /** How many pages were OCR'd before filtering. */
  attempted?: number
  /** How many of those were dropped as picture-noise. */
  dropped?: number
  /** Blocks discarded inside pages that were otherwise kept. */
  blocksDropped?: number
  /** Pages that were sent to OCR. */
  ocrPageNumbers: number[]
}

const DEFAULT_SPARSE = 50
const DEFAULT_MAX_PAGES = 3
const DEFAULT_LANGS = 'eng+pol'

/**
 * Rendering needs a pdfjs that can actually make a canvas.
 *
 * unpdf's own bundled pdfjs cannot: its NodeCanvasFactory was stripped by the
 * bundler down to a proxy that throws '@napi-rs/canvas is not available in this
 * environment' for every call. So a real pdfjs-dist has to be injected — that
 * is what this is for.
 *
 * The version has to match unpdf's, though. pdfjs-dist sat at 4.10.38 against
 * unpdf's 5.6.205, and every render died with 'The API version does not match
 * the Worker version'. runOcr reported that as no pages, so OCR looked like it
 * had read a scan and found nothing in it, when it had never rendered a page.
 */
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

  // Filter inside each page, then drop the pages that had nothing left.
  // Reporting both counts matters: '20 pages OCR'd' and '11 kept' are
  // different facts, and the second says what the memory actually gained.
  let blocksDropped = 0
  const kept: { page: number; text: string }[] = []
  for (const p of pages) {
    const f = filterNoiseBlocks(p.text)
    blocksDropped += f.dropped
    if (f.text.trim().length >= OCR_MIN_CHARS) kept.push({ page: p.page, text: f.text })
  }

  return {
    method: kept.length > 0 ? 'tesseract' : 'none',
    pages: kept,
    ocrPageNumbers: pageNums,
    blocksDropped,
    attempted: pages.length,
    dropped: pages.length - kept.length,
  }
}

/**
 * How much of a page reads like words rather than like a picture.
 *
 * OCR run over a diagram returns confident nonsense: a page of a chess book
 * came back as `Se ake ase 0 oo / Tir are EZ eda eC / aie. |`. Nothing was
 * filtering that, so it reached the vault, got indexed, and became something
 * search could return as knowledge — the exact failure this project keeps
 * removing elsewhere.
 *
 * Measured on that book, 20 pages OCR'd: real prose scored 0.57 to 0.85,
 * including a table of contents full of dot leaders. The two picture pages
 * scored 0.05 and 0.22. The gap is wide enough to cut in the middle and not
 * lose anything that was worth keeping.
 */
export function pageTextQuality(text: string): number {
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 0
  const wordish = tokens.filter(
    (t) => t.length >= 3 && [...t].filter((c) => /\p{L}/u.test(c)).length / t.length >= 0.7,
  ).length
  return wordish / tokens.length
}

/**
 * Keep the text on a page that is part picture.
 *
 * The floor used to judge whole pages, and a page with a diagram and two
 * paragraphs scored like the diagram and lost the paragraphs with it. In a
 * scanned primer that is most of the book: text above the figure, text below
 * it, and OCR noise in the middle scoring the whole page down.
 *
 * Blocks are separated by blank lines, which is what tesseract emits between
 * layout regions, so this is the coarsest honest unit — not a layout analysis,
 * just a refusal to throw away a paragraph because it shared a page.
 */
export function filterNoiseBlocks(text: string): { text: string; kept: number; dropped: number } {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  const good: string[] = []
  let dropped = 0
  for (const b of blocks) {
    // Short blocks are headings and captions more often than noise, and they
    // score fine when they are words. Judge them the same way; only the length
    // floor for a whole page does not apply to one line of it.
    if (pageTextQuality(b) >= OCR_QUALITY_FLOOR) good.push(b)
    else dropped++
  }
  return { text: good.join('\n\n'), kept: good.length, dropped }
}

/** Below this a page is a picture the OCR guessed at, not text. */
export const OCR_QUALITY_FLOOR = 0.45
/** Shorter than this there is nothing to judge, and nothing worth keeping. */
export const OCR_MIN_CHARS = 40

/** True when Tier 1 extraction looks like a scan (sparse text layer). */
export function suggestOcr(parsed: Pick<ParsedDocument, 'meta' | 'format'>): boolean {
  return parsed.meta.sparse && parsed.format === 'pdf'
}
