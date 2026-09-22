// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * The per-file cap is what stopped one rich note from filling a search answer
 * (measured: 4 of 8 hits from a single file, ~6k tokens). These pin that it
 * keeps ranking order, never exceeds the per-file limit, and honours top_k.
 */
import { describe, expect, it } from 'vitest'

import { capPerFile } from './searchLibrary.js'

const hit = (path: string, id: number) => ({ path, id })

describe('capPerFile', () => {
  it('keeps at most maxPerFile from any one path, in order', () => {
    const hits = [
      hit('a', 1), hit('a', 2), hit('a', 3), hit('a', 4),
      hit('b', 5), hit('b', 6),
      hit('c', 7),
    ]
    const out = capPerFile(hits, 2, 10)
    expect(out.map((h) => h.id)).toEqual([1, 2, 5, 6, 7])
  })

  it('stops at the limit even when more would pass the cap', () => {
    const hits = [hit('a', 1), hit('b', 2), hit('c', 3), hit('d', 4)]
    expect(capPerFile(hits, 2, 3).map((h) => h.id)).toEqual([1, 2, 3])
  })

  it('takes the highest-ranked chunks of a dominant file, not later ones', () => {
    const hits = [hit('a', 1), hit('a', 2), hit('a', 3)]
    expect(capPerFile(hits, 2, 4).map((h) => h.id)).toEqual([1, 2])
  })

  it('is empty in, empty out', () => {
    expect(capPerFile([], 2, 4)).toEqual([])
  })

  it('treats a missing path as its own bucket rather than throwing', () => {
    const hits = [{ id: 1 }, { id: 2 }, { id: 3 }] as Array<{ path?: string; id: number }>
    // All share the empty-string key, so the cap applies across them.
    expect(capPerFile(hits, 2, 4).map((h) => h.id)).toEqual([1, 2])
  })
})
