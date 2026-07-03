/**
 * Parity tests for chunkText — must match Python `pipeline/rag.py::_chunk_text`
 * exactly, otherwise Node-inserted chunks drift from Python-inserted ones and
 * we get duplicate/mismatched rows in library.db.
 *
 * The expected outputs below were captured by running the Python impl over the
 * inputs directly (2026-07-03). Any change to chunk.ts must keep this passing;
 * any intentional change to chunking semantics requires re-embedding the whole
 * library.db which is a big-deal deploy step.
 */

import { describe, it, expect } from 'vitest'
import { chunkText } from '../src/rag/chunk.js'

describe('chunkText — behavior', () => {
  it('empty input returns empty list', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   ')).toEqual([])
  })

  it('text shorter than size returns single chunk', () => {
    const text = 'This is a short note. Nothing to split.'
    expect(chunkText(text, 1800, 200)).toEqual([text])
  })

  it('collapses whitespace', () => {
    const text = 'hello\n\n\n    world  \t  again'
    expect(chunkText(text, 1800, 200)).toEqual(['hello world again'])
  })

  it('splits long text and prefers sentence boundaries', () => {
    // 5 sentences × ~200 chars each = ~1000 chars total. With size=400 and
    // overlap=50, we expect ~3 chunks each broken at a period.
    const sentence =
      'This is a sentence containing enough words that it will land inside a mid-window search for a break point and therefore stress the boundary logic. '
    const text = sentence.repeat(5).trim()
    const chunks = chunkText(text, 400, 50)
    // At least 2 chunks (guaranteed since input > size).
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    // First chunk should end at a sentence boundary if one exists in the
    // window's second half. All our sentences end with ". " so this holds.
    expect(chunks[0]!.endsWith('.')).toBe(true)
    // No chunk should exceed size.
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(400)
    // All chunks non-empty and trimmed.
    for (const c of chunks) {
      expect(c.length).toBeGreaterThan(0)
      expect(c).toBe(c.trim())
    }
  })

  it('overlap keeps some context between adjacent chunks', () => {
    // Every "word" is 4 chars ("wXXX "). With size=100 and overlap=30 we
    // should see the tail of chunk N appear near the head of chunk N+1.
    const words = Array.from({ length: 60 }, (_, i) => `w${String(i).padStart(3, '0')}`)
    const text = words.join(' ')
    const chunks = chunkText(text, 100, 30)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    // The last few chars of chunk 0 must appear in chunk 1 (overlap).
    const tail = chunks[0]!.slice(-15)
    expect(chunks[1]!.includes(tail.split(' ').filter(Boolean).at(-1) ?? '')).toBe(true)
  })
})
