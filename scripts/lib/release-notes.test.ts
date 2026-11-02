// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { composeReleaseNotes, writeReleaseNotesFile } from './release-notes.ts'

describe('composeReleaseNotes', () => {
  it('lists every digest in lowercase and keeps an em dash as itself', () => {
    const notes = composeReleaseNotes({
      version: '0.1.92',
      tag: 'v0.1.92',
      commit: 'abc1234',
      digests: [
        { file: 'Pomnia-0.1.92-setup.exe', sha256: 'AB'.repeat(32) },
        { file: 'PomniaMini-win-x64.zip', sha256: 'cd'.repeat(32) },
      ],
    })
    expect(notes).toContain('ab'.repeat(32))
    expect(notes).not.toContain('AB'.repeat(32))
    expect(notes).toContain('PomniaMini-win-x64.zip')
    expect(notes).toContain('PomniaMini-0.1.92.zip')
    expect(notes).toContain('PomniaMini-linux-x64.AppImage')
    expect(notes).toContain('—')
    expect(notes).not.toContain('ÔÇö')
  })
})

describe('writeReleaseNotesFile', () => {
  it('writes UTF-8 bytes for the em dash, not a console-code-page mojibake', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pomnia-notes-'))
    const path = join(dir, 'notes.md')
    writeReleaseNotesFile(path, 'signed — not really\n')
    const bytes = readFileSync(path)
    // U+2014 EM DASH is E2 80 94 in UTF-8. The v0.1.91 notes stored the
    // cp1252 reading of those bytes a second time.
    expect([...bytes.slice(bytes.indexOf(0xe2), bytes.indexOf(0xe2) + 3)]).toEqual([0xe2, 0x80, 0x94])
    expect(bytes.includes(Buffer.from('ÔÇö'))).toBe(false)
  })
})
