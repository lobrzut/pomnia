// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Quality → path routing for distilled notes.
 *
 * Encode quality in the filesystem path (not a chunks.quality column):
 *   garbage|stub (contentless / stub markers) → distilled/_review/ (SKIP_DIRS)
 *   garbage|stub WITH Facts/Solutions/Decisions → distilled/_weak/ (indexed)
 *   weak         → distilled/_weak/     (indexed, ranking penalty)
 *   ok|solid|good|unrated → distilled/  (indexed, no penalty)
 *
 * Two frontmatter vocabularies: new TS (ok|stub|garbage) and legacy Python
 * (weak|solid|good|ok|garbage|stub).
 *
 * Label alone is not enough for stub/garbage: thin-but-useful notes must stay
 * searchable under _weak/; only empty stubs go to quarantine.
 */
import { join } from 'node:path'
import type { DistilledNote } from './distill.js'
import { scoreFields } from './distill.js'

export type QualityLabel =
  | 'garbage'
  | 'stub'
  | 'weak'
  | 'ok'
  | 'solid'
  | 'good'
  | 'unrated'

export type QualityDestination = 'review' | 'weak' | 'keep'

const REVIEW = new Set(['garbage', 'stub'])
const WEAK = new Set(['weak'])
const KEEP = new Set(['ok', 'solid', 'good', 'unrated'])

/** Map a quality label (either vocabulary) to a destination bucket. */
export function destinationForQuality(raw: string | undefined | null): QualityDestination {
  if (!raw) return 'keep'
  const q = raw.trim().toLowerCase()
  if (REVIEW.has(q)) return 'review'
  if (WEAK.has(q)) return 'weak'
  if (KEEP.has(q)) return 'keep'
  // Unknown labels: leave in place (don't quarantine on typos).
  return 'keep'
}

/** True when body has explicit empty-stub markers (legacy distill templates). */
export function hasContentlessStubMarker(markdown: string): boolean {
  const body = stripFrontmatter(markdown)
  return /##\s+_Stub_/i.test(body) || /Distillation didn't extract/i.test(body)
}

/**
 * True when Facts / Solutions / Decisions (or PL aliases) have real bullets —
 * thin knowledge that should stay searchable under _weak/, not quarantine.
 */
export function hasThinSearchableSections(markdown: string): boolean {
  const fields = parseNoteFieldsFromMarkdown(markdown)
  return fields.decisions.length > 0 || fields.solutions.length > 0 || fields.facts.length > 0
}

/**
 * Route by label, with content override for stub|garbage:
 *   markers OR no Facts/Solutions/Decisions → review (quarantine)
 *   non-empty Facts/Solutions/Decisions     → weak (thin but indexed)
 * weak / ok / solid / good / unrated unchanged.
 */
export function destinationForQualityContent(
  raw: string | undefined | null,
  markdown: string,
): QualityDestination {
  if (!raw) return 'keep'
  const q = raw.trim().toLowerCase()
  if (REVIEW.has(q)) {
    if (hasContentlessStubMarker(markdown)) return 'review'
    if (hasThinSearchableSections(markdown)) return 'weak'
    return 'review'
  }
  return destinationForQuality(raw)
}

/**
 * Assign quality for previously unrated notes after scoreFields() (TS 0–10).
 * Never use legacy quality_score — dual 0–10 / 0–100 scales coexist; labels
 * on already-rated notes are authoritative.
 *
 * Asymmetric error preference: only move when CLEARLY below threshold;
 * borderline → unrated (stay in distilled/).
 *
 *   < 2        → garbage (clear) → _review
 *   < 3.5      → weak (clear) → _weak
 *   < 5        → unrated (borderline) → stay
 *   < 6        → ok → stay
 *   >= 6       → solid → stay
 */
export function qualityFromScoreAsymmetric(score: number, empty: boolean): QualityLabel {
  if (empty) return 'stub'
  if (score < 2) return 'garbage'
  if (score < 3.5) return 'weak'
  if (score < 5) return 'unrated'
  if (score < 6) return 'ok'
  return 'solid'
}

/** Absolute dir under distilled/ for a destination. */
export function destDir(distilledRoot: string, dest: QualityDestination): string {
  if (dest === 'review') return join(distilledRoot, '_review')
  if (dest === 'weak') return join(distilledRoot, '_weak')
  return distilledRoot
}

