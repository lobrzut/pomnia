// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Record which searches led to something being saved. Nothing else has this.
 *
 * Pomnia stands on both sides of one loop that no general model can see: the
 * query an agent asked, and the note the user kept twenty minutes later.
 * `search_library("token minting")` → `checkpoint_session` touching
 * `tokenRole.ts` is a relevance label — weak, but true, private, and earned
 * from this vault's own use. It is the raw material a reranker could one day be
 * tuned on without a public dataset that knows nothing about this work.
 *
 * Today it is thrown away: activity lives in a 50-entry in-memory ring that
 * dies with the process. This persists the pairs, and does nothing else with
 * them yet — deliberately.
 *
 * The discipline, stated up front because it is the whole risk: **recording is
 * not ranking.** A loop that promotes what was cited, so it gets cited more,
 * launders its own early mistakes into ground truth. So this writes an
 * append-only log and stops. Using it to change an order is a separate step
 * that has to be measured on LoCoMo against the version without it, the same
 * bar the date-in-chunk change and the reranker had to clear. Building the
 * recorder now means that measurement has data to run on in six months instead
 * of starting the clock then.
 *
 * One line per pairing, JSONL, under `state/` so it replicates with the vault
 * and is trivially inspectable. No query text is stored verbatim longer than
 * needed to pair it — see `record`.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Vault-relative, under state/ so it travels and merges like the ledger. */
export const USAGE_LOG_REL = 'state/usage-signal.jsonl'

/**
 * A save this long after a search is probably not about that search. Twenty
 * minutes is the same window the unsaved-work reminder treats as one session.
 */
const PAIR_WINDOW_MS = 20 * 60 * 1000

/** Keep only this many pending searches; a burst of recall should not grow forever. */
const MAX_PENDING = 20

export interface UsagePair {
  /** ISO day, not a timestamp: the signal is "this query, that save", not forensics. */
  day: string
  /** The query, trimmed and capped — enough to recognise, not to reconstruct a session. */
  query: string
  /** Vault-relative path that was written shortly after. */
  saved: string
  /** Which tool did the writing: save_conversation, checkpoint_session, memory. */
  via: string
  /** Minutes between the search and the save. */
  gapMin: number
}

interface Pending {
  query: string
  at: number
}

/**
 * Pairs searches with the writes that follow them.
 *
 * Process-global, like the other signals here, and for the same reason: the
 * server has no per-agent identity. That makes the pairing approximate — a
 * save could follow someone else's search — which is exactly why this is
 * recorded as a weak signal to be measured, never trusted as a label.
 */
export class UsageSignal {
  private pending: Pending[] = []

  constructor(private readonly vaultRoot: string) {}

  /** An agent searched. Hold the query briefly, waiting to see if a save follows. */
  searched(query: string, now: number = Date.now()): void {
    const q = query.trim().replace(/\s+/g, ' ').slice(0, 200)
    if (!q) return
    this.pending.push({ query: q, at: now })
    // Drop the stale and the excess: a query with no save inside the window
    // was recall, not research.
    this.pending = this.pending.filter((p) => now - p.at < PAIR_WINDOW_MS).slice(-MAX_PENDING)
  }

  /**
   * A note was written. Pair it with every recent search still in the window
   * and append the pairings. Returns how many were written, for the caller/test.
   */
  saved(path: string, via: string, now: number = Date.now()): number {
    const live = this.pending.filter((p) => now - p.at < PAIR_WINDOW_MS)
    if (live.length === 0) return 0
    const day = new Date(now).toISOString().slice(0, 10)
    const lines = live.map((p) => {
      const pair: UsagePair = {
        day,
        query: p.query,
        saved: path,
        via,
        gapMin: Math.max(0, Math.round((now - p.at) / 60_000)),
      }
      return JSON.stringify(pair)
    })
    this.append(lines)
    // A search pairs with the first save that follows it and is then spent —
    // otherwise one search below a burst of saves would flood the log.
    this.pending = []
    return lines.length
  }

  private append(lines: string[]): void {
    try {
      const file = join(this.vaultRoot, USAGE_LOG_REL)
      const dir = dirname(file)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      appendFileSync(file, lines.join('\n') + '\n', 'utf8')
    } catch {
      // A signal nobody is reading yet must never be able to fail a search or
      // a save. Losing a line costs nothing today.
    }
  }
}

/** Read the log back, for whoever eventually measures it. Tolerant of a torn last line. */
export function readUsageSignal(vaultRoot: string): UsagePair[] {
  const file = join(vaultRoot, USAGE_LOG_REL)
  if (!existsSync(file)) return []
  const out: UsagePair[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      const p = JSON.parse(t) as UsagePair
      if (p && typeof p.query === 'string' && typeof p.saved === 'string') out.push(p)
    } catch {
      /* a half-written final line is not a reason to lose the rest */
    }
  }
  return out
}
