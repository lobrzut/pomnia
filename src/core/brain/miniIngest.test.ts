import { describe, expect, it, vi } from 'vitest'

import { pushStagedNotes, stagedNoteName } from './miniIngest.js'

const okSync = vi.fn(async () => ({
  uploaded: 2,
  unchanged: 0,
  failed: [],
  errors: [],
  extraOnReplica: [],
})) as never

describe('pushStagedNotes', () => {
  it('sends the staging root to the server', async () => {
    const sync = vi.fn(async () => ({
      uploaded: 2,
      unchanged: 1,
      failed: [],
      errors: [],
      extraOnReplica: [],
    }))
    const r = await pushStagedNotes({
      stagingRoot: 'C:/stage',
      target: 'http://brain:7865',
      adminToken: 'btk_admin',
      staged: 2,
      syncImpl: sync as never,
    })
    expect(r.ok).toBe(true)
    expect(sync).toHaveBeenCalledWith(
      expect.objectContaining({
        vaultRoot: 'C:/stage',
        target: 'http://brain:7865',
        token: 'btk_admin',
      }),
    )
  })

  it('separates the three reasons it will not send', async () => {
    // Each one is a different thing for the person to do next: fill in the
    // address, paste an admin token, or look at why the parse produced nothing.
    const base = {
      stagingRoot: 'C:/stage',
      target: 'http://brain:7865',
      adminToken: 'btk',
      staged: 1,
      syncImpl: okSync,
    }
    expect(await pushStagedNotes({ ...base, target: '  ' }).then((r) => !r.ok && r.reason)).toBe(
      'no-target',
    )
    expect(await pushStagedNotes({ ...base, adminToken: '' }).then((r) => !r.ok && r.reason)).toBe(
      'no-token',
    )
    expect(await pushStagedNotes({ ...base, staged: 0 }).then((r) => !r.ok && r.reason)).toBe(
      'nothing-staged',
    )
  })

  it('never calls the server when a precondition fails', async () => {
    const sync = vi.fn()
    await pushStagedNotes({ stagingRoot: 'C:/s', target: '', staged: 5, syncImpl: sync as never })
    await pushStagedNotes({
      stagingRoot: 'C:/s',
      target: 'http://b',
      staged: 5,
      syncImpl: sync as never,
    })
    await pushStagedNotes({
      stagingRoot: 'C:/s',
      target: 'http://b',
      adminToken: 'x',
      staged: 0,
      syncImpl: sync as never,
    })
    expect(sync).not.toHaveBeenCalled()
  })

  it('reports a thrown sync as a failure rather than letting it escape', async () => {
    const sync = vi.fn(async () => {
      throw new Error('connection refused')
    })
    const r = await pushStagedNotes({
      stagingRoot: 'C:/s',
      target: 'http://b',
      adminToken: 'x',
      staged: 1,
      syncImpl: sync as never,
    })
    expect(r).toEqual({ ok: false, reason: 'failed', detail: 'connection refused' })
  })
})

describe('stagedNoteName', () => {
  const when = new Date('2026-09-02T10:00:00Z')

  it('keeps the original name so it can be recognised later', () => {
    expect(stagedNoteName('Thinking Fast and Slow.pdf', when)).toBe(
      '2026-09-02_Thinking Fast and Slow.md',
    )
  })

  it('dates it, so re-importing does not silently overwrite', () => {
    const a = stagedNoteName('book.pdf', new Date('2026-09-02T00:00:00Z'))
    const b = stagedNoteName('book.pdf', new Date('2026-09-03T00:00:00Z'))
    expect(a).not.toBe(b)
  })

  it('replaces path characters instead of dropping them', () => {
    // Dropping would turn "a/b" and "ab" into one name.
    expect(stagedNoteName('a/b:c*d?.txt', when)).toBe('2026-09-02_a-b-c-d.md')
  })

  it('strips control characters out of the name', () => {
    expect(stagedNoteName('we\u0007ird.md', when)).toBe('2026-09-02_weird.md')
  })

  it('never produces a name ending in a dot or space', () => {
    // Windows silently strips those, and then the file on disk is not the file
    // the manifest names.
    expect(stagedNoteName('trailing dot..pdf', when)).toBe('2026-09-02_trailing dot.md')
    expect(stagedNoteName('trailing space .txt', when)).toBe('2026-09-02_trailing space.md')
  })

  it('falls back to a usable name when nothing survives', () => {
    expect(stagedNoteName('///', when)).toBe('2026-09-02_import.md')
    expect(stagedNoteName('', when)).toBe('2026-09-02_import.md')
  })

  it('bounds the length', () => {
    expect(stagedNoteName('x'.repeat(300), when).length).toBeLessThanOrEqual(95)
  })
})
