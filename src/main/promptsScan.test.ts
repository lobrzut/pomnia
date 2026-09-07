import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { countLocalPromptsAt, createLocalPrompt, listLocalPromptsAt } from './promptsScan.js'

let vault: string

beforeAll(() => {
  vault = mkdtempSync(join(tmpdir(), 'pomnia-prompts-scan-'))
  mkdirSync(join(vault, 'prompts'), { recursive: true })
  const w = (n: string, body: string): void => writeFileSync(join(vault, 'prompts', n), body)

  w(
    'zglos-blad.md',
    [
      '---',
      'description: Zamień objawy w zgłoszenie',
      'arguments:',
      '  - name: objaw',
      '    required: true',
      '  - name: kiedy',
      '---',
      'Objaw: {{objaw}}',
      'Kiedy: {{kiedy}}',
      '',
    ].join('\n'),
  )
  w('krotki.md', 'Przepisz {{tekst}} po naszemu.\n')
  w('_szkic.md', 'jeszcze nie\n')
  w('notatka.txt', 'nie prompt\n')
})

afterAll(() => {
  rmSync(vault, { recursive: true, force: true })
})

describe('listLocalPromptsAt', () => {
  it('lists prompts and skips drafts and non-markdown', () => {
    expect(listLocalPromptsAt(vault).map((p) => p.name)).toEqual(['krotki', 'zglos-blad'])
  })

  it('reads the declared signature, keeping required as written', () => {
    const p = listLocalPromptsAt(vault).find((x) => x.name === 'zglos-blad')!
    expect(p.description).toBe('Zamień objawy w zgłoszenie')
    expect(p.arguments).toEqual([
      { name: 'objaw', required: true },
      { name: 'kiedy', required: false },
    ])
  })

  it('infers the signature from placeholders when none is declared', () => {
    const p = listLocalPromptsAt(vault).find((x) => x.name === 'krotki')!
    expect(p.arguments).toEqual([{ name: 'tekst', required: true }])
  })

  it('returns nothing rather than throwing when there is no library', () => {
    expect(listLocalPromptsAt(join(vault, 'nowhere'))).toEqual([])
    expect(listLocalPromptsAt('')).toEqual([])
  })

  it('counts what it lists', () => {
    expect(countLocalPromptsAt(vault)).toBe(2)
  })
})

describe('createLocalPrompt', () => {
  it('creates the directory and the file', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'pomnia-fresh-'))
    try {
      const path = createLocalPrompt(fresh, 'pierwszy', '---\ndescription: \n---\n')
      expect(readFileSync(path, 'utf8')).toContain('description:')
      expect(countLocalPromptsAt(fresh)).toBe(1)
    } finally {
      rmSync(fresh, { recursive: true, force: true })
    }
  })

  it('never overwrites an existing prompt', () => {
    // "Add" must not be a way to lose something already written.
    const before = readFileSync(join(vault, 'prompts', 'krotki.md'), 'utf8')
    createLocalPrompt(vault, 'krotki', 'NOWA TRESC')
    expect(readFileSync(join(vault, 'prompts', 'krotki.md'), 'utf8')).toBe(before)
  })
})
