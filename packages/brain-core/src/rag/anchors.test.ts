import { describe, expect, it } from 'vitest'

import { extractAnchors, filterByAnchors } from './anchors.js'

/**
 * The queries below are real ones from this project's own history, which is the
 * point: these are the questions a working vault gets asked, and every one of
 * them names something exactly rather than describing it.
 */

const texts = (q: string): string[] => extractAnchors(q).map((a) => a.text)

describe('extractAnchors — names, kept whole', () => {
  it('keeps a path in one piece', () => {
    // splitTerms would give src, main, docimport, ts — four weak signals.
    expect(texts('co się zmieniło w src/main/docImport.ts')).toContain('src/main/docimport.ts')
  })

  it('keeps a filename with a code extension', () => {
    expect(texts('gdzie jest tokenRole.ts')).toContain('tokenrole.ts')
    expect(texts('co w compose.yaml')).toContain('compose.yaml')
  })

  it('keeps a dotted version, which splitting turns into 0, 1, 82', () => {
    expect(texts('co weszło w 0.1.82')).toContain('0.1.82')
    expect(texts('pdfjs 5.6.205 przeciw 4.10.38')).toEqual(
      expect.arrayContaining(['5.6.205', '4.10.38']),
    )
  })

  it('keeps a SCREAMING_SNAKE constant', () => {
    expect(texts('gdzie był błąd NODE_MODULE_VERSION 137')).toContain('node_module_version')
    expect(texts('co jest w INDEX_SUBDIRS')).toContain('index_subdirs')
  })

  it('keeps snake_case and kebab-case identifiers', () => {
    expect(texts('jak działa search_library')).toContain('search_library')
    expect(texts('wersja brain-core na serwerze')).toContain('brain-core')
  })

  it('keeps camelCase', () => {
    expect(texts('co robi sessionIdGenerator')).toContain('sessionidgenerator')
  })

  it('keeps a commit hash', () => {
    expect(texts('co było w commicie c943ec0f')).toContain('c943ec0f')
  })

  it('finds nothing in an ordinary question', () => {
    // Nothing here is a name, so nothing should be filtered on.
    expect(texts('co ustaliliśmy w sprawie rotacji tokenów')).toEqual([])
    expect(texts('how did we fix the scanning problem')).toEqual([])
  })

  it('ignores hyphenated English that only looks like an identifier', () => {
    expect(texts('a day-to-day step-by-step guide')).toEqual([])
  })

  it('prefers the path over the identifier hiding inside it', () => {
    const a = texts('src/main/docImport.ts')
    expect(a).toContain('src/main/docimport.ts')
    expect(a).not.toContain('docimport')
  })

  it('caps how many it will filter on', () => {
    // A wall of names is a paste, not a question; filtering on all of them
    // finds nothing.
    const many = 'a_b c_d e_f g_h i_j k_l m_n o_p q_r s_t'
    expect(extractAnchors(many).length).toBeLessThanOrEqual(4)
  })
})

describe('filterByAnchors — the safety rule', () => {
  const rows = [
    { text: 'the fix landed in src/main/docImport.ts and runs OCR at import', path: 'sessions/a.md' },
    { text: 'we talked about importing documents generally', path: 'sessions/b.md' },
    { text: 'unrelated note about the garden', path: 'sessions/c.md' },
  ]

  it('keeps only rows containing the anchor', () => {
    const r = filterByAnchors(rows, extractAnchors('co w src/main/docImport.ts'))
    expect(r.kept).toHaveLength(1)
    expect(r.kept[0].path).toBe('sessions/a.md')
    expect(r.applied.map((a) => a.text)).toContain('src/main/docimport.ts')
  })

  it('never empties the result set', () => {
    // The decisive rule: an anchor matching nothing is ignored, rather than
    // answering "your memory contains nothing about this".
    const r = filterByAnchors(rows, extractAnchors('co w src/main/nieistnieje.ts'))
    expect(r.kept).toEqual(rows)
    expect(r.applied).toEqual([])
  })

  it('matches on the note path, not only the chunk body', () => {
    // "what changed in that file" is answered by a chunk *from* the file.
    const byPath = [
      { text: 'some body text with no filename in it', path: 'sessions/tokenRole.ts.md' },
      { text: 'nothing relevant', path: 'sessions/other.md' },
    ]
    const r = filterByAnchors(byPath, extractAnchors('tokenRole.ts'))
    expect(r.kept).toHaveLength(1)
  })

  it('matches on the note name in meta', () => {
    const byName = [
      { text: 'body', meta: { name: '2026-09-08_brain-core_release.md' } },
      { text: 'body', meta: { name: 'inne.md' } },
    ]
    const r = filterByAnchors(byName, extractAnchors('co z brain-core'))
    expect(r.kept).toHaveLength(1)
  })

  it('does nothing when the query has no anchors', () => {
    const r = filterByAnchors(rows, extractAnchors('ogólne pytanie o import'))
    expect(r.kept).toEqual(rows)
    expect(r.applied).toEqual([])
  })

  it('handles an empty candidate list', () => {
    expect(filterByAnchors([], extractAnchors('src/main/x.ts')).kept).toEqual([])
  })
})
