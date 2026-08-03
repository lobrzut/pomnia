import { describe, expect, it } from 'vitest'

import { listTools, readOnlyRefusal } from '../src/mcp/tools/index.js'

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

  it('marks both write tools as disabled in their descriptions', () => {
    const ctx = { readOnly: true, authoritativeVaultHint: 'C:\\Vault on the desktop' }
    for (const tool of ['save_conversation', 'checkpoint_session']) {
      const d = desc(ctx, tool)
      expect(d).toContain('READ-ONLY')
      expect(d).toContain('C:\\Vault on the desktop')
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
    expect(msg).toContain('desktop C:\\Vault')
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
