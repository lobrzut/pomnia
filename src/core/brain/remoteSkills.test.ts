import { describe, expect, it } from 'vitest'

import {
  isSafePromptName,
  isSafeSkillRel,
  promptsFromResponse,
  rowsFromResponse,
  skillPath,
  summaryFromResponse,
} from './remoteSkills.js'

/**
 * These shapes come off the wire from a server that may be older, newer, or
 * having a bad day. Everything here is about answering with *something* the
 * window can draw, rather than throwing inside a render.
 */

describe('isSafeSkillRel', () => {
  it('accepts the three real shapes', () => {
    expect(isSafeSkillRel('brain/build-our-way.md')).toBe(true)
    expect(isSafeSkillRel('cli/think-for-me/SKILL.md')).toBe(true)
    expect(isSafeSkillRel('cli/cyber-mukul/nmap-recon/SKILL.md')).toBe(true)
  })

  it('refuses anything that leaves the skills root', () => {
    for (const bad of [
      '../USER.md',
      'brain/../../USER.md',
      '/etc/passwd',
      'brain\\x.md',
      'sessions/note.md',
      'cli/x/README.md',
      'cli/a/b/c/SKILL.md',
      'cli/_backups/x/SKILL.md',
      '',
    ]) {
      expect(isSafeSkillRel(bad), bad).toBe(false)
    }
  })
})

describe('isSafePromptName', () => {
  it('takes a plain stem and refuses a path', () => {
    expect(isSafePromptName('zglos-blad')).toBe(true)
    for (const bad of ['../x', 'a/b', '', '.hidden', 'x.md']) {
      expect(isSafePromptName(bad), bad).toBe(false)
    }
  })
})

describe('skillPath', () => {
  it('names the file for each kind', () => {
    expect(skillPath({ kind: 'own', name: 'x' })).toBe('brain/x.md')
    expect(skillPath({ kind: 'cli', name: 'x' })).toBe('cli/x/SKILL.md')
    expect(skillPath({ kind: 'cli', name: 'x', category: 'c' })).toBe('cli/c/x/SKILL.md')
  })
})

describe('summaryFromResponse', () => {
  it('reads own skills and category counts', () => {
    const s = summaryFromResponse({
      own: { count: 2, skills: [{ name: 'b', description: 'B' }, { name: 'a' }] },
      cli: { count: 1244, categories: [{ category: 'cyber-mukul', count: 817 }] },
    })
    expect(s.own.map((r) => r.name)).toEqual(['a', 'b'])
    expect(s.own[1].path).toBe('brain/b.md')
    expect(s.cliCount).toBe(1244)
    expect(s.categories).toEqual([{ category: 'cyber-mukul', count: 817 }])
  })

  it('survives a server that answers with nothing useful', () => {
    // Anything but a crash: an empty list is a screen the user can act on.
    for (const junk of [null, undefined, {}, { own: {} }, { cli: {} }]) {
      const s = summaryFromResponse(junk)
      expect(s.own).toEqual([])
      expect(s.categories).toEqual([])
      expect(s.cliCount).toBe(0)
    }
  })
})

describe('rowsFromResponse', () => {
  it('gives every row the path its editor will write back to', () => {
    const r = rowsFromResponse({
      total: 2,
      nextOffset: 100,
      skills: [
        { kind: 'cli', name: 'nmap-recon', category: 'cyber-mukul', description: 'd' },
        { kind: 'own', name: 'build-our-way' },
      ],
    })
    expect(r.rows[0].path).toBe('cli/cyber-mukul/nmap-recon/SKILL.md')
    expect(r.rows[1].path).toBe('brain/build-our-way.md')
    expect(r.nextOffset).toBe(100)
  })

  it('falls back to the row count when the server omits a total', () => {
    expect(rowsFromResponse({ skills: [{ kind: 'cli', name: 'x' }] }).total).toBe(1)
  })

  it('drops a row with no usable name rather than rendering a blank one', () => {
    expect(rowsFromResponse({ skills: [{ kind: 'cli' }, { kind: 'cli', name: 'x' }] }).rows).toHaveLength(1)
  })
})

describe('promptsFromResponse', () => {
  it('keeps the argument signature and sorts by name', () => {
    const p = promptsFromResponse({
      prompts: [
        { name: 'zglos-blad', arguments: [{ name: 'objaw', required: true }], size: 480 },
        { name: 'audyt', description: 'A', arguments: [] },
      ],
    })
    expect(p.map((x) => x.name)).toEqual(['audyt', 'zglos-blad'])
    expect(p[1].arguments).toEqual([{ name: 'objaw', description: undefined, required: true }])
  })

  it('treats a missing required flag as optional rather than guessing', () => {
    const p = promptsFromResponse({ prompts: [{ name: 'x', arguments: [{ name: 'a' }] }] })
    expect(p[0].arguments[0].required).toBe(false)
  })

  it('survives junk', () => {
    expect(promptsFromResponse(null)).toEqual([])
    expect(promptsFromResponse({ prompts: [{}, 'x'] })).toEqual([])
  })
})
