// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * The AGENTS.md preview rides in every session's profile, so it must stay lean
 * and cut cleanly. These pin that the boundary trim ends on a section, not
 * mid-sentence, and never exceeds the cap.
 */
import { describe, expect, it } from 'vitest'

import { truncateAtBoundary } from './userProfile.js'

describe('truncateAtBoundary', () => {
  it('returns text unchanged when under the cap', () => {
    expect(truncateAtBoundary('short brief', 1200)).toBe('short brief')
  })

  it('cuts on a section heading rather than mid-sentence', () => {
    const brief = '## Start\n' + 'a'.repeat(300) + '\n## Rules\n' + 'b'.repeat(300)
    const out = truncateAtBoundary(brief, 340)
    // The 340-char window includes the "\n## Rules" boundary; cut there, not inside the a-run.
    expect(out.endsWith('a'.repeat(300))).toBe(true)
    expect(out).not.toContain('b')
  })

  it('falls back to a hard cut when no boundary is near the end', () => {
    const brief = 'x'.repeat(2000)
    expect(truncateAtBoundary(brief, 1200).length).toBe(1200)
  })
})
