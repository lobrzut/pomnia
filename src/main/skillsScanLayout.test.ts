import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { countSkillsSplitAt, listLocalSkillsAt } from './skillsScan.js'

/**
 * The full app's scanner had the same blind spot as brain-core's: it read
 * `cli/<name>/SKILL.md` and nothing deeper. After 1244 packages were sorted
 * into eight category folders that meant the Skills page and the dashboard
 * count both reported zero imported skills while the directory was full of
 * them.
 */

let root: string

function pack(rel: string, description: string): void {
  const dir = join(root, rel)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\ndescription: ${description}\n---\n\nbody\n`)
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pomnia-scan-'))
  mkdirSync(join(root, 'brain'), { recursive: true })
  writeFileSync(join(root, 'brain', 'build-our-way.md'), '---\ndescription: How we build\n---\nbody\n')

  pack('cli/flat-one', 'never moved')
  pack('cli/cyber/nmap-recon', 'scan politely')
  pack('cli/cyber/burp-basics', 'intercept and replay')

  // A full copy of the categories, which is what the vault actually holds.
  pack('cli/_backup-cli-before-categorize/cyber/nmap-recon', 'a backup copy')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('listLocalSkillsAt', () => {
  it('finds packages at both depths', () => {
    const names = listLocalSkillsAt(root)
      .filter((s) => s.kind === 'imported')
      .map((s) => s.name)
      .sort()
    expect(names).toEqual(['burp-basics', 'flat-one', 'nmap-recon'])
  })

  it('records the category, so the UI can group and the path is reconstructable', () => {
    const nmap = listLocalSkillsAt(root).find((s) => s.name === 'nmap-recon')
    expect(nmap?.category).toBe('cyber')
    expect(nmap?.path).toContain(join('cli', 'cyber', 'nmap-recon', 'SKILL.md'))
    expect(listLocalSkillsAt(root).find((s) => s.name === 'flat-one')?.category).toBeUndefined()
  })

  it('does not walk into the backup copy', () => {
    // Counting each package twice would be worse than missing them.
    expect(listLocalSkillsAt(root).filter((s) => s.name === 'nmap-recon')).toHaveLength(1)
  })

  it('still lists own skills first', () => {
    expect(listLocalSkillsAt(root)[0].kind).toBe('own')
  })

  it('counts what it lists', () => {
    expect(countSkillsSplitAt(root)).toEqual({ own: 1, imported: 3, total: 4 })
  })

  it('answers with nothing for a root that does not exist', () => {
    expect(listLocalSkillsAt(join(root, 'nowhere'))).toEqual([])
  })
})
