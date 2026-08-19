import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAppSettings = vi.fn()

vi.mock('../appSettings.js', () => ({
  getAppSettings,
}))

vi.mock('../ollamaRelay.js', () => ({
  needsOllamaRelay: (url: string) => !/127\.0\.0\.1|localhost/i.test(url),
  ensureOllamaTransportUrl: async (url: string) =>
    /127\.0\.0\.1|localhost/i.test(url) ? url : 'http://127.0.0.1:18765',
  OLLAMA_RELAY_URL: 'http://127.0.0.1:18765',
  OLLAMA_RELAY_PORT: 18765,
}))

vi.mock('@core/brain/ollama.js', () => ({
  defaultOllamaConfig: () => ({
    baseUrl: 'http://127.0.0.1:11434',
    chatModel: 'qwen',
    embedModel: 'nomic-embed-text',
  }),
}))

describe('resolveOllamaUrl', () => {
  beforeEach(() => {
    vi.resetModules()
    getAppSettings.mockReturnValue({})
  })

  it('prefers explicit IPC argument', async () => {
    const { resolveOllamaUrl } = await import('../ollamaSettings.js')
    expect(resolveOllamaUrl('http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434')
  })

  it('falls back to saved app settings including LAN', async () => {
    getAppSettings.mockReturnValue({ ollamaUrl: 'http://192.168.1.201:11434' })
    const { resolveOllamaUrl } = await import('../ollamaSettings.js')
    expect(resolveOllamaUrl()).toBe('http://192.168.1.201:11434')
    expect(resolveOllamaUrl('')).toBe('http://192.168.1.201:11434')
  })

  it('defaults to 127.0.0.1 when nothing saved', async () => {
    const { resolveOllamaUrl } = await import('../ollamaSettings.js')
    expect(resolveOllamaUrl()).toBe('http://127.0.0.1:11434')
  })
})

describe('probeOllama', () => {
  beforeEach(() => {
    vi.resetModules()
    getAppSettings.mockReturnValue({ ollamaUrl: 'http://192.168.1.201:11434' })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ models: [{ name: 'nomic-embed-text:latest' }, { name: 'qwen2.5:14b' }] }),
      }),
    )
  })

  it('probes GET /api/tags via the loopback relay, reports the configured LAN URL', async () => {
    const { probeOllama } = await import('../ollamaSettings.js')
    const r = await probeOllama()
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('expected ok')
    expect(r.url).toBe('http://192.168.1.201:11434')
    expect(r.transport).toBe('http://127.0.0.1:18765')
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:18765/api/tags',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('returns the installed tags — reachable alone does not mean usable', async () => {
    const { probeOllama } = await import('../ollamaSettings.js')
    const r = await probeOllama()
    expect(r.ok && r.models).toEqual(['nomic-embed-text:latest', 'qwen2.5:14b'])
  })

  it('still reports up when the body cannot be parsed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('not json')
        },
      }),
    )
    const { probeOllama } = await import('../ollamaSettings.js')
    const r = await probeOllama()
    expect(r.ok).toBe(true)
    expect(r.ok && r.models).toEqual([])
  })

  it('does not treat a LAN miss as a missing Homebrew install', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')))
    const { probeOllama, ollamaUnreachableMessage } = await import('../ollamaSettings.js')
    const r = await probeOllama('http://192.168.1.201:11434')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('expected failure')
    expect(r.url).toBe('http://192.168.1.201:11434')
    expect(ollamaUnreachableMessage(r)).toMatch(/192\.168\.1\.201:11434/)
    expect(ollamaUnreachableMessage(r)).not.toMatch(/ollama\.com/)
  })
})

describe('missingEmbedModelMessage', () => {
  /**
   * The regression: the embed model was pulled after an index pass ran, so the
   * whole vault came back as 26 files with nothing but WARN lines to show why.
   */
  it('names the pull command when the embed model is absent', async () => {
    const { missingEmbedModelMessage } = await import('../ollamaSettings.js')
    expect(missingEmbedModelMessage(['qwen2.5:14b'])).toContain('ollama pull nomic-embed-text')
  })

  it('is silent when the model is installed under its :latest tag', async () => {
    const { missingEmbedModelMessage } = await import('../ollamaSettings.js')
    expect(missingEmbedModelMessage(['nomic-embed-text:latest'])).toBeNull()
  })
})
