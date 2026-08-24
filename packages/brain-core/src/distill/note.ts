// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** Assemble Brain-schema markdown notes from LLM JSON fields. */

import { GARBAGE_THRESHOLD, scoreFields } from './quality.js'
import type { DistillConversation, DistilledFields, DistilledNote } from './types.js'

export function sanitizeUnicode(s: string): string {
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}

export function transcript(
  conv: DistillConversation,
  maxChars = 14000,
): { text: string; truncated: boolean } {
  const lines = conv.messages.map((m) => `${m.role.toUpperCase()}: ${m.text}`)
  const full = lines.join('\n\n')
  if (full.length <= maxChars) return { text: full, truncated: false }
  const half = Math.floor(maxChars / 2)
  return {
    text: full.slice(0, half) + '\n\n…[truncated]…\n\n' + full.slice(-half),
    truncated: true,
  }
}

function bullets(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join('\n') : '_—_'
}

export function assembleNote(
  conv: DistillConversation,
  fields: DistilledFields,
  model: string,
): DistilledNote {
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
  const quality: DistilledNote['quality'] = empty
    ? 'stub'
    : score < GARBAGE_THRESHOLD
      ? 'garbage'
      : 'ok'

  const fm = [
    '---',
    `source: ${conv.source}`,
    `session: ${conv.id}`,
    `project: ${conv.title.replace(/\n/g, ' ').slice(0, 120)}`,
    `date: ${date}`,
    `msg_count: ${conv.messages.length}`,
    `distilled_via: pomnia-brain-core`,
    `model: ${model}`,
    `quality: ${quality}`,
    `quality_score: ${score}`,
    '---',
    '',
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
        bullets(fields.openQuestions),
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
    fields,
  }
}

export function coerceFields(raw: string): DistilledFields {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => sanitizeUnicode(String(x)).trim()).filter(Boolean) : []
  try {
    const j = JSON.parse(raw) as Record<string, unknown>
    return {
      summary: sanitizeUnicode(String(j.summary ?? '')).trim(),
      decisions: arr(j.decisions),
      solutions: arr(j.solutions),
      facts: arr(j.facts),
      openQuestions: arr(j.open_questions ?? j.openQuestions),
    }
  } catch {
    return { summary: '', decisions: [], solutions: [], facts: [], openQuestions: [] }
  }
}

export function sessionIdFileSuffix(sessionId: string): string {
  return sessionId.slice(0, 8)
}

export function noteFilename(n: DistilledNote): string {
  const slug =
    n.title
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 48) || 'untitled'
  return `${n.date}_${n.source}_${slug}_${sessionIdFileSuffix(n.sessionId)}.md`
}
