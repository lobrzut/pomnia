// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * How well a result set is actually grounded in the vault, said in words.
 *
 * `search` always returns its top K. With nothing relevant indexed it returns
 * the K least-irrelevant chunks, and the caller cannot tell that apart from a
 * real answer: both arrive as a list with a `score`. An agent handed five
 * loosely-related fragments will write a plausible answer out of them, which
 * is the one kind of hallucination this project is in a position to prevent.
 *
 * The blended `score` is the wrong thing to threshold. Measured against the
 * live vault (2545 files / 3934 chunks, 18 queries whose answers are in there
 * against 12 that cannot be):
 *
 *   final score   hits 0.5421-1.1698   noise 0.2329-0.5200   overlap: adjacent
 *   sem_score     hits 0.0731-0.2780   noise 0.0145-0.0821   overlap: one pair
 *   keyword hits  hits always >= 1     noise zero in 8 of 12
 *
 * The blend is a poor confidence signal because `recencyBoost` sat at ~0.25 for
 * nearly every row, noise included — it lifts everything by a quarter without
 * separating anything. The worst false positive scored 0.5200 on a semantic
 * similarity of 0.0821: "coral reef bleaching" matched a note titled "Google
 * Coral Edge TPU" on the word Coral, and recency did the rest.
 *
 * So classify on the two signals that do separate, and never hide a result —
 * label it. A words-only match is often exactly right (an exact filename,
 * a command, an error string); it is only dangerous when nobody says that is
 * what happened.
 */

/**
 * Semantic floor. Below this, meaning contributed nothing worth trusting.
 *
 * Re-measured after the v2 reindex, which moved it. Removing the YAML header
 * from the embedded text sharpened the *noise* along with the signal: a note
 * titled "Google Coral Edge TPU", no longer diluted by session ids and file
 * paths, embeds more purely as Coral — and therefore closer to "coral reef
 * bleaching". That query's semantic score doubled, 0.0821 to 0.1632, while two
 * genuine hits sat below it at 0.0706 and 0.0770.
 *
 * So on this corpus neither signal separates that case: semantic score and
 * keyword count both put the false positive among the true ones. The floor is
 * therefore set above the worst measured noise rather than below the weakest
 * hit, which pushes roughly half of the true hits into `lexical`.
 *
 * That is a real loss of confidence, not a bug: results are still returned,
 * labelled as leads to verify. Claiming a match is about meaning when the
 * measurement cannot show that would be the actual failure. Separating these
 * properly needs a reranker, which scores the query against the chunk directly
 * instead of comparing two independent embeddings.
 *
 *   after v2   hits  0.0706 – 0.3174   (p25 0.1615, median 0.2107)
 *              noise 0.0145 – 0.1632   (median 0.0443)
 */
export const SEM_MEANINGFUL = 0.17

export type Grounding = 'strong' | 'lexical' | 'none'

export interface GroundingVerdict {
  grounding: Grounding
  /** One sentence for the agent. Prose, because a float carries no calibration. */
  note: string
}

interface ScoredLike {
  score: number
  meta?: Record<string, unknown>
}

const num = (m: Record<string, unknown> | undefined, k: string): number => {
  const v = m?.[k]
  return typeof v === 'number' ? v : 0
}

/** Keyword hits on a row, name and body together. */
export function keywordHits(hit: ScoredLike): number {
  return num(hit.meta, 'kw_name_hits') + num(hit.meta, 'kw_text_hits')
}

/** Semantic similarity alone, before recency and keyword mixing. */
export function semanticScore(hit: ScoredLike): number {
  return num(hit.meta, 'sem_score')
}

/**
 * Judge a result set by its best row.
 *
 * Deliberately never returns `none` while any row carries a keyword hit: on the
 * measured set that would have suppressed two true answers whose semantic score
 * was noise-level but which matched on the words that mattered.
 */
export function classifyGrounding(hits: ScoredLike[]): GroundingVerdict {
  if (hits.length === 0) {
    return { grounding: 'none', note: 'The vault has nothing indexed for this query.' }
  }
  const bestSem = Math.max(...hits.map(semanticScore))
  const anyKeyword = hits.some((h) => keywordHits(h) > 0)

  if (bestSem >= SEM_MEANINGFUL) {
    return {
      grounding: 'strong',
      note: 'These notes are about the thing you asked for.',
    }
  }
  if (anyKeyword) {
    return {
      grounding: 'lexical',
      note:
        'Matched on words, not on meaning — the vault holds nothing close to this topic. ' +
        'Treat these as leads to verify, not as an answer, and say so if you use them.',
    }
  }
  return {
    grounding: 'none',
    note:
      'Nothing in the vault covers this. The rows below are the least unrelated ' +
      'chunks, not an answer — do not build one out of them.',
  }
}

/** `2026-07-18_claude-code_Title_ab12cd34.md` → `2026-07-18`, else null. */
export function noteDate(name: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})_/.exec(name)
  return m ? m[1] : null
}
