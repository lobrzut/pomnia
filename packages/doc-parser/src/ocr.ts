import type { ParsedDocument } from './types.js'

/**
 * Phase 4 hook — OCR for scanned PDFs.
 * v0.2: stub only. Future: tesseract.js offline, Ollama vision when available.
 */
export type OcrMethod = 'tesseract' | 'ollama-vision' | 'none'

export interface OcrOptions {
  /** auto = tesseract default, upgrade to Ollama vision when reachable. */
  prefer?: 'auto' | OcrMethod
  ollamaUrl?: string
}

export interface OcrResult {
  method: OcrMethod
  pages: { page: number; text: string }[]
}

/** Stub — Phase 4 will implement dual-path OCR. */
export async function runOcr(_pdfPath: string, _opts?: OcrOptions): Promise<OcrResult> {
  return { method: 'none', pages: [] }
}

/** True when Tier 1 extraction looks like a scan (sparse text layer). */
export function suggestOcr(parsed: Pick<ParsedDocument, 'meta' | 'format'>): boolean {
  return parsed.meta.sparse && parsed.format === 'pdf'
}
