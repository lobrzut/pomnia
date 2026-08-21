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
 *   embed    the active backend answers (Ollama model, or ONNX fastembed)
 *   index    there are chunks to search
 *   vault    the corpus is readable
 *   db       the database opens and answers
 *
 * `degraded` is a real state and is used: a server that can still serve skills
 * and read notes while the embedder is down is not `down`, and calling it `down`
 * would train people to ignore the field.
 *
 * `checks.ollama` is kept as an alias of embed readiness for older probes and
 * the install.sh parser; new code should read `embed.backend` + `embed.ready`.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import type Database from 'better-sqlite3'

import type { EmbedBackendName, EmbedClient } from './rag/embed.js'
import type { SyncHealthSnapshot } from './sync/status.js'

export type CheckState = 'ok' | 'degraded' | 'down'

/** Fresh process: nothing received yet. Public /healthz must show this. */
export const EMPTY_SYNC_HEALTH: SyncHealthSnapshot = {
  lastReceivedAt: null,
  lastPeer: null,
  filesReceived: 0,
  conflicts: 0,
  archiveLastAt: null,
}

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

export interface HealthEmbedInfo {
  backend: EmbedBackendName
  /** Ollama tag or HuggingFace id actually used for vectors. */
  model: string
  ready: boolean
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
  /** Which embed backend is configured and whether preflight passed. */
  embed: HealthEmbedInfo
  checks: {
    db: Check
    index: Check
    vault: Check
    disk: Check
    /** Embedder readiness. Key kept as `ollama` for older clients / install.sh. */
    ollama: Check
  }
  /**
   * Chunk/file counts — cheap, and the number people actually ask for.
   * `null` on the public (redacted) response: zeroes used to look like an
   * empty index while `checks.index` said `ok`, which is how "0/0 mystery"
   * was born. Counts require a token (or `/admin/health`).
   */
  index: { files: number; chunks: number } | null
  /**
   * Surface + archive intake visibility. Stays public (like `embed.backend`):
   * operators need to see "nothing ever arrived" without a token. Conflict
   * *paths* live only under `/admin`, not here.
   */
  sync: SyncHealthSnapshot
  /**
   * Distillation worker visibility. Public enough for monitors: enabled /
   * busy / model redacted on anonymous. Full status under /admin/distill.
   */
  distill: {
    enabled: boolean
    runnable: boolean
    phase: string
    /** Chat model id — redacted on public /healthz. */
    model: string
  }
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
 *
 * Index counts become `null`, never `{files:0,chunks:0}` — a redacted empty
 * object reads as "the index is empty" while the check state still says ok.
 *
 * `embed.backend` and `embed.ready` stay public: operators and install.sh need
 * them without a token. The model id is redacted (paths / HF cache hints).
 *
 * `sync.*` stays public the same way — `lastReceivedAt: null` is how you tell
 * "nothing ever arrived" from a monitor without credentials.
 */
export function redactHealth(h: HealthReport): HealthReport {
  const bare = (c: Check): Check => ({ state: c.state })
  return {
    ...h,
    index: null,
    embed: {
      backend: h.embed.backend,
      model: '',
      ready: h.embed.ready,
    },
    // sync block is intentional public telemetry (no secrets, no vault paths).
    sync: { ...h.sync },
    distill: {
      enabled: h.distill.enabled,
      runnable: h.distill.runnable,
      phase: h.distill.phase,
      model: '',
    },
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
 * Embedder is checked with a short timeout when already warm. A cold fastembed
 * load can take tens of seconds (~0.5 GB ONNX) — allow that once, otherwise a
 * health endpoint that hangs forever is worse than reporting degraded.
 */
async function checkEmbedder(embedder: EmbedClient): Promise<Check> {
  const timeoutMs = embedder.backend === 'fastembed' && !embedder.ready ? 90_000 : 5_000
  try {
    await Promise.race([
      embedder.preflight(),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs),
      ),
    ])
    return { state: 'ok', detail: `${embedder.backend} ready (${embedder.config.modelId})` }
  } catch (e) {
    const why = (e as Error).message
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
  /** Intake counters; omit → empty (fresh / tests). */
  sync?: SyncHealthSnapshot
  /** Distill worker snapshot; omit → feature-off idle. */
  distill?: { enabled: boolean; runnable: boolean; phase: string; model: string }
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

  const embedCheck = opts.embedder
    ? await checkEmbedder(opts.embedder)
    : { state: 'down' as const, detail: 'embedder not configured' }

  // Embedder being down degrades rather than kills: skills, profile and note
  // reads still work, only semantic search stops. Saying `down` for a server
  // that is still useful teaches people to ignore the field.
  const effectiveEmbed: Check =
    embedCheck.state === 'down' ? { ...embedCheck, state: 'degraded' } : embedCheck

  const backend: EmbedBackendName = opts.embedder?.backend ?? 'ollama'
  const model = opts.embedder?.config.modelId ?? ''
  const embedReady = effectiveEmbed.state === 'ok'

  const status = worstOf([db, index, vault, disk, effectiveEmbed])
  return {
    ok: status !== 'down',
    service: 'brain-core',
    version: opts.version,
    status,
    auth: opts.authRequired,
    writable: opts.writable,
    vaultOwner: opts.vaultOwner,
    // Never negative. The caller derives startedAt monotonically, but this is
    // read by a panel and by monitors, and "running for minus two hours" is not
    // a fact any of them can act on — the live server printed -7028.
    uptimeSec: Math.max(0, Math.round((Date.now() - opts.startedAt) / 1000)),
    embed: { backend, model, ready: embedReady },
    checks: { db, index, vault, disk, ollama: effectiveEmbed },
    index: counts,
    sync: opts.sync ? { ...opts.sync } : { ...EMPTY_SYNC_HEALTH },
    distill: opts.distill
      ? { ...opts.distill }
      : { enabled: false, runnable: false, phase: 'idle', model: '' },
  }
}
