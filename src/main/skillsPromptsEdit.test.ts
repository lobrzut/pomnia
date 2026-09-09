import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { MAX_SKILL_BYTES, readLocalSkillAt, writeLocalSkillAt } from './skillsScan.js'
import { MAX_PROMPT_BYTES, readLocalPrompt, writeLocalPrompt } from './promptsScan.js'

/**
 * Editing a skill or a prompt inside the app.
 *
 * The desktop used to hand these files to the operating system's editor, so
 * nothing in the main process could write one. Now it can, and the two things
 * worth pinning down are that it writes only where it is allowed to and that a
 * write cannot leave a half-file behind:
 *
 *  - the target must be something the scanner already lists, so a path handed
 *    in from a window cannot name a file outside the tree, and saving cannot
 *    quietly create a skill that no one asked for;
 *  - the write keeps the previous copy, because a prompt is served to an agent
 *    the moment it is on disk.
 */

let vaultRoot: string
let skillsRoot: string

function skill(rel: string, body: string): string {
  const dir = join(skillsRoot, rel)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'SKILL.md')
  writeFileSync(file, body)
  return file
}

beforeEach(() => {
  vaultRoot = mkdtempSync(join(tmpdir(), 'pomnia-edit-'))
  skillsRoot = join(vaultRoot, 'skills')
  mkdirSync(join(skillsRoot, 'brain'), { recursive: true })
  writeFileSync(
    join(skillsRoot, 'brain', 'own-one.md'),
    '---\ndescription: Own skill\n---\n\nstara treść\n',
  )
  skill('cli/bug-bounty/recon', '---\ndescription: Recon\n---\n\nstara treść\n')

  mkdirSync(join(vaultRoot, 'prompts'), { recursive: true })
  writeFileSync(
    join(vaultRoot, 'prompts', 'zglos-blad.md'),
    '---\ndescription: Zgłoś błąd\n---\n\nstara treść\n',
  )
})

afterAll(() => {
  try {
    rmSync(vaultRoot, { recursive: true, force: true })
  } catch {
    /* the temp dir is the OS's problem after this */
  }
})

describe('editing a skill', () => {
  it('reads one the scanner lists, in either layout', () => {
    const own = readLocalSkillAt(skillsRoot, join(skillsRoot, 'brain', 'own-one.md'))
    expect(own.ok && own.text).toContain('stara treść')

    const nested = readLocalSkillAt(skillsRoot, join(skillsRoot, 'cli', 'bug-bounty', 'recon', 'SKILL.md'))
    expect(nested.ok && nested.text).toContain('Recon')
  })

  it('saves over it, keeping the previous copy', () => {
    const file = join(skillsRoot, 'brain', 'own-one.md')
    const r = writeLocalSkillAt(skillsRoot, file, '---\ndescription: Own skill\n---\n\nnowa treść\n')

    expect(r.ok).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain('nowa treść')
    // The spare is what a crash mid-write leaves behind instead of nothing.
    expect(readFileSync(`${file}.prev`, 'utf8')).toContain('stara treść')
  })

  it('refuses a path the scanner would not list', () => {
    // The shape a traversal would take: a real file, outside the skills tree.
    const outside = join(vaultRoot, 'secret.md')
    writeFileSync(outside, 'nie ruszaj')

    expect(readLocalSkillAt(skillsRoot, outside)).toEqual({ ok: false, error: 'not a listed skill' })
    expect(writeLocalSkillAt(skillsRoot, outside, 'zmienione')).toEqual({
      ok: false,
      error: 'not a listed skill',
    })
    expect(readFileSync(outside, 'utf8')).toBe('nie ruszaj')
  })

  it('saves, never creates', () => {
    const fresh = join(skillsRoot, 'brain', 'never-asked-for.md')
    expect(writeLocalSkillAt(skillsRoot, fresh, 'treść').ok).toBe(false)
    expect(existsSync(fresh)).toBe(false)
  })

  it('refuses a body past the ceiling', () => {
    const file = join(skillsRoot, 'brain', 'own-one.md')
    const r = writeLocalSkillAt(skillsRoot, file, 'x'.repeat(MAX_SKILL_BYTES + 1))

    expect(r).toEqual({ ok: false, error: 'file too large' })
    expect(readFileSync(file, 'utf8')).toContain('stara treść')
  })
})

describe('editing a prompt', () => {
  it('reads and saves by name, keeping the previous copy', () => {
    const read = readLocalPrompt(vaultRoot, 'zglos-blad')
    expect(read.ok && read.text).toContain('stara treść')

    const r = writeLocalPrompt(vaultRoot, 'zglos-blad', '---\ndescription: Zgłoś błąd\n---\n\nnowa\n')
    expect(r.ok).toBe(true)

    const file = join(vaultRoot, 'prompts', 'zglos-blad.md')
    expect(readFileSync(file, 'utf8')).toContain('nowa')
    expect(readFileSync(`${file}.prev`, 'utf8')).toContain('stara treść')
  })

  it('refuses a name that is really a path', () => {
    for (const bad of ['../secret', 'sub/dir', 'zglos-blad.md', '', '.']) {
      expect(readLocalPrompt(vaultRoot, bad).ok).toBe(false)
      expect(writeLocalPrompt(vaultRoot, bad, 'treść').ok).toBe(false)
    }
  })

  it('saves, never creates', () => {
    expect(writeLocalPrompt(vaultRoot, 'nowy-prompt', 'treść')).toEqual({
      ok: false,
      error: 'not found',
    })
    expect(existsSync(join(vaultRoot, 'prompts', 'nowy-prompt.md'))).toBe(false)
  })

  it('refuses a body past the ceiling', () => {
    const r = writeLocalPrompt(vaultRoot, 'zglos-blad', 'x'.repeat(MAX_PROMPT_BYTES + 1))
    expect(r).toEqual({ ok: false, error: 'file too large' })
  })
})
