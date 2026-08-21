// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Post-distill quality heuristic — port of Desktop distill.ts / note_quality.py.
 * Gate at GARBAGE_THRESHOLD so generic filler does not enter the main RAG basket.
 */

import type { DistilledFields, QualityDestination } from './types.js'

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
  /^\s*\d+\s*$/,
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

/** Heuristic 0–10. Aligns with Desktop: solid≥6, ok≥4, weak≥2, garbage&lt;2. */
export function scoreFields(fields: DistilledFields): number {
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

/** Below this → `garbage` → `_review/` (Desktop distill.ts). */
export const GARBAGE_THRESHOLD = 5.0

export function destinationForQuality(raw: string | undefined | null): QualityDestination {
  if (!raw) return 'keep'
  const q = raw.trim().toLowerCase()
  if (q === 'garbage' || q === 'stub') return 'review'
  if (q === 'weak') return 'weak'
  return 'keep'
}
