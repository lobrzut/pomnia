// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Text chunking — mirror of Python `pipeline/rag.py::_chunk_text`.
 *
 * MUST produce byte-identical chunks to the Python impl for a given input,
 * so re-chunking a note in Node gives the same rows we'd insert with Python
 * (otherwise the existing library.db and any Node-inserted chunks drift).
 *
 * Algorithm:
 *  1. Collapse consecutive whitespace to single spaces.
 *  2. If length ≤ size → single chunk (or empty).
 *  3. Otherwise slide a window of `size` chars, trying to break at a sentence
 *     boundary in the second half of the window. Overlap by `overlap` chars.
 */

/**
 * Bumped whenever chunk boundaries or chunk text composition change.
 *
 * An index stamped with an older value cannot be reused: the vectors describe
 * text this chunker would no longer produce, and nothing about the files
 * changed, so an incremental pass would skip every one of them and report
 * success. The stamp is what turns that into a refusal.
 */
export const CHUNKER_VERSION = 'v2'

export const CHUNK_CHAR = 1800
export const CHUNK_OVERLAP = 200

/** Backwards search for a code-point sequence, mirroring Python `str.rfind`. */
function lastIndexOfCodePoints(hay: readonly string[], needle: readonly string[], from: number): number {
  for (let i = Math.min(from, hay.length - needle.length); i >= 0; i--) {
    let hit = true
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        hit = false
        break
      }
    }
    if (hit) return i
  }
  return -1
}

const SEPARATORS = ['. ', '; ', '\n', ' '].map((s) => Array.from(s))

export function chunkText(text: string, size = CHUNK_CHAR, overlap = CHUNK_OVERLAP): string[] {
  // Collapse whitespace: same semantics as Python `" ".join(text.split())`.
  const collapsed = text.split(/\s+/).filter(Boolean).join(' ')
  if (collapsed.length === 0) return []

  // Python measures length in Unicode code points; a JS string indexes UTF-16
  // units, so one emoji shifts every downstream boundary by one and the two
  // implementations cut different text. Work on a code-point array to keep both
  // on the same ruler.
  const cp = Array.from(collapsed)
  if (cp.length <= size) return [collapsed]

  const chunks: string[] = []
  let i = 0
  while (i < cp.length) {
    let end = Math.min(i + size, cp.length)
    // Try to break at a sentence boundary in the second half of the window.
    if (end < cp.length) {
      const start = i + Math.floor(size / 2)
      for (const sep of SEPARATORS) {
        // Mirror Python `rfind(sep, start, end)`: the separator must fit
        // *inside* the window, hence `end - sep.length`. Searching from `end`
        // let a separator sitting on the boundary spill past it and produced a
        // full-width chunk where Python backs up to an earlier break.
        const cut = lastIndexOfCodePoints(cp, sep, end - sep.length)
        if (cut > 0 && cut >= start) {
          end = cut + sep.length
          break
        }
      }
    }
    const piece = cp.slice(i, end).join('').trim()
    if (piece.length > 0) chunks.push(piece)
    if (end === cp.length) break
    i = end - overlap
  }
  return chunks
}
