import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runListSkills, runGetSkill } from './skills.js'

/**
 * The regression this file exists for.
 *
 * 1244 cli packages were sorted into eight category folders. The source only
 * ever read `cli/<name>/SKILL.md`, so it saw none of them; the live server kept
 * working solely because someone edited the compiled file inside the running
 * container. The next `docker compose up --force-recreate` would have deleted
 * that edit and taken all 1244 skills with it, silently, with no error anywhere.
 *
 * The second thing measured here is size. The full catalogue serialised to
 * 388 kB — about a hundred thousand tokens — so any agent that called
 * `list_skills` lost most of its context window to a table of contents.
 */

let root: string

function skill(rel: string, name: string, description: string): void {
  const dir = join(root, rel)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\nbody of ${name}\n`)
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pomnia-skills-'))
  mkdirSync(join(root, 'brain'), { recursive: true })
  writeFileSync(
    join(root, 'brain', 'build-our-way.md'),
    '---\nname: build-our-way\ndescription: How we build here\n---\n\nbody\n',
  )

  skill('cli/flat-one', 'flat-one', 'a package that never moved')
  skill('cli/cyber/nmap-recon', 'nmap-recon', 'scan a network politely')
  skill('cli/cyber/burp-basics', 'burp-basics', 'intercept and replay')
  skill('cli/trading/nmap-recon', 'nmap-recon', 'unrelated, same name on purpose')

  // Bookkeeping that must never be listed: a full copy of the categories.
  skill('_backup-cli-before-categorize/cyber/nmap-recon', 'nmap-recon', 'a backup copy')
  skill('cli/_backups/cyber/nmap-recon', 'nmap-recon', 'a backup copy inside cli')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

const deps = () => ({ skillsRoot: root })

describe('cli layouts', () => {
  it('finds skills in both the flat and the categorised layout', () => {
    const r = JSON.parse(runListSkills({ category: 'cyber' }, deps()))
    expect(r.skills.map((s: { name: string }) => s.name).sort()).toEqual(['burp-basics', 'nmap-recon'])
  })

  it('counts a flat skill as uncategorised rather than dropping it', () => {
    const r = JSON.parse(runListSkills({ scope: 'cli' }, deps()))
    const cats = Object.fromEntries(
      r.cli.categories.map((c: { category: string; count: number }) => [c.category, c.count]),
    )
    expect(cats).toEqual({ cyber: 2, '(uncategorised)': 1, trading: 1 })
    expect(r.cli.count).toBe(4)
  })

  it('never walks into a backup copy', () => {
    const all = JSON.parse(runListSkills({ query: 'nmap' }, deps()))
    // Two real ones — cyber and trading. The two backups are not skills.
    expect(all.total).toBe(2)
    expect(JSON.stringify(all)).not.toContain('backup copy')
  })
})

describe('listing size', () => {
  it('summarises instead of enumerating', () => {
    const summary = runListSkills({}, deps())
    const parsed = JSON.parse(summary)
    // Own skills come back whole; they are few and they are the user's.
    expect(parsed.own.skills).toHaveLength(1)
    // The cli half is counts only — no skill names in it.
    expect(JSON.stringify(parsed.cli)).not.toContain('nmap-recon')
    expect(parsed.cli.count).toBe(4)
  })

  it('pages a narrowed list and says where to continue', () => {
    const first = JSON.parse(runListSkills({ category: 'cyber', limit: 1 }, deps()))
    expect(first.shown).toBe(1)
    expect(first.total).toBe(2)
    expect(first.nextOffset).toBe(1)
    const second = JSON.parse(runListSkills({ category: 'cyber', limit: 1, offset: 1 }, deps()))
    expect(second.shown).toBe(1)
    expect(second.nextOffset).toBeUndefined()
    expect(second.skills[0].name).not.toBe(first.skills[0].name)
  })

  it('caps limit so one call cannot ask for the whole catalogue', () => {
    const r = JSON.parse(runListSkills({ query: 'a', limit: 99999 }, deps()))
    expect(r.shown).toBeLessThanOrEqual(200)
  })

  it('explains an unknown category instead of returning an empty list', () => {
    const r = JSON.parse(runListSkills({ category: 'nope' }, deps()))
    expect(r.total).toBe(0)
    expect(r.hint).toContain('no cli category')
  })
})

describe('get_skill', () => {
  it('loads a categorised skill by bare name', () => {
    const r = JSON.parse(runGetSkill({ name: 'burp-basics' }, deps()))
    expect(r.category).toBe('cyber')
    expect(r.content).toContain('body of burp-basics')
  })

  it('refuses an ambiguous name rather than guessing a category', () => {
    const r = JSON.parse(runGetSkill({ name: 'nmap-recon' }, deps()))
    expect(r.error).toContain('ambiguous')
    expect(r.candidates.sort()).toEqual(['cyber/nmap-recon', 'trading/nmap-recon'])
  })

  it('resolves the ambiguity when the category is given', () => {
    const r = JSON.parse(runGetSkill({ name: 'trading/nmap-recon' }, deps()))
    expect(r.category).toBe('trading')
    expect(r.description).toContain('same name on purpose')
  })

  it('still finds a brain skill', () => {
    const r = JSON.parse(runGetSkill({ name: 'build-our-way' }, deps()))
    expect(r.kind).toBe('brain')
  })

  it('matches regardless of letter case', () => {
    expect(JSON.parse(runGetSkill({ name: 'Burp-Basics' }, deps())).category).toBe('cyber')
  })
})
