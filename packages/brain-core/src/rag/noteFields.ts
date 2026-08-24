// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Split a distilled note into the facts about it and the text of it.
 *
 * Every note opens with YAML: source, session id, project, date, src_path,
 * msg_count, quality. All of it was being chunked and embedded as if it were
 * prose. Measured across the live vault that is 605,102 characters — 14% of
 * everything indexed — and because a distilled note usually fits inside one
 * 1800-character chunk, the dilution lands on the note's whole vector, not
 * just its opening. In a typical first chunk 35% of the text was YAML.
 *
 * What that costs: a session UUID and a Windows path contribute nothing to
 * meaning but do participate in keyword matching, which is how "coral reef
 * bleaching" reached a note titled "Google Coral Edge TPU".
 *
 * Measured gain from removing it: +3.0% mean cosine across 14 queries against
 * 250 real notes, better on 13 of them.
 *
 * The fields are not discarded. They belong in columns, where they can filter
 * and rank instead of being guessed at from prose.
 */

export interface NoteFields {
  /** YAML front matter, keys lower-cased. Empty when the note carries none. */
  meta: Record<string, string>
  /** Everything after the closing `---`, or the whole text when absent. */
  body: string
}

const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/

/**
 * Split leading YAML from the body.
 *
 * Deliberately not a YAML parser: these blocks are flat `key: value` lines
 * written by our own distiller, and pulling in a parser to read them would add
 * a dependency to the one package that has to stay small enough to ship inside
 * an appliance.
 */
export function splitNote(text: string): NoteFields {
  const m = FRONT_MATTER.exec(text)
  if (!m) return { meta: {}, body: text }

  const meta: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const at = line.indexOf(':')
    if (at <= 0) continue
    const key = line.slice(0, at).trim().toLowerCase()
    const value = line.slice(at + 1).trim()
    if (key && value) meta[key] = value
  }
  return { meta, body: text.slice(m[0].length) }
}

/** `date: 2026-07-18` → `2026-07-18`. Null when absent or malformed. */
export function noteDateFrom(meta: Record<string, string>): string | null {
  const v = meta.date
  return v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null
}

/**
 * The distiller's own quality score, if it recorded one.
 *
 * It has been written into every note as `quality_score_ts` and read by
 * nothing: ranking knows only whether a path contains `_weak/`. A number
 * sitting unused is worse than no number, because it looks like the question
 * was already answered.
 */
export function noteQualityFrom(meta: Record<string, string>): number | null {
  const raw = meta.quality_score_ts ?? meta.quality_score
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}
