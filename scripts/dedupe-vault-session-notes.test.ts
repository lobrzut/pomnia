// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'

import {
  basketForPath,
  pickKeeper,
  planDedupe,
  session8FromFilename,
  type NoteFile,
} from './dedupe-vault-session-notes-main.ts'

function note(partial: Partial<NoteFile> & Pick<NoteFile, 'path' | 'basket' | 'mtimeMs'>): NoteFile {
  const name = partial.name ?? partial.path.replace(/\\/g, '/').split('/').pop()!
  return {
    name,
    session8: partial.session8 ?? session8FromFilename(name) ?? 'abcd1234',
    hasContent: partial.hasContent ?? true,
    ...partial,
  }
}

describe('session8FromFilename', () => {
  it('parses trailing 8-char suffix', () => {
    expect(session8FromFilename('topic_AbCd1234.md')).toBe('abcd1234')
    expect(session8FromFilename('no-suffix.md')).toBeNull()
  })
})

describe('basketForPath', () => {
  const root = 'C:/Vault/distilled'
  it('classifies baskets', () => {
    expect(basketForPath(root, 'C:/Vault/distilled/ok_abcd1234.md')).toBe('keep')
    expect(basketForPath(root, 'C:/Vault/distilled/_weak/w_abcd1234.md')).toBe('weak')
    expect(basketForPath(root, 'C:/Vault/distilled/_review/r_abcd1234.md')).toBe('review')
  })
})

describe('pickKeeper — basket beats mtime', () => {
  it('keeps older _weak over newer _review (indexed must not lose to quarantine)', () => {
    const weak = note({
      path: 'C:/Vault/distilled/_weak/sess_abcd1234.md',
      basket: 'weak',
      mtimeMs: 1_000,
    })
    const review = note({
      path: 'C:/Vault/distilled/_review/sess_abcd1234.md',
      basket: 'review',
      mtimeMs: 9_000,
    })
    const { keep, contested, reason } = pickKeeper([weak, review])
    expect(keep.path).toBe(weak.path)
    expect(keep.basket).toBe('weak')
    expect(contested).toBe(true)
    expect(reason).toMatch(/contested/i)
  })

  it('keeps distilled/ over newer _weak', () => {
    const keepNote = note({
      path: 'C:/Vault/distilled/sess_abcd1234.md',
      basket: 'keep',
      mtimeMs: 1_000,
    })
    const weak = note({
      path: 'C:/Vault/distilled/_weak/sess_abcd1234.md',
      basket: 'weak',
      mtimeMs: 9_000,
    })
    const { keep, contested } = pickKeeper([keepNote, weak])
    expect(keep.basket).toBe('keep')
    expect(contested).toBe(true)
  })

  it('keeps distilled/ over newer _review', () => {
    const keepNote = note({
      path: 'C:/Vault/distilled/sess_abcd1234.md',
      basket: 'keep',
      mtimeMs: 1_000,
    })
    const review = note({
      path: 'C:/Vault/distilled/_review/sess_abcd1234.md',
      basket: 'review',
      mtimeMs: 9_000,
    })
    const { keep, contested } = pickKeeper([keepNote, review])
    expect(keep.basket).toBe('keep')
    expect(contested).toBe(true)
  })

  it('same basket → newest mtime wins (not contested)', () => {
    const older = note({
      path: 'C:/Vault/distilled/_weak/old_abcd1234.md',
      basket: 'weak',
      mtimeMs: 1_000,
    })
    const newer = note({
      path: 'C:/Vault/distilled/_weak/new_abcd1234.md',
      basket: 'weak',
      mtimeMs: 9_000,
    })
    const { keep, contested, reason } = pickKeeper([older, newer])
    expect(keep.path).toBe(newer.path)
    expect(contested).toBe(false)
    expect(reason).toMatch(/same basket/)
  })

  it('basket-winner newer than discarded → not contested', () => {
    const weak = note({
      path: 'C:/Vault/distilled/_weak/sess_abcd1234.md',
      basket: 'weak',
      mtimeMs: 9_000,
    })
    const review = note({
      path: 'C:/Vault/distilled/_review/sess_abcd1234.md',
      basket: 'review',
      mtimeMs: 1_000,
    })
    const { keep, contested } = pickKeeper([weak, review])
    expect(keep.basket).toBe('weak')
    expect(contested).toBe(false)
  })
})

describe('planDedupe', () => {
  it('plans drop of newer _review when older _weak shares sessionId', () => {
    const weak = note({
      path: 'C:/Vault/distilled/_weak/a_deadbeef.md',
      basket: 'weak',
      mtimeMs: 100,
      session8: 'deadbeef',
    })
    const review = note({
      path: 'C:/Vault/distilled/_review/b_deadbeef.md',
      basket: 'review',
      mtimeMs: 999,
      session8: 'deadbeef',
    })
    const plans = planDedupe([weak, review])
    expect(plans).toHaveLength(1)
    expect(plans[0]!.keep.basket).toBe('weak')
    expect(plans[0]!.delete.map((d) => d.basket)).toEqual(['review'])
    expect(plans[0]!.contested).toBe(true)
  })
})
