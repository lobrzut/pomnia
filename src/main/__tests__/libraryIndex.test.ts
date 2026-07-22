import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => '/tmp/pomnia-userdata',
    getAppPath: () => '/tmp/pomnia-app',
  },
}))

const brainStatus = vi.fn()
const brainStart = vi.fn()
const indexDocument = vi.fn()

vi.mock('../brainCore.js', () => ({
  brainCore: {
    status: () => brainStatus(),
    start: (...args: unknown[]) => brainStart(...args),
    indexDocument: (...args: unknown[]) => indexDocument(...args),
    setSkillsRoot: vi.fn(),
    setVaultRoot: vi.fn(),
  },
}))

vi.mock('../brainPaths.js', () => ({
  brainCoreDataDir: () => '/tmp/brain-data',
  brainSkillsDir: (vault?: string | null) =>
    vault ? `${vault}/skills` : '/tmp/brain-data/vault/skills',
  brainVaultRoot: (vault?: string | null) => vault || '/tmp/brain-data/vault',
}))

const probeOllama = vi.fn()
vi.mock('../ollamaSettings.js', () => ({
  resolveOllamaUrl: (url?: string) => url || 'http://localhost:11434',
  probeOllama: (...args: unknown[]) => probeOllama(...args),
  ollamaUnreachableMessage: () => 'Ollama niedostępne',
  brainProcessFailedMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}))

vi.mock('@pomnia/doc-parser', () => ({
  parseDocument: vi.fn().mockResolvedValue({
    pages: [{ page: 1, text: 'hello' }],
    format: 'txt',
    markdown: 'hello',
    meta: { pageCount: 1, tier: 'passthrough', sparse: false },
  }),
}))

describe('ensureBrainForIndexing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    brainStatus.mockReturnValue({ running: false, starting: false })
    probeOllama.mockResolvedValue({ ok: true, baseUrl: 'http://localhost:11434' })
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
    expect(r).toEqual({ running: true, autoStarted: true, ollamaUrl: 'http://127.0.0.1:11434' })
    expect(brainStart).toHaveBeenCalledWith({
      dataDir: '/tmp/brain-data',
      ollamaUrl: 'http://127.0.0.1:11434',
      skillsRoot: '/tmp/brain-data/vault/skills',
      vaultRoot: '/tmp/brain-data/vault',
    })
  })

  it('fails gracefully when Ollama is offline', async () => {
    probeOllama.mockResolvedValue({ ok: false, baseUrl: 'http://localhost:11434', error: 'fetch failed' })
    const { ensureBrainForIndexing } = await import('../ensureBrain.js')
    const r = await ensureBrainForIndexing()
    expect(r.running).toBe(false)
    expect(r.autoStarted).toBe(false)
    expect(r.error).toMatch(/Ollama/i)
    expect(brainStart).not.toHaveBeenCalled()
  })
})

describe('indexPendingLibraryDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    brainStatus.mockReturnValue({ running: true, starting: false })
    indexDocument.mockResolvedValue({ chunks: 2 })
  })

  it('skipEnsure returns error when brain is offline', async () => {
    brainStatus.mockReturnValue({ running: false, starting: false })
    const { indexPendingLibraryDocuments } = await import('../libraryIndex.js')
    const vault = {
      getPendingIndexDocuments: () => [{ id: 'doc1', originalName: 'a.txt' }],
    }
    const r = await indexPendingLibraryDocuments(vault as never, '/vault', { skipEnsure: true })
    expect(r.indexed).toBe(0)
    expect(r.errors[0]).toMatch(/niedostępna/i)
    expect(indexDocument).not.toHaveBeenCalled()
  })

  it('skipEnsure indexes pending docs when brain runs', async () => {
    const markLibraryDocIndexed = vi.fn()
    const vault = {
      getPendingIndexDocuments: () => [{ id: 'doc1', originalName: 'a.txt' }],
      getLibraryDocument: () => ({ id: 'doc1', originalName: 'a.txt' }),
      readLibrarySource: vi.fn().mockResolvedValue(Buffer.from('hello')),
      markLibraryDocIndexed,
    }
    const { indexPendingLibraryDocuments } = await import('../libraryIndex.js')
    const r = await indexPendingLibraryDocuments(vault as never, '/vault', { skipEnsure: true })
    expect(r.indexed).toBe(1)
    expect(r.chunks).toBe(2)
    expect(markLibraryDocIndexed).toHaveBeenCalledWith('doc1')
    expect(brainStart).not.toHaveBeenCalled()
  })
})
