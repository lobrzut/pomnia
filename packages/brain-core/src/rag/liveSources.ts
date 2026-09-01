// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Drop hits whose source file is no longer on disk.
 *
 * The index is not rebuilt on every delete. A note that is removed, renamed or
 * merged leaves its chunks behind, and `search` will keep returning them: real
 * text, a real-looking path, a real date, ranked among genuine results. There
 * is nothing in the answer to mark it as gone.
 *
 * That is the worst shape a hallucination can take here, because it does not
 * come from the model. The agent quotes it faithfully and cites a file that
 * does not exist, and grounding cannot catch it — the chunk really was about
 * the topic, back when it was true.
 *
 * Measured on the live vault during an audit: 2688 rows indexed against 2666
 * notes on disk. Twenty-two quotable passages with nothing behind them.
 *
 * /healthz now reports the gap, but reporting it does not stop the next recall
 * from serving one. This does. The stat cost is one syscall per returned row —
 * five, typically — against an answer that cannot be checked.
 */

import { promises as fs } from 'node:fs'

export interface PathedHit {
  path: string
}

export interface LiveSourceResult<T> {
  /** Hits whose file is still there, in the order given. */
  live: T[]
  /** Paths dropped because the file is gone. */
  missing: string[]
}

/**
 * Keep only hits whose source file still exists.
 *
 * A stat that fails for any reason other than "not there" — a permission
 * problem, an unmounted share — keeps the hit. Refusing to answer because a
 * mount is briefly unhappy would be a worse failure than the one this guards
 * against, and an unreadable file is a mount problem that /healthz reports
 * separately.
 */
export async function keepLiveSources<T extends PathedHit>(
  hits: readonly T[],
): Promise<LiveSourceResult<T>> {
  const live: T[] = []
  const missing: string[] = []
  await Promise.all(
    hits.map(async (h, i) => {
      try {
        await fs.access(h.path)
        live[i] = h
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') missing.push(h.path)
        else live[i] = h
      }
    }),
  )
  return { live: live.filter((h) => h !== undefined), missing }
}
