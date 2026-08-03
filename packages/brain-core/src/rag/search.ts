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
 * Why hybrid: nomic-embed-text is English-centric. Mixed Polish/English
 * queries ("tunel WireGuard MikroTik") get scattered embeddings. Literal
 * keyword matches in filename/path/content give a strong signal we must
 * use, otherwise we'd miss well-tagged notes.
 * No user language switch — always hybrid PL+EN (app uiLocale is chrome-only).
 */

import type Database from 'better-sqlite3'
import type { SearchHit } from './types.js'
import type { EmbedClient } from './embed.js'
import { vecToBlob } from './vec.js'

export type SearchSource = 'all' | 'vault' | 'library'

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
  const scored = [...candidates.values()].map((c) => {
    const p = c.pdf_path
    const weakPenalty = p.includes('_weak') ? 0.15 : 0
    const humanBoost = p.includes('sessions') ? 0.05 : 0
    return {
      hit: {
        path: c.pdf_path,
        chunkIdx: c.chunk_idx,
        text: c.text,
        score:
          c.sem_score -
          weakPenalty +
          humanBoost +
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
        },
      } satisfies SearchHit,
    }
  })

  scored.sort((a, b) => b.hit.score - a.hit.score)
  return scored.slice(0, topK).map((s) => s.hit)
}
