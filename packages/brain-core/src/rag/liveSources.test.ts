import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { keepLiveSources } from './liveSources.js'

describe('keepLiveSources', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pomnia-live-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  async function note(name: string): Promise<string> {
    const p = join(dir, name)
    await writeFile(p, '# note')
    return p
  }

  it('drops a hit whose note was deleted', async () => {
    // The failure this exists for: the chunk is real and on topic, and the
    // file it came from is gone. Nothing downstream can tell.
    const kept = await note('kept.md')
    const r = await keepLiveSources([{ path: kept }, { path: join(dir, 'deleted.md') }])
    expect(r.live.map((h) => h.path)).toEqual([kept])
    expect(r.missing).toEqual([join(dir, 'deleted.md')])
  })

  it('preserves rank order of the survivors', async () => {
    // Callers rely on search order; filtering must not reshuffle it.
    const a = await note('a.md')
    const b = await note('b.md')
    const c = await note('c.md')
    const r = await keepLiveSources([
      { path: a },
      { path: join(dir, 'gone-1.md') },
      { path: b },
      { path: join(dir, 'gone-2.md') },
      { path: c },
    ])
    expect(r.live.map((h) => h.path)).toEqual([a, b, c])
    expect(r.missing).toHaveLength(2)
  })

  it('keeps every hit when nothing is missing', async () => {
    const a = await note('a.md')
    const r = await keepLiveSources([{ path: a }])
    expect(r.live).toHaveLength(1)
    expect(r.missing).toEqual([])
  })

  it('can empty the result set — that is the honest answer', async () => {
    const r = await keepLiveSources([{ path: join(dir, 'x.md') }, { path: join(dir, 'y.md') }])
    expect(r.live).toEqual([])
    expect(r.missing).toHaveLength(2)
  })

  it('carries the whole hit through, not just the path', async () => {
    const a = await note('a.md')
    const r = await keepLiveSources([{ path: a, score: 0.9, text: 'body' }])
    expect(r.live[0]).toEqual({ path: a, score: 0.9, text: 'body' })
  })

  it('handles an empty input without touching the disk', async () => {
    expect(await keepLiveSources([])).toEqual({ live: [], missing: [] })
  })
})
