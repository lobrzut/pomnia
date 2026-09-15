// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * The impure half of book → skill: what happens when the model is not there.
 *
 * The pure shaping module was well covered and the part that touches the world
 * was not, which is why a total distillation failure could return `ok: true`
 * with no warnings for as long as it did. These tests pin the counter rule:
 * nothing back at all is an error, partial is a warning, and a working model
 * is neither.
 *
 * Ollama is mocked rather than reached — the point is the decision this module
 * makes about the answers, not Ollama itself.
 *
 * One harness detail, learned the hard way: the mock's behaviour is swapped
 * through a variable and the spy is never `mockReset()`. A reset drops the
 * rejected promises the spy recorded, and dropping them unhandled makes vitest
 * fail whichever test happens to be running — reported as `Error: fetch
 * failed` against code that caught every one of those rejections. Measured:
 * the same scenario passes when the reset is gone.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Swapped per test; the spy itself keeps one implementation for its whole life. */
let answer: (call: number) => Promise<string> = async () => 'nieustawione'
let calls = 0

const generate = vi.fn(async () => answer(++calls))

vi.mock('@core/brain/ollama.js', () => ({
  Ollama: class {
    generate = generate
  },
  defaultOllamaConfig: () => ({ baseUrl: 'http://mock-ollama:11434' }),
}))

const { composeBookSkill } = await import('./bookSkillBuild.js')

/** Three headings, each long enough that the splitter keeps it as its own chapter. */
const BOOK = ['Wstep', 'Fundamenty', 'Praktyka']
  .map((t) => `# ${t}\n\n${`Tresc rozdzialu ${t} opisana wystarczajaco szeroko. `.repeat(20)}`)
  .join('\n\n')

function bookOnDisk(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'booktest-')), 'ksiazka.md')
  writeFileSync(file, BOOK, 'utf8')
  return file
}

const DEAD = async (): Promise<string> => {
  throw new Error('fetch failed')
}

beforeEach(() => {
  calls = 0
})

describe('composeBookSkill — when the model does not answer', () => {
  it('refuses rather than shipping a table of contents as a skill', async () => {
    answer = DEAD

    const r = await composeBookSkill({ filePath: bookOnDisk(), category: 'test' })

    expect(r.ok).toBe(false)
    if (r.ok) return
    // The message has to name the address, or the person cannot act on it.
    expect(r.error).toContain('http://mock-ollama:11434')
    expect(r.error).toMatch(/destylacja nie zwróciła niczego/)
    // Three chapters split, seven calls attempted: the work happened, the
    // model did not answer. Nothing is written.
    expect(calls).toBe(7)
  })

  it('names the endpoint the caller configured, not the default', async () => {
    answer = DEAD

    const r = await composeBookSkill({
      filePath: bookOnDisk(),
      ollamaUrl: 'http://192.168.1.201:11434',
    })

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain('http://192.168.1.201:11434')
  })
})

describe('composeBookSkill — when the model answers', () => {
  it('ships the distilled sections and warns about nothing', async () => {
    answer = async () => 'Prawdziwa odpowiedz modelu, wystarczajaco dluga zeby przejsc prog.'

    const r = await composeBookSkill({ filePath: bookOnDisk(), category: 'test' })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    const names = r.files.map((f) => f.path)
    expect(names).toContain('glossary.md')
    expect(names).toContain('patterns.md')
    expect(names).toContain('cheatsheet.md')
    expect(r.files.find((f) => f.path === 'SKILL.md')!.content).toContain('## Modele myślowe')
    expect(r.warnings).toEqual([])
  })

  it('still ships when only part came back, and says which part', async () => {
    // Chapter summaries run first, then the four whole-book sections. Failing
    // the summaries alone is the partial case: usable, but not silently so.
    answer = async (call) => {
      if (call <= 3) throw new Error('timeout')
      return 'Sekcja ktora wrocila i jest wystarczajaco dluga zeby sie liczyc.'
    }

    const r = await composeBookSkill({ filePath: bookOnDisk(), category: 'test' })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.warnings.join(' ')).toMatch(/streszczenia rozdziałów: 0 z 3/)
  })
})
