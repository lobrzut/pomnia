import { afterEach, describe, expect, it, vi } from 'vitest'

import { EmbedClient, embedModelMatches } from '../src/rag/embed.js'

function tagsResponse(names: string[]): Response {
  return {
    ok: true,
    json: async () => ({ models: names.map((name) => ({ name })) }),
  } as unknown as Response
}

describe('embedModelMatches', () => {
  it('treats a bare name as the :latest tag', () => {
    expect(embedModelMatches('nomic-embed-text:latest', 'nomic-embed-text')).toBe(true)
    expect(embedModelMatches('nomic-embed-text', 'nomic-embed-text')).toBe(true)
  })

  it('does not let :latest satisfy an explicitly pinned tag', () => {
    expect(embedModelMatches('nomic-embed-text:latest', 'nomic-embed-text:v1.5')).toBe(false)
  })

  it('does not match a different model that shares a prefix', () => {
    expect(embedModelMatches('nomic-embed-text-v2:latest', 'nomic-embed-text')).toBe(false)
  })
})

describe('EmbedClient.preflight', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('passes when Ollama serves the model', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => tagsResponse(['qwen2.5:14b', 'nomic-embed-text:latest'])))
    const c = new EmbedClient({ ollamaUrl: 'http://127.0.0.1:11434', embedModel: 'nomic-embed-text' })
    await expect(c.preflight()).resolves.toBeUndefined()
  })

  /**
   * The regression this guards: the model was pulled *after* an index pass ran,
   * so every embed 404'd, the pass "finished", and a 1900-note vault was
   * reported as 26 files indexed.
   */
  it('names the exact pull command when the model is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => tagsResponse(['qwen2.5:14b'])))
    const c = new EmbedClient({ ollamaUrl: 'http://127.0.0.1:11434', embedModel: 'nomic-embed-text' })
    await expect(c.preflight()).rejects.toThrow('ollama pull nomic-embed-text')
  })

  it('reports the URL it could not reach rather than a bare failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
    )
    const c = new EmbedClient({ ollamaUrl: 'http://127.0.0.1:11434', embedModel: 'nomic-embed-text' })
    await expect(c.preflight()).rejects.toThrow(/unreachable at http:\/\/127\.0\.0\.1:11434/)
  })

  it('treats a non-OK /api/tags as unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response))
    const c = new EmbedClient({ ollamaUrl: 'http://127.0.0.1:11434', embedModel: 'nomic-embed-text' })
    await expect(c.preflight()).rejects.toThrow(/unreachable/)
  })
})
