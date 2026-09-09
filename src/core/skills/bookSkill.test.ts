import { describe, expect, it } from 'vitest'

import {
  buildSkillPackage,
  chapterFileName,
  chaptersFromMarkdown,
  slugFromTitle,
  withTableOfContents,
  MAX_DESCRIPTION_CHARS,
  MAX_SLUG_CHARS,
} from './bookSkill.js'

describe('slugFromTitle', () => {
  it('makes a legal name from a Polish title', () => {
    // Only lowercase letters, digits and hyphens are allowed, so diacritics are
    // folded rather than dropped into an unreadable stump.
    expect(slugFromTitle('Sieci MikroTik — routing zaawansowany')).toBe(
      'sieci-mikrotik-routing-zaawansowany',
    )
    expect(slugFromTitle('Łączność i błędy')).toBe('lacznosc-i-bledy')
  })

  it('removes reserved words instead of renaming around them', () => {
    // The loader refuses a name containing either, anywhere.
    expect(slugFromTitle('Claude Code Handbook')).not.toContain('claude')
    expect(slugFromTitle('Anthropic Internals')).not.toContain('anthropic')
    expect(slugFromTitle('Claude Code Handbook')).toBe('code-handbook')
  })

  it('never exceeds the character limit and cuts on a hyphen', () => {
    const long = slugFromTitle('a-very-'.repeat(30) + 'end')
    expect(long.length).toBeLessThanOrEqual(MAX_SLUG_CHARS)
    expect(long.endsWith('-')).toBe(false)
  })

  it('always yields something usable', () => {
    expect(slugFromTitle('!!! ???')).toBe('skill')
    expect(slugFromTitle('')).toBe('skill')
  })
})

describe('chaptersFromMarkdown', () => {
  const heading = (t: string, chars: number): string => `# ${t}\n\n${'x'.repeat(chars)}\n`

  it('splits on top-level headings', () => {
    const md = heading('Wstęp', 1000) + heading('Routing', 1200) + heading('Firewall', 900)
    const ch = chaptersFromMarkdown(md)
    expect(ch.map((c) => c.title)).toEqual(['Wstęp', 'Routing', 'Firewall'])
    expect(ch[0].index).toBe(1)
  })

  it('folds a short section into the one before it', () => {
    // A heading with two sentences under it is a subsection. Promoting it to its
    // own file makes the agent pay a read for almost nothing.
    const md = heading('Rozdział', 1500) + heading('Uwaga', 40)
    const ch = chaptersFromMarkdown(md)
    expect(ch).toHaveLength(1)
    expect(ch[0].text).toContain('Uwaga')
  })

  it('falls back to size blocks when a scan has no headings', () => {
    const ch = chaptersFromMarkdown('y'.repeat(20000))
    expect(ch.length).toBeGreaterThan(1)
    expect(ch[0].title).toBe('Część 1')
  })

  it('caps the chapter count — 400 headings is not 400 chapters', () => {
    let md = ''
    for (let i = 0; i < 200; i++) md += heading(`H${i}`, 1000)
    expect(chaptersFromMarkdown(md, { maxChapters: 40 }).length).toBeLessThanOrEqual(40)
  })

  it('returns nothing for an empty document rather than one empty chapter', () => {
    expect(chaptersFromMarkdown('   ')).toEqual([])
  })
})

describe('chapterFileName', () => {
  it('zero-pads so a directory listing sorts correctly', () => {
    expect(chapterFileName({ index: 1, title: 'Wstęp', text: '' })).toBe('chapters/ch01-wstep.md')
    expect(chapterFileName({ index: 12, title: 'Firewall', text: '' })).toBe(
      'chapters/ch12-firewall.md',
    )
  })

  it('uses forward slashes and stays one level deep', () => {
    const p = chapterFileName({ index: 3, title: 'Coś', text: '' })
    expect(p).not.toContain('\\')
    expect(p.split('/')).toHaveLength(2)
  })
})

describe('withTableOfContents', () => {
  const long = (headings: number): string =>
    ['# Tytuł', '', ...Array.from({ length: headings }, (_, i) => `## Sekcja ${i}\n\n${'z'.repeat(60)}\n`)].join('\n')

  it('adds a contents list to a long file', () => {
    const out = withTableOfContents(long(30))
    expect(out).toContain('## Spis treści')
    expect(out).toContain('- Sekcja 0')
    // The title stays first — the TOC goes after it.
    expect(out.indexOf('# Tytuł')).toBeLessThan(out.indexOf('## Spis treści'))
  })

  it('leaves a short file alone', () => {
    const short = '# Tytuł\n\n## A\n\ntreść\n'
    expect(withTableOfContents(short)).toBe(short)
  })

  it('does not add a second contents list', () => {
    const once = withTableOfContents(long(30))
    expect(withTableOfContents(once)).toBe(once)
  })
})

