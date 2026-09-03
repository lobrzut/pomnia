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
  const SHA = 'abc123def456789000'

  it('keeps the original name so it can be recognised later', () => {
    expect(stagedNoteName('Thinking Fast and Slow.pdf', SHA)).toBe(
      'Thinking Fast and Slow__abc123def456.md',
    )
  })

  it('gives the same document the same name, so a re-import replaces it', () => {
    // Three copies of one book reached the server — empty, nine pages, and a
    // hundred and six — because the name carried the date instead of the
    // identity. Identity is the bytes.
    const a = stagedNoteName('book.pdf', SHA)
    const b = stagedNoteName('book.pdf', SHA)
    expect(a).toBe(b)
  })

  it('gives two different documents different names, even with one title', () => {
    const a = stagedNoteName('book.pdf', 'aaaaaaaaaaaaaaaa')
    const b = stagedNoteName('book.pdf', 'bbbbbbbbbbbbbbbb')
    expect(a).not.toBe(b)
  })

  it('falls back to the bare title when there is no source file', () => {
    // Conversations come out of an archive and have no bytes of their own.
    expect(stagedNoteName('Rozmowa o MCP')).toBe('Rozmowa o MCP.md')
  })

  it('replaces path characters instead of dropping them', () => {
    // Dropping would turn "a/b" and "ab" into one name.
    expect(stagedNoteName('a/b:c*d?.txt')).toBe('a-b-c-d.md')
  })

  it('strips control characters out of the name', () => {
    expect(stagedNoteName('weird.md')).toBe('weird.md')
  })

  it('never produces a name ending in a dot or space', () => {
    // Windows silently strips those, and then the file on disk is not the file
    // the manifest names.
    expect(stagedNoteName('trailing dot..pdf')).toBe('trailing dot.md')
    expect(stagedNoteName('trailing space .txt')).toBe('trailing space.md')
  })

  it('falls back to a usable name when nothing survives', () => {
    expect(stagedNoteName('///')).toBe('import.md')
    expect(stagedNoteName('')).toBe('import.md')
  })

  it('bounds the length', () => {
    expect(stagedNoteName('x'.repeat(300), SHA).length).toBeLessThanOrEqual(100)
  })
})
