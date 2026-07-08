import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAppSettings = vi.fn()

vi.mock('../appSettings.js', () => ({
  getAppSettings,
}))

vi.mock('@core/brain/ollama.js', () => ({
  defaultOllamaConfig: () => ({
    baseUrl: 'http://localhost:11434',
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
    expect(resolveOllamaUrl('http://brain.example.local:11434/')).toBe('http://brain.example.local:11434')
  })

  it('falls back to saved app settings', async () => {
    getAppSettings.mockReturnValue({ ollamaUrl: 'http://brain.example.local:11434' })
    const { resolveOllamaUrl } = await import('../ollamaSettings.js')
    expect(resolveOllamaUrl()).toBe('http://brain.example.local:11434')
    expect(resolveOllamaUrl('')).toBe('http://brain.example.local:11434')
  })

  it('defaults to localhost when nothing saved', async () => {
    const { resolveOllamaUrl } = await import('../ollamaSettings.js')
    expect(resolveOllamaUrl()).toBe('http://localhost:11434')
  })
})

describe('probeOllama', () => {
  beforeEach(() => {
    vi.resetModules()
    getAppSettings.mockReturnValue({ ollamaUrl: 'http://brain.example.local:11434' })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    )
  })

  it('probes GET /api/tags on resolved URL', async () => {
    const { probeOllama } = await import('../ollamaSettings.js')
    const r = await probeOllama()
    expect(r.ok).toBe(true)
    expect(fetch).toHaveBeenCalledWith(
      'http://brain.example.local:11434/api/tags',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })
})
