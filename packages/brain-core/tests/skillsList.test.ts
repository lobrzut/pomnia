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
    mkdirSync(join(root, 'cli', 'cyber', 'nmap-recon'), { recursive: true })
    writeFileSync(
      join(root, 'brain', 'think-for-me.md'),
      '---\ndescription: Think helper\n---\n# body\n',
    )
    writeFileSync(join(root, 'brain', 'x.md.bak-1'), 'bak')
    writeFileSync(
      join(root, 'cli', '09-web-security', 'SKILL.md'),
      '---\ndescription: Web security\n---\n',
    )
    writeFileSync(
      join(root, 'cli', 'cyber', 'nmap-recon', 'SKILL.md'),
      '---\ndescription: Scan politely\n---\n',
    )
    return root
  }

  it('summarises rather than enumerating', () => {
    seed()
    // The catalogue is 1259 entries on the real vault and serialises to 388 kB.
    // Returning it whole cost the caller most of its context window, so the
    // default answer is counts plus the user's own skills.
    const own = JSON.parse(runListSkills({ scope: 'own' }, { skillsRoot: root }))
    expect(own.own.skills).toHaveLength(1)
    expect(own.own.skills[0].name).toBe('think-for-me')
    expect(own.cli).toBeUndefined()

    const cli = JSON.parse(runListSkills({ scope: 'cli' }, { skillsRoot: root }))
    expect(cli.cli.count).toBe(2)
    expect(cli.own).toBeUndefined()
    expect(JSON.stringify(cli)).not.toContain('nmap-recon')

    const all = JSON.parse(runListSkills({}, { skillsRoot: root }))
    expect(all.own.count).toBe(1)
    expect(all.cli.count).toBe(2)
    expect(all.cli.categories).toEqual([
      { category: '(uncategorised)', count: 1 },
      { category: 'cyber', count: 1 },
    ])
  })

  it('returns the skills themselves once narrowed', () => {
    seed()
    const cyber = JSON.parse(runListSkills({ category: 'cyber' }, { skillsRoot: root }))
    expect(cyber.total).toBe(1)
    expect(cyber.skills[0]).toMatchObject({ name: 'nmap-recon', category: 'cyber' })

    const q = JSON.parse(runListSkills({ query: 'politely' }, { skillsRoot: root }))
    expect(q.skills.map((s: { name: string }) => s.name)).toEqual(['nmap-recon'])
  })

  it('list_cli_skills remains an alias', () => {
    seed()
    const a = JSON.parse(runListCliSkills({}, { skillsRoot: root }))
    const b = JSON.parse(runListSkills({ scope: 'cli' }, { skillsRoot: root }))
    // Compare the counts explicitly. Comparing `a.skills` to `b.skills` would
    // now be two undefineds agreeing with each other, which is how a test keeps
    // passing after the thing it guards has gone.
    expect(a.cli.count).toBe(2)
    expect(a.cli).toEqual(b.cli)
  })

  it('get_skill think-for-me', () => {
    seed()
    const r = JSON.parse(runGetSkill({ name: 'think-for-me' }, { skillsRoot: root }))
    expect(r.error).toBeUndefined()
    expect(r.kind).toBe('brain')
    expect(r.content).toContain('Think helper')
  })

  it('get_skill reaches a skill inside a category', () => {
    seed()
    const r = JSON.parse(runGetSkill({ name: 'nmap-recon' }, { skillsRoot: root }))
    expect(r.category).toBe('cyber')
    expect(r.content).toContain('Scan politely')
  })
})
