// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * MCP tool: search_library
 *
 * Semantic + keyword hybrid search over the shared library.db (distilled
 * vault notes + PDF/EPUB/DOCX chunks). Direct port of the Python handler in
 * `dashboard/mcp_rag.py` — same input schema, same source filter, same
 * output format (JSON-serialized top-K hits).
 */

import { z } from 'zod'
import type Database from 'better-sqlite3'
import type { EmbedClient } from '../../rag/embed.js'
import { search, type SearchSource } from '../../rag/search.js'
import { classifyGrounding, keywordHits, noteDate, semanticScore, SEM_MEANINGFUL } from '../../rag/grounding.js'
import { keepLiveSources } from '../../rag/liveSources.js'
import type { Reranker } from '../../rag/rerank.js'

export const searchLibrarySchema = {
  type: 'object' as const,
  properties: {
    query: { type: 'string', description: 'Search query in natural language.' },
    top_k: { type: 'integer', default: 4, description: 'How many hits to return (default 4). At most 2 come from any one file.' },
    source: {
      type: 'string',
      enum: ['all', 'vault', 'library'],
      default: 'all',
      description: "Filter: 'all' (default), 'vault' (only .md notes), 'library' (only PDFs/EPUBs).",
    },
    compact: {
      type: 'boolean',
      default: false,
      description:
        'Return path, title, date, score and a one-line snippet instead of the full chunk text — far fewer tokens. Use it to scan first; re-query more specifically when a hit needs its full passage.',
    },
  },
  required: ['query'],
}

const argsSchema = z.object({
  query: z.string(),
  top_k: z.number().int().positive().optional().default(4),
  source: z.enum(['all', 'vault', 'library']).optional().default('all'),
  // No default here: absent means "use the server's token-saver setting", which
  // the deps carry. An explicit true/false from the caller still wins.
  compact: z.boolean().optional(),
})

/** At most this many chunks from one file, so a single rich note cannot fill the answer. */
const MAX_PER_FILE = 2
/** A compact snippet is a scan aid, not the passage. */
const SNIPPET_LEN = 180

/**
 * Keep ranking order but let no single file own the answer: take hits in order,
 * allow at most `maxPerFile` from any one path, stop at `limit`. Pure so the
 * cap can be tested without a live index.
 */
export function capPerFile<T extends { path?: unknown }>(
  hits: T[],
  maxPerFile: number,
  limit: number,
): T[] {
  const perFile = new Map<string, number>()
  const out: T[] = []
  for (const h of hits) {
    const key = String(h.path ?? '')
    const seen = perFile.get(key) ?? 0
    if (seen >= maxPerFile) continue
    perFile.set(key, seen + 1)
    out.push(h)
    if (out.length >= limit) break
  }
  return out
}

export interface SearchLibraryDeps {
  db: Database.Database
  embedder: EmbedClient
  /**
   * Optional second opinion on the ordering. Absent or unloadable and the
   * blended score decides, exactly as before — see rag/rerank.ts.
   */
  reranker?: Reranker
  /**
   * What compact means when the caller does not say — the server's token-saver
   * setting. Defaults to true (compact), which the measured 76% token cut earns;
   * a caller passing compact:false still gets full text.
   */
  compactDefault?: boolean
}

/**
 * Execute the tool. Returns MCP-shaped text content (JSON string of hits array).
 * The Python impl returns TextContent with a JSON dump — we mirror that.
 */
export async function runSearchLibrary(
  args: unknown,
  deps: SearchLibraryDeps,
): Promise<string> {
  const { query, top_k, source, compact } = argsSchema.parse(args)
  // Explicit arg wins; otherwise the server's token-saver setting; otherwise on.
  const useCompact = compact ?? deps.compactDefault ?? true

  // Fetch a wider pool than we return: dedup by file drops chunks, so asking
  // search for exactly top_k could hand back fewer than top_k after dedup, or
  // top_k rows that are all the same note. The pool is bounded so a broad query
  // cannot blow up the rerank.
  const poolSize = Math.min(Math.max(top_k * 3, 12), 30)
  const raw = await search(deps.db, deps.embedder, {
    query,
    topK: poolSize,
    source: source as SearchSource,
    reranker: deps.reranker,
  })

  // Before anything is judged: a chunk whose file was deleted is not a weak
  // result, it is a passage with nothing behind it. See keepLiveSources.
  const { live, missing } = await keepLiveSources(raw)

  // Keep ranking order, but let no single file own the answer: the measured
  // problem was 4 of 8 hits from one note, ~6k tokens for one file's worth of
  // signal. Cap per file, then take top_k.
  const hits = capPerFile(live, MAX_PER_FILE, top_k)
  const verdict = classifyGrounding(hits)

  if (hits.length === 0) {
    return JSON.stringify({
      hits: [],
      ...verdict,
      message: 'no results',
      ...(missing.length
        ? {
            stale_dropped: missing.length,
            stale_note:
              `${missing.length} indexed passage(s) matched but their notes no longer ` +
              `exist on disk, so they were withheld. Run brain-core --reindex to prune them.`,
          }
        : {}),
    })
  }

  // Two things the caller could not previously see. `matched` says whether a row
  // earned its place by meaning or by sharing words, which the blended score
  // hides -- a note titled "Google Coral Edge TPU" ranks for "coral reef" on the
  // word alone. `dated` puts the note's own date in front of the model, because
  // a corpus spanning months contains decisions that were later reversed, and
  // without a date the reader has no way to prefer the newer one. The date is
  // already parsed for the recency boost; it just never reached the answer.
  const annotated = hits.map((h) => {
    const sem = semanticScore(h)
    const kw = keywordHits(h)
    const matched =
      sem >= SEM_MEANINGFUL && kw > 0 ? 'meaning and words'
      : sem >= SEM_MEANINGFUL ? 'meaning'
      : kw > 0 ? 'words only'
      : 'weak on both'
    const name = String((h.meta as { name?: unknown })?.name ?? '')
    const dated = noteDate(name)
    if (useCompact) {
      // Path, title, date, score and one line — enough to decide relevance
      // without carrying the whole passage. The full text is one re-query away.
      const text = String((h as { text?: unknown }).text ?? '')
      return {
        path: (h as { path?: unknown }).path ?? null,
        title: name || null,
        dated,
        score: (h as { score?: unknown }).score ?? null,
        matched,
        snippet: text.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LEN),
      }
    }
    return { ...h, matched, dated }
  })

  return JSON.stringify({
    hits: annotated,
    ...verdict,
    ...(missing.length
      ? {
          stale_dropped: missing.length,
          stale_note:
            `${missing.length} further passage(s) were withheld: their notes are in the ` +
            `index but no longer on disk. Run brain-core --reindex to prune them.`,
        }
      : {}),
  })
}
