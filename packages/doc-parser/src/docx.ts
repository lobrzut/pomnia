// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { readFileSync } from 'node:fs'
import { convertToMarkdown } from 'mammoth'

import type { ParsedDocument } from './types.js'

/**
 * Extract markdown from DOCX via mammoth (pure JS, no native deps).
 */
export async function parseDocx(filePath: string): Promise<ParsedDocument> {
  const buffer = readFileSync(filePath)
  const result = await convertToMarkdown({ buffer })
  const text = result.value.trim()
  const pages = [{ page: 1, text }]

  return {
    sourcePath: filePath,
    format: 'docx',
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
