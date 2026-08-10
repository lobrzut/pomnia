import { afterEach, describe, expect, it, vi } from 'vitest'

import { EmbedClient } from '../src/rag/embed.js'

/**
 * nomic-embed is trained on an asymmetric pair: documents carry
 * `search_document: `, queries carry `search_query: `. This client used to send
 * bare text on the belief that Ollama's template prepended them.
 *
 * Measured against a live Ollama: cosine between "foo" and "search_document: foo"
 * is 0.92, not ~1.0 — the template adds nothing. Sending bare text collapsed the
 * query/document distinction and put every vector 0.92 away from the Python
 * brain's index, so the two could not share a library.db.
 */
function captureFetch(): ReturnType<typeof vi.fn> {
  const f = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ embeddings: [new Array(768).fill(0.01)] }),
  }))
  vi.stubGlobal('fetch', f)
  return f as unknown as ReturnType<typeof vi.fn>
}

function sentInput(f: ReturnType<typeof vi.fn>): string[] {
  const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
  return (JSON.parse(String(init.body)) as { input: string[] }).input
}

const client = (): EmbedClient =>
  new EmbedClient({ ollamaUrl: 'http://127.0.0.1:11434', embedModel: 'nomic-embed-text' })

describe('EmbedClient task prefixes', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('marks indexed text as a document', async () => {
    const f = captureFetch()
    await client().embedBatch(['a note about WireGuard'], 'document')
    expect(sentInput(f)).toEqual(['search_document: a note about WireGuard'])
  })

  it('marks a search as a query', async () => {
    const f = captureFetch()
    await client().embedOne('how do I set up WireGuard', 'query')
    expect(sentInput(f)).toEqual(['search_query: how do I set up WireGuard'])
  })

  it('prefixes every item of a batch, not just the first', async () => {
    const f = captureFetch()
    await client().embedBatch(['one', 'two', 'three'], 'document')
    expect(sentInput(f)).toEqual([
      'search_document: one',
      'search_document: two',
      'search_document: three',
    ])
  })

  it('sends the same text differently depending on kind', async () => {
    const f1 = captureFetch()
    await client().embedBatch(['same text'], 'document')
    const asDoc = sentInput(f1)
    vi.unstubAllGlobals()

    const f2 = captureFetch()
    await client().embedBatch(['same text'], 'query')
    const asQuery = sentInput(f2)

    expect(asDoc).not.toEqual(asQuery)
  })

  it('does not call Ollama at all for an empty batch', async () => {
    const f = captureFetch()
    await expect(client().embedBatch([], 'document')).resolves.toEqual([])
    expect(f).not.toHaveBeenCalled()
  })
})
