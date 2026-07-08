import { beforeEach, describe, expect, it, vi } from 'vitest'

const brainStatus = vi.fn()
const brainStart = vi.fn()

vi.mock('../brainCore.js', () => ({
  brainCore: {
    status: () => brainStatus(),
    start: (...args: unknown[]) => brainStart(...args),
  },
}))

vi.mock('../brainPaths.js', () => ({
  brainCoreDataDir: () => '/tmp/brain-data',
}))

const probeOllama = vi.fn()
vi.mock('../ollamaSettings.js', () => ({
  resolveOllamaUrl: (u?: string) => u?.trim() || 'http://localhost:11434',
  probeOllama: (...args: unknown[]) => probeOllama(...args),
  ollamaUnreachableMessage: (p: { url: string; detail?: string }) =>
    `Ollama niedostępne pod ${p.url} (GET /api/tags${p.detail ? `: ${p.detail}` : ''})`,
  brainProcessFailedMessage: (err: unknown) =>
    `Proces wyszukiwarki nie wystartował: ${err instanceof Error ? err.message : String(err)}`,
}))

describe('ensureBrainForIndexing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    brainStatus.mockReturnValue({ running: false, starting: false })
    probeOllama.mockResolvedValue({ ok: true, url: 'http://127.0.0.1:11434' })
    brainStart.mockResolvedValue({ running: true })
  })

  it('returns immediately when brain already runs', async () => {
    brainStatus.mockReturnValue({ running: true, starting: false })
    const { ensureBrainForIndexing } = await import('../ensureBrain.js')
    const r = await ensureBrainForIndexing()
    expect(r).toEqual({ running: true, autoStarted: false, ollamaUrl: 'http://localhost:11434' })
    expect(brainStart).not.toHaveBeenCalled()
  })

  it('auto-starts brain when Ollama is reachable', async () => {
    const { ensureBrainForIndexing } = await import('../ensureBrain.js')
    const r = await ensureBrainForIndexing('http://127.0.0.1:11434')
    expect(r).toEqual({
      running: true,
      autoStarted: true,
      ollamaUrl: 'http://127.0.0.1:11434',
    })
    expect(probeOllama).toHaveBeenCalledWith('http://127.0.0.1:11434')
    expect(brainStart).toHaveBeenCalledWith({
      dataDir: '/tmp/brain-data',
      ollamaUrl: 'http://127.0.0.1:11434',
    })
  })

  it('fails gracefully when Ollama is offline', async () => {
    probeOllama.mockResolvedValue({
      ok: false,
      reason: 'unreachable',
      url: 'http://brain.example.local:11434',
      detail: 'fetch failed',
    })
    const { ensureBrainForIndexing } = await import('../ensureBrain.js')
    const r = await ensureBrainForIndexing('http://brain.example.local:11434')
    expect(r.running).toBe(false)
    expect(r.autoStarted).toBe(false)
    expect(r.error).toMatch(/Ollama niedostępne/)
    expect(r.error).toContain('/api/tags')
    expect(brainStart).not.toHaveBeenCalled()
  })

  it('distinguishes brain process failure from Ollama offline', async () => {
    brainStart.mockRejectedValue(new Error('brain-core start timeout (20s)'))
    const { ensureBrainForIndexing } = await import('../ensureBrain.js')
    const r = await ensureBrainForIndexing('http://brain.example.local:11434')
    expect(r.running).toBe(false)
    expect(r.error).toMatch(/Proces wyszukiwarki/)
    expect(r.error).not.toMatch(/Ollama niedostępne/)
  })
})
