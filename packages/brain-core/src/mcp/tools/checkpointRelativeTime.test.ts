import { describe, expect, it } from 'vitest'

import { relativeTimePhrases, relativeTimeWarning } from './checkpointSession.js'

describe('checkpoint — relative dates rot, absolute ones do not', () => {
  it('catches the phrasing that actually went into the vault', () => {
    // Verbatim from a checkpoint written 2026-08-31. It stopped meaning
    // anything the moment tomorrow arrived.
    expect(
      relativeTimePhrases(['zaszyfrowany magazyn nie mogl wyprodukowac dzisiejszych checkpointow']),
    ).toEqual(['dzisiejszych'])
  })

  it('catches Polish and English, with and without diacritics', () => {
    const hits = relativeTimePhrases(['naprawione dziś', 'broke yesterday', 'wczoraj padlo', 'ship tomorrow'])
    expect(hits.sort()).toEqual(['dziś', 'tomorrow', 'wczoraj', 'yesterday'])
  })

  it('catches counted offsets in both languages', () => {
    expect(relativeTimePhrases(['zmierzone 3 dni temu']).length).toBe(1)
    expect(relativeTimePhrases(['measured 2 weeks ago']).length).toBe(1)
  })

  it('leaves absolute dates alone — they are the fix, not the fault', () => {
    expect(relativeTimePhrases(['zmierzone 2026-08-20 na .248', 'commit d17fe1e'])).toEqual([])
  })

  it('does not fire on words that merely contain a match', () => {
    // "dziśki"/"todays" are not words we mean; guard against a sloppy regex.
    expect(relativeTimePhrases(['podziśkowanie', 'todayish'])).toEqual([])
  })

  it('deduplicates, so one repeated word is one warning', () => {
    expect(relativeTimePhrases(['dziś A', 'dziś B', 'DZIŚ C'])).toEqual(['dziś'])
  })

  it('names the absolute date the author should have used', () => {
    expect(relativeTimeWarning(['dziś'], '2026-08-31')).toContain('2026-08-31')
  })
})
