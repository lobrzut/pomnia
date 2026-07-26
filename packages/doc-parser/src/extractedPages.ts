import type { ParsedPage } from './types.js'

/**
 * Recover per-page text from extracted markdown (`## Page N` headings).
 * Used after OCR so re-index can embed vault markdown instead of re-parsing the PDF.
 */
export function pagesFromExtractedMarkdown(markdown: string): ParsedPage[] | null {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, '')
  const re = /^## Page (\d+)\s*$/gm
  const hits: { page: number; start: number; headerEnd: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    hits.push({ page: Number(m[1]), start: m.index, headerEnd: m.index + m[0].length })
  }
  if (hits.length === 0) return null

  const pages: ParsedPage[] = []
  for (let i = 0; i < hits.length; i++) {
    const end = i + 1 < hits.length ? hits[i + 1].start : body.length
    let text = body.slice(hits[i].headerEnd, end).trim()
    if (text === '_(empty)_') text = ''
    pages.push({ page: hits[i].page, text })
  }
  return pages
}

/** Rebuild `## Page N` markdown body from pages (no frontmatter). */
export function markdownFromPages(pages: ParsedPage[]): string {
  return pages
    .map((p) => (p.text ? `## Page ${p.page}\n\n${p.text}` : `## Page ${p.page}\n\n_(empty)_`))
    .join('\n\n')
}
