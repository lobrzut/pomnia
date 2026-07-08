/**
 * @pomnia/doc-parser — local document → markdown for Pomnia RAG.
 *
 * v1: PDF text layer via unpdf. DOCX/OCR/remote tiers follow docs/PDF-LOCAL.md.
 */

export { parsePdf } from './pdf.js'
export type { ParsedDocument, ParsedPage, ParsePdfOptions, ExtractionTier } from './types.js'
