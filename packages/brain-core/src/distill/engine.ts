// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Server-side distillation engine — adapted from Desktop `src/core/brain/distill.ts`.
 * Profile default: DEFAULT_DISTILL_MODEL via Ollama /api/generate.
 */

import { assembleNote, coerceFields, transcript } from './note.js'
import { DEFAULT_DISTILL_MODEL, ollamaGenerate } from './ollamaChat.js'
import type { DistillConversation, DistilledFields, DistilledNote } from './types.js'

const SYSTEM = `You are a knowledge distiller for a personal RAG "brain".
Given a raw AI-assistant conversation transcript, extract ONLY durable, reusable knowledge.
Rules:
- Keep the user's language (Polish or English) — do not translate.
- Mixed PL+EN vaults are normal: preserve each note/session in its original language; never force a single language across the vault.
- Be concrete: real commands, file paths, numbers, config, decisions made. No chit-chat, no pleasantries.
- Prefer terse bullet phrases over sentences.
- Record what was TRIED AND FAILED as carefully as what worked: the approach, and why it failed. A dead end nobody wrote down gets walked again.
- If the conversation contains nothing durable, return empty arrays and an empty summary.
Respond with ONLY a JSON object matching exactly this schema:
{"title": string (<=80 chars), "summary": string (1-3 sentences),
 "decisions": string[], "solutions": string[], "facts": string[], "open_questions": string[],
 "attempts_failed": string[]}`

const MIN_MESSAGES = 3
const MIN_CONTENT_CHARS = 200
const DISTILL_TIMEOUT_MS = 120_000

export function isWorthDistilling(conv: DistillConversation): boolean {
  if (conv.messages.length < MIN_MESSAGES) return false
  const totalChars = conv.messages.reduce((n, m) => n + m.text.length, 0)
  return totalChars >= MIN_CONTENT_CHARS
}

export interface DistillEngineOpts {
  ollamaUrl: string
  model?: string
  timeoutMs?: number
  signal?: AbortSignal
  maxChars?: number
  /** Inject for tests — skip live Ollama. */
  generate?: (prompt: string, system: string, model: string) => Promise<string>
}

export async function distillConversation(
  conv: DistillConversation,
  opts: DistillEngineOpts,
): Promise<DistilledNote> {
  const model = opts.model || DEFAULT_DISTILL_MODEL
  const { text } = transcript(conv, opts.maxChars ?? 12_000)

  const generate = (): Promise<string> =>
    opts.generate
      ? opts.generate(text, SYSTEM, model)
      : ollamaGenerate({
          baseUrl: opts.ollamaUrl,
          model,
          prompt: text,
          system: SYSTEM,
          json: true,
          timeoutMs: opts.timeoutMs ?? DISTILL_TIMEOUT_MS,
          signal: opts.signal,
        })

  let fields = coerceFields(await generate())

  // One retry when the model returned nothing usable.
  //
  // `coerceFields` is forgiving, so empty output means the response was not a
  // note at all. Measured across 30 conversations, this happens roughly once
  // per 30 on an 8B model and never on a 14B: the small model opens valid JSON,
  // falls into a repetition loop (in the observed case a run of tab characters
  // inside `facts`) and never closes the object. It is a sampling accident, not
  // a misunderstanding of the schema, so the same prompt usually succeeds on
  // the next attempt.
  //
  // Cheap insurance either way: a conversation with genuinely nothing durable
  // in it costs one extra generation, while a lost note costs a note. Retrying
  // once, not until it works — a model that fails twice on the same input is
  // saying something, and a distill loop that never gives up blocks the queue.
  if (isEmptyFields(fields)) fields = coerceFields(await generate())

  return assembleNote(conv, fields, model)
}

/** Nothing usable came back — every list empty and no summary. */
function isEmptyFields(f: DistilledFields): boolean {
  return (
    f.decisions.length === 0 &&
    f.solutions.length === 0 &&
    f.facts.length === 0 &&
    f.openQuestions.length === 0 &&
    f.attemptsFailed.length === 0 &&
    !f.summary.trim()
  )
}
