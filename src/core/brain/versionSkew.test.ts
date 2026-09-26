// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'

import {
  assessHealthPayload,
  assessVersionSkew,
  formatVersionSkew,
  versionSkewToDoctorCheck,
} from './versionSkew.js'

describe('assessVersionSkew', () => {
  it('stays quiet when the releases match', () => {
    const a = assessVersionSkew('0.1.91', '0.1.91')
    expect(a.level).toBe('quiet')
    expect(a.reason).toBe('match')
    expect(a.client).toBe('0.1.91')
    expect(a.brain).toBe('0.1.91')
    expect(formatVersionSkew(a, 'en')).toBeNull()
    expect(formatVersionSkew(a, 'pl')).toBeNull()
    expect(versionSkewToDoctorCheck(a)).toBeNull()
  })

  it('treats a leading v and a pre-release suffix as the same release', () => {
    expect(assessVersionSkew('v0.1.91', '0.1.91').reason).toBe('match')
    expect(assessVersionSkew('0.1.91-beta.1', '0.1.91').level).toBe('quiet')
    expect(assessVersionSkew(' 0.1.91 ', '0.1.91+build.4').reason).toBe('match')
  })

  it('warns on skew, names both versions, and says which side to update', () => {
    const brainOlder = assessVersionSkew('0.1.91', '0.1.80')
    expect(brainOlder.level).toBe('warn')
    expect(brainOlder.reason).toBe('skew')
    expect(brainOlder.older).toBe('brain')
    const en = formatVersionSkew(brainOlder, 'en')
    const pl = formatVersionSkew(brainOlder, 'pl')
    expect(en).toContain('0.1.91')
    expect(en).toContain('0.1.80')
    expect(en).toMatch(/Update the Brain/)
    expect(en).toMatch(/connection stays open/)
    expect(pl).toContain('0.1.91')
    expect(pl).toContain('0.1.80')
    expect(pl).toMatch(/Zaktualizuj Brain/)

    const desktopOlder = assessVersionSkew('0.1.70', '0.1.91')
    expect(desktopOlder.older).toBe('desktop')
    expect(formatVersionSkew(desktopOlder, 'en')).toMatch(/Update Desktop/)
    expect(formatVersionSkew(desktopOlder, 'pl')).toMatch(/Zaktualizuj Desktop/)

    const doctor = versionSkewToDoctorCheck(brainOlder)
    expect(doctor?.level).toBe('WARN')
    expect(doctor?.id).toBe('brain-version')
    expect(doctor?.message).toContain('0.1.80')
    expect(doctor?.action).toMatch(/Update the Brain to 0\.1\.91/)
  })

  it('does not throw when the Brain has no version field', () => {
    const health = { ok: true, service: 'brain-core', auth: true }
    const a = assessHealthPayload('0.1.91', health)
    expect(a).not.toBeNull()
    expect(a?.level).toBe('warn')
    expect(a?.reason).toBe('brain-version-missing')
    expect(a?.client).toBe('0.1.91')
    expect(a?.brain).toBeNull()
    const msg = formatVersionSkew(a!, 'en')
    expect(msg).toContain('0.1.91')
    expect(msg).toMatch(/did not report a version/)
    expect(msg).toMatch(/connection stays open/)

    expect(() => assessVersionSkew('0.1.91', undefined)).not.toThrow()
    expect(() => assessVersionSkew('0.1.91', null)).not.toThrow()
    expect(() => assessHealthPayload('0.1.91', { service: 'brain-core', version: { nested: true } })).not.toThrow()
    expect(assessVersionSkew('0.1.91', '').reason).toBe('brain-version-missing')
    expect(assessHealthPayload('0.1.91', undefined)).toBeNull()
  })

  it('treats 0.0.0 as an unknown version, not as a match and not as an ancient release', () => {
    const a = assessVersionSkew('0.1.91', '0.0.0')
    expect(a.reason).toBe('brain-version-missing')
    expect(a.brain).toBeNull()
    expect(a.brainReported).toBe('0.0.0')
    expect(formatVersionSkew(a, 'en')).toMatch(/0\.0\.0/)
    expect(formatVersionSkew(a, 'en')).not.toMatch(/older/)
  })

  it('names an unreadable version instead of crashing', () => {
    const a = assessVersionSkew('0.1.91', 'dev')
    expect(a.reason).toBe('brain-version-unreadable')
    expect(formatVersionSkew(a, 'en')).toContain('dev')
    expect(formatVersionSkew(a, 'pl')).toContain('dev')
  })

  it('does not pile a version warning onto a payload that is not brain-core', () => {
    expect(assessHealthPayload('0.1.91', { ok: true, upstream: 'http://127.0.0.1:7863', tokens: 4 })).toBeNull()
    expect(assessHealthPayload('0.1.91', { notes: 12, sessions: 3 })).toBeNull()
    expect(assessHealthPayload('0.1.91', null)).toBeNull()
  })
})
