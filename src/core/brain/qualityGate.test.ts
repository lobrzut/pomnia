// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'
import {
  destinationForQuality,
  destinationForQualityContent,
  hasContentlessStubMarker,
  hasThinSearchableSections,
  parseFrontmatterQuality,
  parseFrontmatterScore,
  qualityFromScoreAsymmetric,
  rateUnratedMarkdown,
  upsertQualityFrontmatter,
} from './qualityGate.js'

describe('qualityGate destination', () => {
  it('maps both vocabularies', () => {
    expect(destinationForQuality('garbage')).toBe('review')
    expect(destinationForQuality('stub')).toBe('review')
    expect(destinationForQuality('weak')).toBe('weak')
    expect(destinationForQuality('ok')).toBe('keep')
    expect(destinationForQuality('solid')).toBe('keep')
    expect(destinationForQuality('good')).toBe('keep')
    expect(destinationForQuality('unrated')).toBe('keep')
  })
})

describe('qualityGate stub/garbage content routing', () => {
  const emptyStub = `---
quality: stub
---

## Summary
## _Stub_
Distillation didn't extract durable knowledge.
`

  const thinWithSolution = `---
quality: stub
---

## Decisions
- keep indicator inputs as strings

## Solutions
- Declare var string SimpleBuy = "Buy" to fix syntax error

## Facts
- Pine Script v5 requires typed vars
`

  it('detects contentless markers and thin sections', () => {
    expect(hasContentlessStubMarker(emptyStub)).toBe(true)
    expect(hasThinSearchableSections(emptyStub)).toBe(false)
    expect(hasContentlessStubMarker(thinWithSolution)).toBe(false)
    expect(hasThinSearchableSections(thinWithSolution)).toBe(true)
  })

  it('quarantines only contentless stub/garbage; thin content → _weak', () => {
    expect(destinationForQualityContent('stub', emptyStub)).toBe('review')
    expect(destinationForQualityContent('garbage', emptyStub)).toBe('review')
    expect(destinationForQualityContent('stub', thinWithSolution)).toBe('weak')
    expect(destinationForQualityContent('garbage', thinWithSolution)).toBe('weak')
  })

  it('leaves quality=weak unchanged (always _weak)', () => {
    expect(destinationForQualityContent('weak', thinWithSolution)).toBe('weak')
    expect(destinationForQualityContent('weak', emptyStub)).toBe('weak')
  })
})

describe('qualityGate asymmetric unrated bands (TS 0-10 scoreFields)', () => {
  it('only moves when clearly below threshold', () => {
    expect(qualityFromScoreAsymmetric(0, true)).toBe('stub')
    expect(qualityFromScoreAsymmetric(1.5, false)).toBe('garbage')
    expect(qualityFromScoreAsymmetric(3, false)).toBe('weak')
    expect(qualityFromScoreAsymmetric(4.2, false)).toBe('unrated') // borderline -> stay
    expect(qualityFromScoreAsymmetric(5.5, false)).toBe('ok')
    expect(qualityFromScoreAsymmetric(7, false)).toBe('solid')
  })
})

describe('upsertQualityFrontmatter', () => {
  it('writes quality_score_ts and never overwrites quality_score', () => {
    const md = `---
source: grok
quality_score: 72
---

# note
`
    const out = upsertQualityFrontmatter(md, 'unrated', 4.2)
    expect(out).toContain('quality: unrated')
    expect(out).toContain('quality_score_ts: 4.2')
    expect(out).toMatch(/^quality_score: 72$/m)
    expect(parseFrontmatterScore(out)).toBe(72)
    expect(parseFrontmatterQuality(out)).toBe('unrated')
  })

  it('does not invent quality_score when absent', () => {
    const md = `---
source: cursor
---

## Decisions
- chose X
`
    const out = upsertQualityFrontmatter(md, 'garbage', 1.1)
    expect(out).toContain('quality_score_ts: 1.1')
    expect(out).not.toMatch(/^quality_score:/m)
  })
})

describe('rateUnratedMarkdown', () => {
  it('scores legacy section structure', () => {
    const md = `---
source: grok
date: 2025-03-22
---

# title

## Decisions
- use scrypt N=2^17 in src/core/crypto.ts

## Solutions
- ran \`npm test\` and \`git commit -m fix\`, 14 tests passed
`
    const r = rateUnratedMarkdown(md)
    expect(r.empty).toBe(false)
    expect(r.score).toBeGreaterThanOrEqual(5)
    expect(['ok', 'solid']).toContain(r.quality)
  })
})
