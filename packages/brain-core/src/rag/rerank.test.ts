import { describe, expect, it } from 'vitest'

import { createReranker, noReranker, DEFAULT_BATCH, DEFAULT_CANDIDATES } from './rerank.js'

/**
 * These cover the promise the module makes, which is not "ranks well" — that is
 * measured against LoCoMo, not asserted here — but **never makes search worse
 * than not having it**. A reranker that throws, hangs, or cannot find its model
 * has to come out the far side as the order the retriever already chose.
 */

const docs = [
  { id: 'a', text: 'alpha' },
  { id: 'b', text: 'beta' },
  { id: 'c', text: 'gamma' },
]

describe('noReranker', () => {
  it('hands back exactly what it was given', async () => {
    const r = noReranker()
    expect(await r.rerank('q', docs)).toEqual(docs)
    expect(r.available).toBe(false)
  })
})

describe('createReranker — failure is never allowed to lose results', () => {
  it('returns the retrieval order when the model cannot load', async () => {
    const r = createReranker({ modelId: 'this-model-does-not-exist/nope' })
    const out = await r.rerank('q', docs)
    expect(out).toEqual(docs)
  })

  it('marks itself unavailable after the load fails, so it stops retrying', async () => {
    // Retrying a missing model would turn every search into a failed download.
    const r = createReranker({ modelId: 'this-model-does-not-exist/nope' })
    await r.rerank('q', docs)
    expect(r.available).toBe(false)
  })

  it('does not call the model at all for a single result', async () => {
    // Nothing to reorder, so nothing to pay for.
    const r = createReranker({ modelId: 'this-model-does-not-exist/nope' })
    const one = [docs[0]]
    expect(await r.rerank('q', one)).toBe(one)
    // Never loaded, so never proven dead.
    expect(r.available).toBe(true)
  })

  it('passes an empty list straight through', async () => {
    const r = createReranker({ modelId: 'this-model-does-not-exist/nope' })
    expect(await r.rerank('q', [])).toEqual([])
  })
})

describe('measured defaults', () => {
  it('scores one pair at a time', () => {
    // Batching was slower on real chunks — padding to the longest row in each
    // batch costs more than the per-call overhead it saves. 1425 ms vs 1161 ms.
    expect(DEFAULT_BATCH).toBe(1)
  })

  it('fetches fifteen candidates, where the recall curve bends', () => {
    // 10 → +5.3pp / 524 ms, 15 → +7.6pp / 727 ms, 25 → +8.9pp / 1161 ms.
    expect(DEFAULT_CANDIDATES).toBe(15)
  })
})
