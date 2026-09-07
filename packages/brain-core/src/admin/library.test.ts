import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  isSafePromptName,
  isSafeSkillRel,
  listPrompts,
  readPrompt,
  readSkill,
  writePrompt,
  writeSkill,
} from './library.js'

let vault: string
let skills: string

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), 'pomnia-lib-'))
  skills = join(vault, 'skills')
  mkdirSync(join(skills, 'brain'), { recursive: true })
  mkdirSync(join(skills, 'cli', 'cyber', 'nmap-recon'), { recursive: true })
  writeFileSync(join(skills, 'brain', 'build-our-way.md'), 'brain body\n')
  writeFileSync(join(skills, 'cli', 'cyber', 'nmap-recon', 'SKILL.md'), 'cli body\n')
  mkdirSync(join(vault, 'prompts'), { recursive: true })
  writeFileSync(join(vault, 'prompts', 'zglos-blad.md'), '---\ndescription: d\n---\n{{objaw}}\n')
})

afterEach(() => {
  rmSync(vault, { recursive: true, force: true })
})

describe('skill paths', () => {
  it('accepts the three real shapes', () => {
    expect(isSafeSkillRel('brain/x.md')).toBe(true)
    expect(isSafeSkillRel('cli/x/SKILL.md')).toBe(true)
    expect(isSafeSkillRel('cli/cat/x/SKILL.md')).toBe(true)
  })

  it('refuses anything that could write outside the skills root', () => {
    // Each of these arrives from a window on a laptop and names a file on the
    // server. Refused, not normalised — normalising an escape makes it work.
    for (const bad of [
      '../USER.md',
      'brain/../../USER.md',
      'cli/x/../../../etc/passwd',
      '/etc/passwd',
      'brain\\x.md',
      'cli//SKILL.md',
      'sessions/note.md',
      'brain/x.txt',
      'cli/x/README.md',
      'cli/a/b/c/SKILL.md',
      '_backups/x/SKILL.md',
      'cli/_backups/x/SKILL.md',
      '',
    ]) {
      expect(isSafeSkillRel(bad), bad).toBe(false)
    }
  })

  it('refuses the traversal at the read and write door too, not only in the checker', () => {
    expect(readSkill(skills, '../../etc/passwd')).toMatchObject({ error: 'bad-path' })
    expect(writeSkill(skills, '../../etc/passwd', 'x')).toMatchObject({ error: 'bad-path' })
  })
})

describe('skills', () => {
  it('reads both layouts', () => {
    expect(readSkill(skills, 'brain/build-our-way.md')).toMatchObject({ content: 'brain body\n' })
    expect(readSkill(skills, 'cli/cyber/nmap-recon/SKILL.md')).toMatchObject({ content: 'cli body\n' })
  })

  it('says not-found rather than inventing an empty file', () => {
    expect(readSkill(skills, 'brain/nope.md')).toMatchObject({ error: 'not-found' })
  })

  it('writes and reports whether anything changed', () => {
    const first = writeSkill(skills, 'brain/build-our-way.md', 'new body\n')
    expect(first).toMatchObject({ unchanged: false })
    expect(readFileSync(join(skills, 'brain', 'build-our-way.md'), 'utf8')).toBe('new body\n')
    // An identical save must not touch mtime — every replica would refetch it.
    expect(writeSkill(skills, 'brain/build-our-way.md', 'new body\n')).toMatchObject({ unchanged: true })
  })

  it('will not create a skill that does not exist', () => {
    expect(writeSkill(skills, 'brain/invented.md', 'x')).toMatchObject({ error: 'not-found' })
    expect(existsSync(join(skills, 'brain', 'invented.md'))).toBe(false)
  })
})

describe('prompt names', () => {
  it('takes a plain stem and nothing with a path in it', () => {
    expect(isSafePromptName('zglos-blad')).toBe(true)
    expect(isSafePromptName('a_b.c-1')).toBe(true)
    for (const bad of ['../x', 'a/b', '', '.hidden', 'x.md', 'a..b', 'ą-ę']) {
      expect(isSafePromptName(bad), bad).toBe(false)
    }
  })
})

describe('prompts', () => {
  it('lists with the argument signature, not the body', () => {
    const list = listPrompts(vault)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'zglos-blad', description: 'd' })
    expect(list[0].arguments).toEqual([{ name: 'objaw', required: true }])
    expect(JSON.stringify(list)).not.toContain('{{objaw}}')
  })

  it('reads by file stem so the editor can write back what it opened', () => {
    expect(readPrompt(vault, 'zglos-blad')).toMatchObject({ content: expect.stringContaining('{{objaw}}') })
  })

  it('creates a prompt, and says so', () => {
    const r = writePrompt(vault, 'nowy', '---\ndescription: n\n---\nbody\n')
    expect(r).toMatchObject({ created: true, unchanged: false })
    expect(listPrompts(vault).map((p) => p.name)).toEqual(['nowy', 'zglos-blad'])
  })

  it('creates the directory when the library is empty', () => {
    const empty = mkdtempSync(join(tmpdir(), 'pomnia-empty-'))
    try {
      expect(writePrompt(empty, 'first', 'body\n')).toMatchObject({ created: true })
      expect(listPrompts(empty)).toHaveLength(1)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('refuses a name that would escape the prompts directory', () => {
    expect(writePrompt(vault, '../USER', 'x')).toMatchObject({ error: 'bad-path' })
    expect(existsSync(join(vault, 'USER.md'))).toBe(false)
  })
})
