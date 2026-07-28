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
const documentChunkCounts = vi.fn()

vi.mock('../brainCore.js', () => ({
  brainCore: {
    status: () => brainStatus(),
    start: (...args: unknown[]) => brainStart(...args),
    indexDocument: (...args: unknown[]) => indexDocument(...args),
    documentChunkCounts: (...args: unknown[]) => documentChunkCounts(...args),
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
  pagesFromExtractedMarkdown: vi.fn().mockReturnValue(null),
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
  }, 30_000)

  it('auto-starts brain when Ollama is reachable', async () => {
    const { ensureBrainForIndexing } = await import('../ensureBrain.js')
    const r = await ensureBrainForIndexing('http://127.0.0.1:11434')
    expect(r).toEqual({ running: true, autoStarted: true, ollamaUrl: 'http://127.0.0.1:11434' })
    expect(brainStart).toHaveBeenCalledWith({
      dataDir: '/tmp/brain-data',
      ollamaUrl: 'http://127.0.0.1:11434',
      skillsRoot: '/tmp/brain-data/vault/skills',
      vaultRoot: '/tmp/brain-data/vault',
      autoCheckpointEnabled: true,
      handshakeEnabled: true,
      handshakePhrase: 'OK to Go Go Go',
    })
  }, 30_000)

  it('fails gracefully when Ollama is offline', async () => {
    probeOllama.mockResolvedValue({ ok: false, baseUrl: 'http://localhost:11434', error: 'fetch failed' })
    const { ensureBrainForIndexing } = await import('../ensureBrain.js')
    const r = await ensureBrainForIndexing()
    expect(r.running).toBe(false)
    expect(r.autoStarted).toBe(false)
    expect(r.error).toMatch(/Ollama/i)
    expect(brainStart).not.toHaveBeenCalled()
  }, 30_000)
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
  }, 30_000)

  it('skipEnsure indexes pending docs when brain runs', async () => {
    const markLibraryDocIndexed = vi.fn()
    const vault = {
      getPendingIndexDocuments: () => [{ id: 'doc1', originalName: 'a.txt' }],
      getLibraryDocument: () => ({ id: 'doc1', originalName: 'a.txt' }),
      readLibrarySource: vi.fn().mockResolvedValue(Buffer.from('hello')),
      readLibraryExtracted: vi.fn().mockResolvedValue(Buffer.from('')),
      markLibraryDocIndexed,
    }
    const { indexPendingLibraryDocuments } = await import('../libraryIndex.js')
    const r = await indexPendingLibraryDocuments(vault as never, '/vault', { skipEnsure: true })
    expect(r.indexed).toBe(1)
    expect(r.chunks).toBe(2)
    expect(markLibraryDocIndexed).toHaveBeenCalledWith('doc1')
    expect(brainStart).not.toHaveBeenCalled()
  }, 30_000)
})

describe('reconcileLibraryIndexConsistency', () => {
  it('marks pendingIndex=false docs with zero chunks as pending', async () => {
    const setLibraryDocPendingIndex = vi.fn()
    const vault = {
      getLibraryManifest: () => ({
        documents: [
          { id: 'epub-a', originalName: 'Shannon.epub', pendingIndex: false, indexedAt: '2026-07-01' },
          { id: 'epub-b', originalName: 'Other.epub', pendingIndex: false, indexedAt: '2026-07-01' },
          { id: 'ok', originalName: 'ok.txt', pendingIndex: false, indexedAt: '2026-07-01' },
          { id: 'already', originalName: 'pend.txt', pendingIndex: true },
        ],
      }),
      setLibraryDocPendingIndex,
    }
    const counts: Record<string, number> = {
      '/vault/library/epub-a': 0,
      '/vault/library/epub-b': 0,
      '/vault/library/ok': 12,
    }
    const { reconcileLibraryIndexConsistency } = await import('../libraryIndex.js')
    const r = await reconcileLibraryIndexConsistency(vault as never, '/vault', {
      countChunks: (p) => counts[p] ?? 0,
    })
    expect(r.repaired.sort()).toEqual(['epub-a', 'epub-b'])
    expect(setLibraryDocPendingIndex).toHaveBeenCalledWith('epub-a', true)
    expect(setLibraryDocPendingIndex).toHaveBeenCalledWith('epub-b', true)
    expect(setLibraryDocPendingIndex).not.toHaveBeenCalledWith('ok', true)
    expect(setLibraryDocPendingIndex).not.toHaveBeenCalledWith('already', true)
  }, 30_000)

  it('reconcile + pending flush indexes repaired docs', async () => {
    const markLibraryDocIndexed = vi.fn()
    const setLibraryDocPendingIndex = vi.fn(async (id: string, pending: boolean) => {
      doc.pendingIndex = pending
      if (pending) delete doc.indexedAt
    })
    const doc: {
      id: string
      originalName: string
      pendingIndex?: boolean
      indexedAt?: string
    } = {
      id: 'shannon',
      originalName: 'Shannon.epub',
      pendingIndex: false,
      indexedAt: '2026-07-15T00:00:00.000Z',
    }
    const vault = {
      getLibraryManifest: () => ({ documents: [doc] }),
      getPendingIndexDocuments: () => (doc.pendingIndex ? [doc] : []),
      getLibraryDocument: () => doc,
      setLibraryDocPendingIndex,
      readLibrarySource: vi.fn().mockResolvedValue(Buffer.from('shannon text')),
      readLibraryExtracted: vi.fn().mockResolvedValue(Buffer.from('')),
      markLibraryDocIndexed,
    }

    const { reconcileLibraryIndexConsistency, indexPendingLibraryDocuments } = await import(
      '../libraryIndex.js'
    )
    const repaired = await reconcileLibraryIndexConsistency(vault as never, '/vault', {
      countChunks: () => 0,
    })
    expect(repaired.repaired).toEqual(['shannon'])
    expect(doc.pendingIndex).toBe(true)

    brainStatus.mockReturnValue({ running: true, starting: false })
    indexDocument.mockResolvedValue({ chunks: 2 })
    const flush = await indexPendingLibraryDocuments(vault as never, '/vault', { skipEnsure: true })
    expect(flush.indexed).toBe(1)
    expect(flush.chunks).toBe(2)
    expect(markLibraryDocIndexed).toHaveBeenCalledWith('shannon')
  }, 30_000)
})