/** Parse `quality:` from YAML frontmatter (first --- block). */
export function parseFrontmatterQuality(markdown: string): string | null {
  const fm = frontmatterBlock(markdown)
  if (!fm) return null
  const m = fm.match(/^quality:\s*(\S+)/m)
  return m?.[1] ?? null
}

/** Parse `quality_score:` from frontmatter. */
export function parseFrontmatterScore(markdown: string): number | null {
  const fm = frontmatterBlock(markdown)
  if (!fm) return null
  const m = fm.match(/^quality_score:\s*([0-9.]+)/m)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function frontmatterBlock(markdown: string): string | null {
  if (!markdown.startsWith('---')) return null
  const end = markdown.indexOf('\n---', 3)
  if (end < 0) return null
  return markdown.slice(4, end)
}

/**
 * Upsert `quality` + `quality_score_ts` into frontmatter.
 * Never touches existing `quality_score` (legacy 0–10 and 0–100 scales coexist —
 * labels are authoritative; TS score goes to quality_score_ts for reversibility).
 */
export function upsertQualityFrontmatter(
  markdown: string,
  quality: string,
  qualityScoreTs: number,
): string {
  const qLine = `quality: ${quality}`
  const sLine = `quality_score_ts: ${qualityScoreTs}`
  if (!markdown.startsWith('---')) {
    return `---\n${qLine}\n${sLine}\n---\n\n${markdown}`
  }
  const end = markdown.indexOf('\n---', 3)
  if (end < 0) {
    return `---\n${qLine}\n${sLine}\n---\n\n${markdown}`
  }
  let fm = markdown.slice(4, end)
  if (/^quality:\s*\S+/m.test(fm)) {
    fm = fm.replace(/^quality:\s*\S+/m, qLine)
  } else {
    fm = `${fm.trimEnd()}\n${qLine}`
  }
  if (/^quality_score_ts:\s*[0-9.]+/m.test(fm)) {
    fm = fm.replace(/^quality_score_ts:\s*[0-9.]+/m, sLine)
  } else {
    fm = `${fm.trimEnd()}\n${sLine}`
  }
  return `---\n${fm.trim()}\n---${markdown.slice(end + 4)}`
}

/**
 * Pull Decisions / Solutions / Facts / Open Questions / Summary bullets from
 * legacy or TS distilled markdown so scoreFields() can run without an LLM.
 */
export function parseNoteFieldsFromMarkdown(markdown: string): DistilledNote['fields'] {
  const body = stripFrontmatter(markdown)
  const section = (names: string[]): string[] => {
    for (const name of names) {
      const re = new RegExp(
        `^##\\s+${name}\\s*\\r?\\n([\\s\\S]*?)(?=^##\\s+|$)`,
        'im',
      )
      const m = body.match(re)
      if (!m) continue
      const block = m[1] ?? ''
      const bullets = block
        .split('\n')
        .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
        .filter((l) => l && l !== '_—_' && !l.startsWith('_Stub_'))
      if (bullets.length) return bullets
      const prose = block.trim()
      if (prose && prose !== '_—_') return [prose]
    }
    return []
  }

  const summaryBullets = section(['Summary', 'Podsumowanie'])
  return {
    summary: summaryBullets[0] ?? '',
    decisions: section(['Decisions', 'Decyzje']),
    solutions: section(['Solutions', 'Rozwiązania', 'Solutions / Fixes']),
    facts: section(['Facts', 'Fakty']),
    openQuestions: section(['Open Questions', 'Open questions', 'Otwarte pytania', 'Questions']),
  }
}

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown
  const end = markdown.indexOf('\n---', 3)
  if (end < 0) return markdown
  return markdown.slice(end + 4)
}

/** Score + asymmetric label for an unrated note body. */
export function rateUnratedMarkdown(markdown: string): {
  score: number
  quality: QualityLabel
  empty: boolean
} {
  const fields = parseNoteFieldsFromMarkdown(markdown)
  const empty =
    !fields.summary &&
    !fields.decisions.length &&
    !fields.solutions.length &&
    !fields.facts.length &&
    !fields.openQuestions.length
  const score = empty ? 0 : scoreFields(fields)
  const quality = qualityFromScoreAsymmetric(score, empty)
  return { score, quality, empty }
}
