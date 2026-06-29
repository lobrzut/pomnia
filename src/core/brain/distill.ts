/**
 * Host-side distillation. Turns a raw Conversation into a Brain-compatible markdown
 * note (same frontmatter + sections Brain's own pipeline emits), using a local
 * Ollama model. Doing this on the user's GPU box offloads the Brain VM entirely —
 * Brain then only has to embed the finished note.
 */
import type { Conversation } from '../model.js'
import { Ollama } from './ollama.js'

export interface DistilledNote {
  title: string
  date: string
  source: string
  sessionId: string
  msgCount: number
  quality: 'ok' | 'stub'
  markdown: string
  /** Structured fields, kept for the local index + optional re-use. */
  fields: { summary: string; decisions: string[]; solutions: string[]; facts: string[]; openQuestions: string[] }
}

const SYSTEM = `You are a knowledge distiller for a personal RAG "brain".
Given a raw AI-assistant conversation transcript, extract ONLY durable, reusable knowledge.
Rules:
- Keep the user's language (Polish or English) — do not translate.
- Be concrete: real commands, file paths, numbers, config, decisions made. No chit-chat, no pleasantries.
- Prefer terse bullet phrases over sentences.
- If the conversation contains nothing durable, return empty arrays and an empty summary.
Respond with ONLY a JSON object matching exactly this schema:
{"title": string (<=80 chars), "summary": string (1-3 sentences),
 "decisions": string[], "solutions": string[], "facts": string[], "open_questions": string[]}`

/** Strip unpaired UTF-16 surrogates (Brain's distiller historically choked on these). */
export function sanitizeUnicode(s: string): string {
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}

/** Render a conversation to a transcript, budgeting characters (head + tail on overflow). */
export function transcript(conv: Conversation, maxChars = 14000): { text: string; truncated: boolean } {
  const lines = conv.messages.map((m) => `${m.role.toUpperCase()}: ${m.text}`)
  const full = lines.join('\n\n')
  if (full.length <= maxChars) return { text: full, truncated: false }
  const half = Math.floor(maxChars / 2)
  return { text: full.slice(0, half) + '\n\n…[truncated]…\n\n' + full.slice(-half), truncated: true }
}

function bullets(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join('\n') : '_—_'
}

export function assembleNote(conv: Conversation, fields: DistilledNote['fields'], model: string): DistilledNote {
  const date = (conv.updatedAt || conv.createdAt || new Date().toISOString()).slice(0, 10)
  const id8 = conv.id.slice(0, 8)
  const title = conv.title || conv.id
  const empty =
    !fields.summary &&
    !fields.decisions.length &&
    !fields.solutions.length &&
    !fields.facts.length &&
    !fields.openQuestions.length
  const quality: 'ok' | 'stub' = empty ? 'stub' : 'ok'

  const fm = [
    '---',
    `source: ${conv.source}`,
    `session: ${conv.id}`,
    `project: ${conv.title.replace(/\n/g, ' ').slice(0, 120)}`,
    `date: ${date}`,
    `msg_count: ${conv.messages.length}`,
    `distilled_via: reliqua`,
    `model: ${model}`,
    `quality: ${quality}`,
    '---',
    ''
  ].join('\n')

  const body = empty
    ? `# ${date} · ${conv.source} · ${id8}\n\n## _Stub_\n_No durable knowledge extracted._`
    : [
        `# ${date} · ${conv.source} · ${id8}`,
        '',
        '## Summary',
        fields.summary || '_—_',
        '',
        '## Decisions',
        bullets(fields.decisions),
        '',
        '## Solutions',
        bullets(fields.solutions),
        '',
        '## Facts',
        bullets(fields.facts),
        '',
        '## Open Questions',
        bullets(fields.openQuestions)
      ].join('\n')

  return {
    title: title.slice(0, 80),
    date,
    source: conv.source,
    sessionId: conv.id,
    msgCount: conv.messages.length,
    quality,
    markdown: sanitizeUnicode(fm + body),
    fields
  }
}

function coerceFields(raw: string): DistilledNote['fields'] {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => sanitizeUnicode(String(x)).trim()).filter(Boolean) : []
  try {
    const j = JSON.parse(raw) as Record<string, unknown>
    return {
      summary: sanitizeUnicode(String(j.summary ?? '')).trim(),
      decisions: arr(j.decisions),
      solutions: arr(j.solutions),
      facts: arr(j.facts),
      openQuestions: arr(j.open_questions ?? (j as Record<string, unknown>).openQuestions)
    }
  } catch {
    return { summary: '', decisions: [], solutions: [], facts: [], openQuestions: [] }
  }
}

/** Distill one conversation into a Brain-schema note via local Ollama. */
export async function distillConversation(
  conv: Conversation,
  ollama: Ollama,
  model?: string
): Promise<DistilledNote> {
  const m = model || ollama.cfg.chatModel
  const { text } = transcript(conv)
  const raw = await ollama.generate(text, { system: SYSTEM, model: m, json: true })
  return assembleNote(conv, coerceFields(raw), m)
}
