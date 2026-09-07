import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runGetPrompt, runListPrompts } from './promptTools.js'

/**
 * The gap these close: MCP serves prompts to the *client*, and an agent has no
 * way to open that door. "Use my bug-report prompt" was a sentence the user
 * could say and nothing could act on.
 */

let vault: string
const deps = () => ({ vaultRoot: vault })

beforeAll(() => {
  vault = mkdtempSync(join(tmpdir(), 'pomnia-prompt-tools-'))
  mkdirSync(join(vault, 'prompts'), { recursive: true })
  writeFileSync(
    join(vault, 'prompts', 'zglos-blad.md'),
    [
      '---',
      'description: Turn symptoms into a filed bug',
      'arguments:',
      '  - name: objaw',
      '    required: true',
      '  - name: kiedy',
      '---',
      'Objaw: {{objaw}}',
      'Kiedy: {{kiedy}}',
      '',
    ].join('\n'),
  )
})

afterAll(() => {
  rmSync(vault, { recursive: true, force: true })
})

describe('list_prompts', () => {
  it('lists names, descriptions and signatures without the bodies', () => {
    const r = JSON.parse(runListPrompts({}, deps()))
    expect(r.prompts).toHaveLength(1)
    expect(r.prompts[0]).toMatchObject({ name: 'zglos-blad', description: 'Turn symptoms into a filed bug' })
    expect(JSON.stringify(r)).not.toContain('Objaw:')
  })

  it('explains an empty library instead of returning a bare empty list', () => {
    const empty = mkdtempSync(join(tmpdir(), 'pomnia-empty-prompts-'))
    try {
      const r = JSON.parse(runListPrompts({}, { vaultRoot: empty }))
      expect(r.prompts).toEqual([])
      expect(r.hint).toContain('vault/prompts')
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

describe('get_prompt', () => {
  it('fills in the arguments it was given', () => {
    const r = JSON.parse(
      runGetPrompt({ name: 'zglos-blad', arguments: { objaw: 'pusty ekran', kiedy: 'od wczoraj' } }, deps()),
    )
    expect(r.text).toBe('Objaw: pusty ekran\nKiedy: od wczoraj\n')
    expect(r.missing).toEqual([])
  })

  it('renders anyway when a required argument is absent, and names it', () => {
    // Refusing would leave an agent that is holding the conversation the value
    // is in with nothing to do but guess. Naming the gap lets it ask.
    const r = JSON.parse(runGetPrompt({ name: 'zglos-blad' }, deps()))
    expect(r.missing).toEqual(['objaw'])
    expect(r.text).toContain('{{objaw}}')
  })

  it('reports an unknown name and says where names come from', () => {
    const r = JSON.parse(runGetPrompt({ name: 'nie-ma-takiego' }, deps()))
    expect(r.error).toContain('not found')
    expect(r.hint).toContain('list_prompts')
  })

  it('refuses a call with no name at all', () => {
    expect(() => runGetPrompt({}, deps())).toThrow(/requires name/)
  })

  it('carries the signature back, so the caller can see what is optional', () => {
    const r = JSON.parse(runGetPrompt({ name: 'zglos-blad' }, deps()))
    expect(r.arguments).toEqual([
      { name: 'objaw', required: true },
      { name: 'kiedy', required: false },
    ])
  })
})
