// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * What has to be true before a distill run is allowed to start.
 *
 * A missing Ollama or a missing chat model used to look like an idle queue:
 * the backlog button was disabled, or each conversation failed and was then
 * marked processed. This report is the checklist the Desktop shows instead.
 *
 * No Node imports — the renderer bundles this file.
 */
import { hasOllamaModel } from './modelMatch.js'
import { chatModelDownloadSize } from './profiles.js'

/** Install page for a local Ollama. Not shown when the URL is a LAN daemon. */
export const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download'

export interface DistillPreflightInput {
  reachable: boolean
  models: string[]
  distillModel: string
  embedModel: string
  /**
   * Embedded search indexes on this Ollama, so `nomic-embed-text` is required.
   * Remote Brain embeds on the server (often fastembed) — do not demand a
   * local embed pull before distill.
   */
  requireEmbed: boolean
  ollamaUrl: string
}

export type DistillPreflightItem =
  | { id: 'ollama'; ok: boolean; url: string; local: boolean }
  | { id: 'embed'; ok: boolean; model: string; pull: string }
  | { id: 'distill'; ok: boolean; model: string; pull: string; size: string }

export interface DistillPreflightReport {
  ok: boolean
  items: DistillPreflightItem[]
}

/** Empty / loopback → a local install. A LAN hostname is someone else's daemon. */
export function distillOllamaUrlLooksLocal(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return true
  try {
    const host = new URL(trimmed).hostname.toLowerCase()
    return host === '127.0.0.1' || host === 'localhost' || host === '::1'
  } catch {
    return true
  }
}

export function assessDistillPreflight(input: DistillPreflightInput): DistillPreflightReport {
  const url = input.ollamaUrl.trim() || 'http://127.0.0.1:11434'
  const local = distillOllamaUrlLooksLocal(url)
  const items: DistillPreflightItem[] = [
    { id: 'ollama', ok: input.reachable, url, local },
  ]
  if (input.requireEmbed) {
    const model = input.embedModel.trim() || 'nomic-embed-text'
    items.push({
      id: 'embed',
      ok: input.reachable && hasOllamaModel(input.models, model),
      model,
      pull: `ollama pull ${model}`,
    })
  }
  const distillModel = input.distillModel.trim()
  items.push({
    id: 'distill',
    ok: input.reachable && hasOllamaModel(input.models, distillModel),
    model: distillModel,
    pull: `ollama pull ${distillModel}`,
    size: chatModelDownloadSize(distillModel),
  })
  return { ok: items.every((item) => item.ok), items }
}

/** One line for a thrown error when the UI gate was bypassed. Commands, not prose. */
export function formatDistillPreflightBlock(report: DistillPreflightReport): string {
  return report.items
    .filter((item) => !item.ok)
    .map((item) => {
      if (item.id === 'ollama') {
        return item.local
          ? `Ollama is not running at ${item.url} — install ${OLLAMA_DOWNLOAD_URL}`
          : `Ollama is not answering at ${item.url} — start the daemon on that host`
      }
      if (item.id === 'embed') return `missing embedding model ${item.model} — ${item.pull}`
      const size = item.size ? ` (${item.size})` : ''
      return `missing distill model ${item.model}${size} — ${item.pull}`
    })
    .join(' · ')
}
