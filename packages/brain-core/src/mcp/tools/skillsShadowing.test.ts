import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runGetSkill } from './skills.js'

/**
 * An own skill and a cli package can share a name, and in the vault this was
 * found in, `art-of-war-skill` does: brain/art-of-war-skill.md and an
 * uncategorised cli/art-of-war-skill/. A bare name has always answered with the
 * own skill. Until this file nothing said so, and no name at all reached the
 * package — checked against the live server on 2026-09-13, where
 * `cli/art-of-war-skill` and `brain/art-of-war-skill` both came back
 * "skill not found".
 */

let root: string

function write(rel: string, body: string): void {
  const file = join(root, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, body)
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pomnia-shadow-'))
  write('brain/art-of-war-skill.md', '---\nname: art-of-war-skill\ndescription: own copy\n---\n\nown body\n')
  write('cli/art-of-war-skill/SKILL.md', '---\nname: art-of-war-skill\ndescription: pkg\n---\n\npackage body\n')
  write(
    'cli/strategy/art-of-war-skill/SKILL.md',
    '---\nname: art-of-war-skill\ndescription: cat\n---\n\ncategorised body\n',
  )
  write('cli/strategy/sun-tzu/SKILL.md', '---\nname: sun-tzu\ndescription: other\n---\n\nother body\n')
  write('brain/build-our-way.md', '---\nname: build-our-way\ndescription: alone\n---\n\nbody\n')
  write('cli/twin/SKILL.md', '---\nname: twin\ndescription: flat\n---\n\nflat twin\n')
  write('cli/strategy/twin/SKILL.md', '---\nname: twin\ndescription: filed\n---\n\nfiled twin\n')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

const get = (name: string) => JSON.parse(runGetSkill({ name }, { skillsRoot: root }))

describe('a bare name that an own skill shares', () => {
  it('still answers with the own skill', () => {
    const r = get('art-of-war-skill')
    expect(r.kind).toBe('brain')
    expect(r.content).toContain('own body')
  })

  it('says which packages it stood in front of, as paths get_skill accepts', () => {
    expect(get('art-of-war-skill').shadows).toEqual([
      'cli/art-of-war-skill/SKILL.md',
      'cli/strategy/art-of-war-skill/SKILL.md',
    ])
  })

  it('says nothing when there was nothing to stand in front of', () => {
    const r = get('build-our-way')
    expect(r.shadows).toBeUndefined()
    expect(r.hint).toBeUndefined()
  })
})

describe('an exact path', () => {
  it('reaches the uncategorised package no name could', () => {
    const r = get('cli/art-of-war-skill/SKILL.md')
    expect(r.kind).toBe('cli')
    expect(r.category).toBeUndefined()
    expect(r.content).toContain('package body')
  })

  it('reaches a categorised package', () => {
    const r = get('cli/strategy/art-of-war-skill/SKILL.md')
    expect(r.category).toBe('strategy')
    expect(r.content).toContain('categorised body')
  })

  it('loads an own skill without reporting shadows, because it asked for exactly that file', () => {
    const r = get('brain/art-of-war-skill.md')
    expect(r.kind).toBe('brain')
    expect(r.shadows).toBeUndefined()
  })

  it('does not step outside the skills tree', () => {
    expect(get('cli/../../etc/SKILL.md').error).toMatch(/not found/)
    expect(get('brain/../../secret.md').error).toMatch(/not found/)
  })

  it('answers not found for a safe path with nothing behind it', () => {
    expect(get('cli/nothing-here/SKILL.md').error).toMatch(/not found/)
  })
})

describe('a name two packages share', () => {
  it('offers candidates every one of which loads', () => {
    // The live server holds 208 uncategorised packages beside 1295 filed ones.
    // Wherever two share a name, the uncategorised one used to be listed by its
    // bare name — the one spelling that is ambiguous by definition.
    const r = get('twin')
    expect(r.error).toMatch(/ambiguous/)
    expect(r.candidates).toHaveLength(2)
    expect(r.candidates).toEqual(expect.arrayContaining(['strategy/twin', 'cli/twin/SKILL.md']))
    for (const c of r.candidates) expect(get(c).error).toBeUndefined()
  })
})

describe('the names that already worked', () => {
  it('still resolve category/name', () => {
    expect(get('strategy/sun-tzu').content).toContain('other body')
  })

  it('still resolve a bare cli name', () => {
    expect(get('sun-tzu').category).toBe('strategy')
  })
})
