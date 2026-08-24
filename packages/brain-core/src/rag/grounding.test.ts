// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'

import { classifyGrounding, keywordHits, noteDate, semanticScore, SEM_MEANINGFUL } from './grounding.js'

const row = (sem: number, kwName = 0, kwText = 0, score = 0.5) => ({
  score,
  meta: { sem_score: sem, kw_name_hits: kwName, kw_text_hits: kwText },
})

describe('what the agent is told about its own retrieval', () => {
  it('calls a real topic strong', () => {
    // "brain-core MCP server" on the live vault: sem 0.2198, 7 keyword hits.
    expect(classifyGrounding([row(0.2107, 3, 4)]).grounding).toBe('strong')
  })

  it('refuses to call an unrelated query an answer', () => {
    // "lunar regolith sintering": sem 0.0145, no keyword hit anywhere.
    const v = classifyGrounding([row(0.0145)])
    expect(v.grounding).toBe('none')
    expect(v.note).toMatch(/not an answer/i)
  })

  it('names a words-only match instead of passing it off as meaning', () => {
    // "coral reef bleaching" against a note titled "Google Coral Edge TPU".
    // After the v2 reindex its semantic score doubled to 0.1632 — stripping the
    // YAML header sharpened the noise as well as the signal — which is why the
    // floor sits above it rather than below the weakest true hit.
    const v = classifyGrounding([row(0.1632, 1, 2)])
    expect(v.grounding).toBe('lexical')
    expect(v.note).toMatch(/words, not on meaning/i)
  })

  it('never answers "nothing" while a keyword matched', () => {
    // "electron-builder instalator" is a true hit carried entirely by the
    // words: sem 0.0706, below the floor and below the coral false positive. Suppressing it would lose a real
    // answer, so a keyword hit downgrades the verdict rather than erasing it.
    expect(classifyGrounding([row(0.0706, 1, 2)]).grounding).toBe('lexical')
  })

  it('judges the set by its best row, not its worst', () => {
    expect(classifyGrounding([row(0.02), row(0.3174, 1), row(0.03)]).grounding).toBe('strong')
  })

  it('says so when there is nothing indexed at all', () => {
    expect(classifyGrounding([]).grounding).toBe('none')
  })

  it('puts the floor where the measurement put it', () => {
    expect(classifyGrounding([row(SEM_MEANINGFUL)]).grounding).toBe('strong')
    expect(classifyGrounding([row(SEM_MEANINGFUL - 0.0001)]).grounding).toBe('none')
  })
})

describe('reading a row', () => {
  it('adds name and body keyword hits', () => {
    expect(keywordHits(row(0.1, 2, 3))).toBe(5)
  })

  it('treats a missing meta as zero rather than throwing', () => {
    expect(semanticScore({ score: 0.4 })).toBe(0)
    expect(keywordHits({ score: 0.4 })).toBe(0)
  })

  it('lifts the date a distilled note carries in its name', () => {
    expect(noteDate('2026-07-18_claude-code_Some_title_ab12cd34.md')).toBe('2026-07-18')
  })

  it('returns null for a name that carries no date', () => {
    expect(noteDate('USER.md')).toBeNull()
  })
})
