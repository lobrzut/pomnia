import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { parseDocx } from '../src/docx.js'

function minimalDocxBytes(): Uint8Array {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t>Hello DOCX Pomnia — this sentence is long enough to avoid the sparse heuristic threshold for single-page documents in the parser.</w:t></w:r></w:p></w:body>
</w:document>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  const enc = new TextEncoder()
  return zipSync({
    '[Content_Types].xml': enc.encode(contentTypes),
    '_rels/.rels': enc.encode(rels),
    'word/document.xml': enc.encode(document),
  })
}

describe('parseDocx', () => {
  it('extracts text from a minimal DOCX', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pomnia-doc-parser-'))
    const docxPath = join(dir, 'test.docx')
    writeFileSync(docxPath, minimalDocxBytes())

    const doc = await parseDocx(docxPath)

    expect(doc.format).toBe('docx')
    expect(doc.meta.pageCount).toBe(1)
    expect(doc.pages[0].text).toContain('Hello DOCX Pomnia')
    expect(doc.markdown).toContain('Hello DOCX Pomnia')
    expect(doc.meta.sparse).toBe(false)
  })
})
