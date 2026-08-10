import { describe, expect, it } from 'vitest'

import { noteRecencyBoost } from '../src/rag/search.js'

const NOW = Date.UTC(2026, 7, 3) // 2026-08-03
const day = 86_400_000
const note = (date: string): string => `${date}_claude-code_Some_title_ab12cd34.md`

describe('noteRecencyBoost', () => {
  it('gives the full boost to notes under a month old', () => {
    expect(noteRecencyBoost(note('2026-08-01'), NOW)).toBe(0.25)
    expect(noteRecencyBoost(note('2026-07-10'), NOW)).toBe(0.25)
  })

  it('decays toward zero and reaches it at two years', () => {
    const recent = noteRecencyBoost(note('2026-01-01'), NOW)
    const older = noteRecencyBoost(note('2025-06-01'), NOW)
    expect(recent).toBeGreaterThan(older)
    expect(older).toBeGreaterThan(0)
    expect(noteRecencyBoost(note('2024-01-01'), NOW)).toBe(0)
  })

  /**
   * The reason this reads the filename instead of stat().mtime, which the
   * Python impl used: copying a vault, restoring a backup or merging notes
   * from another host rewrites every mtime to now. That would hand the whole
   * corpus a uniform full boost and flatten the signal entirely — and it is
   * not hypothetical, 80 notes were merged into this vault from another
   * machine on the day this was written.
   */
  it('reads the date from the name, so a freshly copied file is not "new"', () => {
    // Same note, whatever its mtime says.
    expect(noteRecencyBoost(note('2025-03-22'), NOW)).toBeLessThan(0.25)
    expect(noteRecencyBoost(note('2025-03-22'), NOW)).toBeGreaterThan(0)
  })

  it('ignores library documents — a 1948 paper is not stale', () => {
    expect(noteRecencyBoost('Shannon, Claude E. - The Mathematical Theory of Communication.epub', NOW)).toBe(0)
    expect(noteRecencyBoost('ApplicationsofGroupTheoryinCryptography.pdf', NOW)).toBe(0)
  })

  it('returns nothing for names without a date prefix', () => {
    expect(noteRecencyBoost('USER.md', NOW)).toBe(0)
    expect(noteRecencyBoost('AGENTS.md', NOW)).toBe(0)
    expect(noteRecencyBoost('whatnot_recon_2026-05-30.md', NOW)).toBe(0)
  })

  it('does not reward a future date', () => {
    expect(noteRecencyBoost(note('2027-01-01'), NOW)).toBe(0.25)
    expect(noteRecencyBoost(note('2026-08-03'), NOW)).toBe(0.25)
  })

  it('never exceeds the cap or goes negative', () => {
    for (let d = -400; d < 1200; d += 7) {
      const stamp = new Date(NOW - d * day).toISOString().slice(0, 10)
      const b = noteRecencyBoost(note(stamp), NOW)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(0.25)
    }
  })
})
