// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** Minimal Ollama /api/generate client for distill (separate from embed). */

/**
 * Distillation model.
 *
 * Was `qwen2.5:14b` on the assumption that the larger model writes the better
 * note. Measured against `scoreFields` — the gate that decides whether a note
 * reaches retrieval at all — the assumption does not hold:
 *
 *   30 conversations, 2 passes    qwen2.5:14b   llama3.1:8b
 *   mean score                          5.838         6.853
 *   passes the quality gate               73%           87%
 *   attempts_failed per note             1.03          1.87
 *   median seconds per conversation      18.5           9.2
 *
 * Better on 23 of 30, median delta +1.18, and the runs were deterministic
 * (spread 0.000 per host). Replicated on a second machine with a different GPU,
 * where the gap was wider still, and confirmed on a held-out set the numbers
 * never steered: 7.514 mean, every note through the gate, read by hand.
 *
 * The `attempts_failed` row matters more than the mean. That section is the one
 * an agent needs most and the corpus had least of — across 1809 notes there
 * were none, because nothing asked for them. The smaller model records nearly
 * twice as many.
 *
 * The one thing 14B did better was never returning unparseable JSON, where 8B
 * failed roughly once in thirty. `distillConversation` retries once, which
 * covers it.
 *
 * Measured on one corpus (Polish + English, homelab and development work), so
 * this is a better default, not a proof about every vault. Anyone whose notes
 * look different should measure their own — experiments/gepa-distill in
 * lobrzut/pomnia-lab is the rig that produced these numbers.
 */
export const DEFAULT_DISTILL_MODEL = 'llama3.1:8b'

export interface OllamaGenerateOpts {
  baseUrl: string
  model: string
  prompt: string
  system?: string
  json?: boolean
  temperature?: number
  /**
   * Context window. Ollama defaults to 4096, which `num_ctx` must cover for the
   * prompt AND the generated note together. A distill transcript is budgeted at
   * 12 000 characters and Polish tokenizes at roughly 3 chars/token, so the
   * prompt alone lands near 4 000 — add a 400-600 token note and the longest
   * conversations overflow. Ollama then silently slides the window and drops
   * the head of the transcript: no error, just a note distilled from a
   * conversation missing its beginning. `transcript()`'s own head+tail budget
   * assumes the model sees what it sent.
   */
  numCtx?: number
  timeoutMs?: number
  signal?: AbortSignal
}

/** Headroom over the 12 000-char transcript budget plus the generated note. */
export const DEFAULT_NUM_CTX = 8192

export async function ollamaGenerate(opts: OllamaGenerateOpts): Promise<string> {
  const base = opts.baseUrl.replace(/\/$/, '')
  if (!base) throw new Error('ollama URL is empty')
  const body = {
    model: opts.model,
    prompt: opts.prompt,
    system: opts.system,
    stream: false,
    format: opts.json ? 'json' : undefined,
    options: { temperature: opts.temperature ?? 0.2, num_ctx: opts.numCtx ?? DEFAULT_NUM_CTX },
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
