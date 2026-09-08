import { describe, expect, it } from 'vitest'

import { VaultFreshness, freshnessReminder, hashContent } from './vaultFreshness.js'

const H = hashContent

describe('VaultFreshness — the three-agents case', () => {
  it('fires when a served note changed on disk, and names how long ago', () => {
    const f = new VaultFreshness()
    const t0 = 1_000_000
    f.served_('sprawa/rustyrat-CIT8', 'stara treść', t0)
    // Six minutes later, another agent (or a replica) has rewritten it.
    const notices = f.check(new Map([['sprawa/rustyrat-CIT8', H('nowa treść')]]), t0 + 6 * 60_000)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ label: 'sprawa/rustyrat-CIT8', minutesAgo: 6 })
  })

  it('says nothing when the note is unchanged', () => {
    const f = new VaultFreshness()
    f.served_('sesja/x', 'treść', 1000)
    expect(f.check(new Map([['sesja/x', H('treść')]]), 5 * 60_000)).toEqual([])
  })

  it('says nothing about a note the server never served', () => {
    const f = new VaultFreshness()
    // The agent never read this one, so a change to it is not its problem.
    expect(f.check(new Map([['sprawa/inna', H('cokolwiek')]]), 5 * 60_000)).toEqual([])
  })

  it('fires once per change, not on every later call', () => {
    const f = new VaultFreshness()
    f.served_('sprawa/x', 'v1', 0)
    const now = 5 * 60_000
    const first = f.check(new Map([['sprawa/x', H('v2')]]), now)
    expect(first).toHaveLength(1)
    // Same changed content, a later call past the cooldown: baseline advanced,
    // so nothing new to report.
    const second = f.check(new Map([['sprawa/x', H('v2')]]), now + 5 * 60_000)
    expect(second).toEqual([])
  })

  it('fires again when the note changes a second time', () => {
    const f = new VaultFreshness()
    f.served_('sprawa/x', 'v1', 0)
    f.check(new Map([['sprawa/x', H('v2')]]), 5 * 60_000)
    const third = f.check(new Map([['sprawa/x', H('v3')]]), 20 * 60_000)
    expect(third).toHaveLength(1)
  })

  it('holds its tongue during the cooldown', () => {
    const f = new VaultFreshness()
    f.served_('a', 'v1', 0)
    f.served_('b', 'v1', 0)
    // Two notes change; the first notice fires, the second is inside cooldown.
    const first = f.check(new Map([['a', H('v2')]]), 5 * 60_000)
    expect(first).toHaveLength(1)
    const soon = f.check(new Map([['b', H('v2')]]), 5 * 60_000 + 30_000)
    expect(soon).toEqual([])
  })

  it('a fresh read resets the baseline — the process-global limit, made explicit', () => {
    const f = new VaultFreshness()
    f.served_('sprawa/x', 'v1', 0)
    // A second agent reads the current version; the server re-serves v2.
    f.served_('sprawa/x', 'v2', 60_000)
    // Now on-disk is v2, matching the latest serve, so no notice. The first
    // agent's stale view is invisible to a server with no per-agent identity.
    expect(f.check(new Map([['sprawa/x', H('v2')]]), 5 * 60_000)).toEqual([])
  })

  it('keeps only the most recently served notes', () => {
    const f = new VaultFreshness()
    for (let i = 0; i < 40; i++) f.served_(`n${i}`, 'v', i)
    const tracked = f.trackedLabels()
    expect(tracked.length).toBeLessThanOrEqual(32)
    // The oldest were dropped; the newest kept.
    expect(tracked).toContain('n39')
    expect(tracked).not.toContain('n0')
  })
})

describe('freshnessReminder', () => {
  it('is null when there is nothing to say', () => {
    expect(freshnessReminder([])).toBeNull()
  })

  it('names the note and tells the agent to re-read', () => {
    const r = freshnessReminder([{ label: 'sprawa/x', minutesAgo: 8 }])
    expect(r).toContain('sprawa/x')
    expect(r).toContain('re-read')
  })
})
