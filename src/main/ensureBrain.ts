import { Ollama, defaultOllamaConfig } from '@core/brain/ollama.js'
import { brainCore } from './brainCore.js'
import { brainCoreDataDir } from './brainPaths.js'

export type EnsureBrainProgress = {
  phase: string
  done: number
  total: number
  detail?: string
}

export interface EnsureBrainResult {
  running: boolean
  autoStarted: boolean
  error?: string
}

/** Start embedded brain when Ollama is reachable and brain is not already running. */
export async function ensureBrainForIndexing(
  ollamaUrl?: string,
  onProgress?: (e: EnsureBrainProgress) => void,
): Promise<EnsureBrainResult> {
  const status = brainCore.status()
  if (status.running) return { running: true, autoStarted: false }
  if (status.starting) {
    onProgress?.({ phase: 'brain-start', done: 0, total: 1, detail: 'czekam…' })
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500))
      if (brainCore.status().running) return { running: true, autoStarted: false }
    }
    return { running: false, autoStarted: false, error: 'Uruchamianie wyszukiwarki trwa zbyt długo' }
  }

  const baseUrl = ollamaUrl || defaultOllamaConfig().baseUrl
  const ollama = new Ollama({ ...defaultOllamaConfig(), baseUrl })
  if (!(await ollama.reachable())) {
    return { running: false, autoStarted: false, error: 'Ollama niedostępne — uruchom model lokalnie' }
  }

  onProgress?.({ phase: 'brain-start', done: 0, total: 1, detail: 'uruchamiam…' })
  try {
    await brainCore.start({ dataDir: brainCoreDataDir(), ollamaUrl: baseUrl })
    onProgress?.({ phase: 'brain-start', done: 1, total: 1 })
    return { running: true, autoStarted: true }
  } catch (err) {
    return {
      running: false,
      autoStarted: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
