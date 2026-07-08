import { readFileSync } from 'node:fs'
import { extractText, getDocumentProxy } from 'unpdf'

import type { ParsedDocument, ParsePdfOptions } from './types.js'

const DEFAULT_SPARSE_THRESHOLD = 50

/**
 * Extract text from a PDF using unpdf (bundled serverless pdfjs).
 * No Java, no canvas — suitable for Electron main / brain-core fork child.
 */
export async function parsePdf(
  filePath: string,
  options: ParsePdfOptions = {},
): Promise<ParsedDocument> {
  const sparseThreshold = options.sparseThreshold ?? DEFAULT_SPARSE_THRESHOLD
  const buffer = readFileSync(filePath)
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { totalPages, text: pageTexts } = await extractText(pdf, { mergePages: false })

  const pages = pageTexts.map((text, i) => ({
    page: i + 1,
    text: text.trim(),
  }))

  const charCount = pages.reduce((n, p) => n + p.text.length, 0)
  const avgChars = totalPages > 0 ? charCount / totalPages : 0
  const sparse = totalPages > 0 && avgChars < sparseThreshold

  const markdown = pages
    .map((p) => (p.text ? `## Page ${p.page}\n\n${p.text}` : `## Page ${p.page}\n\n_(empty)_`))
    .join('\n\n')

  return {
    sourcePath: filePath,
    format: 'pdf',
    pages,
    markdown,
    meta: {
      tier: 1,
      sparse,
      charCount,
      pageCount: totalPages,
    },
  }
}
