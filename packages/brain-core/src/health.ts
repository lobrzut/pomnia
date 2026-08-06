// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * What "healthy" means for a Pomnia server.
 *
 * `/healthz` used to answer `{"ok":true}` whenever the process was listening.
 * That is a liveness probe wearing a health check's name: a server with no
 * embedding model, an empty index, or an unreadable database answered exactly
 * the same as a working one. Every monitor and every client badge would show
 * green over a brain that returns nothing for every search — the failure this
 * project keeps paying for, sitting on its most visible endpoint.
 *
 * So health is assembled from the things that have to be true for a search to
 * come back with an answer, each reported separately with its own reason:
 *
 *   ollama   the embedder answers and has the model — no model, no query vector
 *   index    there are chunks to search
 *   vault    the corpus is readable
 *   db       the database opens and answers
 *
 * `degraded` is a real state and is used: a server that can still serve skills
 * and read notes while Ollama is down is not `down`, and calling it `down`
 * would train people to ignore the field.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import type Database from 'better-sqlite3'

import type { EmbedClient } from './rag/embed.js'

export type CheckState = 'ok' | 'degraded' | 'down'

export interface Check {
  state: CheckState
  /** Present whenever the state is not `ok`. Written for a human. */
  detail?: string
}

/**
 * Can this process actually write where it keeps its state?
 *
 * Nothing checked this, and "writable" in the report below means something
 * else entirely — who owns the vault. A full or read-only filesystem fails the
 * next sync, the next reindex and every token touch, while /healthz reports
 * `ok` because the database opens fine for reads.
 *
 * A real write, not a free-space calculation: quotas, read-only remounts and
 * permission changes all produce a working `statfs` and a failing write, and
 * the failing write is the thing that matters.
 */
async function checkDisk(dataDir: string): Promise<Check> {
  if (!dataDir) return { state: 'down', detail: 'no data directory configured' }
  const probe = join(dataDir, '.write-probe')
  try {
    await fs.writeFile(probe, String(Date.now()), 'utf8')
    await fs.rm(probe, { force: true })
  } catch (e) {
    return { state: 'down', detail: `cannot write to ${dataDir}: ${(e as Error).message}` }
  }
  try {
    const { bavail, bsize } = await fs.statfs(dataDir)
    const freeMb = (bavail * bsize) / 1024 / 1024
    // Indexing a large vault writes hundreds of megabytes of vectors. Warning
    // before it fails leaves room to act; warning after does not.
    if (freeMb < 200) {
      return { state: 'down', detail: `only ${freeMb.toFixed(0)} MB free on ${dataDir}` }
    }
    if (freeMb < 1024) {
      return { state: 'degraded', detail: `${freeMb.toFixed(0)} MB free — a full reindex may not fit` }
    }
  } catch {
    // statfs is unavailable on some filesystems; the write probe above already
    // answered the question that matters.
  }
  return { state: 'ok' }
}

export interface HealthReport {
  /** Kept for compatibility: true unless something makes the server useless. */
  ok: boolean
  service: 'brain-core'
  version: string
  /** Worst of the checks below. */
  status: CheckState
  auth: boolean
  writable: boolean
  vaultOwner: string | null
  uptimeSec: number
  checks: {
    db: Check
    index: Check
    vault: Check
    disk: Check
    ollama: Check
  }
  /** Chunk/file counts — cheap, and the number people actually ask for. */
  index: { files: number; chunks: number }
}

/**
 * Strip everything an anonymous caller has no business reading.
 *
 * The verdict is not a secret — a monitor has to be able to see that the
 * server is broken, and hiding it would defeat the point of the endpoint. The
 * *reasons* are: they name vault paths, the Ollama URL and the embedding
 * model, and the counts say how much material is in there. Those go to whoever
 * holds a token, which is the same person who could ask the server anything
 * else anyway.
 */
