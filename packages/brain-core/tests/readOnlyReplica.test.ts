import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { callTool, listTools, readOnlyRefusal } from '../src/mcp/tools/index.js'

/**
 * Why a replica must refuse instead of accepting:
 *
 * Two writable brains over one corpus fork the memory silently. It already
 * happened here — the desktop vault and the Linux brain drifted to 99 files
 * present on one side only, and nothing reported it; the gap was found by
 * diffing the two by hand months later. A note written to a replica is
 * deleted by the next sync, and the agent reports success either way.
 */

const names = (ctx?: Parameters<typeof listTools>[0]): string[] => listTools(ctx).map((t) => t.name)
const desc = (ctx: Parameters<typeof listTools>[0], name: string): string =>
  listTools(ctx).find((t) => t.name === name)!.description

describe('read-only replica', () => {
  it('still advertises every tool — the catalog must not change shape', () => {
    expect(names({ readOnly: true })).toEqual(names())
  })

  it('marks every write tool as disabled in its description', () => {
    const ctx = { readOnly: true, authoritativeVaultHint: 'C:\\Vault on the desktop' }
    // memory belongs here: it writes USER.md, and a replica accepting a profile
    // edit the next sync deletes is exactly the silent fork this guards (F05).
    for (const tool of ['save_conversation', 'checkpoint_session', 'memory']) {
      const d = desc(ctx, tool)
      expect(d, tool).toContain('READ-ONLY')
      expect(d, tool).toContain('C:\\Vault on the desktop')
    }
  })

  it('leaves read tools untouched', () => {
    const ro = desc({ readOnly: true }, 'search_library')
    const rw = desc(undefined, 'search_library')
    expect(ro).toBe(rw)
  })

  it('does not claim read-only when the flag is absent or false', () => {
    for (const ctx of [undefined, { readOnly: false }]) {
      expect(desc(ctx, 'save_conversation')).not.toContain('READ-ONLY')
    }
  })

  /** The agent must tell the user, not silently drop the note. */
  it('refusal says nothing was written and names where to save', () => {
    const msg = readOnlyRefusal('desktop C:\\Vault')
    expect(msg).toContain('Nothing was written')
    expect(msg).toContain('held by desktop C:\\Vault')
    expect(msg).toMatch(/NOT saved/)
  })

  it('refusal is still explicit without a configured owner hint', () => {
    const msg = readOnlyRefusal()
    expect(msg).toContain('READ-ONLY')
    expect(msg).toContain('Nothing was written')
  })

  /**
   * checkpoint_session already had autoCheckpointEnabled. Read-only must win
   * over it: a replica refuses regardless of that setting.
   */
  it('read-only overrides autoCheckpointEnabled', () => {
    const d = desc({ readOnly: true, autoCheckpointEnabled: true }, 'checkpoint_session')
    expect(d).toContain('READ-ONLY')
  })
})

/**
 * Catalog text is not enough — the audit probe called the dispatcher and the
 * profile grew a byte. Gate must refuse before runMemory touches disk (F05).
 */
describe('read-only memory dispatcher (F05)', () => {
  let dir = ''
  let profile = ''

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = ''
  })

  it('add/replace/remove leave USER.md bytes unchanged and still allow reads', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pomnia-f05-'))
    profile = join(dir, 'USER.md')
    const initial = '# fixture\n\n§ PROFIL\n· keep me\n'
    writeFileSync(profile, initial, 'utf8')

    const ctx = {
      readOnly: true as const,
      userMdPath: profile,
      vaultRoot: dir,
      autoCheckpointEnabled: false,
      authoritativeVaultHint: 'desktop fixture',
    }

    for (const args of [
      { action: 'add', category: 'user', content: 'Fixture preference: concise prose.' },
      { action: 'replace', category: 'user', content: 'replace must not land', match: 'keep' },
      { action: 'remove', category: 'user', match: 'keep' },
    ]) {
      const out = await callTool('memory', args, ctx)
      expect(out).toContain('Nothing was written')
      expect(readFileSync(profile, 'utf8')).toBe(initial)
    }

    const profileText = await callTool('get_user_profile', {}, ctx)
    expect(profileText).toContain('keep me')
    expect(readFileSync(profile, 'utf8')).toBe(initial)
  })
})
