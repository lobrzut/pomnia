// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * A book becomes one skill, not a pile of notes and not twenty skills.
 *
 * Import already turns a PDF into markdown a person can read. That is the wrong
 * shape for an agent: to answer one question it must carry the whole book, and a
 * technical book is tens of thousands of tokens that crowd out the conversation.
 * A skill is the right shape — an index that is always loaded, and chapters that
 * are read only when the question needs them.
 *
 * Two rules here are measured, not preferences, and both are easy to get wrong:
 *
 * **One book is one skill.** The tempting alternative — a skill per chapter with
 * a router above them — was tested against flat indexing and lost badly: 0.9126
 * to 0.6398 on one set, 0.7479 to 0.3890 on another. Depth does not pay. It is
 * also the same context leak this project already fixed once: every skill's
 * description is preloaded at startup, so a book split into twenty skills costs
 * twenty descriptions in every session, including sessions that never open it.
 *
 * **Flat indexing earns its keep at library scale.** For a single book it is
 * often a tie — an agent with grep reconstructs retrieval on its own. Across
 * twenty books it was 0.26 against 0.46, roughly double the accuracy at half the
 * tokens. This vault holds 1259 skills, so it is firmly in the range where the
 * measurement applies.
 *
 * The structural limits come from the published skill-authoring rules rather
 * than from taste: SKILL.md under 500 lines, `name` at most 64 characters of
 * lowercase/digits/hyphens with `anthropic` and `claude` reserved, `description`
 * at most 1024 characters and written in the third person because it is injected
 * into a system prompt, reference files one level from SKILL.md, and a table of
 * contents in any file over 100 lines so a partial read still shows the scope.
 *
 * This module is deliberately free of any model call. It shapes and validates;
 * the prose that needs a model (mental models, patterns, glossary) arrives as
 * input. That keeps the part worth trusting testable without a GPU.
 */

/** Hard limits from the skill-authoring rules. Not tunables. */
export const MAX_SLUG_CHARS = 64
export const MAX_DESCRIPTION_CHARS = 1024
export const MAX_SKILL_MD_LINES = 500
export const TOC_REQUIRED_OVER_LINES = 100

/** Reserved by the spec — a skill name may not contain either. */
const RESERVED = ['anthropic', 'claude']

export interface Chapter {
  /** 1-based, drives the filename so ordering survives a directory listing. */
  index: number
  title: string
  text: string
  /** One line for the index in SKILL.md. Supplied by whoever distilled it. */
  summary?: string
}

export interface SkillFile {
  /** Forward slashes always, relative to the skill directory. */
  path: string
  content: string
}

export interface SkillPackage {
  slug: string
  files: SkillFile[]
  /** Things a person should look at. Never thrown — a warning is not a failure. */
  warnings: string[]
}

/**
 * Turn a title into a legal skill name.
 *
 * Strips diacritics so a Polish title yields an ASCII slug — the spec allows
 * only lowercase letters, digits and hyphens, and a slug the loader rejects is
 * worse than one that reads a little flatter.
 */
export function slugFromTitle(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/gi, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  // Reserved words cannot appear anywhere in the name, so remove rather than
  // rename — a slug containing them is refused outright by the loader.
  let out = base
  for (const word of RESERVED) {
    out = out.split(word).join('')
  }
  out = out.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')

  if (!out) out = 'skill'
  if (out.length > MAX_SLUG_CHARS) {
    // Cut on a hyphen when possible so the name stays readable.
    out = out.slice(0, MAX_SLUG_CHARS)
    const lastDash = out.lastIndexOf('-')
    if (lastDash > MAX_SLUG_CHARS / 2) out = out.slice(0, lastDash)
    out = out.replace(/-+$/, '')
  }
  return out
}

/** `ch01-nazwa-rozdzialu.md`, zero-padded so a listing sorts correctly. */
export function chapterFileName(chapter: Chapter): string {
  const n = String(chapter.index).padStart(2, '0')
  const slug = slugFromTitle(chapter.title).slice(0, 40).replace(/-+$/, '') || 'rozdzial'
  return `chapters/ch${n}-${slug}.md`
}

export interface HeadingSplitOptions {
  /** Below this many characters a heading is treated as a subsection, not a chapter. */
  minChapterChars?: number
  /** Never produce more than this; a book with 400 headings is not 400 chapters. */
  maxChapters?: number
}

/**
 * Split extracted markdown into chapters at its top-level headings.
 *
 * Falls back to fixed-size blocks when a document has no usable headings — a
 * scanned book often has none, and returning one enormous chapter would defeat
 * the whole point.
 */
export function chaptersFromMarkdown(markdown: string, opts: HeadingSplitOptions = {}): Chapter[] {
  const minChars = opts.minChapterChars ?? 800
  const maxChapters = opts.maxChapters ?? 40

  const lines = markdown.split('\n')
  const cuts: { line: number; title: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,2})\s+(.+?)\s*$/.exec(lines[i])
    if (m && m[2].trim()) cuts.push({ line: i, title: m[2].trim() })
  }

  const sections: { title: string; text: string }[] = []
  if (cuts.length > 0) {
    for (let i = 0; i < cuts.length; i++) {
      const from = cuts[i].line
      const to = i + 1 < cuts.length ? cuts[i + 1].line : lines.length
      sections.push({ title: cuts[i].title, text: lines.slice(from, to).join('\n').trim() })
    }
  }

  // Merge anything too short into the previous section: a heading with two
  // sentences under it is a subsection, and promoting it to a chapter file
  // means the agent pays a read for almost nothing.
  const merged: { title: string; text: string }[] = []
  for (const s of sections) {
    if (merged.length > 0 && s.text.length < minChars) {
      merged[merged.length - 1].text += `\n\n${s.text}`
    } else {
      merged.push({ ...s })
    }
  }

  if (merged.length === 0) {
    // No headings worth using. Split on size so chapters stay readable.
    const body = markdown.trim()
    if (!body) return []
    const target = Math.max(minChars * 4, Math.ceil(body.length / maxChapters))
    const blocks: string[] = []
    for (let i = 0; i < body.length; i += target) blocks.push(body.slice(i, i + target))
    return blocks.map((text, i) => ({ index: i + 1, title: `Część ${i + 1}`, text }))
  }

  return merged.slice(0, maxChapters).map((s, i) => ({ index: i + 1, title: s.title, text: s.text }))
}

