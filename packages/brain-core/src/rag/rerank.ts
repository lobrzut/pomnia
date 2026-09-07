// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Score the query against the chunk directly, instead of comparing two
 * independent embeddings.
 *
 * `grounding.ts` has named this as the missing piece since it was written, with
 * the measurement to back it: on the live vault the semantic score of true hits
 * (0.0706–0.3174) overlaps the semantic score of noise (0.0145–0.1632). No
 * threshold separates them, because the two numbers being compared were never
 * about each other — a bi-encoder embeds the question and the text apart and
 * hopes the geometry agrees. A cross-encoder reads them together.
 *
 * The case that motivated it: "coral reef bleaching" ranked a note titled
 * "Google Coral Edge TPU" as the best match, on the word *Coral*, with recency
 * doing the rest.
 *
 * Measured before building this, on four pairs where the wrong answer is
 * deliberately the lexically tempting one, two of them Polish:
 *
 *   Xenova/ms-marco-MiniLM-L-6-v2   4/4   ~10 ms/pair   margins 7.9 – 19.2
 *   mixedbread-ai/mxbai-rerank-xsmall-v1  4/4  ~31 ms/pair  margins 0.3 – 6.5
 *   Xenova/bge-reranker-base        4/4   ~31 ms/pair   margins 1.7 – 17.8
 *
 * MiniLM is nominally English-only and still separated the Polish pairs by the
 * widest margin at a third of the cost. Four pairs is not a benchmark; it is
 * enough to know the approach works and which model to measure properly first.
 *
 * Read the raw logit, never the classification pipeline. These models have a
 * single output and `text-classification` softmaxes it — a softmax over one
 * number is always 1.0, so every pair scores identically. That failure looks
 * exactly like three broken models and cost an hour to see.
 *
 * Failing is not allowed to break search. A model that will not load, a slow
 * first call, an out-of-memory — every one of them returns the input order
 * unchanged. Reranking makes a good answer more likely; it is never the reason
 * there is no answer.
 */

/** Default: fastest of the three measured, and the widest margins. */
export const DEFAULT_RERANK_MODEL = 'Xenova/ms-marco-MiniLM-L-6-v2'

/**
 * How many candidates to score. Fifteen, measured.
 *
 * The point of over-fetching is to hand the reranker rows the bi-encoder put
 * below the cut. How many is worth paying for is not a matter of taste — on
 * 302 LoCoMo questions, against a no-rerank baseline of 82.8%:
 *
 *   10 candidates  recall@5 88.1%  (+5.3)   524 ms
 *   15 candidates  recall@5 90.4%  (+7.6)   727 ms
 *   25 candidates  recall@5 91.7%  (+8.9)  1161 ms
 *
 * Fifteen is where the curve bends: 25 buys 1.3 points more for 434 ms more.
 * This constant was 40 when it was a guess, which would have cost about two
 * seconds a search for less than the 25-row result.
 */
export const DEFAULT_CANDIDATES = 15

/** Give up rather than hold a search open. */
const SCORE_TIMEOUT_MS = 15_000

export interface Rerankable {
  /** The text actually compared against the query. */
  text: string
}

export interface Reranker {
  /** Highest first. On any failure, the input order, unchanged. */
  rerank<T extends Rerankable>(query: string, docs: T[]): Promise<T[]>
  /** False once the model has proven it cannot load here. */
  readonly available: boolean
}

interface Loaded {
  /** Takes a batch of queries and the matching batch of passages. */
  tokenizer: (q: string[], opts: Record<string, unknown>) => unknown
  model: (inputs: unknown) => Promise<{ logits: { data: ArrayLike<number> } }>
}

/** A reranker that does nothing, for when it is switched off or unavailable. */
export function noReranker(): Reranker {
  return {
    available: false,
    async rerank<T extends Rerankable>(_q: string, docs: T[]): Promise<T[]> {
      return docs
    },
  }
}

