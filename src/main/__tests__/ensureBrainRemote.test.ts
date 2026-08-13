import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/pomnia-test' } }))

let settings: { brainTarget?: 'embedded' | 'remote'; brainMcpUrl?: string; uiLocale?: 'pl' | 'en' } = {}
vi.mock('../appSettings.js', () => ({ getAppSettings: () => settings }))

const started = vi.fn()
vi.mock('../brainCore.js', () => ({
  brainCore: {
    status: () => ({ running: false, starting: false }),
    start: started,
    setSkillsRoot: vi.fn(),
    setVaultRoot: vi.fn(),
  },
}))

const probe = vi.fn(async () => ({ ok: true, url: 'http://127.0.0.1:11434', models: [] }))
vi.mock('../ollamaSettings.js', () => ({
  resolveOllamaUrl: (u?: string) => u ?? 'http://127.0.0.1:11434',
  probeOllama: (...a: unknown[]) => probe(...(a as [])),
  ollamaUnreachableMessage: () => 'ollama unreachable',
  brainProcessFailedMessage: (e: unknown) => String(e),
}))

const load = async (): Promise<typeof import('../ensureBrain.js')> => {
  vi.resetModules()
  return import('../ensureBrain.js')
}

beforeEach(() => {
  settings = {}
  started.mockClear()
  probe.mockClear()
})

/**
 * With Pomnia pointed at a server, the desktop used to start its own brain-core
 * anyway and index into a local library.db that no agent queries. Importing a
 * document reported success, the counters moved, and nothing could find it.
 *
 * That is the failure this project keeps meeting from a new angle: the work
 * happened, the numbers were real, and they described a place nobody was
 * looking.
 */
describe('indexing when the brain is on a server', () => {
  it('does not start a local brain', async () => {
    settings = { brainTarget: 'remote', brainMcpUrl: 'http://192.168.1.201:7865' }
    const { ensureBrainForIndexing } = await load()
    const r = await ensureBrainForIndexing()
    expect(r.running).toBe(false)
    expect(started).not.toHaveBeenCalled()
  })

  it('names the server in the refusal, so the message is actionable', async () => {
    settings = { brainTarget: 'remote', brainMcpUrl: 'http://192.168.1.201:7865' }
    const { ensureBrainForIndexing } = await load()
    const r = await ensureBrainForIndexing()
    expect(r.error).toContain('192.168.1.201:7865')
  })

  /** Refusing before the probe: there is nothing to ask Ollama about. */
  it('does not even probe Ollama', async () => {
    settings = { brainTarget: 'remote', brainMcpUrl: 'http://srv:7865' }
    const { ensureBrainForIndexing } = await load()
    await ensureBrainForIndexing()
    expect(probe).not.toHaveBeenCalled()
  })

  it('still starts the local brain in local mode', async () => {
    settings = { brainTarget: 'embedded' }
    const { ensureBrainForIndexing } = await load()
    await ensureBrainForIndexing()
    expect(started).toHaveBeenCalled()
  })

  /** An unset target is local — the setting arrived after the feature did. */
  it('treats an absent target as local', async () => {
    settings = {}
    const { ensureBrainForIndexing } = await load()
    await ensureBrainForIndexing()
    expect(started).toHaveBeenCalled()
  })
})
