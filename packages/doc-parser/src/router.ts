import { extname } from 'node:path'

import { parseDocx } from './docx.js'
import { parsePdf } from './pdf.js'
import { parseText } from './text.js'
import type { ParsedDocument, ParsePdfOptions } from './types.js'

export interface ParseDocumentOptions extends ParsePdfOptions {}

const SUPPORTED = new Set(['.pdf', '.docx', '.md', '.markdown', '.txt'])

/** Route a file path to the correct Tier 1 parser. */
export async function parseDocument(
  filePath: string,
  options: ParseDocumentOptions = {},
): Promise<ParsedDocument> {
  const ext = extname(filePath).toLowerCase()
  if (!SUPPORTED.has(ext)) {
    throw new Error(`Unsupported document format: ${ext || '(no extension)'}`)
  }
  switch (ext) {
    case '.pdf':
      return parsePdf(filePath, options)
    case '.docx':
      return parseDocx(filePath)
    case '.md':
    case '.markdown':
    case '.txt':
      return parseText(filePath)
    default:
      throw new Error(`Unsupported document format: ${ext}`)
  }
}

/** Human-readable parser id for UI / frontmatter. */
export function extractionPathLabel(parsed: ParsedDocument): string {
  switch (parsed.format) {
    case 'pdf':
      return 'unpdf'
    case 'docx':
      return 'mammoth'
    case 'md':
    case 'txt':
      return 'passthrough'
    default:
      return 'unknown'
  }
}
