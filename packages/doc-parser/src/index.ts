// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * @pomnia/doc-parser — local document → markdown for Pomnia RAG.
 *
 * v0.2: PDF (unpdf) + DOCX (mammoth) + EPUB (fflate) + MD/TXT passthrough.
 * Tier 2 OCR: tesseract.js (Apache-2.0) in ocr.ts — never scribe.js.
 */

export { parsePdf } from './pdf.js'
export { parseDocx } from './docx.js'
export { parseEpub, htmlToText } from './epub.js'
export { parseText } from './text.js'
export { parseDocument, extractionPathLabel } from './router.js'
export { buildExtractedMarkdown } from './frontmatter.js'
export type { ExtractedFrontmatter } from './frontmatter.js'
export {
  runOcr,
  suggestOcr,
  selectSparsePages,
  mergeOcrPages,
  applyOcrToDocument,
  resolveTessdataPath,
} from './ocr.js'
export type { OcrMethod, OcrOptions, OcrResult } from './ocr.js'
export { pagesFromExtractedMarkdown, markdownFromPages } from './extractedPages.js'
export type { ParsedDocument, ParsedPage, ParsePdfOptions, ExtractionTier } from './types.js'
export type { ParseDocumentOptions } from './router.js'
