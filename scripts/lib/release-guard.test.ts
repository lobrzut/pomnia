// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'

import {
  formatReleaseCommit,
  guardReleaseUpload,
  parseReleaseCommit,
  releaseCommitFileName,
} from './release-guard.ts'

const HEAD = 'a'.repeat(40)
const OTHER = 'b'.repeat(40)

function guard(over: Partial<Parameters<typeof guardReleaseUpload>[0]> = {}) {
  return guardReleaseUpload({
    head: HEAD,
    tagCommit: HEAD,
    dirty: null,
    releaseExists: true,
    isDraft: true,
    targetCommitish: HEAD,
    recordedCommit: HEAD,
    ...over,
  })
}

describe('release commit file', () => {
  it('names and round-trips a full sha', () => {
    expect(releaseCommitFileName('0.1.91')).toBe('pomnia-0.1.91.commit')
    expect(parseReleaseCommit(formatReleaseCommit(HEAD))).toBe(HEAD)
    expect(parseReleaseCommit('ZZ\n')).toBeNull()
  })
})

describe('guardReleaseUpload', () => {
  it('allows a draft built from the tagged commit', () => {
    expect(guard().ok).toBe(true)
  })

  it('refuses a checkout that is not the tag', () => {
    const r = guard({ head: OTHER })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/tagged commit/)
  })

  it('refuses to replace a published release', () => {
    const r = guard({ isDraft: false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/already published/)
  })

  it('refuses a draft recorded from another commit', () => {
    const r = guard({ recordedCommit: OTHER, targetCommitish: 'master' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(OTHER)
  })

  it('allows the first upload when the release does not exist yet', () => {
    expect(
      guard({ releaseExists: false, isDraft: false, tagCommit: null, recordedCommit: null, targetCommitish: null })
        .ok,
    ).toBe(true)
  })

  it('refuses a dirty tree', () => {
    const r = guard({ dirty: ' M package.json' })
    expect(r.ok).toBe(false)
  })
})
