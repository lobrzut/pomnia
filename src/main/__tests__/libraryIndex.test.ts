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

const reachable = vi.fn()
vi.mock('@core/brain/ollama.js', () => ({
  defaultOllamaConfig: () => ({
    baseUrl: 'http://localhost:11434',
    chatModel: 'qwen',
    embedModel: 'nomic-embed-text',
  }),
  Ollama: vi.fn().mockImplementation(() => ({
    reachable,
  })),
}))

describe('ensureBrainForIndexing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    brainStatus.mockReturnValue({ running: false, starting: false })
    reachable.mockResolvedValue(true)
    brainStart.mockResolvedValue({ running: true })
  })

  it('returns immediately when brain already runs', async () => {
    brainStatus.mockReturnValue({ running: true, starting: false })
    const { ensureBrainForIndexing } = await import('../ensureBrain.js')
    const r = await ensureBrainForIndexing()
    expect(r).toEqual({ running: true, autoStarted: false })
    expect(brainStart).not.toHaveBeenCalled()
  })

  it('auto-starts brain when Ollama is reachable', async () => {
    const { ensureBrainForIndexing } = await import('../ensureBrain.js')
    const r = await ensureBrainForIndexing('http://127.0.0.1:11434')
    expect(r).toEqual({ running: true, autoStarted: true })
    expect(brainStart).toHaveBeenCalledWith({
      dataDir: '/tmp/brain-data',
      ollamaUrl: 'http://127.0.0.1:11434',
    })
  })

  it('fails gracefully when Ollama is offline', async () => {
    reachable.mockResolvedValue(false)
    const { ensureBrainForIndexing } = await import('../ensureBrain.js')
    const r = await ensureBrainForIndexing()
    expect(r.running).toBe(false)
    expect(r.autoStarted).toBe(false)
    expect(r.error).toMatch(/Ollama/i)
    expect(brainStart).not.toHaveBeenCalled()
  })
})
