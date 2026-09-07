import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  listResourceTemplates,
  listResources,
  parseUri,
  readResource,
  uriFor,
  SESSION_LIST_LIMIT,
} from './resources.js'

let vault: string

const daysAgo = (n: number): Date => new Date(Date.now() - n * 86_400_000)

beforeAll(() => {
  vault = mkdtempSync(join(tmpdir(), 'pomnia-res-'))
  mkdirSync(join(vault, 'sprawy'), { recursive: true })
  mkdirSync(join(vault, 'sessions'), { recursive: true })
  mkdirSync(join(vault, 'distilled'), { recursive: true })

  writeFileSync(
    join(vault, 'sprawy', 'rustyrat-CIT8-2025.md'),
    'To jest jedyne źródło STANU TERAZ. Checkpointy = historia.\n',
  )
  writeFileSync(join(vault, 'sprawy', 'rustyrat-SF-2025.md'), '# Sprawozdanie 2025\n\nZłożone.\n')
  // Machine-written, reachable through search — deliberately not addressable.
  writeFileSync(join(vault, 'distilled', 'jakis-destylat.md'), 'nieadresowalne\n')

  for (let i = 0; i < SESSION_LIST_LIMIT + 10; i++) {
    const f = join(vault, 'sessions', `2026-09-${String((i % 28) + 1).padStart(2, '0')}_s${i}.md`)
    writeFileSync(f, `# Sesja ${i}\n\ntreść\n`)
    const t = daysAgo(i)
    utimesSync(f, t, t)
  }
})

afterAll(() => {
  rmSync(vault, { recursive: true, force: true })
})

describe('parseUri — the name reaches a filesystem read', () => {
  it('accepts the shapes it serves', () => {
    expect(parseUri('pomnia://sprawa/rustyrat-CIT8-2025')).toEqual({
      area: 'sprawa',
      key: 'rustyrat-CIT8-2025',
    })
    expect(parseUri('pomnia://recent/7')).toEqual({ area: 'recent', key: '7' })
  })

  it('refuses anything that could climb out, rather than normalising it', () => {
    for (const bad of [
      'pomnia://sprawa/../../etc/passwd',
      'pomnia://sprawa/..',
      'pomnia://sesja/a/b',
      'pomnia://sesja/a\\b',
      'pomnia://distilled/x',
      'pomnia://sprawa/',
      'file:///etc/passwd',
      'pomnia://recent/abc',
      '',
    ]) {
      expect(parseUri(bad), bad).toBeNull()
    }
  })

  it('refuses a traversal hidden in percent-encoding', () => {
    // The decode happens before the check, so `%2e%2e` is caught as `..`.
    expect(parseUri('pomnia://sprawa/%2e%2e')).toBeNull()
    expect(parseUri('pomnia://sprawa/a%2Fb')).toBeNull()
  })
})

describe('listResources', () => {
  it('lists cases and sessions, and nothing machine-written', () => {
    const all = listResources(vault)
    const uris = all.map((r) => r.uri)
    expect(uris).toContain(uriFor('sprawa', 'rustyrat-CIT8-2025'))
    expect(uris.some((u) => u.includes('sesja/'))).toBe(true)
    expect(uris.some((u) => u.includes('distilled'))).toBe(false)
  })

  it('describes a note by its own first line, never an invented one', () => {
    const r = listResources(vault).find((x) => x.uri.endsWith('rustyrat-CIT8-2025'))
    expect(r?.description).toContain('STANU TERAZ')
  })

  it('caps sessions, because a menu of thousands is the list_skills mistake again', () => {
    const sessions = listResources(vault).filter((r) => r.uri.includes('sesja/'))
    expect(sessions).toHaveLength(SESSION_LIST_LIMIT)
  })

  it('returns nothing rather than throwing when the vault is not there', () => {
    expect(listResources(join(vault, 'nowhere'))).toEqual([])
    expect(listResources('')).toEqual([])
  })
})

describe('readResource', () => {
  it('returns the file, unchanged', () => {
    const got = readResource(vault, uriFor('sprawa', 'rustyrat-CIT8-2025'))
    expect(got).toMatchObject({ mimeType: 'text/markdown' })
    expect('text' in got && got.text).toContain('STANU TERAZ')
  })

  it('reaches a session that the listing was too short to show', () => {
    // The cap is on the menu, not on what is addressable.
    const got = readResource(vault, uriFor('sesja', '2026-09-01_s56'))
    expect('text' in got && got.text).toContain('Sesja 56')
  })

  it('says so for a name that is not there', () => {
    expect(readResource(vault, uriFor('sprawa', 'nie-ma-takiej'))).toMatchObject({
      error: expect.stringContaining('no such resource'),
    })
  })

  it('refuses a traversal at the read door too, not only in the parser', () => {
    expect(readResource(vault, 'pomnia://sprawa/../../etc/passwd')).toMatchObject({
      error: expect.stringContaining('unreadable'),
    })
  })

  it('answers recent with pointers, not with a week of pasted text', () => {
    // Inlining the contents here would be the context-window mistake in a new
    // place — this is a menu.
    const got = readResource(vault, 'pomnia://recent/3')
    const text = 'text' in got ? got.text : ''
    expect(text).toContain('pomnia://')
    expect(text).not.toContain('treść')
  })

  it('says plainly when nothing changed', () => {
    const empty = mkdtempSync(join(tmpdir(), 'pomnia-res-empty-'))
    try {
      mkdirSync(join(empty, 'sprawy'), { recursive: true })
      const got = readResource(empty, 'pomnia://recent/7')
      expect('text' in got && got.text).toContain('Nic nie zmieniało się')
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

describe('templates are views, not file paths', () => {
  it('offers a case, a session and a time window', () => {
    const t = listResourceTemplates().map((x) => x.uriTemplate)
    expect(t).toEqual([
      'pomnia://sprawa/{nazwa}',
      'pomnia://sesja/{nazwa}',
      'pomnia://recent/{dni}',
    ])
    // No `pomnia://file/{path}`: that is a file browser, and it makes the user
    // learn the vault's layout to ask a question about their own memory.
    expect(t.some((x) => x.includes('file/'))).toBe(false)
  })
})
