// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Hybrid search — semantic embedding + keyword boost.
 *
 * Direct port of Python `pipeline/rag.py::search`. Same shape, same source
 * filter semantics, same keyword-boost heuristics — so an integration test
 * ("same query, same DB → same top-K, same order") is meaningful going
 * forward.
 *
 * Why hybrid: literal keyword matches in filename/path/content give a signal
 * the vectors miss — an exact command, an error string, a filename.
 *
 * This used to say nomic-embed-text is English-centric and that keywords are
 * what carry Polish queries. Measured on the live vault that does not hold up:
 * ten concepts asked once in each language scored PL 0.2197 against EN 0.1871
 * on semantic similarity alone, with English ahead in only two — and the corpus
 * is 53% English-only against 31% Polish-only, so a language-match explanation
 * does not cover it either. The measurement has a real weakness: both phrasings
 * were written by the same author in one sitting, so the Polish ones may track
 * this vault's vocabulary more closely than a stranger's would.
 *
 * What is safe to say is narrower: hybrid earns its place on literal matches,
 * not on rescuing one language from the model.
 * No user language switch — always hybrid PL+EN (app uiLocale is chrome-only).
 */

import type Database from 'better-sqlite3'
import type { SearchHit } from './types.js'
import type { EmbedClient } from './embed.js'
import { vecToBlob } from './vec.js'

export type SearchSource = 'all' | 'vault' | 'library'

/** Full boost up to this age, then linear decay to zero at DECAY_END_DAYS. */
const RECENCY_MAX = 0.25
const RECENCY_FLAT_DAYS = 30
const RECENCY_DECAY_END_DAYS = 730

/** `2026-07-18_claude-code_Some_title_ab12cd34.md` → the leading date. */
const NAME_DATE = /^(\d{4})-(\d{2})-(\d{2})_/

/**
 * Recency boost for vault notes, matching the Python brain's curve: full boost
 * under a month old, decaying linearly to nothing at two years. The rationale
 * is the user's: what you understood recently usually beats what you wrote
 * about the same topic a year ago.
 *
 * Age comes from the date in the filename, NOT from the file's mtime, which
 * the Python impl used. mtime describes when the bytes last moved, not when
 * the thinking happened — copying a vault to a new machine, restoring a
 * backup, or merging notes from another host resets every mtime to now and
 * would hand a uniform full boost to the entire corpus. Distilled and session
 * notes are all named `YYYY-MM-DD_…`, so the real date is right there.
 *
 * Library documents (PDF/EPUB) get nothing: a 1948 paper is not stale.
 */
export function noteRecencyBoost(name: string, now = Date.now()): number {
  if (!name.toLowerCase().endsWith('.md')) return 0
  const m = NAME_DATE.exec(name)
  if (!m) return 0
  const written = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (!Number.isFinite(written)) return 0
  const ageDays = (now - written) / 86_400_000
  // A future-dated note is not more relevant than a current one; clamp instead
  // of rewarding a clock skew or a typo in the filename.
  if (ageDays <= RECENCY_FLAT_DAYS) return RECENCY_MAX
  if (ageDays >= RECENCY_DECAY_END_DAYS) return 0
  const spent = (ageDays - RECENCY_FLAT_DAYS) / (RECENCY_DECAY_END_DAYS - RECENCY_FLAT_DAYS)
  return Math.round(RECENCY_MAX * (1 - spent) * 10000) / 10000
}

/** Simple Polish + English stopwords. Match Python impl. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'but',
  'konfiguracja', 'ustawienia', 'miedzy', 'między', 'jak',
  'lub', 'albo', 'oraz',
])

/**
 * Split a query into candidate keyword tokens. Lower-case, drop punctuation,
 * keep 2+ char tokens.
 */
function splitTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .slice(0, 8)
}

/** True if `term` appears at a word boundary in `haystack`. */
function nameMatch(haystackLc: string, termLc: string): boolean {
  if (termLc.length >= 4) return haystackLc.includes(termLc)
  // 2–3 char tokens: require non-alphanumeric on both sides (avoid 'cv'
  // matching 'discover').
  const re = new RegExp(
    `(?:^|[^a-z0-9])${termLc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`,
  )
  return re.test(haystackLc)
}

/** Row shape returned by the vec MATCH query. */
interface SemanticRow {
  id: number
  pdf_name: string
  pdf_path: string
  page_num: number
  chunk_idx: number
  text: string
  distance: number
}

