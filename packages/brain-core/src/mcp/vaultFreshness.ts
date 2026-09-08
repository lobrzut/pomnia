// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Tell an agent when a note it is working from has changed underneath it.
 *
 * The case, in the user's words: three agents in one project, each working. One
 * of them — or a replica pushing in from another machine — edits `sprawa/X`.
 * The others are still reasoning from the version they read ten minutes ago,
 * and nothing tells them the ground moved.
 *
 * The honest way to do this is MCP resource subscriptions, and Pomnia cannot,
 * yet: the transport is stateless, a new Server per request, no held connection
 * to push a notification down and no session identity to say *which* agent to
 * push to. That is B6, and it is a real piece of work.
 *
 * This is the piece that does not need it. Pomnia already has one channel that
 * reaches an agent mid-session — the text of a tool result, the same channel
 * the unsaved-work reminder uses. So: remember the content hash of each note
 * the server hands out, and on the next tool call, if any of those notes now
 * hashes differently on disk, say so in the result.
 *
 * What it can and cannot do, stated plainly because the difference matters:
 *
 *   - It fires when an agent reads a note, that note changes, and the agent
 *     makes another tool call. That is the common shape and it is covered.
 *   - It cannot reach an agent whose context has already ended — there is no
 *     call left to append to. Same wall as everything else here.
 *   - State is process-global, because the server has no per-agent identity. If
 *     two agents read the same note, the second read resets the baseline and
 *     the first may miss its notice. This is a real limit, not a bug, and it is
 *     why B6 exists.
 *
 * The one rule that makes it safe to ship regardless: it never invents a change
 * it cannot see on disk, and never fires twice for the same change. A missed
 * notice costs nothing beyond today's behaviour; a false one trains the agent
 * to ignore the channel, which costs the unsaved-work reminder too.
 */
import { createHash } from 'node:crypto'

/** How many served notes to remember. A working session touches a handful. */
const TRACKED = 32
/** Do not repeat a freshness notice more often than this. */
const COOLDOWN_MS = 2 * 60 * 1000

interface Served {
  /** Vault-relative path or resource key, for the message. */
  label: string
  /** Content hash when the server last handed this note out. */
  hash: string
  servedAt: number
}

export interface FreshnessNotice {
  label: string
  minutesAgo: number
}

/**
 * Hash content the way this tracker compares it. Exposed so a caller that
 * already has the bytes does not read the file twice.
 */
export function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

export class VaultFreshness {
  private readonly served = new Map<string, Served>()
  private lastNoticeAt = 0

  /**
   * Record that the server just handed out this note's content.
   *
   * Called wherever a note leaves the server whole: a resource read, a brain
   * skill fetched by an agent, a prompt loaded. Not for search hits — those are
   * fragments, and an agent does not carry a chunk forward as the note.
   */
  served_(label: string, content: string, now: number = Date.now()): void {
    this.served.set(label, { label, hash: hashContent(content), servedAt: now })
    // Bounded: drop the oldest once over the cap.
    if (this.served.size > TRACKED) {
      let oldestKey: string | null = null
      let oldest = Infinity
      for (const [k, v] of this.served) {
        if (v.servedAt < oldest) {
          oldest = v.servedAt
          oldestKey = k
        }
      }
      if (oldestKey) this.served.delete(oldestKey)
    }
  }

  /**
   * Given the current on-disk hash of a tracked note, has it changed since the
   * server served it? Updates the baseline so one change is reported once.
   *
   * The caller reads the file (the tracker does not know how to find it), which
   * also means a note that was deleted or became unreadable simply stops being
   * checked — its absence is not a "change" worth interrupting anyone over.
   */
  check(currentHashes: Map<string, string>, now: number = Date.now()): FreshnessNotice[] {
    if (now - this.lastNoticeAt < COOLDOWN_MS) return []
    const out: FreshnessNotice[] = []
    for (const [label, current] of currentHashes) {
      const prev = this.served.get(label)
      if (!prev || prev.hash === current) continue
      out.push({ label, minutesAgo: Math.max(1, Math.round((now - prev.servedAt) / 60_000)) })
      // Advance the baseline so the same change does not fire on every later
      // call — only the next genuine change will.
      this.served.set(label, { label, hash: current, servedAt: now })
    }
    if (out.length > 0) this.lastNoticeAt = now
    return out
  }

  /** Labels currently tracked, so the caller knows which files to hash. */
  trackedLabels(): string[] {
    return [...this.served.keys()]
  }
}

/** The line appended to a tool result. Plain, and it names what to re-read. */
export function freshnessReminder(notices: FreshnessNotice[]): string | null {
  if (notices.length === 0) return null
  const list = notices
    .map((n) => `${n.label} (read ${n.minutesAgo} min ago)`)
    .join(', ')
  return (
    `\n\n---\nPomnia: ${list} changed on disk since it was read here. ` +
    `If you are working from the earlier version — another agent or another machine may ` +
    `have edited it — re-read it before relying on what you have.`
  )
}
