// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Server-side distillation engine — adapted from Desktop `src/core/brain/distill.ts`.
 * Profile default: qwen2.5:14b via Ollama /api/generate.
 */

import { assembleNote, coerceFields, transcript } from './note.js'
import { DEFAULT_DISTILL_MODEL, ollamaGenerate } from './ollamaChat.js'
import type { DistillConversation, DistilledNote } from './types.js'

const SYSTEM = `You are a knowledge distiller for a personal RAG "brain".
Given a raw AI-assistant conversation transcript, extract ONLY durable, reusable knowledge.
Rules:
- Keep the user's language (Polish or English) — do not translate.
- Mixed PL+EN vaults are normal: preserve each note/session in its original language; never force a single language across the vault.
- Be concrete: real commands, file paths, numbers, config, decisions made. No chit-chat, no pleasantries.
- Prefer terse bullet phrases over sentences.
- If the conversation contains nothing durable, return empty arrays and an empty summary.
Respond with ONLY a JSON object matching exactly this schema:
{"title": string (<=80 chars), "summary": string (1-3 sentences),
 "decisions": string[], "solutions": string[], "facts": string[], "open_questions": string[]}`

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
  const raw = opts.generate
    ? await opts.generate(text, SYSTEM, model)
    : await ollamaGenerate({
        baseUrl: opts.ollamaUrl,
        model,
        prompt: text,
        system: SYSTEM,
        json: true,
        timeoutMs: opts.timeoutMs ?? DISTILL_TIMEOUT_MS,
        signal: opts.signal,
      })
  return assembleNote(conv, coerceFields(raw), model)
}
