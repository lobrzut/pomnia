/**
 * @pomnia/doc-parser — local document → markdown for Pomnia RAG.
 *
 * v0.2: PDF (unpdf) + DOCX (mammoth) + MD/TXT passthrough.
 * Tier 2 OCR / vision hooks in ocr.ts (Phase 4).
 */

export { parsePdf } from './pdf.js'
export { parseDocx } from './docx.js'
export { parseText } from './text.js'
export { parseDocument, extractionPathLabel } from './router.js'
export { buildExtractedMarkdown } from './frontmatter.js'
export type { ExtractedFrontmatter } from './frontmatter.js'
export { runOcr, suggestOcr } from './ocr.js'
export type { OcrMethod, OcrOptions, OcrResult } from './ocr.js'
export type { ParsedDocument, ParsedPage, ParsePdfOptions, ExtractionTier } from './types.js'
export type { ParseDocumentOptions } from './router.js'
