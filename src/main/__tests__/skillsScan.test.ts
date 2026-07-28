// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { mkdirSync, writeFileSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanupSkillsJunkAt,
  countSkillsSplitAt,
  listLocalSkillsAt,
  writeSkillsIndexAt,
} from '../skillsScan.js'

describe('skillsScan', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  function seed(): string {
    root = mkdtempSync(join(tmpdir(), 'pomnia-skills-'))
    mkdirSync(join(root, 'brain'), { recursive: true })
    mkdirSync(join(root, 'cli', 'mentor-suntzu'), { recursive: true })
    mkdirSync(join(root, 'cli', 'empty'), { recursive: true })
    writeFileSync(
      join(root, 'brain', 'think-for-me.md'),
      '---\ndescription: Decision helper\n---\n# Think\n',
    )
    writeFileSync(join(root, 'brain', 'think-for-me.md.bak-20260721'), '# bak')
    writeFileSync(join(root, 'brain', '.hidden.md'), '# no')
    writeFileSync(join(root, 'cli', 'mentor-suntzu', 'SKILL.md'), '---\ndescription: Sun Tzu\n---\n')
    writeFileSync(join(root, 'cli', 'empty', 'README.md'), 'no')
    mkdirSync(join(root, 'cli', 'mentor-suntzu', '__pycache__'), { recursive: true })
    writeFileSync(join(root, 'cli', 'mentor-suntzu', '__pycache__', 'x.pyc'), 'x')
    return root
  }

  it('splits own vs imported and skips bak/dotfiles/empty packs', () => {
    seed()
    const split = countSkillsSplitAt(root)
    expect(split).toEqual({ own: 1, imported: 1, total: 2 })
    const list = listLocalSkillsAt(root)
    expect(list.map((s) => s.name).sort()).toEqual(['mentor-suntzu', 'think-for-me'])
    expect(list.find((s) => s.name === 'think-for-me')?.description).toContain('Decision')
  })

  it('writes truthful index.json and cleans bak/pycache', () => {
    seed()
    writeSkillsIndexAt(root)
    const index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')) as Array<{ name: string }>
    expect(index.map((e) => e.name).sort()).toEqual(['mentor-suntzu', 'think-for-me'])

    const cleaned = cleanupSkillsJunkAt(root)
    expect(cleaned.movedBak).toBe(1)
    expect(cleaned.removedPycache).toBeGreaterThanOrEqual(1)
    expect(existsSync(join(root, 'brain', 'think-for-me.md.bak-20260721'))).toBe(false)
    expect(existsSync(join(root, '_backups', 'think-for-me.md.bak-20260721'))).toBe(true)
    expect(existsSync(join(root, 'cli', 'mentor-suntzu', '__pycache__'))).toBe(false)
    expect(existsSync(join(root, 'brain', 'think-for-me.md'))).toBe(true)
  })
})
