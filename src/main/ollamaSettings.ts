// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { defaultOllamaConfig } from '@core/brain/ollama.js'
import { getAppSettings } from './appSettings.js'

export function resolveOllamaUrl(passed?: string): string {
  const trimmed = passed?.trim()
  if (trimmed) return trimmed.replace(/\/$/, '')
  const saved = getAppSettings().ollamaUrl?.trim()
  if (saved) return saved.replace(/\/$/, '')
  return defaultOllamaConfig().baseUrl.replace(/\/$/, '')
}

export type OllamaProbeResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'unreachable' | 'http_error'; url: string; detail?: string }

/** Probe Ollama with GET /api/tags — same check the UI uses for "online". */
export async function probeOllama(passedUrl?: string): Promise<OllamaProbeResult> {
  const url = resolveOllamaUrl(passedUrl)
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return { ok: false, reason: 'http_error', url, detail: `HTTP ${r.status}` }
    return { ok: true, url }
  } catch (e) {
    return {
      ok: false,
      reason: 'unreachable',
      url,
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}

export function ollamaUnreachableMessage(probe: Extract<OllamaProbeResult, { ok: false }>): string {
  const suffix = probe.detail ? ` — ${probe.detail}` : ''
  return `Ollama niedostępne pod ${probe.url} (GET /api/tags${suffix})`
}

export function brainProcessFailedMessage(err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err)
  return `Proces wyszukiwarki nie wystartował: ${detail}`
}
