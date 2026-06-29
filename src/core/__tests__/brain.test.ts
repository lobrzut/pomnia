import { describe, expect, it } from 'vitest'
import { assembleNote, sanitizeUnicode, transcript } from '../brain/distill.js'
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
    expect(stub.markdown).toContain('distilled_via: reliqua')

    const ok = assembleNote(conv, { summary: 'did a thing', decisions: ['chose X'], solutions: [], facts: [], openQuestions: [] }, 'qwen2.5:14b')
    expect(ok.quality).toBe('ok')
    expect(ok.markdown).toContain('## Decisions')
    expect(ok.markdown).toContain('- chose X')
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
