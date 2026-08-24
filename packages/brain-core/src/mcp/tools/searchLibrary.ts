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
import { classifyGrounding, keywordHits, noteDate, semanticScore } from '../../rag/grounding.js'

export const searchLibrarySchema = {
  type: 'object' as const,
  properties: {
    query: { type: 'string', description: 'Search query in natural language.' },
    top_k: { type: 'integer', default: 5, description: 'Number of top hits to return (default 5).' },
    source: {
      type: 'string',
      enum: ['all', 'vault', 'library'],
      default: 'all',
      description: "Filter: 'all' (default), 'vault' (only .md notes), 'library' (only PDFs/EPUBs).",
    },
  },
  required: ['query'],
}

const argsSchema = z.object({
  query: z.string(),
  top_k: z.number().int().positive().optional().default(5),
  source: z.enum(['all', 'vault', 'library']).optional().default('all'),
})

export interface SearchLibraryDeps {
  db: Database.Database
  embedder: EmbedClient
}

/**
 * Execute the tool. Returns MCP-shaped text content (JSON string of hits array).
 * The Python impl returns TextContent with a JSON dump — we mirror that.
 */
export async function runSearchLibrary(
  args: unknown,
  deps: SearchLibraryDeps,
): Promise<string> {
  const { query, top_k, source } = argsSchema.parse(args)

  const hits = await search(deps.db, deps.embedder, {
    query,
    topK: top_k,
    source: source as SearchSource,
  })

  const verdict = classifyGrounding(hits)

  if (hits.length === 0) {
    return JSON.stringify({ hits: [], ...verdict, message: 'no results' })
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
    return {
      ...h,
      matched:
        sem >= 0.1 && kw > 0 ? 'meaning and words'
        : sem >= 0.1 ? 'meaning'
        : kw > 0 ? 'words only'
        : 'weak on both',
      dated: noteDate(String((h.meta as { name?: unknown })?.name ?? '')),
    }
  })

  return JSON.stringify({ hits: annotated, ...verdict })
}
