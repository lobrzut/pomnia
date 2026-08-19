// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { brainCore } from './brainCore.js'
import { brainCoreDataDir, brainSkillsDir, brainVaultRoot } from './brainPaths.js'
import { getAppSettings } from './appSettings.js'
import { getHandshakePhrase, isHandshakeEnabled } from './handshake.js'
import { m } from './mainStrings.js'
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

  /**
   * Refuse to build a second index when the brain lives on a server.
   *
   * This used to start the local brain-core regardless of the configured
   * target, so with Pomnia pointed at a server the desktop quietly indexed into
   * its own library.db — a database no agent ever queries. Importing a document
   * reported success, the counters moved, and the document was invisible to
   * every client. Two indexes over one corpus is the waste; an index nobody
   * reads reporting success is the bug.
   *
   * Saying so is the whole fix here. Sending documents to a server is a
   * capability that does not exist yet — the daemon exposes no import route —
   * and pretending otherwise is what got us here.
   */
  const settings = getAppSettings()
  if ((settings.brainTarget ?? 'embedded') === 'remote') {
    const url = settings.brainMcpUrl?.trim() || 'remote'
    return { running: false, autoStarted: false, ollamaUrl: baseUrl, error: m().indexingIsRemote(url) }
  }

  const skillsRoot = brainSkillsDir(encryptedVaultPath)
  const vaultRoot = brainVaultRoot(encryptedVaultPath)
  const status = brainCore.status()
  if (status.running) {
    applyPortableRoots(encryptedVaultPath)
    return { running: true, autoStarted: false, ollamaUrl: baseUrl }
  }
  if (status.starting) {
    onProgress?.({ phase: 'brain-start', done: 0, total: 1, detail: 'czekam…' })
    // Match brainCore START_TIMEOUT_MS (45s) + small buffer.
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 500))
      if (brainCore.status().running) {
        applyPortableRoots(encryptedVaultPath)
        return { running: true, autoStarted: false, ollamaUrl: baseUrl }
      }
      if (!brainCore.status().starting && !brainCore.status().running) break
    }
    return {
      running: false,
      autoStarted: false,
      ollamaUrl: baseUrl,
      error: brainCore.status().lastError || m().brainStartTooLong,
    }
  }

  onProgress?.({ phase: 'brain-start', done: 0, total: 1, detail: m().checkingOllama })
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
      ollamaUrl: probe.transport ?? baseUrl,
      skillsRoot,
      vaultRoot,
      handshakePhrase: getHandshakePhrase(),
      handshakeEnabled: isHandshakeEnabled(),
      autoCheckpointEnabled: getAppSettings().autoCheckpointEnabled !== false,
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
