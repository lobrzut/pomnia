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

export const CHUNK_CHAR = 1800
export const CHUNK_OVERLAP = 200

export function chunkText(text: string, size = CHUNK_CHAR, overlap = CHUNK_OVERLAP): string[] {
  // Collapse whitespace: same semantics as Python `" ".join(text.split())`.
  const collapsed = text.split(/\s+/).filter(Boolean).join(' ')
  if (collapsed.length === 0) return []
  if (collapsed.length <= size) return [collapsed]

  const chunks: string[] = []
  let i = 0
  while (i < collapsed.length) {
    let end = Math.min(i + size, collapsed.length)
    // Try to break at a sentence boundary in the second half of the window.
    if (end < collapsed.length) {
      const halfway = i + Math.floor(size / 2)
      for (const sep of ['. ', '; ', '\n', ' ']) {
        const cut = collapsed.lastIndexOf(sep, end)
        if (cut > halfway) {
          end = cut + sep.length
          break
        }
      }
    }
    const piece = collapsed.slice(i, end).trim()
    if (piece.length > 0) chunks.push(piece)
    if (end === collapsed.length) break
    i = end - overlap
  }
  return chunks
}
