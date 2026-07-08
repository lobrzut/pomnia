import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { parsePdf } from '../src/pdf.js'

/** Minimal valid PDF with a single text line — no external fixture needed. */
function minimalPdfBytes(): Buffer {
  const body = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 12 Tf 10 100 Td (Hello Pomnia) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
0000000230 00000 n 
0000000324 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
393
%%EOF`
  return Buffer.from(body, 'utf8')
}

describe('parsePdf', () => {
  it('extracts text from a minimal PDF', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pomnia-doc-parser-'))
    const pdfPath = join(dir, 'test.pdf')
    writeFileSync(pdfPath, minimalPdfBytes())

    const doc = await parsePdf(pdfPath, { sparseThreshold: 5 })

    expect(doc.format).toBe('pdf')
    expect(doc.meta.pageCount).toBe(1)
    expect(doc.meta.tier).toBe(1)
    expect(doc.pages[0].text).toContain('Hello Pomnia')
    expect(doc.markdown).toContain('## Page 1')
    expect(doc.meta.charCount).toBeGreaterThan(0)
    expect(doc.meta.sparse).toBe(false)
  })
})
