// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sanitizePeerLabel, SyncIntakeTracker } from './status.js'

describe('sanitizePeerLabel', () => {
  it('keeps a short token name', () => {
    expect(sanitizePeerLabel('pomnia-desktop')).toBe('pomnia-desktop')
  })

  it('keeps name@host', () => {
    expect(sanitizePeerLabel('desktop@192.168.1.10')).toBe('desktop@192.168.1.10')
  })

  it('refuses a long opaque secret-looking string', () => {
    const secret = 'a'.repeat(48)
    expect(sanitizePeerLabel(secret)).toBe('peer')
  })

  it('never returns empty', () => {
    expect(sanitizePeerLabel('')).toBe('unknown')
    expect(sanitizePeerLabel('   ')).toBe('unknown')
  })
})

describe('SyncIntakeTracker', () => {
  let warns: string[] = []

  beforeEach(() => {
    warns = []
    vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => {
      warns.push(a.map(String).join(' '))
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('starts with null lastReceivedAt — never received', () => {
    const t = new SyncIntakeTracker()
    expect(t.snapshot()).toEqual({
      lastReceivedAt: null,
      lastPeer: null,
      filesReceived: 0,
      conflicts: 0,
      archiveLastAt: null,
    })
  })

  it('counts a transfer after plan + files', () => {
    const t = new SyncIntakeTracker()
    t.beginSurfaceTransfer('desktop@10.0.0.2')
    t.recordSurfaceFile({ peer: 'desktop@10.0.0.2' })
    t.recordSurfaceFile({ peer: 'desktop@10.0.0.2' })
    const s = t.snapshot()
    expect(s.filesReceived).toBe(2)
    expect(s.lastPeer).toBe('desktop@10.0.0.2')
    expect(s.lastReceivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(s.conflicts).toBe(0)
  })

  it('counts the new transfer from one, not from the old total', () => {
    const t = new SyncIntakeTracker()
    t.beginSurfaceTransfer('a')
    t.recordSurfaceFile({ peer: 'a' })
    t.recordSurfaceFile({ peer: 'a' })
    t.beginSurfaceTransfer('b')
    t.recordSurfaceFile({ peer: 'b' })
    expect(t.snapshot().filesReceived).toBe(1)
    expect(t.snapshot().lastPeer).toBe('b')
  })

  it('a plan that delivers nothing does not erase the last real transfer', () => {
    // Found live: two instances, a real 1-file push, then an idle poll. The
    // timestamp survived and the count did not, so /healthz read "arrived at
    // 11:25, brought nothing" over a transfer that brought a file. Any client
    // polling /sync/plan erased the evidence, which is what this tracker was
    // written to stop. The two fields describe one event; they move together.
    const t = new SyncIntakeTracker()
    t.beginSurfaceTransfer('a')
    t.recordSurfaceFile({ peer: 'a' })
    const after = t.snapshot()

    t.beginSurfaceTransfer('a') // poll: nothing to send
    const polled = t.snapshot()

    expect(polled.filesReceived).toBe(1)
    expect(polled.lastReceivedAt).toBe(after.lastReceivedAt)
    expect(polled.lastReceivedAt).not.toBeNull()
  })

  it('increments conflicts, keeps recent rows, warns', () => {
    const t = new SyncIntakeTracker()
    t.recordSurfaceFile({
      peer: 'desktop',
      conflict: { kept: 'distilled/note.md', wrote: 'distilled/note-2.md' },
    })
    const s = t.snapshot()
    expect(s.conflicts).toBe(1)
    const admin = t.adminSnapshot()
    expect(admin.recentConflicts).toHaveLength(1)
    expect(admin.recentConflicts[0]).toMatchObject({
      path: 'distilled/note.md',
      wrote: 'distilled/note-2.md',
      peer: 'desktop',
    })
    expect(admin.mode).toBe('receive-only')
    expect(warns.join('\n')).toMatch(/sync conflict/)
    expect(warns.join('\n')).not.toMatch(/Bearer|token=/i)
  })

  it('records archiveLastAt separately from surface receive', () => {
    const t = new SyncIntakeTracker()
    t.recordArchive('archiver@1.2.3.4')
    const s = t.snapshot()
    expect(s.archiveLastAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(s.lastReceivedAt).toBeNull()
  })

  it('echoes peer and archiveTarget config without mixing them', () => {
    const t = new SyncIntakeTracker({
      peer: 'http://192.168.1.10:7865',
      archiveTarget: '\\\\nas\\archive',
    })
    const a = t.adminSnapshot()
    expect(a.peer).toBe('http://192.168.1.10:7865')
    expect(a.archiveTarget).toBe('\\\\nas\\archive')
    expect(a.peer).not.toBe(a.archiveTarget)
  })
})
