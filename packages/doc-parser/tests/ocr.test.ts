import { describe, expect, it } from 'vitest'

import {
  applyOcrToDocument,
  mergeOcrPages,
  pagesFromExtractedMarkdown,
  markdownFromPages,
  selectSparsePages,
  suggestOcr,
} from '../src/index.js'
import type { ParsedDocument } from '../src/types.js'

describe('OCR helpers (no native deps)', () => {
  it('suggestOcr only for sparse PDF', () => {
    expect(suggestOcr({ format: 'pdf', meta: { sparse: true, tier: 1, charCount: 10, pageCount: 1 } })).toBe(
      true,
    )
    expect(suggestOcr({ format: 'pdf', meta: { sparse: false, tier: 1, charCount: 200, pageCount: 1 } })).toBe(
      false,
    )
    expect(suggestOcr({ format: 'docx', meta: { sparse: true, tier: 1, charCount: 10, pageCount: 1 } })).toBe(
      false,
    )
  })

  it('selectSparsePages picks first N sparse pages', () => {
    const pages = [
      { page: 1, text: '' },
      { page: 2, text: 'x'.repeat(100) },
      { page: 3, text: 'hi' },
      { page: 4, text: '' },
    ]
    expect(selectSparsePages(pages, { sparseThreshold: 50, maxPages: 2 })).toEqual([1, 3])
  })

  it('mergeOcrPages overwrites with OCR text', () => {
    const merged = mergeOcrPages(
      [
        { page: 1, text: '' },
        { page: 2, text: 'digital' },
      ],
      [{ page: 1, text: '  scanned hello  ' }],
    )
    expect(merged[0].text).toBe('scanned hello')
    expect(merged[1].text).toBe('digital')
  })

  it('applyOcrToDocument sets tier 2 and rebuilds markdown', () => {
    const doc: ParsedDocument = {
      sourcePath: '/tmp/a.pdf',
      format: 'pdf',
      pages: [
        { page: 1, text: '' },
        { page: 2, text: 'kept' },
      ],
      markdown: markdownFromPages([
        { page: 1, text: '' },
        { page: 2, text: 'kept' },
      ]),
      meta: { tier: 1, sparse: true, charCount: 4, pageCount: 2 },
    }
    const out = applyOcrToDocument(doc, {
      method: 'tesseract',
      pages: [
        {
          page: 1,
          text:
            'OCR line from scan with enough characters to clear the sparse average threshold easily when averaged across both pages of this document.',
        },
      ],
      ocrPageNumbers: [1],
    })
    expect(out.meta.tier).toBe(2)
    expect(out.pages[0].text).toContain('OCR line')
    expect(out.markdown).toContain('## Page 1')
    expect(out.markdown).toContain('OCR line from scan')
    expect(out.meta.charCount).toBeGreaterThan(50)
    expect(out.meta.sparse).toBe(false)
  })

  it('pagesFromExtractedMarkdown round-trips page sections', () => {
    const md = `---
source_file: x.pdf
---
## Page 1

Hello OCR

## Page 2

_(empty)_
`
    const pages = pagesFromExtractedMarkdown(md)
    expect(pages).toEqual([
      { page: 1, text: 'Hello OCR' },
      { page: 2, text: '' },
    ])
  })
})
