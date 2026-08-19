// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { hasOllamaModel } from '@core/brain/modelMatch.js'
import { defaultOllamaConfig } from '@core/brain/ollama.js'
import { m } from './mainStrings.js'
import { getAppSettings } from './appSettings.js'
import { ensureOllamaTransportUrl, needsOllamaRelay } from './ollamaRelay.js'

export function resolveOllamaUrl(passed?: string): string {
  const trimmed = passed?.trim()
  if (trimmed) return trimmed.replace(/\/$/, '')
  const saved = getAppSettings().ollamaUrl?.trim()
  if (saved) return saved.replace(/\/$/, '')
  return defaultOllamaConfig().baseUrl.replace(/\/$/, '')
}

/** Last transport URL (may be loopback relay). Used by sync ollamaFor(). */
let cachedTransportUrl: string | null = null
let cachedConfiguredUrl: string | null = null

export function getOllamaTransportUrl(configured?: string): string {
  const cfg = configured ?? cachedConfiguredUrl ?? resolveOllamaUrl()
  if (cachedTransportUrl && cachedConfiguredUrl === cfg) return cachedTransportUrl
  return cfg
}

/** Resolve configured URL and ensure macOS launchd relay when talking to LAN. */
export async function resolveOllamaTransport(passed?: string): Promise<{ configured: string; transport: string }> {
  const configured = resolveOllamaUrl(passed)
  const transport = await ensureOllamaTransportUrl(configured)
  cachedConfiguredUrl = configured
  cachedTransportUrl = transport
  return { configured, transport }
}

export type OllamaProbeResult =
  | { ok: true; url: string; models: string[]; transport?: string }
  | { ok: false; reason: 'unreachable' | 'http_error'; url: string; detail?: string }

/**
 * Probe Ollama with GET /api/tags — same check the UI uses for "online".
 * On macOS + remote Ollama, traffic goes through a launchd localhost relay
 * (Electron fetch to LAN fails while curl from Terminal works).
 */
export async function probeOllama(passedUrl?: string): Promise<OllamaProbeResult> {
  const { configured, transport } = await resolveOllamaTransport(passedUrl)
  try {
    const r = await fetch(`${transport}/api/tags`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return { ok: false, reason: 'http_error', url: configured, detail: `HTTP ${r.status}` }
    let models: string[] = []
    try {
      const j = (await r.json()) as { models?: { name?: string }[] }
      models = (j.models ?? []).map((row) => row.name ?? '').filter(Boolean)
    } catch {
      // A 200 with an unreadable body still means Ollama answered. The model
      // list is a bonus here — never a reason to call the host unreachable.
    }
    return { ok: true, url: configured, models, transport }
  } catch (e) {
    const viaRelay = transport !== configured
    const err = e instanceof Error ? e.message : String(e)
    const detail = viaRelay
      ? `host ${configured.replace(/^https?:\/\//, '')} nie odpowiada przez lokalny relay (${err})`
      : needsOllamaRelay(configured)
        ? `${err} (LAN — macOS blokuje gniazda Pomni; relay powinien przejąć ruch)`
        : err
    return {
      ok: false,
      reason: 'unreachable',
      url: configured,
      detail,
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
