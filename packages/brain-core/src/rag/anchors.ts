// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Some questions are not about meaning. They are about a string.
 *
 * "where was the NODE_MODULE_VERSION 137 error", "what changed in
 * src/main/docImport.ts", "what did we decide in 0.1.82" — every one of these
 * names something exactly, and similarity is the wrong instrument for an exact
 * name. Embeddings put "docImport" near "importing documents", which is helpful
 * for a topic and useless when you meant that file.
 *
 * The existing keyword lane cannot help, because it destroys these tokens
 * before it looks at them: `splitTerms` splits on every non-alphanumeric
 * character, so `src/main/docImport.ts` becomes `src`, `main`, `docimport`,
 * `ts`, and `0.1.82` becomes `0`, `1`, `82`. Four weak signals instead of one
 * decisive one, and `1` is not a signal at all.
 *
 * So: pull the tokens out *whole*, and use them to **filter** rather than to
 * nudge a score. A chunk that does not contain the file you named is not a
 * slightly worse answer to "what changed in that file" — it is not an answer.
 *
 * The safety rule, and it is the important one: **an anchor may never empty the
 * result set.** If nothing contains it, the anchor was probably a red herring —
 * a word that looked like an identifier, or a file that is genuinely not in the
 * vault — and the ordinary ranking must still get its turn. Filtering to zero
 * would turn a lucky guess into "your memory contains nothing about this".
 */

/**
 * Tokens that look like names rather than words.
 *
 * Each pattern earns its place from a real query in this project's history;
 * none of them is speculative.
 */
const PATTERNS: { name: string; re: RegExp }[] = [
  // A path with a separator: src/main/docImport.ts, packages/brain-core/src
  { name: 'path', re: /\b[\w.-]+(?:\/[\w.-]+){1,6}\b/g },
  // A filename with a code-ish extension: tokenRole.ts, compose.yaml
  { name: 'file', re: /\b[\w-]+\.(?:ts|tsx|js|mjs|json|ya?ml|md|py|sh|sql|toml|ini|env)\b/gi },
  // Dotted version: 0.1.82, 5.6.205
  { name: 'version', re: /\b\d+\.\d+(?:\.\d+)+\b/g },
  // SCREAMING_SNAKE: NODE_MODULE_VERSION, INDEX_SUBDIRS, BRAIN_RERANK
  { name: 'const', re: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g },
  // snake_case and kebab-case identifiers: search_library, brain-core
  { name: 'ident', re: /\b[a-z][a-z0-9]*(?:[_-][a-z0-9]+){1,5}\b/g },
  // camelCase with a capital in the middle: sessionIdGenerator, docImport
  { name: 'camel', re: /\b[a-z]+[A-Z][A-Za-z0-9]{2,}\b/g },
  // A long hex run: commit hashes, sha prefixes
  { name: 'hex', re: /\b[0-9a-f]{7,40}\b/gi },
  // Prefixed secrets and ids, named so they can be searched for by shape
  { name: 'prefixed', re: /\b[a-z]{2,6}_[A-Za-z0-9_-]{6,}\b/g },
]

/**
 * Words that match a pattern and mean nothing as an anchor.
 *
 * `search-library` in "how does search-library work" is a real anchor;
 * "day-to-day" is not. The list is short on purpose — over-blocking loses the
 * decisive signal, and a wrong anchor is already survivable because it can
 * never empty the results.
 */
const NOT_ANCHORS = new Set([
  'day-to-day',
  'step-by-step',
  'up-to-date',
  'e-mail',
  'follow-up',
  'so-called',
  'long-term',
  'short-term',
  'real-time',
])

/** Shortest token worth treating as a name. Below this, collisions dominate. */
const MIN_ANCHOR = 5

export interface Anchor {
  /** The token as it will be matched, lowercased. */
  text: string
  /** Which pattern found it — for explaining a filtered search. */
  kind: string
}

/**
 * Names in a query, whole.
 *
 * Order is by pattern specificity, and duplicates are dropped, so a path is
 * preferred over the identifier hiding inside it.
 */
export function extractAnchors(query: string): Anchor[] {
  const out: Anchor[] = []
  const seen = new Set<string>()
  for (const { name, re } of PATTERNS) {
    // A fresh regex per call: /g carries lastIndex between uses.
    const rx = new RegExp(re.source, re.flags)
    for (const m of query.matchAll(rx)) {
      const raw = m[0]
      const text = raw.toLowerCase()
      if (text.length < MIN_ANCHOR) continue
      if (NOT_ANCHORS.has(text)) continue
      // Skip anything already covered by a longer anchor found earlier: the
      // path `src/main/docImport.ts` already implies `docImport`.
      if (seen.has(text)) continue
      if (out.some((a) => a.text.includes(text))) continue
      seen.add(text)
      out.push({ text, kind: name })
    }
  }
  // A query that is nothing but names is usually a paste, not a question, and
  // filtering on eight of them at once finds nothing. Keep the most specific.
  return out.slice(0, 4)
}

export interface AnchorFilterable {
  text: string
  meta?: Record<string, unknown>
  path?: string
}

export interface AnchorFilterResult<T> {
  kept: T[]
  /** The anchors that actually matched something. Empty when none did. */
  applied: Anchor[]
}

/**
 * Keep only rows that contain one of the anchors — unless that keeps nothing.
 *
 * Matching looks at the chunk text and at the note's path and name, because
 * "what changed in docImport.ts" is answered by a chunk *from* that file as
 * much as by a chunk that mentions it.
 */
export function filterByAnchors<T extends AnchorFilterable>(
  rows: T[],
  anchors: Anchor[],
): AnchorFilterResult<T> {
  if (anchors.length === 0 || rows.length === 0) return { kept: rows, applied: [] }

  const haystack = (r: T): string => {
    const name = typeof r.meta?.name === 'string' ? r.meta.name : ''
    return `${r.text}\n${r.path ?? ''}\n${name}`.toLowerCase()
  }

  const matched: Anchor[] = []
  const kept = rows.filter((r) => {
    const hay = haystack(r)
    const hit = anchors.filter((a) => hay.includes(a.text))
    if (hit.length === 0) return false
    for (const a of hit) if (!matched.some((m) => m.text === a.text)) matched.push(a)
    return true
  })

  // The rule that keeps this safe: an anchor that matches nothing gets ignored,
  // rather than answering "your memory contains nothing about this".
  if (kept.length === 0) return { kept: rows, applied: [] }
  return { kept, applied: matched }
}
