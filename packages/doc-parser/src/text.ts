import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

import type { ParsedDocument } from './types.js'

/** Passthrough for markdown and plain text files. */
export function parseText(filePath: string): ParsedDocument {
  const text = readFileSync(filePath, 'utf8').trim()
  const ext = extname(filePath).toLowerCase()
  const format = ext === '.md' || ext === '.markdown' ? 'md' : 'txt'
  const pages = [{ page: 1, text }]

  return {
    sourcePath: filePath,
    format,
    pages,
    markdown: text || '_(empty)_',
    meta: {
      tier: 1,
      sparse: text.length < 50,
      charCount: text.length,
      pageCount: 1,
    },
  }
}
