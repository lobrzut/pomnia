import { readFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'

import { unzipSync } from 'fflate'

import type { ParsedDocument, ParsedPage } from './types.js'

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

/** Strip XHTML/HTML to plain text for RAG indexing. */
export function htmlToText(html: string): string {
  return decodeXmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

function readZipText(files: Record<string, Uint8Array>, path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const data = files[normalized]
  if (!data) throw new Error(`EPUB missing entry: ${path}`)
  return new TextDecoder('utf-8').decode(data)
}

function containerRootPath(containerXml: string): string {
  const m = containerXml.match(/full-path=["']([^"']+)["']/i)
  if (!m) throw new Error('EPUB container.xml: rootfile not found')
  return m[1]!
}

function opfManifest(opf: string): Map<string, string> {
  const map = new Map<string, string>()
  const itemRe = /<item\b[^>]*\/?>/gi
  for (const tag of opf.match(itemRe) ?? []) {
    const id = tag.match(/\bid=["']([^"']+)["']/i)?.[1]
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1]
    if (id && href) map.set(id, href)
  }
  return map
}

function opfSpineIds(opf: string): string[] {
  const ids: string[] = []
  const re = /<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*\/?>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(opf)) !== null) ids.push(m[1]!)
  return ids
}

function resolveZipPath(basePath: string, href: string): string {
  const baseDir = dirname(basePath.replace(/\\/g, '/'))
  return posix.normalize(join(baseDir, href).replace(/\\/g, '/'))
}

/**
 * Extract text from EPUB via ZIP + OPF spine (pure JS, no native deps).
 */
export function parseEpub(filePath: string): ParsedDocument {
  const raw = readFileSync(filePath)
  const files = unzipSync(new Uint8Array(raw)) as Record<string, Uint8Array>

  const containerXml = readZipText(files, 'META-INF/container.xml')
  const opfPath = containerRootPath(containerXml)
  const opf = readZipText(files, opfPath)

  const manifest = opfManifest(opf)
  const spineIds = opfSpineIds(opf)
  if (spineIds.length === 0) throw new Error('EPUB spine is empty')

  const pages: ParsedPage[] = []
  const mdParts: string[] = []

  for (let i = 0; i < spineIds.length; i++) {
    const href = manifest.get(spineIds[i]!)
    if (!href) continue
    const entryPath = resolveZipPath(opfPath, href)
    const html = readZipText(files, entryPath)
    const text = htmlToText(html)
    if (!text) continue
    pages.push({ page: pages.length + 1, text })
    mdParts.push(text)
  }

  if (pages.length === 0) {
    pages.push({ page: 1, text: '' })
  }

  const markdown = mdParts.join('\n\n---\n\n') || '_(empty)_'
  const charCount = pages.reduce((n, p) => n + p.text.length, 0)

  return {
    sourcePath: filePath,
    format: 'epub',
    pages,
    markdown,
    meta: {
      tier: 1,
      sparse: charCount / pages.length < 50,
      charCount,
      pageCount: pages.length,
    },
  }
}
