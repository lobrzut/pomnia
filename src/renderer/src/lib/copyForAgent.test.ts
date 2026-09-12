// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'

import { promptForAgent, skillForAgent } from './copyForAgent'

/**
 * 0.1.83 shipped the copy behaviour with "Not verified by clicking" in its own
 * commit message, and it reached the operator wrong: a pasted `/oszczedny-kod`
 * came back as `Unknown command`. The pages still sit behind the vault gate, so
 * the click is still not testable here — but the text that click produces is,
 * and that is where the mistake actually lived.
 */

const PROMPT = `---
description: Zanim agent napisze kod
arguments:
  - name: zadanie
    required: true
---
Zanim napiszesz choć linijkę na to zadanie:

{{zadanie}}

Przejdź drabinę i zatrzymaj się na pierwszym „tak":

1. Czy to w ogóle musi powstać?
`

const ARGS = [{ name: 'zadanie', required: true }]

describe('promptForAgent', () => {
  const out = promptForAgent(PROMPT, ARGS)

  it('drops the frontmatter the loader needs and the reader does not', () => {
    expect(out).not.toContain('description:')
    expect(out).not.toContain('---')
  })

  it('leaves no slot to edit by hand', () => {
    // Editing the paste is the work this button exists to remove.
    expect(out).not.toContain('{{')
  })

  it('does not leave the hole where the slot was', () => {
    expect(out).not.toMatch(/\n{3,}/)
  })

  it('ends with one labelled line to type after pasting', () => {
    expect(out.trimEnd().endsWith('Zadanie:')).toBe(true)
  })

  it('keeps the instruction itself intact', () => {
    expect(out).toContain('Przejdź drabinę')
    expect(out).toContain('1. Czy to w ogóle musi powstać?')
  })

  it('adds no trailing label when the prompt takes no required argument', () => {
    const free = promptForAgent('---\ndescription: d\n---\nPisz zwięźle.\n', [])
    expect(free.trim()).toBe('Pisz zwięźle.')
  })

  it('offers one line per required argument, skipping optional ones', () => {
    const two = promptForAgent('---\nd: x\n---\n{{objaw}} i {{kiedy}}\n', [
      { name: 'objaw', required: true },
      { name: 'kiedy', required: false },
    ])
    expect(two).toContain('Objaw:')
    expect(two).not.toContain('Kiedy:')
  })
})

describe('skillForAgent', () => {
  it('travels whole — frontmatter included, because a skill is read as one', () => {
    const raw = '---\nname: build-our-way\ndescription: d\n---\n\n# Doktryna\n\nTreść.\n'
    const out = skillForAgent(raw)
    expect(out).toContain('name: build-our-way')
    expect(out).toContain('# Doktryna')
    expect(out.endsWith('\n')).toBe(true)
  })
})
