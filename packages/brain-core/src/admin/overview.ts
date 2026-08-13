// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * What the server has been doing — the dashboard's data.
 *
 * The panel could already change things, but it could not tell you anything:
 * whether agents are actually connecting, what they ask for, how much of the
 * vault is indexed, whether the last reindex helped. Settings without any of
 * that is a form, not a control room — you change a value and have no way to
 * see whether it mattered.
 *
 * Everything here is derived, never stored. A dashboard that maintains its own
 * counters drifts from the thing it describes, and then you are debugging the
 * dashboard.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import type Database from 'better-sqlite3'

import { INDEX_SUBDIRS, SKIP_DIRS } from '../rag/indexer.js'

/** Directories worth counting separately — the shape of a Pomnia vault. */
const VAULT_DIRS = ['sessions', 'distilled', 'notes', 'digests', 'skills', 'chats'] as const

export interface ActivityEntry {
  tool: string
  detail?: string
  ts: number
  /** Token or account name, when the call carried one. */
  actor?: string
}

/**
 * Recent MCP calls, newest first.
 *
 * A ring rather than a log file: it answers "is anything actually using this"
 * without adding a retention policy, a rotation story, or a place for vault
 * text to accumulate on disk. Query text is already in memory for
 * /mcp/activity; this only keeps more of it, briefly.
 */
export interface ActivityRing {
  push(e: ActivityEntry): void
  recent(limit?: number): ActivityEntry[]
  /** Distinct actors seen in the window, newest first. */
  actors(sinceMs: number): Array<{ name: string; last: number; calls: number }>
  countSince(sinceMs: number): number
}

export function createActivityRing(size = 50): ActivityRing {
  const items: ActivityEntry[] = []
  return {
    push(e) {
      items.unshift(e)
      if (items.length > size) items.length = size
    },
    recent(limit = size) {
      return items.slice(0, limit)
    },
    actors(sinceMs) {
      const cutoff = Date.now() - sinceMs
      const seen = new Map<string, { name: string; last: number; calls: number }>()
      for (const e of items) {
        if (e.ts < cutoff || !e.actor) continue
        const prev = seen.get(e.actor)
        if (prev) prev.calls++
        else seen.set(e.actor, { name: e.actor, last: e.ts, calls: 1 })
      }
      return [...seen.values()].sort((a, b) => b.last - a.last)
    },
    countSince(sinceMs) {
      const cutoff = Date.now() - sinceMs
      return items.filter((e) => e.ts >= cutoff).length
    },
  }
}

export interface VaultBreakdown {
  dir: string
  files: number
  bytes: number
  /**
   * Whether the indexer would ever look here.
   *
   * `skills/` holds 773 files on the live server and is deliberately never
   * indexed — it is served by get_skill, not searched. Counting it toward
   * "unindexed" made the dashboard report an 851-file gap that did not exist,
   * which is worse than reporting nothing: a metric that cries wolf gets
   * ignored, including on the day it is right.
   */
  indexable: boolean
}

/**
 * Count what is actually on disk, per directory.
 *
 * Deliberately separate from the index counts: the interesting number is the
 * gap between them. "1996 notes on disk, 1400 indexed" is a problem you can
 * only see by measuring both, and it is exactly the state a failed reindex
 * leaves behind while every counter it wrote says success.
 */
export async function vaultBreakdown(vaultRoot: string): Promise<VaultBreakdown[]> {
  const out: VaultBreakdown[] = []
  for (const dir of VAULT_DIRS) {
    // The indexer's own list, imported rather than restated: two copies of
    // "what gets indexed" drift, and the dashboard would then describe a
    // server that does not exist.
    const indexable = INDEX_SUBDIRS.has(dir) && !SKIP_DIRS.has(dir)
    let files = 0
    let bytes = 0
    const walk = async (rel: string, counted: boolean): Promise<void> => {
      let entries
      try {
        entries = await fs.readdir(join(vaultRoot, rel), { withFileTypes: true })
      } catch {
        return // a vault without chats/ is an ordinary vault
      }
      for (const e of entries) {
        const child = `${rel}/${e.name}`
        if (e.isDirectory()) {
          // `_review` and `_quarantine_stubs` live *inside* distilled/, so the
          // skip has to apply at every level, not just the top.
          await walk(child, counted && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
        } else if (counted && /\.(md|markdown|txt|json|ya?ml)$/i.test(e.name)) {
          files++
          try {
            bytes += (await fs.stat(join(vaultRoot, child))).size
          } catch {
            /* vanished between readdir and stat — it simply does not count */
          }
        }
      }
    }
    await walk(dir, true)
    if (files > 0) out.push({ dir, files, bytes, indexable })
  }
  return out
}

export interface IndexBreakdown {
  /** Distinct indexed files, and their chunks. */
  files: number
  chunks: number
  /** Most recently indexed file's timestamp, if the schema records one. */
  lastIndexedAt: number | null
}

export function indexBreakdown(db: Database.Database | null): IndexBreakdown {
  if (!db) return { files: 0, chunks: 0, lastIndexedAt: null }
  try {
    const f = db.prepare('SELECT COUNT(*) AS c FROM indexed_files').get() as { c?: number }
    const c = db.prepare('SELECT COUNT(*) AS c FROM chunks').get() as { c?: number }
    let lastIndexedAt: number | null = null
    try {
      const r = db.prepare('SELECT MAX(mtime_ms) AS m FROM indexed_files').get() as { m?: number }
      lastIndexedAt = typeof r?.m === 'number' ? r.m : null
    } catch {
      // Older schema without mtime_ms — absent, not zero. Zero would render as
      // 1970 and look like a broken index rather than a missing column.
    }
    return { files: f?.c ?? 0, chunks: c?.c ?? 0, lastIndexedAt }
  } catch {
    return { files: 0, chunks: 0, lastIndexedAt: null }
  }
}

export interface Overview {
  index: IndexBreakdown
  vault: VaultBreakdown[]
  /** Files on disk that the index does not know about. */
  unindexed: number
  activity: {
    recent: ActivityEntry[]
    lastHour: number
    last24h: number
    actors: Array<{ name: string; last: number; calls: number }>
  }
  uptimeSec: number
  version: string
}

export async function collectOverview(opts: {
  db: Database.Database | null
  vaultRoot: string
  ring: ActivityRing
  startedAt: number
  version: string
}): Promise<Overview> {
  const index = indexBreakdown(opts.db)
  const vault = await vaultBreakdown(opts.vaultRoot)
  // Only from directories the indexer would actually visit.
  const onDisk = vault.reduce((n, v) => n + (v.indexable ? v.files : 0), 0)
  return {
    index,
    vault,
    // Never negative: an index can legitimately hold rows for files that were
    // deleted but not yet pruned, and "-40 unindexed" is nonsense on a screen.
    unindexed: Math.max(0, onDisk - index.files),
    activity: {
      recent: opts.ring.recent(20),
      lastHour: opts.ring.countSince(60 * 60_000),
      last24h: opts.ring.countSince(24 * 60 * 60_000),
      actors: opts.ring.actors(24 * 60 * 60_000),
    },
    uptimeSec: Math.max(0, Math.round((Date.now() - opts.startedAt) / 1000)),
    version: opts.version,
  }
}
