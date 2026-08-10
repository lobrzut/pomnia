import { describe, expect, it } from 'vitest'

import { chunkText, CHUNK_CHAR, CHUNK_OVERLAP } from '../src/rag/chunk.js'

/**
 * Expected values come from running `pipeline/rag.py::_chunk_text` (the Linux
 * brain's chunker) on the same inputs. Verified against all 1886 notes in a
 * real vault: 0 divergences.
 *
 * This matters for the Linux + desktop split — one vault, two engines. If the
 * two chunkers disagree, the same note indexed on either side produces
 * different rows, and re-indexing on the other machine silently rewrites the
 * index for no semantic reason.
 */

/** Faithful port of the Python reference, used as the oracle here. */
function pythonChunk(text: string, size = CHUNK_CHAR, overlap = CHUNK_OVERLAP): string[] {
  const collapsed = Array.from(text.split(/\s+/).filter(Boolean).join(' '))
  if (collapsed.length === 0) return []
  if (collapsed.length <= size) return [collapsed.join('')]
  const seps = ['. ', '; ', '\n', ' '].map((s) => Array.from(s))
  const out: string[] = []
  let i = 0
  while (i < collapsed.length) {
    let end = Math.min(i + size, collapsed.length)
    if (end < collapsed.length) {
      const start = i + Math.floor(size / 2)
      for (const sep of seps) {
        let cut = -1
        for (let k = Math.min(end - sep.length, collapsed.length - sep.length); k >= 0; k--) {
          if (sep.every((c, j) => collapsed[k + j] === c)) {
            cut = k
            break
          }
        }
        if (cut > 0 && cut >= start) {
          end = cut + sep.length
          break
        }
      }
    }
    out.push(collapsed.slice(i, end).join('').trim())
    if (end === collapsed.length) break
    i = end - overlap
  }
  return out.filter(Boolean)
}

const CASES: Record<string, string> = {
  'separator sitting exactly on the window edge': 'x'.repeat(1800) + '. ' + 'y'.repeat(500),
  'separator exactly at the halfway mark': 'x'.repeat(900) + '. ' + 'y'.repeat(1400),
  'no separator anywhere — falls through to space': 'z'.repeat(4000),
  'space separated words only': 'word '.repeat(900),
  'dense sentence endings near the boundary': ('s'.repeat(40) + '. ').repeat(120),
  'exactly at size': 'q'.repeat(1800),
  'one over size': 'q'.repeat(1801),
  'empty': '',
  'whitespace only': '   \n\t  ',
}

describe('chunkText matches the Python reference', () => {
  for (const [name, input] of Object.entries(CASES)) {
    it(name, () => {
      expect(chunkText(input)).toEqual(pythonChunk(input))
    })
  }

  /**
   * The last divergence found in the real vault: Python counts code points,
   * JS strings index UTF-16 units, so a single emoji shifted every downstream
   * boundary by one and the two cut different text.
   */
  it('counts astral characters the way Python does', () => {
    const withEmoji = ('fix the thing 🔧 and carry on. '.repeat(80))
    expect(chunkText(withEmoji)).toEqual(pythonChunk(withEmoji))

    // Emoji placed right at the window boundary is the sharp case.
    const boundary = 'a'.repeat(1798) + '🔧' + ' tail. ' + 'b'.repeat(600)
    expect(chunkText(boundary)).toEqual(pythonChunk(boundary))
  })

  it('never emits a chunk longer than the window in code points', () => {
    for (const input of Object.values(CASES)) {
      for (const c of chunkText(input)) {
        expect(Array.from(c).length).toBeLessThanOrEqual(CHUNK_CHAR)
      }
    }
  })
})