export interface RerankerOptions {
  modelId?: string
  cacheDir?: string
  /**
   * Longest text scored.
   *
   * Do not lower this to save time. Measured on 302 LoCoMo questions, cutting
   * the passage is the one change that turns the reranker harmful:
   *
   *   2000 chars  recall@5 91.7%  (+8.9 over no rerank)  1161 ms
   *   1000 chars  recall@5 88.1%  (+5.3)                  893 ms
   *    600 chars  recall@5 78.8%  (-4.0)                  547 ms
   *
   * At 600 it ranks below doing nothing: it is judging a fragment that often no
   * longer contains the evidence, and doing so confidently.
   */
  maxChars?: number
  /** Pairs per forward pass. Larger is faster until it is out of memory. */
  batchSize?: number
}

/**
 * Pairs per forward pass. One, measured.
 *
 * Batching was the obvious optimisation and it made things *worse*: 25 chunks
 * scored eight at a time took 1425 ms against 1161 ms one at a time, for the
 * same recall. Padding is why — every row in a batch pads to the longest in it,
 * and vault chunks vary from a line to 1500 characters, so most of a batch is
 * compute spent on padding. Left configurable because a corpus of uniform
 * lengths would come out the other way.
 */
export const DEFAULT_BATCH = 1

export function createReranker(opts: RerankerOptions = {}): Reranker {
  const modelId = opts.modelId ?? DEFAULT_RERANK_MODEL
  const maxChars = opts.maxChars ?? 2000
  const batchSize = Math.max(1, opts.batchSize ?? DEFAULT_BATCH)
  let loading: Promise<Loaded | null> | null = null
  let dead = false

  async function load(): Promise<Loaded | null> {
    if (dead) return null
    if (!loading) {
      loading = (async () => {
        try {
          const t = await import('@huggingface/transformers')
          if (opts.cacheDir) {
            ;(t.env as { cacheDir?: string }).cacheDir = opts.cacheDir
          }
          t.env.allowLocalModels = true
          const tokenizer = await t.AutoTokenizer.from_pretrained(modelId)
          const model = await t.AutoModelForSequenceClassification.from_pretrained(modelId, {
            dtype: 'q8',
          })
          return { tokenizer, model } as unknown as Loaded
        } catch (e) {
          // Once is enough. Retrying a model that is not there turns every
          // search into a failed download.
          dead = true
          console.error(`[pomnia-core] reranker unavailable (${modelId}): ${(e as Error).message}`)
          return null
        }
      })()
    }
    return loading
  }

  return {
    get available(): boolean {
      return !dead
    },
    async rerank<T extends Rerankable>(query: string, docs: T[]): Promise<T[]> {
      if (docs.length < 2) return docs
      const loaded = await load()
      if (!loaded) return docs

      try {
        const scored = await withTimeout(
          (async () => {
            const out: { doc: T; score: number }[] = []
            // Sequential by default — see DEFAULT_BATCH for why batching lost.
            for (let i = 0; i < docs.length; i += batchSize) {
              const slice = docs.slice(i, i + batchSize)
              const inputs = loaded.tokenizer(
                slice.map(() => query),
                {
                  text_pair: slice.map((d) => d.text.slice(0, maxChars)),
                  padding: true,
                  truncation: true,
                },
              )
              const { logits } = await loaded.model(inputs)
              // One logit per row, in order.
              slice.forEach((doc, j) => out.push({ doc, score: Number(logits.data[j]) }))
            }
            return out
          })(),
          SCORE_TIMEOUT_MS,
        )
        // Stable within equal scores: a reranker that cannot tell two rows
        // apart should leave the order the retriever chose.
        return scored
          .map((s, i) => ({ ...s, i }))
          .sort((a, b) => b.score - a.score || a.i - b.i)
          .map((s) => s.doc)
      } catch (e) {
        console.error(`[pomnia-core] rerank failed, keeping retrieval order: ${(e as Error).message}`)
        return docs
      }
    },
  }
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`rerank exceeded ${ms} ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
