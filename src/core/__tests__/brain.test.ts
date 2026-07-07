import { describe, expect, it } from 'vitest'
import { assembleNote, isWorthDistilling, sanitizeUnicode, transcript } from '../brain/distill.js'
import { chunkText, cosine } from '../brain/localIndex.js'
import type { Conversation } from '../model.js'

describe('brain/distill', () => {
  it('strips lone surrogates but keeps valid emoji pairs', () => {
    expect(sanitizeUnicode('ok\uD800end')).toBe('okend') // lone high surrogate removed
    expect(sanitizeUnicode('🔐 vault')).toBe('🔐 vault') // valid pair preserved
  })

  it('truncates long transcripts head+tail', () => {
    const conv: Conversation = {
      id: 'x',
      source: 'claude-code',
      title: 't',
      messages: Array.from({ length: 200 }, (_, i) => ({ role: 'user' as const, text: `line ${i} ` + 'x'.repeat(200) }))
    }
    const { text, truncated } = transcript(conv, 2000)
    expect(truncated).toBe(true)
    expect(text).toContain('[truncated]')
    expect(text.length).toBeLessThan(2200)
  })

  it('marks empty distillation as stub, keeps brain-compatible frontmatter', () => {
    const conv: Conversation = { id: 'abc12345', source: 'cursor', title: 'Demo', messages: [{ role: 'user', text: 'hi' }] }
    const stub = assembleNote(conv, { summary: '', decisions: [], solutions: [], facts: [], openQuestions: [] }, 'qwen2.5:14b')
    expect(stub.quality).toBe('stub')
    expect(stub.markdown).toContain('distilled_via: pomnia')

    const ok = assembleNote(conv, { summary: 'did a thing', decisions: ['chose X'], solutions: [], facts: [], openQuestions: [] }, 'qwen2.5:14b')
    expect(ok.quality).toBe('ok')
    expect(ok.markdown).toContain('## Decisions')
    expect(ok.markdown).toContain('- chose X')
  })

  it('tags generic-filler bullets as garbage, not ok', () => {
    const conv: Conversation = { id: 'def67890', source: 'cursor', title: 'Demo', messages: [{ role: 'user', text: 'hi' }] }
    const filler = assembleNote(
      conv,
      {
        summary: 'we talked about stuff',
        decisions: ['decided to continue working on the project'],
        solutions: [],
        facts: ['discussed the topic'],
        openQuestions: ['continued']
      },
      'qwen2.5:3b'
    )
    expect(filler.quality).toBe('garbage')
    expect(filler.score).toBeLessThan(4)
    expect(filler.markdown).toContain('quality: garbage')

    // A real, specific note with file paths/commands/numbers should score well above it.
    const specific = assembleNote(
      conv,
      {
        summary: 'fixed the auth bug',
        decisions: ['use scrypt N=2^17 in src/core/crypto.ts'],
        solutions: ['ran `npm test` and `git commit -m fix-auth`, all 14 tests passed'],
        facts: [],
        openQuestions: []
      },
      'qwen2.5:14b'
    )
    expect(specific.quality).toBe('ok')
    expect(specific.score).toBeGreaterThan(filler.score)
  })

  it('pre-filters trivial conversations before they ever reach the LLM', () => {
    const trivial: Conversation = {
      id: 'g1', source: 'cursor', title: 'hi',
      messages: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello! how can I help?' }]
    }
    expect(isWorthDistilling(trivial)).toBe(false)

    const substantial: Conversation = {
      id: 'g2', source: 'cursor', title: 'debug session',
      messages: Array.from({ length: 6 }, (_, i) => ({
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        text: 'a real exchange about debugging the auth flow '.repeat(3)
      }))
    }
    expect(isWorthDistilling(substantial)).toBe(true)
  })
})

describe('brain/localIndex', () => {
  it('cosine is 1 for identical, ~0 for orthogonal', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6)
  })

  it('chunks text on paragraph boundaries', () => {
    const text = Array.from({ length: 10 }, (_, i) => `para ${i} ` + 'word '.repeat(80)).join('\n\n')
    const chunks = chunkText(text, 800, 100)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.length > 0)).toBe(true)
  })
})