/** Prepend a table of contents when a file is long enough that a partial read would hide its scope. */
export function withTableOfContents(content: string): string {
  const lines = content.split('\n')
  if (lines.length <= TOC_REQUIRED_OVER_LINES) return content
  if (/^##\s+(Contents|Spis treści)\s*$/m.test(content)) return content

  const headings = lines
    .map((l) => /^(#{2,3})\s+(.+?)\s*$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => `- ${m[2].trim()}`)
  if (headings.length === 0) return content

  // After the H1 if there is one, so the title stays first.
  const h1 = lines.findIndex((l) => /^#\s+/.test(l))
  const toc = ['## Spis treści', '', ...headings, ''].join('\n')
  if (h1 < 0) return `${toc}\n${content}`
  const head = lines.slice(0, h1 + 1).join('\n')
  const rest = lines.slice(h1 + 1).join('\n')
  return `${head}\n\n${toc}${rest}`
}

export interface BuildSkillInput {
  slug: string
  /** Human title of the book, used in the SKILL.md heading. */
  title: string
  /** Third person, what it covers and when to reach for it. */
  description: string
  chapters: Chapter[]
  /** Distilled prose. Each is optional; an absent one simply produces no file. */
  mentalModels?: string
  glossary?: string
  patterns?: string
  cheatsheet?: string
  /** Where the text came from, recorded so a reader can go back to it. */
  source?: string
}

/**
 * Assemble the file set. Pure: same input, same bytes.
 *
 * Validation produces warnings rather than errors. A skill slightly over the
 * line budget is still usable and the person can trim it; refusing to write
 * anything would lose the whole extraction over a formatting rule.
 */
export function buildSkillPackage(input: BuildSkillInput): SkillPackage {
  const warnings: string[] = []
  const slug = slugFromTitle(input.slug || input.title)

  let description = input.description.trim().replace(/\s+/g, ' ')
  if (description.length > MAX_DESCRIPTION_CHARS) {
    description = description.slice(0, MAX_DESCRIPTION_CHARS - 1).trimEnd() + '…'
    warnings.push(`description was cut to ${MAX_DESCRIPTION_CHARS} characters`)
  }
  if (/^\s*(I |We |You )/i.test(input.description.trim())) {
    warnings.push('description should be third person — it is injected into a system prompt')
  }

  const files: SkillFile[] = []

  // Chapter files first: SKILL.md indexes them, so their names must exist.
  for (const ch of input.chapters) {
    const path = chapterFileName(ch)
    const body = [`# ${ch.title}`, '', ch.text.replace(/^#{1,2}\s+.+\n?/, '').trim(), ''].join('\n')
    files.push({ path, content: withTableOfContents(body) })
  }

  const optional: [string, string | undefined][] = [
    ['glossary.md', input.glossary],
    ['patterns.md', input.patterns],
    ['cheatsheet.md', input.cheatsheet],
  ]
  for (const [name, content] of optional) {
    if (content && content.trim()) {
      files.push({ path: name, content: withTableOfContents(content.trim() + '\n') })
    }
  }

  const index = input.chapters
    .map((ch) => {
      const file = chapterFileName(ch)
      const line = ch.summary?.trim().replace(/\s+/g, ' ')
      return `- [${ch.title}](${file})${line ? ` — ${line}` : ''}`
    })
    .join('\n')

  const links: string[] = []
  for (const [name, content] of optional) {
    if (content && content.trim()) {
      const label =
        name === 'glossary.md' ? 'Pojęcia' : name === 'patterns.md' ? 'Wzorce' : 'Ściąga'
      links.push(`- [${label}](${name})`)
    }
  }

  const skillMd = [
    '---',
    `name: ${slug}`,
    `description: ${description}`,
    '---',
    '',
    `# ${input.title}`,
    '',
    input.source ? `Źródło: ${input.source}` : '',
    input.source ? '' : '',
    input.mentalModels?.trim() ? '## Modele myślowe' : '',
    input.mentalModels?.trim() ? '' : '',
    input.mentalModels?.trim() ?? '',
    input.mentalModels?.trim() ? '' : '',
    '## Rozdziały',
    '',
    'Czytaj tylko ten, którego dotyczy pytanie — reszta nie kosztuje kontekstu, dopóki jej nie otworzysz.',
    '',
    index,
    '',
    ...(links.length > 0 ? ['## Dodatkowo', '', ...links, ''] : []),
  ]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n')

  const skillLines = skillMd.split('\n').length
  if (skillLines > MAX_SKILL_MD_LINES) {
    warnings.push(
      `SKILL.md is ${skillLines} lines, over the ${MAX_SKILL_MD_LINES}-line budget — move detail into chapter files`,
    )
  }
  if (input.chapters.length === 0) {
    warnings.push('no chapters were produced — the document may have yielded no usable text')
  }

  files.unshift({ path: 'SKILL.md', content: skillMd })
  return { slug, files, warnings }
}