describe('buildSkillPackage', () => {
  const chapters = [
    { index: 1, title: 'Wstęp', text: '# Wstęp\n\ntreść pierwsza', summary: 'po co to wszystko' },
    { index: 2, title: 'Routing', text: '# Routing\n\ntreść druga' },
  ]
  const base = {
    slug: 'mikrotik-routing',
    title: 'MikroTik routing',
    description: 'Covers MikroTik routing decisions. Use when configuring or debugging routes.',
    chapters,
  }

  it('produces one skill for the whole book, never one per chapter', () => {
    // The measured reason: a router above per-chapter skills scored 0.6398
    // against 0.9126 flat, and every skill description is preloaded at startup.
    const pkg = buildSkillPackage(base)
    const skillMds = pkg.files.filter((f) => f.path.endsWith('SKILL.md'))
    expect(skillMds).toHaveLength(1)
    expect(skillMds[0].path).toBe('SKILL.md')
  })

  it('puts SKILL.md first and indexes every chapter file that exists', () => {
    const pkg = buildSkillPackage(base)
    expect(pkg.files[0].path).toBe('SKILL.md')
    const paths = pkg.files.map((f) => f.path)
    for (const ch of chapters) {
      const file = chapterFileName(ch)
      expect(paths).toContain(file)
      expect(pkg.files[0].content).toContain(file)
    }
  })

  it('carries the per-chapter summary into the index', () => {
    const pkg = buildSkillPackage(base)
    expect(pkg.files[0].content).toContain('po co to wszystko')
  })

  it('writes frontmatter the loader will accept', () => {
    const pkg = buildSkillPackage(base)
    const md = pkg.files[0].content
    expect(md.startsWith('---\n')).toBe(true)
    expect(md).toContain('name: mikrotik-routing')
    expect(md).toContain('description: Covers MikroTik routing')
  })

  it('cuts an over-long description and says so', () => {
    const pkg = buildSkillPackage({ ...base, description: 'x'.repeat(MAX_DESCRIPTION_CHARS + 50) })
    const line = pkg.files[0].content.split('\n').find((l) => l.startsWith('description:'))!
    expect(line.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS + 'description: '.length)
    expect(pkg.warnings.join(' ')).toContain('cut to')
  })

  it('warns about a first-person description', () => {
    // It is injected into a system prompt, where point of view breaks discovery.
    const pkg = buildSkillPackage({ ...base, description: 'I can help you with routing.' })
    expect(pkg.warnings.join(' ')).toContain('third person')
  })

  it('omits optional files that were not distilled', () => {
    const pkg = buildSkillPackage(base)
    expect(pkg.files.map((f) => f.path)).not.toContain('glossary.md')
    expect(pkg.files[0].content).not.toContain('Dodatkowo')
  })

  it('links the optional files that were', () => {
    const pkg = buildSkillPackage({ ...base, glossary: 'BGP — protokół', cheatsheet: '| a | b |' })
    const paths = pkg.files.map((f) => f.path)
    expect(paths).toContain('glossary.md')
    expect(paths).toContain('cheatsheet.md')
    expect(pkg.files[0].content).toContain('[Pojęcia](glossary.md)')
    expect(pkg.files[0].content).toContain('[Ściąga](cheatsheet.md)')
  })

  it('keeps every reference exactly one level from SKILL.md', () => {
    // Nested references make the agent preview with head -100 and read partial
    // files, so links must point straight at their target.
    const pkg = buildSkillPackage({ ...base, glossary: 'x' })
    for (const f of pkg.files) {
      expect(f.path.split('/').length).toBeLessThanOrEqual(2)
      expect(f.path).not.toContain('\\')
    }
  })

  it('says so when the document yielded nothing', () => {
    const pkg = buildSkillPackage({ ...base, chapters: [] })
    expect(pkg.warnings.join(' ')).toContain('no chapters')
  })

  it('is pure — the same input gives the same bytes', () => {
    expect(buildSkillPackage(base)).toEqual(buildSkillPackage(base))
  })
})
