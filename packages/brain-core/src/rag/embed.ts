// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Embedding client — Ollama HTTP or in-process ONNX (fastembed parity).
 *
 * Both backends use nomic-embed-text v1.5 → **768 dims**. Vectors from Ollama
 * `nomic-embed-text` and Python/Node fastembed (`nomic-ai/nomic-embed-text-v1.5`)
 * are directionally compatible: cosine similarity is orientation-invariant to
 * L2 normalization, and they agree to ~0.99996 on the same prefixed input
 * (Phase 0). An existing library.db is queryable after a backend swap **without
 * a reindex**.
 *
 * Task prefixes are applied HERE, explicitly, and must stay exact:
 *   `search_document: ` / `search_query: `
 * Changing them yields cosine ~0.92 vs the existing index; incremental reindex
 * then "succeeds" while retrieval stays broken — only a wipe of library.db
 * recovers. Ollama's template does NOT prepend them (measured).
 *
 * Backend selection: `BRAIN_EMBED_BACKEND=fastembed|ollama` (default ollama for
 * desktop; KVM install.sh / Dockerfile set fastembed so a host without Ollama
 * can search).
 */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export const EMBED_DIMS = 768

/** HuggingFace id used by Python fastembed — same ONNX weights, ~0.5 GB. */
export const FASTEMBED_MODEL_ID = 'nomic-ai/nomic-embed-text-v1.5'

/** What the text is for. nomic-embed expects the pair to be marked differently. */
export type EmbedKind = 'document' | 'query'

export type EmbedBackendName = 'ollama' | 'fastembed'

const EMBED_PREFIX: Record<EmbedKind, string> = {
  document: 'search_document: ',
  query: 'search_query: ',
}

/** Exported for tests — do not change without wiping library.db. */
export function applyEmbedPrefix(text: string, kind: EmbedKind): string {
  return EMBED_PREFIX[kind] + text
}

export interface EmbedClientConfig {
  backend?: EmbedBackendName
  /** Required when backend is ollama. Ignored for fastembed. */
  ollamaUrl?: string
  embedModel: string
  /** Per-request timeout in ms. Long embed batches on CPU can take a while. */
  timeoutMs?: number
  /**
   * Directory for the ONNX model cache (fastembed). Defaults to
   * `<cwd>/.cache/pomnia-embed` when unset — callers should pass
   * `<dataDir>/embed-cache` so ProtectSystem=strict can write it.
   */
  cacheDir?: string
}

/** `nomic-embed-text` matches `nomic-embed-text:latest`; an explicit tag must match exactly. */
export function embedModelMatches(available: string, wanted: string): boolean {
  if (available === wanted) return true
  return !wanted.includes(':') && available === `${wanted}:latest`
}

export function parseEmbedBackend(raw: string | undefined): EmbedBackendName {
  const v = (raw ?? '').trim().toLowerCase()
  // `local` / `EMBED_PROVIDER=local` = same ONNX path (KVM / appliance wording).
  if (v === 'fastembed' || v === 'onnx' || v === 'local') return 'fastembed'
  if (v === 'ollama' || v === '') return 'ollama'
  throw new Error(
    `unknown embed backend ${JSON.stringify(raw)} — use fastembed|local|onnx or ollama`,
  )
}

type FeatureExtractor = (
  texts: string | string[],
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist: () => number[] | number[][]; data?: Float32Array; dims?: number[] }>

/** Lazy singleton so the ~0.5 GB load is paid once per process. */
let fastembedLoader: Promise<FeatureExtractor> | null = null
let fastembedCacheDir: string | undefined

async function loadFastembedExtractor(cacheDir?: string): Promise<FeatureExtractor> {
  if (fastembedLoader && fastembedCacheDir === cacheDir) return fastembedLoader
  fastembedCacheDir = cacheDir
  fastembedLoader = (async () => {
    if (cacheDir) {
      await mkdir(cacheDir, { recursive: true })
    }
    // Dynamic import: desktop Ollama path must not pay the ONNX/native cost at boot.
    const transformers = await import('@huggingface/transformers')
    if (cacheDir) {
      transformers.env.cacheDir = cacheDir
    }
    transformers.env.allowLocalModels = true
    // fp32 matches Python fastembed's onnx/model.onnx (~0.52 GB), not the q8 path.
    const extractor = await transformers.pipeline(
      'feature-extraction',
      FASTEMBED_MODEL_ID,
      { dtype: 'fp32' },
    )
    return extractor as unknown as FeatureExtractor
  })()
  return fastembedLoader
}

/** Reset the singleton — tests only. */
export function resetFastembedForTests(): void {
  fastembedLoader = null
  fastembedCacheDir = undefined
}

export class EmbedClient {
  readonly backend: EmbedBackendName
  private url: string
  private model: string
  private readonly timeoutMs: number
  private readonly cacheDir?: string
  private fastembedReady = false

  constructor(cfg: EmbedClientConfig) {
    this.backend = cfg.backend ?? 'ollama'
    this.url = (cfg.ollamaUrl ?? '').replace(/\/$/, '')
    this.model = cfg.embedModel
    this.timeoutMs = cfg.timeoutMs ?? 300_000
    this.cacheDir = cfg.cacheDir
  }