export function redactHealth(h: HealthReport): HealthReport {
  const bare = (c: Check): Check => ({ state: c.state })
  return {
    ...h,
    index: { files: 0, chunks: 0 },
    checks: {
      db: bare(h.checks.db),
      index: bare(h.checks.index),
      vault: bare(h.checks.vault),
      disk: bare(h.checks.disk),
      ollama: bare(h.checks.ollama),
    },
  }
}

const WORST: Record<CheckState, number> = { ok: 0, degraded: 1, down: 2 }

export function worstOf(checks: Check[]): CheckState {
  return checks.reduce<CheckState>((acc, c) => (WORST[c.state] > WORST[acc] ? c.state : acc), 'ok')
}

function countRow(db: Database.Database, sql: string): number {
  const row = db.prepare(sql).get() as { c?: number } | undefined
  return typeof row?.c === 'number' ? row.c : 0
}

/**
 * Ollama is checked with its own short timeout rather than the embedder's
 * 5-minute one: a health endpoint that hangs for five minutes is worse than
 * one that reports `down`, because whatever polls it hangs too.
 */
async function checkOllama(embedder: EmbedClient): Promise<Check> {
  try {
    await Promise.race([
      embedder.preflight(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 5s')), 5_000)),
    ])
    return { state: 'ok' }
  } catch (e) {
    const why = (e as Error).message
    // Missing model and unreachable host are different problems with different
    // fixes, and the message from preflight already says which.
    return { state: 'down', detail: why }
  }
}

export async function collectHealth(opts: {
  db: Database.Database | null
  embedder: EmbedClient | null
  vaultRoot: string
  dataDir: string
  version: string
  authRequired: boolean
  writable: boolean
  vaultOwner: string | null
  startedAt: number
}): Promise<HealthReport> {
  let db: Check = { state: 'ok' }
  let index: Check = { state: 'ok' }
  let counts = { files: 0, chunks: 0 }

  if (!opts.db) {
    db = { state: 'down', detail: 'database not open' }
    index = { state: 'down', detail: 'database not open' }
  } else {
    try {
      counts = {
        files: countRow(opts.db, 'SELECT COUNT(*) AS c FROM indexed_files'),
        chunks: countRow(opts.db, 'SELECT COUNT(*) AS c FROM chunks'),
      }
      if (counts.chunks === 0) {
        // Serving an empty index is the single most misleading state a Pomnia
        // server can be in: everything answers, every search comes back empty.
        index = { state: 'down', detail: 'index is empty — run brain-core --reindex' }
      }
    } catch (e) {
      db = { state: 'down', detail: (e as Error).message }
      index = { state: 'down', detail: 'cannot read index' }
    }
  }

  let vault: Check = { state: 'ok' }
  try {
    const st = await fs.stat(opts.vaultRoot)
    if (!st.isDirectory()) vault = { state: 'down', detail: `${opts.vaultRoot} is not a directory` }
  } catch (e) {
    vault = { state: 'down', detail: `${opts.vaultRoot}: ${(e as Error).message}` }
  }

  const disk = await checkDisk(opts.dataDir)

  const ollama = opts.embedder
    ? await checkOllama(opts.embedder)
    : { state: 'down' as const, detail: 'embedder not configured' }

  // Ollama being down degrades rather than kills: skills, profile and note
  // reads still work, only semantic search stops. Saying `down` for a server
  // that is still useful teaches people to ignore the field.
  const effectiveOllama: Check = ollama.state === 'down' ? { ...ollama, state: 'degraded' } : ollama

  const status = worstOf([db, index, vault, disk, effectiveOllama])
  return {
    ok: status !== 'down',
    service: 'brain-core',
    version: opts.version,
    status,
    auth: opts.authRequired,
    writable: opts.writable,
    vaultOwner: opts.vaultOwner,
    uptimeSec: Math.round((Date.now() - opts.startedAt) / 1000),
    checks: { db, index, vault, disk, ollama: effectiveOllama },
    index: counts,
  }
}
