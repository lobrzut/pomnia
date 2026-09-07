import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadPrompts, parsePrompt, renderPrompt } from './prompts.js'

let vault: string

function prompt(file: string, body: string): void {
  writeFileSync(join(vault, 'prompts', file), body)
}

beforeAll(() => {
  vault = mkdtempSync(join(tmpdir(), 'pomnia-prompts-'))
  mkdirSync(join(vault, 'prompts'), { recursive: true })

  prompt(
    'bug-report.md',
    [
      '---',
      'description: Turn loose symptoms into a filed bug',
      'arguments:',
      '  - name: symptom',
      '    description: What you actually saw',
      '    required: true',
      '  - name: repro',
      '---',
      'Saw: {{symptom}}',
      'Steps: {{repro}}',
      '',
    ].join('\n'),
  )
  // No frontmatter block for arguments — the placeholders are the signature.
  prompt('short.md', 'Rewrite {{text}} in the house voice.\n')
  prompt('_draft.md', 'not ready\n')
  prompt('notes.txt', 'not a prompt\n')
})

afterAll(() => {
  rmSync(vault, { recursive: true, force: true })
})

describe('loadPrompts', () => {
  it('reads the library and skips drafts and non-markdown', () => {
    const names = loadPrompts(vault).map((p) => p.name)
    expect(names).toEqual(['bug-report', 'short'])
  })

  it('returns nothing rather than throwing when there is no library yet', () => {
    expect(loadPrompts(join(vault, 'nowhere'))).toEqual([])
    expect(loadPrompts('')).toEqual([])
  })

  it('names a prompt after its file when the frontmatter does not', () => {
    expect(loadPrompts(vault).find((p) => p.name === 'bug-report')?.description).toBe(
      'Turn loose symptoms into a filed bug',
    )
  })
})

describe('argument signatures', () => {
  it('reads a declared block, keeping required as written', () => {
    const p = loadPrompts(vault).find((p) => p.name === 'bug-report')!
    expect(p.arguments).toEqual([
      { name: 'symptom', description: 'What you actually saw', required: true },
      { name: 'repro', required: false },
    ])
  })

  it('infers the signature from placeholders when none is declared', () => {
    const p = loadPrompts(vault).find((p) => p.name === 'short')!
    expect(p.arguments).toEqual([{ name: 'text', required: true }])
  })

  it('adds a placeholder the author forgot to declare', () => {
    // Left undeclared it would render as literal braces in someone's prompt.
    const p = parsePrompt('---\narguments: [a]\n---\n{{a}} and {{b}}\n', 'x.md')
    expect(p.arguments.map((a) => a.name)).toEqual(['a', 'b'])
  })

  it('accepts the inline shorthand', () => {
    const p = parsePrompt('---\narguments: [one, two]\n---\n{{one}} {{two}}\n', 'x.md')
    expect(p.arguments.every((a) => a.required)).toBe(true)
    expect(p.arguments).toHaveLength(2)
  })
})

describe('renderPrompt', () => {
  const load = (name: string) => loadPrompts(vault).find((p) => p.name === name)!

  it('substitutes values', () => {
    const text = renderPrompt(load('bug-report'), { symptom: 'blank screen', repro: 'open app' })
    expect(text).toBe('Saw: blank screen\nSteps: open app\n')
  })

  it('refuses to render without a required argument', () => {
    expect(() => renderPrompt(load('bug-report'), { repro: 'open app' })).toThrow(/symptom/)
  })

  it('leaves an optional placeholder visible rather than blanking it', () => {
    // A silently emptied line reads as a bug in the prompt, not a missing value.
    const text = renderPrompt(load('bug-report'), { symptom: 'blank screen' })
    expect(text).toContain('{{repro}}')
  })

  it('strips the frontmatter from what the client receives', () => {
    expect(renderPrompt(load('short'), { text: 'this' })).toBe('Rewrite this in the house voice.\n')
  })
})
