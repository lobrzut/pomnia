import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildExtractedMarkdown } from '../src/frontmatter.js'
import { parseDocument } from '../src/router.js'
import { parseText } from '../src/text.js'
import { suggestOcr } from '../src/ocr.js'

describe('parseText', () => {
  it('reads markdown passthrough', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pomnia-doc-parser-'))
    const mdPath = join(dir, 'note.md')
    writeFileSync(mdPath, '# Title\n\nBody text here.')

    const doc = parseText(mdPath)
    expect(doc.format).toBe('md')
    expect(doc.markdown).toContain('Body text here')
    expect(doc.meta.pageCount).toBe(1)
  })
})

describe('parseDocument router', () => {
  it('routes .txt files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pomnia-doc-parser-'))
    const txtPath = join(dir, 'readme.txt')
    writeFileSync(txtPath, 'Plain text document.')

    const doc = await parseDocument(txtPath)
    expect(doc.format).toBe('txt')
    expect(doc.pages[0].text).toBe('Plain text document.')
  })

  it('rejects unknown extensions', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pomnia-doc-parser-'))
    const badPath = join(dir, 'data.xlsx')
    writeFileSync(badPath, 'x')

    await expect(parseDocument(badPath)).rejects.toThrow(/Unsupported/)
  })
})

describe('buildExtractedMarkdown', () => {
  it('includes frontmatter fields', () => {
    const md = buildExtractedMarkdown('body', {
      source_file: 'a.pdf',
      source_sha256: 'abc',
      format: 'pdf',
      extraction_tier: 1,
      extraction_sparse: false,
      extraction_path: 'unpdf',
      pages: 2,
      imported_at: '2026-07-08T00:00:00.000Z',
      imported_via: 'pomnia',
    })
    expect(md).toContain('extraction_path: unpdf')
    expect(md).toContain('body')
  })
})

describe('suggestOcr', () => {
  it('flags sparse PDFs', () => {
    expect(
      suggestOcr({
        meta: { sparse: true, tier: 1, charCount: 10, pageCount: 5 },
        format: 'pdf',
        sourcePath: 'x',
        pages: [],
        markdown: '',
      }),
    ).toBe(true)
  })
})
