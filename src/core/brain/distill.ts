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
  /** stub = LLM found nothing durable. garbage = it found *something*, but it's
   *  generic filler (score below threshold). ok = passed the quality bar. */
  quality: 'ok' | 'stub' | 'garbage'
  /** Heuristic content-quality score, 0-10 — see scoreFields(). */
  score: number
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

// Cheap, deterministic pre-filter — skip conversations too trivial to be worth
// an LLM call ("hi" / "thanks" exchanges, accidental or test chats). Catches
// the bulk of garbage-in before any compute is spent; the LLM-side "stub"
// verdict in assembleNote() still catches longer-but-empty conversations that
// pass this gate but turn out to have nothing durable.
const MIN_MESSAGES = 3
const MIN_CONTENT_CHARS = 200

export function isWorthDistilling(conv: Conversation): boolean {
  if (conv.messages.length < MIN_MESSAGES) return false
  const totalChars = conv.messages.reduce((n, m) => n + m.text.length, 0)
  return totalChars >= MIN_CONTENT_CHARS
}

// ---------------------------------------------------------------------------
// Post-distill quality score — TS port of pipeline/note_quality.py's heuristic
// (generic-phrase + specificity detection), run inline instead of as a
// separate after-the-fact audit. Catches notes where the LLM produced *some*
// output but it's generic filler ("decided to continue working on X") rather
// than durable, searchable knowledge.
// ---------------------------------------------------------------------------
const GENERIC_PATTERNS = [
  /\bdecided to\s+(continue|proceed|work on|move forward|further)\b/i,
  /\bzdecydowano?\s*(się)?\s*(kontynuować|przejść|pójść|pracować)\b/i,
  /\bdiscussed (the |a )?(topic|matter|issue|approach)\b/i,
  /\bomówiono?\s+(temat|kwestię|zagadnienie|podejście)\b/i,
  /\b(further|additional)\s+(analysis|investigation|research)\b/i,
  /\bwymagana?\s*(jest)?\s*(dalsza|dodatkowa)\s*(analiza|weryfikacja)\b/i,
  /^(yes|no|tak|nie|ok|okay)\b\s*\.?$/i,
  /^\s*(continued|kontynuacja|to be continued|cdn)\.?\s*$/i,
  /^\s*(brak|none|n\/a|not specified)\s*\.?\s*$/i,
  /^\s*\.?\s*$/,
  /^[\W_]+$/,
  /^\s*\d+\s*$/
]
const HAS_NUMBER = /\b\d{2,}\b/
const HAS_DATE = /\b\d{4}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/
const HAS_CODE = /`[^`]+`|\$\w+|\/\w+\/\w+|[a-z_]+\.(py|js|ts|md|json|yaml|rs|go|sh)\b/
const HAS_CMD = /\b(sudo |apt |npm |pip |git |docker |systemctl |curl |wget )/i
const HAS_URL = /https?:\/\/[^\s)]+/
const HAS_CAPS_AC = /\b[A-Z][A-Z0-9]{2,}\b/
const HAS_PROPER = /\b[A-Z][a-z]+[A-Z]\w+\b/

function scoreBullet(b: string): { generic: boolean; specific: number } {
  const t = b.trim()
  const generic = GENERIC_PATTERNS.some((rx) => rx.test(t))
  let specific = 0
  if (HAS_NUMBER.test(t)) specific += 1
  if (HAS_DATE.test(t)) specific += 1
  if (HAS_CODE.test(t)) specific += 2
  if (HAS_CMD.test(t)) specific += 2
  if (HAS_URL.test(t)) specific += 1
  if (HAS_CAPS_AC.test(t)) specific += 1
  if (HAS_PROPER.test(t)) specific += 1
  return { generic, specific }
}

/** Heuristic 0-10 content score for a distilled note's fields. Mirrors the
 *  threshold bands in note_quality.py: solid>=6, ok>=4, weak>=2, garbage<2. */
export function scoreFields(fields: DistilledNote['fields']): number {
  const all = [...fields.decisions, ...fields.solutions, ...fields.facts, ...fields.openQuestions]
  if (all.length === 0) return 0

  const scored = all.map(scoreBullet)
  const genericRatio = scored.filter((s) => s.generic).length / scored.length
  const avgSpecific = scored.reduce((n, s) => n + s.specific, 0) / scored.length

  const seen = new Map<string, number>()
  for (const b of all) {
    const key = b.toLowerCase().trim().slice(0, 80)
    seen.set(key, (seen.get(key) || 0) + 1)
  }
  let dupCount = 0
  for (const c of seen.values()) if (c > 1) dupCount += c - 1

  let score = Math.min(6, avgSpecific * 2) - genericRatio * 3 - dupCount * 0.5
  const solDec = [...fields.decisions, ...fields.solutions].slice(0, 5)
  if (solDec.some((b) => scoreBullet(b).specific >= 2)) score += 1
  score = Math.max(0, Math.min(10, score + 4))
  return Math.round(score * 100) / 100
}

const GARBAGE_THRESHOLD = 4.0 // below note_quality.py's "ok" bar

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
  const score = empty ? 0 : scoreFields(fields)
  const quality: DistilledNote['quality'] = empty ? 'stub' : score < GARBAGE_THRESHOLD ? 'garbage' : 'ok'

  const fm = [
    '---',
    `source: ${conv.source}`,
    `session: ${conv.id}`,
    `project: ${conv.title.replace(/\n/g, ' ').slice(0, 120)}`,
    `date: ${date}`,
    `msg_count: ${conv.messages.length}`,
    `distilled_via: pomnia`,
    `model: ${model}`,
    `quality: ${quality}`,
    `quality_score: ${score}`,
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
    score,
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
  model?: string,
  opts?: { timeoutMs?: number; signal?: AbortSignal; maxChars?: number }
): Promise<DistilledNote> {
  const m = model || ollama.cfg.chatModel
  const { text } = transcript(conv, opts?.maxChars ?? 12_000)
  const raw = await ollama.generate(text, {
    system: SYSTEM,
    model: m,
    json: true,
    timeoutMs: opts?.timeoutMs,
    signal: opts?.signal
  })
  return assembleNote(conv, coerceFields(raw), m)
}
