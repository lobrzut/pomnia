// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** Extraction quality tier — maps to architecture doc tiers 1–3. */
export type ExtractionTier = 1 | 2 | 3

export interface ParsedPage {
  page: number
  text: string
}

export interface ParsedDocument {
  sourcePath: string
  format: 'pdf' | 'docx' | 'md' | 'txt' | 'epub'
  pages: ParsedPage[]
  markdown: string
  meta: {
    tier: ExtractionTier
    /** True when average chars/page suggests scanned or empty text layer. */
    sparse: boolean
    charCount: number
    pageCount: number
  }
}

export interface ParsePdfOptions {
  /** Mark pages with fewer than this many chars as sparse (default 50). */
  sparseThreshold?: number
}