/** Candidate mid-search — mutable while we mix in keyword scores. */
interface Candidate {
  id: number
  pdf: string
  pdf_path: string
  page: number
  chunk_idx: number
  text: string
  sem_score: number
  kw_name_hits: number
  kw_text_hits: number
}

export interface SearchOptions {
  query: string
  topK?: number
  source?: SearchSource
}

/**
 * Run a hybrid search against an open library.db.
 *
 * @param db Opened via storage/db.ts::openDb (sqlite-vec already loaded).
 * @param embedder Ollama-backed embed client.
 * @param opts Query + top-k + optional source filter.
 */
export async function search(
  db: Database.Database,
  embedder: EmbedClient,
  opts: SearchOptions,
): Promise<SearchHit[]> {
  const topK = opts.topK ?? 5
  const source: SearchSource = opts.source ?? 'all'

  const emb = await embedder.embedOne(opts.query, 'query')
  const fetchN = Math.max(topK * 3, 12)

  const rows = db
    .prepare(
      `SELECT chunks.id           AS id,
              chunks.pdf_name     AS pdf_name,
              chunks.pdf_path     AS pdf_path,
              chunks.page_num     AS page_num,
              chunks.chunk_idx    AS chunk_idx,
              chunks.text         AS text,
              chunks_vec.distance AS distance
         FROM chunks_vec
         JOIN chunks ON chunks.id = chunks_vec.rowid
        WHERE chunks_vec.embedding MATCH ? AND k = ?
        ORDER BY chunks_vec.distance`,
    )
    // BigInt: better-sqlite3 v12 binds JS numbers as REAL and vec0 requires
    // an INTEGER k — same constraint as rowid binds in the indexer.
    .all(vecToBlob(emb), BigInt(fetchN)) as SemanticRow[]

  const matchesSource = (name: string): boolean => {
    if (source === 'all') return true
    const isMd = name.toLowerCase().endsWith('.md')
    if (source === 'vault') return isMd
    if (source === 'library') return !isMd
    return true
  }

  const candidates = new Map<number, Candidate>()
  for (const r of rows) {
    if (!matchesSource(r.pdf_name)) continue
    candidates.set(r.id, {
      id: r.id,
      pdf: r.pdf_name,
      pdf_path: r.pdf_path,
      page: r.page_num,
      chunk_idx: r.chunk_idx,
      text: r.text,
      sem_score: Math.round((1 - r.distance) * 10000) / 10000,
      kw_name_hits: 0,
      kw_text_hits: 0,
    })
  }

  // Keyword-boost pass — same weights as Python impl.
  const terms = splitTerms(opts.query)
  if (terms.length > 0) {
    for (const c of candidates.values()) {
      const nameLc = c.pdf.toLowerCase()
      const pathLc = c.pdf_path.toLowerCase()
      const textLc = c.text.toLowerCase()
      for (const t of terms) {
        if (nameMatch(nameLc, t) || nameMatch(pathLc, t)) c.kw_name_hits += 1
        if (textLc.includes(t)) c.kw_text_hits += 1
      }
    }
  }

  // Final score: semantic 1.0, kw_name 0.15, kw_text 0.05, plus path-encoded
  // quality: _weak/ penalty, sessions/ human boost. Quality lives in the path
  // (not a chunks column) so legacy corpus can be re-ranked without re-embed.
  // Recency is added on top — see noteRecencyBoost.
  const now = Date.now()
  const scored = [...candidates.values()].map((c) => {
    const p = c.pdf_path
    const weakPenalty = p.includes('_weak') ? 0.15 : 0
    const humanBoost = p.includes('sessions') ? 0.05 : 0
    const recencyBoost = noteRecencyBoost(c.pdf, now)
    return {
      hit: {
        path: c.pdf_path,
        chunkIdx: c.chunk_idx,
        text: c.text,
        score:
          c.sem_score -
          weakPenalty +
          humanBoost +
          recencyBoost +
          c.kw_name_hits * 0.15 +
          c.kw_text_hits * 0.05,
        meta: {
          name: c.pdf,
          page: c.page,
          sem_score: c.sem_score,
          kw_name_hits: c.kw_name_hits,
          kw_text_hits: c.kw_text_hits,
          weakPenalty,
          humanBoost,
          recencyBoost,
        },
      } satisfies SearchHit,
    }
  })

  scored.sort((a, b) => b.hit.score - a.hit.score)
  return scored.slice(0, topK).map((s) => s.hit)
}
