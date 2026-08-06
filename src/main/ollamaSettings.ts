// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { hasOllamaModel } from '@core/brain/modelMatch.js'
import { defaultOllamaConfig } from '@core/brain/ollama.js'
import { m } from './mainStrings.js'
import { getAppSettings } from './appSettings.js'

export function resolveOllamaUrl(passed?: string): string {
  const trimmed = passed?.trim()
  if (trimmed) return trimmed.replace(/\/$/, '')
  const saved = getAppSettings().ollamaUrl?.trim()
  if (saved) return saved.replace(/\/$/, '')
  return defaultOllamaConfig().baseUrl.replace(/\/$/, '')
}

export type OllamaProbeResult =
  | { ok: true; url: string; models: string[] }
  | { ok: false; reason: 'unreachable' | 'http_error'; url: string; detail?: string }

/**
 * Probe Ollama with GET /api/tags — same check the UI uses for "online".
 * Returns the installed tags too: the response already carries them, and
 * "reachable" alone is not enough to know the brain can embed anything.
 */
export async function probeOllama(passedUrl?: string): Promise<OllamaProbeResult> {
  const url = resolveOllamaUrl(passedUrl)
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return { ok: false, reason: 'http_error', url, detail: `HTTP ${r.status}` }
    let models: string[] = []
    try {
      const j = (await r.json()) as { models?: { name?: string }[] }
      models = (j.models ?? []).map((m) => m.name ?? '').filter(Boolean)
    } catch {
      // A 200 with an unreadable body still means Ollama answered. The model
      // list is a bonus here — never a reason to call the host unreachable.
    }
    return { ok: true, url, models }
  } catch (e) {
    return {
      ok: false,
      reason: 'unreachable',
      url,
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * The embed model missing is not a warning-level detail: without it the brain
 * cannot index a single note *or* embed a search query, so every agent lookup
 * returns nothing while the app reports itself healthy. Returns null when fine.
 */
export function missingEmbedModelMessage(models: string[]): string | null {
  const embedModel = defaultOllamaConfig().embedModel
  if (hasOllamaModel(models, embedModel)) return null
  return m().ollamaMissingModel(embedModel, `ollama pull ${embedModel}`)
}

export function ollamaUnreachableMessage(probe: Extract<OllamaProbeResult, { ok: false }>): string {
  const suffix = probe.detail ? ` — ${probe.detail}` : ''
  return m().ollamaUnreachable(probe.url, suffix)
}

export function brainProcessFailedMessage(err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err)
  return m().brainProcessFailed(detail)
}
