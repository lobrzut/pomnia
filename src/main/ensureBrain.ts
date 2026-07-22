import { brainCore } from './brainCore.js'
import { brainCoreDataDir, brainSkillsDir, brainVaultRoot } from './brainPaths.js'
import {
  brainProcessFailedMessage,
  ollamaUnreachableMessage,
  probeOllama,
  resolveOllamaUrl,
} from './ollamaSettings.js'

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
  ollamaUrl?: string
}

function applyPortableRoots(encryptedVaultPath?: string | null): void {
  if (!encryptedVaultPath) return
  brainCore.setSkillsRoot(brainSkillsDir(encryptedVaultPath))
  brainCore.setVaultRoot(brainVaultRoot(encryptedVaultPath))
}

/** Start embedded brain when Ollama is reachable and brain is not already running. */
export async function ensureBrainForIndexing(
  ollamaUrl?: string,
  onProgress?: (e: EnsureBrainProgress) => void,
  /** Open encrypted vault path — skills + knowledge live as plaintext sidecars. */
  encryptedVaultPath?: string | null,
): Promise<EnsureBrainResult> {
  const baseUrl = resolveOllamaUrl(ollamaUrl)
  const skillsRoot = brainSkillsDir(encryptedVaultPath)
  const vaultRoot = brainVaultRoot(encryptedVaultPath)
  const status = brainCore.status()
  if (status.running) {
    applyPortableRoots(encryptedVaultPath)
    return { running: true, autoStarted: false, ollamaUrl: baseUrl }
  }
  if (status.starting) {
    onProgress?.({ phase: 'brain-start', done: 0, total: 1, detail: 'czekam…' })
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500))
      if (brainCore.status().running) {
        applyPortableRoots(encryptedVaultPath)
        return { running: true, autoStarted: false, ollamaUrl: baseUrl }
      }
    }
    return {
      running: false,
      autoStarted: false,
      ollamaUrl: baseUrl,
      error: 'Uruchamianie wyszukiwarki trwa zbyt długo',
    }
  }

  onProgress?.({ phase: 'brain-start', done: 0, total: 1, detail: 'sprawdzam Ollama…' })
  const probe = await probeOllama(baseUrl)
  if (!probe.ok) {
    return {
      running: false,
      autoStarted: false,
      ollamaUrl: baseUrl,
      error: ollamaUnreachableMessage(probe),
    }
  }

  onProgress?.({ phase: 'brain-start', done: 0, total: 1, detail: 'uruchamiam…' })
  try {
    await brainCore.start({
      dataDir: brainCoreDataDir(),
      ollamaUrl: baseUrl,
      skillsRoot,
      vaultRoot,
    })
    onProgress?.({ phase: 'brain-start', done: 1, total: 1 })
    return { running: true, autoStarted: true, ollamaUrl: baseUrl }
  } catch (err) {
    return {
      running: false,
      autoStarted: false,
      ollamaUrl: baseUrl,
      error: brainProcessFailedMessage(err),
    }
  }
}