  /**
   * Repoint a live client after an admin changes the setting.
   *
   * Mutating beats rebuilding: the ToolContext holds this instance, so a new
   * object would have to be threaded through every consumer, and one missed
   * reference would leave part of the server talking to the old address —
   * working, and wrong, which is the hardest state to notice.
   *
   * Backend switches are not supported here — that would unload/reload ~0.5 GB
   * and invalidate operator expectations mid-flight. Restart the process.
   */
  reconfigure(cfg: Partial<Pick<EmbedClientConfig, 'ollamaUrl' | 'embedModel'>>): void {
    if (cfg.ollamaUrl) this.url = cfg.ollamaUrl.replace(/\/$/, '')
    if (cfg.embedModel) this.model = cfg.embedModel
  }

  get config(): {
    backend: EmbedBackendName
    ollamaUrl: string
    embedModel: string
    modelId: string
  } {
    return {
      backend: this.backend,
      ollamaUrl: this.url,
      embedModel: this.model,
      modelId: this.backend === 'fastembed' ? FASTEMBED_MODEL_ID : this.model,
    }
  }

  /** True after a successful preflight (or first embed) for the active backend. */
  get ready(): boolean {
    if (this.backend === 'fastembed') return this.fastembedReady
    return Boolean(this.url)
  }

  /**
   * Refuse to start an index pass the embedder cannot serve.
   *
   * Without this the pass runs to completion embedding nothing: every file
   * 404s, each one logs a WARN nobody reads, and the run still returns a
   * file/chunk count that gets written to the stats sidecar and surfaced as a
   * green "index refreshed". That is how a 1900-note vault came back as 26.
   */
  async preflight(): Promise<void> {
    if (this.backend === 'fastembed') {
      await this.ensureFastembed()
      return
    }
    if (!this.url) {
      throw new Error('ollama URL not configured — set --ollama-url or BRAIN_EMBED_BACKEND=fastembed')
    }
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

  private async ensureFastembed(): Promise<FeatureExtractor> {
    try {
      const extractor = await loadFastembedExtractor(this.cacheDir)
      this.fastembedReady = true
      return extractor
    } catch (err) {
      this.fastembedReady = false
      const why = err instanceof Error ? err.message : String(err)
      throw new Error(
        `fastembed model unavailable (${FASTEMBED_MODEL_ID}): ${why} — ` +
          `check network on first load or set BRAIN_EMBED_CACHE to a prefetched cache`,
      )
    }
  }

  /**
   * Embed a batch of texts. Returns one vector per input, in order.
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
    const prefixed = texts.map((t) => applyEmbedPrefix(t, kind))
    if (this.backend === 'fastembed') {
      return this.embedFastembed(prefixed, signal)
    }
    return this.embedOllama(prefixed, signal)
  }

  private async embedFastembed(prefixed: string[], signal?: AbortSignal): Promise<number[][]> {
    const extractor = await this.ensureFastembed()
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
      // Race a timeout: transformers.js has no AbortSignal on pipeline calls.
      const out = await Promise.race([
        extractor(prefixed, { pooling: 'mean', normalize: true }),
        new Promise<never>((_, rej) => {
          ctl.signal.addEventListener('abort', () => {
            const err = new Error('embed aborted')
            err.name = 'AbortError'
            rej(err)
          })
        }),
      ])
      return tensorsToRows(out, prefixed.length)
    } finally {
      clearTimeout(t)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  private async embedOllama(prefixed: string[], signal?: AbortSignal): Promise<number[][]> {
    if (!this.url) {
      throw new Error('ollama URL not configured')
    }
    const ctl = new AbortController()
    const onAbort = (): void => ctl.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    const t = setTimeout(() => ctl.abort(), this.timeoutMs)
    try {
      const r = await fetch(`${this.url}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, input: prefixed }),
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
    if (!v) throw new Error('embedder returned zero vectors')
    return v
  }
}

function tensorsToRows(
  out: { tolist: () => number[] | number[][]; data?: Float32Array; dims?: number[] },
  expected: number,
): number[][] {
  if (typeof out.tolist === 'function') {
    const list = out.tolist()
    if (Array.isArray(list[0])) return list as number[][]
    // Single vector for a one-element batch.
    if (expected === 1 && typeof list[0] === 'number') return [list as number[]]
  }
  if (out.data && out.dims && out.dims.length >= 2) {
    const rows = out.dims[0]!
    const cols = out.dims[out.dims.length - 1]!
    const data = out.data
    const result: number[][] = []
    for (let i = 0; i < rows; i++) {
      const row: number[] = []
      for (let j = 0; j < cols; j++) row.push(data[i * cols + j]!)
      result.push(row)
    }
    return result
  }
  throw new Error('fastembed returned an unexpected tensor shape')
}

/** Prefetch the ONNX model into cacheDir (install / Docker build). */
export async function prefetchFastembed(cacheDir: string): Promise<void> {
  const client = new EmbedClient({
    backend: 'fastembed',
    embedModel: 'nomic-embed-text',
    cacheDir,
  })
  await client.preflight()
  // Touch a tiny embed so weights are fully materialised, not just tokenizer.
  await client.embedOne('prefetch', 'query')
}

export function defaultEmbedCacheDir(dataDir: string): string {
  return join(dataDir, 'embed-cache')
}

/** Build a client from resolved BrainConfig fields. */
export function embedClientFromConfig(cfg: {
  embedBackend: EmbedBackendName
  ollamaUrl: string
  embedModel: string
  embedCacheDir: string
}): EmbedClient {
  return new EmbedClient({
    backend: cfg.embedBackend,
    ollamaUrl: cfg.ollamaUrl,
    embedModel: cfg.embedModel,
    cacheDir: cfg.embedCacheDir,
  })
}
