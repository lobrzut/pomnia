// SPDX-License-Identifier: AGPL-3.0-only
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runSaveConversation } from './saveConversation.js'

describe('save_conversation never replaces a note that is already there', () => {
  let vaultRoot: string
  beforeEach(() => {
    vaultRoot = mkdtempSync(join(tmpdir(), 'pomnia-save-'))
  })
  afterEach(() => {
    rmSync(vaultRoot, { recursive: true, force: true })
  })

  const sessions = () => readdirSync(join(vaultRoot, 'sessions')).sort()
  const bodies = () =>
    sessions().map((f) => readFileSync(join(vaultRoot, 'sessions', f), 'utf8'))

  it('keeps both notes when two saves collide inside the same minute', async () => {
    // The filename carries the time only to the minute, so two saves with the
    // same source and topic resolved to one path and rename() replaced the
    // first note. Both callers were told the save had succeeded.
    const args = { source: 'cursor', topic: 'refactor', summary: 'MARKER-PIERWSZA' }
    const first = await runSaveConversation(args, { vaultRoot })
    const second = await runSaveConversation({ ...args, summary: 'MARKER-DRUGA' }, { vaultRoot })

    expect(first.path).not.toBe(second.path)
    expect(sessions()).toHaveLength(2)
    expect(bodies().some((b) => b.includes('MARKER-PIERWSZA'))).toBe(true)
    expect(bodies().some((b) => b.includes('MARKER-DRUGA'))).toBe(true)
  })

  it('keeps going past a second collision rather than stopping at one suffix', async () => {
    const args = { source: 'claude', topic: 'audit' }
    await runSaveConversation({ ...args, summary: 'MARKER-A' }, { vaultRoot })
    await runSaveConversation({ ...args, summary: 'MARKER-B' }, { vaultRoot })
    await runSaveConversation({ ...args, summary: 'MARKER-C' }, { vaultRoot })

    expect(sessions()).toHaveLength(3)
    const all = bodies().join(' ')
    for (const marker of ['MARKER-A', 'MARKER-B', 'MARKER-C']) {
      expect(all).toContain(marker)
    }
  })

  // Three saves in one day went out as unknown/untitled or lost a field to a
  // typo, and each answered with a bare tick. Nothing is refused here - agents
  // calling loosely keep working - but the answer stops hiding what was lost.
  it('names the required fields the caller left out', async () => {
    const r = await runSaveConversation({}, { vaultRoot })
    expect(r.text).toContain('source, topic, summary not provided')
    expect(r.text).toContain('unknown/untitled')
  })

  it('names a misspelled field instead of dropping it in silence', async () => {
    const r = await runSaveConversation(
      { source: 'x', topic: 'y', sumary: 'content that would vanish' },
      { vaultRoot },
    )
    expect(r.text).toContain('ignored unknown field(s): sumary')
  })

  it('stays quiet when the call is complete', async () => {
    const r = await runSaveConversation(
      { source: 'cursor', topic: 'refactor', summary: 'all present' },
      { vaultRoot },
    )
    expect(r.text).not.toContain('!')
  })

  it('leaves no .tmp file behind', async () => {
    await runSaveConversation({ source: 's', topic: 't', summary: 'y' }, { vaultRoot })
    expect(sessions().filter((f) => f.endsWith('.tmp'))).toEqual([])
  })
})
