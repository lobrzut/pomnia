import { describe, expect, it } from 'vitest'

import { conflictSuffixPath } from './receive.js'
import { safeVaultPath } from './paths.js'

describe('sync — the two root files must be able to heal a conflict', () => {
  it('accepts the conflict sibling of an allowed root file', () => {
    // The real failure: a diverged USER.md produced USER-2.md, the validator
    // called it not-synced-dir, and the push failed. Permanently — every later
    // push hit the same wall, so the one file every agent reads at session start
    // was the only one that could never reconcile.
    expect(safeVaultPath('USER-2.md')).toMatchObject({ ok: true })
    expect(safeVaultPath('AGENTS-2.md')).toMatchObject({ ok: true })
    expect(safeVaultPath('USER-17.md')).toMatchObject({ ok: true })
  })

  it('still accepts the originals', () => {
    expect(safeVaultPath('USER.md')).toMatchObject({ ok: true })
    expect(safeVaultPath('AGENTS.md')).toMatchObject({ ok: true })
  })

  it('does not open the root to anything that merely looks similar', () => {
    // The suffix has to be digits, and the stem has to be one we allow.
    expect(safeVaultPath('USER-notes.md')).toMatchObject({ ok: false, reason: 'not-synced-dir' })
    expect(safeVaultPath('SECRETS-2.md')).toMatchObject({ ok: false, reason: 'not-synced-dir' })
    expect(safeVaultPath('USER.md.bak')).toMatchObject({ ok: false })
    expect(safeVaultPath('USER-2.exe')).toMatchObject({ ok: false })
    expect(safeVaultPath('random.md')).toMatchObject({ ok: false, reason: 'not-synced-dir' })
  })

  it('matches what conflictSuffixPath actually generates', async () => {
    // A test that asserts a shape the generator does not produce guards nothing.
    const alt = await conflictSuffixPath(process.cwd(), 'USER.md')
    expect(alt).toBe('USER-2.md')
    expect(safeVaultPath(alt)).toMatchObject({ ok: true })
  })
})
