// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Index a just-written note, and tell the truth about whether it worked.
 *
 * The file write is atomic — a temporary file and a rename, so a note is either
 * wholly there or not there at all. Indexing was not part of that promise: it
 * was started and not awaited, and a failure went to `console.error`, a log
 * nobody reads. The tool still answered "saved".
 *
 * A note on disk that is not in the index is not saved in the sense that
 * matters. Nothing will find it, `search_library` will not return it, and the
 * next session will not know it exists — while the agent that wrote it was told
 * it succeeded. That is the same failure this project keeps removing, in the
 * one place where it costs the most: the moment a decision is recorded.
 *
 * So: wait, briefly. Embedding one note takes milliseconds once the model is
 * loaded, and the first call after a cold start can take much longer. Waiting
 * without a bound would hold an MCP reply open through a model download;
 * waiting not at all is what produced this. The compromise is a deadline, and
 * three honest answers rather than one convenient one.
 */

export type IndexOutcome =
  /** In the index. `search_library` will return it now. */
  | 'indexed'
  /** Written, still indexing. It will appear; nothing is lost. */
  | 'pending'
  /** Written and NOT indexed. Nothing will find it until a reindex. */
  | 'failed'

/** How long to hold the reply waiting for the index. */
export const INDEX_WAIT_MS = 4_000

/**
 * Failures since this process started.
 *
 * Kept because a failure is invisible otherwise: the note is on disk, the
 * agent has moved on, and only a reindex would reveal it. /healthz reads this
 * so the gap is reported rather than discovered months later.
 */
let failures = 0
let lastFailure: { at: string; path: string; detail: string } | null = null

export function indexFailureSnapshot(): {
  count: number
  last: { at: string; path: string; detail: string } | null
} {
  return { count: failures, last: lastFailure }
}

/** Test seam — a count from one case must not leak into the next. */
export function resetIndexFailures(): void {
  failures = 0
  lastFailure = null
}

export async function indexAfterWrite(
  path: string,
  run: () => Promise<unknown>,
  waitMs: number = INDEX_WAIT_MS,
): Promise<IndexOutcome> {
  let settled: IndexOutcome | null = null
  const work = run().then(
    () => {
      if (settled === null) settled = 'indexed'
      return 'indexed' as const
    },
    (err: unknown) => {
      failures += 1
      lastFailure = {
        at: new Date().toISOString(),
        path,
        detail: err instanceof Error ? err.message : String(err),
      }
      if (settled === null) settled = 'failed'
      return 'failed' as const
    },
  )

  // The race is against a timer, not against the work: a slow index still
  // finishes and still records its failure if it has one. Only the reply
  // stops waiting.
  const timer = new Promise<'pending'>((resolve) => {
    const t = setTimeout(() => resolve('pending'), waitMs)
    // Do not hold the process open for a deadline nobody is waiting on.
    if (typeof t === 'object' && t !== null && 'unref' in t) {
      ;(t as { unref: () => void }).unref()
    }
  })

  const outcome = await Promise.race([work, timer])
  settled = outcome
  return outcome
}

/**
 * The line a tool appends to its reply.
 *
 * Written for an agent that has just recorded something and is deciding
 * whether it can move on. `failed` says plainly that nothing will find this,
 * because the alternative is an agent believing a decision is in the memory
 * when it is only on a disk.
 */
export function indexOutcomeNote(outcome: IndexOutcome): string {
  switch (outcome) {
    case 'indexed':
      return 'Indexed — search_library will return it now.'
    case 'pending':
      return 'Written. Indexing is still running; it will be searchable shortly.'
    case 'failed':
      return (
        'WRITTEN BUT NOT INDEXED — the file is on disk and search will not find it. ' +
        'Run brain-core --reindex, and tell the user: this note is invisible to recall until then.'
      )
  }
}
