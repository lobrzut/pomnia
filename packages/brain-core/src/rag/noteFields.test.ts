// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'

import { noteDateFrom, noteQualityFrom, splitNote } from './noteFields.js'

// Shape taken verbatim from a real distilled note in the live vault.
const NOTE = [
  '---',
  'source: grok',
  'session: 5bc9d033-7b07-4856-9a92-ea22fba6361a',
  'project: Strategia handlu BTCUSDT w Pine Script v6',
  'date: 2025-03-22',
  'src_path: C:\Users\helluk\brain\data\brain-raw\inbox\grok.zip',
  'msg_count: 12',
  'quality: unrated',
  'quality_score_ts: 4.67',
  '---',
  '',
  '# 2025-03-22 · grok · 5bc9d033',
  '',
  '## Decisions',
  '- Chose dynamic position sizing',
].join('\n')

describe('separating what a note is from what it says', () => {
  it('keeps the YAML out of the body', () => {
    const { body } = splitNote(NOTE)
    expect(body).not.toMatch(/src_path|session:|msg_count/)
    expect(body).toMatch(/## Decisions/)
  })

  it('lifts every field', () => {
    const { meta } = splitNote(NOTE)
    expect(meta.source).toBe('grok')
    expect(meta.date).toBe('2025-03-22')
    expect(meta.quality_score_ts).toBe('4.67')
  })

  it('keeps a Windows path intact rather than splitting on its colon', () => {
    // src_path carries a drive letter; splitting on every colon would truncate
    // it to "C" and quietly lose the field.
    expect(splitNote(NOTE).meta.src_path).toBe('C:\Users\helluk\brain\data\brain-raw\inbox\grok.zip')
  })

  it('passes a note with no front matter through untouched', () => {
    const plain = '# Title\n\nSome text.'
    expect(splitNote(plain)).toEqual({ meta: {}, body: plain })
  })

  it('does not treat a horizontal rule mid-document as front matter', () => {
    const text = '# Title\n\n---\n\nnot front matter\n'
    expect(splitNote(text).meta).toEqual({})
    expect(splitNote(text).body).toBe(text)
  })

  it('survives CRLF, which is how these files arrive on Windows', () => {
    const crlf = NOTE.replace(/\n/g, '\r\n')
    expect(splitNote(crlf).meta.source).toBe('grok')
    expect(splitNote(crlf).body).toMatch(/## Decisions/)
  })

  it('reads the date', () => {
    expect(noteDateFrom({ date: '2025-03-22' })).toBe('2025-03-22')
    expect(noteDateFrom({ date: 'unrated' })).toBeNull()
    expect(noteDateFrom({})).toBeNull()
  })

  it('reads the quality score that nothing has been reading', () => {
    expect(noteQualityFrom({ quality_score_ts: '4.67' })).toBe(4.67)
    expect(noteQualityFrom({ quality_score_ts: 'unrated' })).toBeNull()
    expect(noteQualityFrom({})).toBeNull()
  })
})
