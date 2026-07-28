// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { runGetSkill, runListCliSkills, runListSkills } from '../src/mcp/tools/skills.js'

describe('MCP list_skills / get_skill', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  function seed(): string {
    root = mkdtempSync(join(tmpdir(), 'pomnia-mcp-skills-'))
    mkdirSync(join(root, 'brain'), { recursive: true })
    mkdirSync(join(root, 'cli', '09-web-security'), { recursive: true })
    writeFileSync(
      join(root, 'brain', 'think-for-me.md'),
      '---\ndescription: Think helper\n---\n# body\n',
    )
    writeFileSync(join(root, 'brain', 'x.md.bak-1'), 'bak')
    writeFileSync(
      join(root, 'cli', '09-web-security', 'SKILL.md'),
      '---\ndescription: Web security\n---\n',
    )
    return root
  }

  it('list_skills scope own|cli|all', () => {
    seed()
    const own = JSON.parse(runListSkills({ scope: 'own' }, { skillsRoot: root }))
    expect(own.skills).toHaveLength(1)
    expect(own.skills[0].name).toBe('think-for-me')

    const cli = JSON.parse(runListSkills({ scope: 'cli' }, { skillsRoot: root }))
    expect(cli.skills).toHaveLength(1)
    expect(cli.skills[0].name).toBe('09-web-security')

    const all = JSON.parse(runListSkills({ scope: 'all' }, { skillsRoot: root }))
    expect(all.skills).toHaveLength(2)

    const def = JSON.parse(runListSkills({}, { skillsRoot: root }))
    expect(def.skills).toHaveLength(2)
  })

  it('list_cli_skills remains an alias', () => {
    seed()
    const a = JSON.parse(runListCliSkills({}, { skillsRoot: root }))
    const b = JSON.parse(runListSkills({ scope: 'cli' }, { skillsRoot: root }))
    expect(a.skills).toEqual(b.skills)
  })

  it('get_skill think-for-me', () => {
    seed()
    const r = JSON.parse(runGetSkill({ name: 'think-for-me' }, { skillsRoot: root }))
    expect(r.error).toBeUndefined()
    expect(r.kind).toBe('brain')
    expect(r.content).toContain('Think helper')
  })
})
