import { afterEach, describe, expect, it } from 'vitest'

import {
  indexAfterWrite,
  indexFailureSnapshot,
  indexOutcomeNote,
  resetIndexFailures,
} from './indexAfterWrite.js'

const never = () => new Promise<void>(() => {})

describe('indexAfterWrite', () => {
  afterEach(() => resetIndexFailures())

  it('reports indexed when the index finishes in time', async () => {
    expect(await indexAfterWrite('a.md', async () => undefined, 500)).toBe('indexed')
  })

  it('reports failed when indexing throws', async () => {
    // The case that used to go to console.error and be answered with "saved".
    const out = await indexAfterWrite('a.md', async () => { throw new Error('embedder down') }, 500)
    expect(out).toBe('failed')
  })

  it('reports pending rather than blocking on a slow index', async () => {
    // A cold model load must not hold an MCP reply open.
    const started = Date.now()
    expect(await indexAfterWrite('a.md', never, 50)).toBe('pending')
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('records a failure even when the reply already gave up waiting', async () => {
    // The race is against the clock, not against the work: a slow failure is
    // still a failure and still has to be counted, or it is invisible again.
    let boom: (e: Error) => void = () => {}
    const slow = () => new Promise<void>((_, rej) => { boom = rej })
    expect(await indexAfterWrite('late.md', slow, 20)).toBe('pending')
    boom(new Error('died later'))
    await new Promise((r) => setTimeout(r, 20))
    const snap = indexFailureSnapshot()
    expect(snap.count).toBe(1)
    expect(snap.last?.path).toBe('late.md')
    expect(snap.last?.detail).toContain('died later')
  })

  it('counts every failure, not just the last', async () => {
    for (const p of ['a.md', 'b.md']) {
      await indexAfterWrite(p, async () => { throw new Error('x') }, 200)
    }
    expect(indexFailureSnapshot().count).toBe(2)
  })

  it('starts clean', () => {
    expect(indexFailureSnapshot()).toEqual({ count: 0, last: null })
  })
})

describe('indexOutcomeNote', () => {
  it('says plainly when recall will not find the note', () => {
    const s = indexOutcomeNote('failed')
    expect(s).toContain('NOT INDEXED')
    expect(s).toContain('--reindex')
    // The agent must pass this on rather than reporting a clean save.
    expect(s).toContain('tell the user')
  })

  it('does not claim searchability while indexing is still running', () => {
    expect(indexOutcomeNote('pending')).not.toContain('will return it now')
  })

  it('claims it only when it is true', () => {
    expect(indexOutcomeNote('indexed')).toContain('search_library will return it now')
  })
})
