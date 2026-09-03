import { describe, expect, it } from 'vitest'

import { isSafeSkillPath, skillFromPath, skillsFromManifest } from './remoteSkills.js'

describe('skillFromPath', () => {
  it('names a workflow skill by its file', () => {
    expect(skillFromPath('skills/brain/bug-recon.md', 1767)).toEqual({
      path: 'skills/brain/bug-recon.md',
      kind: 'brain',
      name: 'bug-recon',
      size: 1767,
      sha256: undefined,
    })
  })

  it('names a CLI skill by its directory, not by SKILL.md', () => {
    // Every one of them is called SKILL.md; the directory is the name.
    const s = skillFromPath('skills/cli/think-for-me/SKILL.md', 4200)
    expect(s?.kind).toBe('cli')
    expect(s?.name).toBe('think-for-me')
  })

  it('keeps anything else under skills/ rather than hiding it', () => {
    // A list that silently omits files disagrees with the directory it claims
    // to show, and the person is the one who put them there.
    const s = skillFromPath('skills/index.json', 900)
    expect(s?.kind).toBe('other')
    expect(s?.name).toBe('index.json')
  })

  it('ignores paths outside skills/', () => {
    expect(skillFromPath('distilled/note.md')).toBeNull()
    expect(skillFromPath('sessions/x.md')).toBeNull()
  })
})

describe('skillsFromManifest', () => {
  const manifest = [
    { path: 'distilled/2026-09-01_note.md', size: 10 },
    { path: 'skills/cli/build-our-way/SKILL.md', size: 20 },
    { path: 'skills/brain/zebra.md', size: 30 },
    { path: 'skills/brain/alpha.md', size: 40 },
    { path: 'skills/index.json', size: 50 },
  ]

  it('takes only the skills', () => {
    expect(skillsFromManifest(manifest).map((s) => s.name)).toEqual([
      'alpha',
      'zebra',
      'build-our-way',
      'index.json',
    ])
  })

  it('groups by kind, then sorts by name', () => {
    // 772 files in one flat alphabetical run is a wall, not a list.
    const kinds = skillsFromManifest(manifest).map((s) => s.kind)
    expect(kinds).toEqual(['brain', 'brain', 'cli', 'other'])
  })

  it('survives a manifest that is not a list, or holds rubbish', () => {
    expect(skillsFromManifest(null)).toEqual([])
    expect(skillsFromManifest('nope')).toEqual([])
    expect(skillsFromManifest([null, 42, {}, { path: 5 }])).toEqual([])
  })

  it('defaults a missing size to zero rather than printing undefined', () => {
    expect(skillsFromManifest([{ path: 'skills/brain/x.md' }])[0].size).toBe(0)
  })
})

describe('isSafeSkillPath', () => {
  it('accepts a path inside skills/', () => {
    expect(isSafeSkillPath('skills/brain/x.md')).toBe(true)
    expect(isSafeSkillPath('skills/cli/y/SKILL.md')).toBe(true)
  })

  it('refuses anything that climbs out', () => {
    // This value decides what gets overwritten on someone else's machine.
    expect(isSafeSkillPath('skills/../distilled/note.md')).toBe(false)
    expect(isSafeSkillPath('skills/./x.md')).toBe(false)
    expect(isSafeSkillPath('../skills/x.md')).toBe(false)
  })

  it('refuses paths outside skills/ and backslash paths', () => {
    expect(isSafeSkillPath('distilled/note.md')).toBe(false)
    expect(isSafeSkillPath('skills\\brain\\x.md')).toBe(false)
    expect(isSafeSkillPath('')).toBe(false)
  })

  it('refuses an empty segment, which resolves to the directory itself', () => {
    expect(isSafeSkillPath('skills//x.md')).toBe(false)
    expect(isSafeSkillPath('skills/')).toBe(false)
  })
})
