// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Which agents have actually talked to this memory.
 *
 * The desktop answers that question today by walking a hardcoded list of seven
 * config files and reporting whether a `pomnia` block is in them. That is a
 * list of clients somebody wrote code for, and it says a file parsed — which
 * this project has now watched mean nothing twice over: six clients sat green
 * while answering 403, and one sat green with a token the server rejects.
 *
 * The server knows better, because every MCP client introduces itself. The
 * `initialize` request carries `clientInfo: { name, version }`, so a client
 * that has called is a client that exists, whether or not anyone wrote a spec
 * for it. An agent released tomorrow appears here the first time it connects,
 * and nothing needs updating.
 *
 * Kept in memory on purpose. This is "who has been here since the server
 * started", not an audit log — persisting it would turn a client someone tried
 * once into a permanent fixture of the list, which is the same wrongness as a
 * config file that outlives the tool that wrote it.
 */

export interface SeenClient {
  /** As the client introduced itself. Not normalised: their name, their case. */
  name: string
  version?: string
  /** Epoch ms, first and most recent `initialize` from this name. */
  firstSeen: number
  lastSeen: number
  /** How many times it has introduced itself — i.e. restarts and reconnects. */
  connects: number
}

/** Bound so a misbehaving client cannot grow this without limit. */
const MAX_CLIENTS = 64

/**
 * Pomnia's own liveness probe, which opens an MCP session on a timer purely to
 * ask whether the server answers. It is not an agent and it has never read a
 * note, so listing it under 'agents that used your memory' is false — and,
 * because it runs every few seconds, it outnumbers the real clients: 217
 * connections against 21 from a person's actual editor. Excluded by name.
 */
const PROBE_CLIENTS = new Set(['pomnia-status-probe'])
const MAX_NAME = 64

const clients = new Map<string, SeenClient>()

/** Test seam: one case's clients must not leak into the next. */
export function resetSeenClients(): void {
  clients.clear()
}

function clean(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  // Control characters would land in a UI and in logs; a name is a label.
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max)
  return s.length > 0 ? s : undefined
}

/**
 * Record an `initialize`, if that is what this body is.
 *
 * Takes the whole JSON-RPC body and decides for itself, so callers do not have
 * to know the shape — and so a batch (an array of messages) is handled rather
 * than silently ignored.
 */
export function noteMcpBody(body: unknown, now: number = Date.now()): void {
  const messages = Array.isArray(body) ? body : [body]
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue
    const msg = m as { method?: unknown; params?: { clientInfo?: unknown } }
    if (msg.method !== 'initialize') continue
    const info = msg.params?.clientInfo as { name?: unknown; version?: unknown } | undefined
    const name = clean(info?.name, MAX_NAME)
    if (!name || PROBE_CLIENTS.has(name.toLowerCase())) continue

    const existing = clients.get(name)
    if (existing) {
      existing.lastSeen = now
      existing.connects += 1
      if (!existing.version) existing.version = clean(info?.version, MAX_NAME)
      continue
    }
    if (clients.size >= MAX_CLIENTS) {
      // Drop the least recently seen rather than refusing the new one: the
      // interesting client is usually the one that just arrived.
      let oldestKey: string | null = null
      let oldest = Infinity
      for (const [k, v] of clients) {
        if (v.lastSeen < oldest) {
          oldest = v.lastSeen
          oldestKey = k
        }
      }
      if (oldestKey) clients.delete(oldestKey)
    }
    clients.set(name, {
      name,
      version: clean(info?.version, MAX_NAME),
      firstSeen: now,
      lastSeen: now,
      connects: 1,
    })
  }
}

/** Most recently seen first — the order somebody scanning the list wants. */
export function seenClients(): SeenClient[] {
  return [...clients.values()].sort((a, b) => b.lastSeen - a.lastSeen)
}
