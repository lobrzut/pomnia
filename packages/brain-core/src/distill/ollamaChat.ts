// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** Minimal Ollama /api/generate client for distill (separate from embed). */

export const DEFAULT_DISTILL_MODEL = 'qwen2.5:14b'

export interface OllamaGenerateOpts {
  baseUrl: string
  model: string
  prompt: string
  system?: string
  json?: boolean
  temperature?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export async function ollamaGenerate(opts: OllamaGenerateOpts): Promise<string> {
  const base = opts.baseUrl.replace(/\/$/, '')
  if (!base) throw new Error('ollama URL is empty')
  const body = {
    model: opts.model,
    prompt: opts.prompt,
    system: opts.system,
    stream: false,
    format: opts.json ? 'json' : undefined,
    options: { temperature: opts.temperature ?? 0.2 },
  }
  const timeoutMs = opts.timeoutMs ?? 300_000
  const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)]
  if (opts.signal) signals.push(opts.signal)
  const signal = AbortSignal.any(signals)
  const r = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!r.ok) throw new Error(`ollama generate ${r.status}: ${await r.text().catch(() => '')}`)
  const j = (await r.json()) as { response?: string }
  return j.response ?? ''
}

/** Smoke: one short generate — proves chat model answers without writing vault. */
export async function dryRunOllamaGenerate(
  baseUrl: string,
  model: string,
  signal?: AbortSignal,
): Promise<{ ok: true; sample: string } | { ok: false; error: string }> {
  try {
    const sample = await ollamaGenerate({
      baseUrl,
      model,
      prompt: 'Reply with exactly: {"pong":true}',
      system: 'You are a connectivity probe. Respond with JSON only.',
      json: true,
      timeoutMs: 60_000,
      signal,
    })
    return { ok: true, sample: sample.slice(0, 200) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
