import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { htmlToText, parseEpub } from '../src/epub.js'
import { parseDocument } from '../src/router.js'

function minimalEpubBytes(): Uint8Array {
  const container = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`
  const chapter = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body><p>Hello EPUB Pomnia — this sentence is long enough to avoid the sparse heuristic threshold for single-page documents in the parser.</p></body>
</html>`
  const enc = new TextEncoder()
  return zipSync({
    'META-INF/container.xml': enc.encode(container),
    'OEBPS/content.opf': enc.encode(opf),
    'OEBPS/chapter1.xhtml': enc.encode(chapter),
  })
}

describe('htmlToText', () => {
  it('strips tags and decodes entities', () => {
    expect(htmlToText('<p>Hello &amp; <b>world</b></p>')).toBe('Hello & world')
  })
})

describe('parseEpub', () => {
  it('extracts text from a minimal EPUB', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pomnia-doc-parser-'))
    const epubPath = join(dir, 'test.epub')
    writeFileSync(epubPath, minimalEpubBytes())

    const doc = parseEpub(epubPath)

    expect(doc.format).toBe('epub')
    expect(doc.meta.pageCount).toBe(1)
    expect(doc.pages[0].text).toContain('Hello EPUB Pomnia')
    expect(doc.markdown).toContain('Hello EPUB Pomnia')
    expect(doc.meta.sparse).toBe(false)
  })
})

describe('parseDocument epub route', () => {
  it('routes .epub files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pomnia-doc-parser-'))
    const epubPath = join(dir, 'book.epub')
    writeFileSync(epubPath, minimalEpubBytes())

    const doc = await parseDocument(epubPath)
    expect(doc.format).toBe('epub')
    expect(doc.pages[0].text).toContain('Hello EPUB Pomnia')
  })
})
