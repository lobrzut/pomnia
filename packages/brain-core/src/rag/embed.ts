// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Ollama embedding client.
 *
 * MVP is Ollama-only (see brain-in-node-rewrite-plan). Model default matches
 * the existing Python deploy — nomic-embed-text (v1.5 tag on Ollama) → 768 dims.
 * That way the existing library.db (54k chunks on the master, embedded by the
 * Python fastembed backend) is directly queryable without a reindex: cosine
 * similarity is orientation-invariant to L2 normalization, and the Ollama and
 * Python-fastembed backends emit the same directional vector for the same
 * model (verified in Phase 0).
 *
 * Task prefixes are applied HERE, explicitly.
 *
 * An earlier comment claimed Ollama's nomic template adds them itself, so this
 * client sent bare text. Measured on a live Ollama: embedding "foo" versus
 * "search_document: foo" gives cosine 0.92 — nowhere near the ~1.0 that would
 * mean the template prepends anything. It does not. The same claim sits in the
 * Python brain's rag.py and is equally wrong there.
 *
 * Consequences of getting this wrong were twofold: queries and documents landed
 * in the same undifferentiated space (nomic is trained for an asymmetric pair,
 * which is the whole point of the prefixes), and vectors sat 0.92 away from the
 * Python brain's index — so the two could not share one library.db.
 * fastembed and Ollama agree to 0.99996 when handed the same prefixed input,
 * so the backend was never the problem; the prefix was.
 */

export const EMBED_DIMS = 768

/** What the text is for. nomic-embed expects the pair to be marked differently. */
export type EmbedKind = 'document' | 'query'

const EMBED_PREFIX: Record<EmbedKind, string> = {
  document: 'search_document: ',
  query: 'search_query: ',
}

export interface EmbedClientConfig {
  ollamaUrl: string
  embedModel: string
  /** Per-request timeout in ms. Long embed batches on CPU can take a while. */
  timeoutMs?: number
}

/** `nomic-embed-text` matches `nomic-embed-text:latest`; an explicit tag must match exactly. */
export function embedModelMatches(available: string, wanted: string): boolean {
  if (available === wanted) return true
  return !wanted.includes(':') && available === `${wanted}:latest`
}

export class EmbedClient {
  private readonly url: string
  private readonly model: string
  private readonly timeoutMs: number

  constructor(cfg: EmbedClientConfig) {
    this.url = cfg.ollamaUrl.replace(/\/$/, '')
    this.model = cfg.embedModel
    this.timeoutMs = cfg.timeoutMs ?? 300_000
  }

  /**
   * Refuse to start an index pass Ollama cannot serve.
   *
   * Without this the pass runs to completion embedding nothing: every file
   * 404s, each one logs a WARN nobody reads, and the run still returns a
   * file/chunk count that gets written to the stats sidecar and surfaced as a
   * green "index refreshed". That is how a 1900-note vault came back as 26.
   */
  async preflight(): Promise<void> {
    let models: string[]
    try {
      const r = await fetch(`${this.url}/api/tags`, { signal: AbortSignal.timeout(8_000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as { models?: { name?: string }[] }
      models = (j.models ?? []).map((m) => m.name ?? '').filter(Boolean)
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err)
      throw new Error(`ollama unreachable at ${this.url} (${why}) — start Ollama, then retry`)
    }
    if (!models.some((m) => embedModelMatches(m, this.model))) {
      throw new Error(`embedding model "${this.model}" is not installed — run: ollama pull ${this.model}`)
    }
  }

  /**
   * Embed a batch of texts. Returns one vector per input, in order.
   * Throws with the Ollama status body on error.
   *
   * `kind` is required rather than defaulted: indexing a query-shaped vector or
   * searching with a document-shaped one degrades retrieval silently, and a
   * default would let a new call site inherit the wrong one by omission.
   */
  async embedBatch(texts: string[], kind: EmbedKind, signal?: AbortSignal): Promise<number[][]> {
    if (texts.length === 0) return []
    if (signal?.aborted) {
      const err = new Error('embed aborted')
      err.name = 'AbortError'
      throw err
    }
    const ctl = new AbortController()
    const onAbort = (): void => ctl.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    const t = setTimeout(() => ctl.abort(), this.timeoutMs)
    try {
      const r = await fetch(`${this.url}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, input: texts.map((t) => EMBED_PREFIX[kind] + t) }),
        signal: ctl.signal,
      })
      if (!r.ok) {
        const body = await r.text().catch(() => '')
        throw new Error(`ollama embed failed: ${r.status} ${body.slice(0, 200)}`)
      }
      const j = (await r.json()) as { embeddings?: number[][]; embedding?: number[] }
      if (j.embeddings && j.embeddings.length > 0) return j.embeddings
      if (j.embedding) return [j.embedding]
      throw new Error('ollama embed returned no vectors')
    } finally {
      clearTimeout(t)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  /** Convenience for the single-text case. */
  async embedOne(text: string, kind: EmbedKind): Promise<number[]> {
    const [v] = await this.embedBatch([text], kind)
    if (!v) throw new Error('ollama returned zero vectors')
    return v
  }
}
