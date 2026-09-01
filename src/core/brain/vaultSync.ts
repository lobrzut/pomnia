// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Surface sync client: push and pull the knowledge layer (~12 MB), not blobs.
 *
 * Push (existing): offer local manifest -> peer planSync -> upload wanted files.
 * Pull (A1): fetch peer manifest -> local planSync -> download wanted files.
 * Same handshake both ways — no separate protocol.
 *
 * Conflicts keep both versions (suffix incoming). distill-ledger.json merges as
 * set-union of ids inside applyFile on whichever side receives it.
 *
 * Interrupted runs resume: the next plan only wants paths whose content hash
 * still differs, so completed transfers are not re-sent.
 */

import { promises as fs } from 'node:fs'
import { join, relative, sep } from 'node:path'

import {
  applyFile,
  buildSyncManifest,
  planSync,
  sha256,
  SYNC_DIRS,
  SYNC_ROOT_FILES,
  type ApplyResult,
  type ManifestEntry,
} from '../../../packages/brain-core/src/sync/index.js'
import { log } from '../log.js'

/** Mirrors brain-core's SYNC_DIRS — the replica rejects anything else anyway. */
export const SYNCED_DIRS = SYNC_DIRS

export const SYNCED_ROOT_FILES = SYNC_ROOT_FILES

export interface SyncManifestEntry {
  path: string
  sha256: string
  size: number
}

export interface VaultSyncResult {
  /** Files the replica already had, byte for byte. */
  unchanged: number
  uploaded: number
  /** Files the replica asked for but that failed to upload, with the reason. */
  failed: Array<{ path: string; reason: string }>
  /** Skipped locally before offering — too big, unreadable. */
  skipped: Array<{ path: string; reason: string }>
  /** Present on the replica, absent here. Reported only; nothing is deleted. */
  extraOnReplica: string[]
  bytesUploaded: number
  /** Peer kept its file and wrote ours under a suffix. */
  conflicts: Array<{ kept: string; wrote: string }>
}

export interface VaultPullResult {
  unchanged: number
  downloaded: number
  failed: Array<{ path: string; reason: string }>
  skipped: Array<{ path: string; reason: string }>
  /** Present here, absent on the peer — reported; never deleted. */
  extraLocal: string[]
  bytesDownloaded: number
  conflicts: Array<{ kept: string; wrote: string }>
  ledgerMerged: boolean
}

export interface VaultSurfaceSyncResult {
  push: VaultSyncResult
  pull: VaultPullResult
}

/** Walk the synced subset of a vault (shared with brain-core). */
export async function buildVaultManifest(
  vaultRoot: string,
): Promise<{ entries: SyncManifestEntry[]; skipped: Array<{ path: string; reason: string }> }> {
  return buildSyncManifest(vaultRoot)
}

async function post(
  base: string,
  path: string,
  token: string | undefined,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await r.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`${path} returned ${r.status} (not JSON): ${text.slice(0, 200)}`)
  }
  if (!r.ok) {
    const p = parsed as { error?: string; hint?: string; detail?: string }
    const err = p?.error ?? ''
    const refusal: Record<string, string> = {
      write_needs_admin:
        'The target owns this vault, so writing to it needs an admin token — reissue the Connect token with --role admin.',
      not_a_replica:
        'The target owns the vault and this version of it accepts pushes only on a read-only replica. Upgrade the server, or point this at a replica.',
    }
    if (refusal[err]) {
      const e: Error & { code?: string } = new Error(`${refusal[err]} [${err}]`)
      e.code = err
      throw e
    }
    throw new Error(
      `${path} → ${r.status} ${err}${p?.hint ? ` — ${p.hint}` : ''}${p?.detail ? ` — ${p.detail}` : ''}`.trim(),
    )
  }
  return parsed
}

function normalizeBase(target: string): string {
  return target.replace(/\/+$/, '').replace(/\/mcp$/, '')
}

export interface VaultSyncOptions {
  vaultRoot: string
  /** Peer base URL, e.g. https://brain.example.com */
  target: string
  token?: string
  onProgress?: (done: number, total: number, path: string) => void
  signal?: AbortSignal
}

/**
 * Push this vault's surface to `target`.
 *
 * Never deletes. Files present on the peer and absent here come back as
 * `extraOnReplica`. Content-hash resume: already-identical files are unchanged.
 */
export async function syncVaultToReplica(opts: VaultSyncOptions): Promise<VaultSyncResult> {
  const base = normalizeBase(opts.target)
  const { entries, skipped } = await buildVaultManifest(opts.vaultRoot)

  const plan = (await post(base, '/sync/plan', opts.token, { manifest: entries, reportExtras: true }, 120_000)) as {
    wanted: string[]
    unchanged: number
    extra: string[]
    rejected: Array<{ path: string; reason: string }>
  }

  const result: VaultSyncResult = {
    unchanged: plan.unchanged,
    uploaded: 0,
    failed: plan.rejected.map((r) => ({ path: r.path, reason: `replica refused: ${r.reason}` })),
    skipped,
    extraOnReplica: plan.extra ?? [],
    bytesUploaded: 0,
    conflicts: [],
  }

  const byPath = new Map(entries.map((e) => [e.path, e]))
  let done = 0
  for (const rel of plan.wanted) {
    if (opts.signal?.aborted) {
      result.failed.push({ path: rel, reason: 'cancelled' })
      break
    }
    const entry = byPath.get(rel)
    if (!entry) {
      result.failed.push({ path: rel, reason: 'not in local manifest' })
      continue
    }
    opts.onProgress?.(++done, plan.wanted.length, rel)
    try {
      const content = await fs.readFile(join(opts.vaultRoot, rel))
      const applied = (await post(
        base,
        '/sync/file',
        opts.token,
        { path: rel, sha256: sha256(content), contentBase64: content.toString('base64') },
        60_000,
      )) as ApplyResult
      if (!applied.ok) {
        result.failed.push({ path: rel, reason: applied.reason })
        continue
      }
      if (applied.conflict) result.conflicts.push(applied.conflict)
      if (!applied.unchanged) {
        result.uploaded++
        result.bytesUploaded += content.length
      } else {
        result.unchanged++
      }
    } catch (e) {
      result.failed.push({ path: rel, reason: (e as Error).message })
    }
  }

  if (result.uploaded > 0 || result.conflicts.length > 0) {
    try {
      await post(base, '/sync/reindex', opts.token, {}, 15_000)
    } catch (e) {
      result.failed.push({ path: '(replica reindex)', reason: (e as Error).message })
    }
  }

  log.info(
    `vault sync push → ${base}: ${result.uploaded} uploaded, ${result.unchanged} unchanged, ` +
      `${result.conflicts.length} conflicts, ${result.failed.length} failed, ` +
      `${result.extraOnReplica.length} extra on replica`,
  )
  return result
}

/**
 * Pull the peer's surface into this vault using the same planSync handshake.
 *
 * 1. Fetch peer manifest (path + content hash)
 * 2. planSync locally → wanted
 * 3. fetch + applyFile one path at a time (conflict suffix / ledger union)
 */
export async function pullVaultFromPeer(opts: VaultSyncOptions): Promise<VaultPullResult> {
  const base = normalizeBase(opts.target)
  const remote = (await post(base, '/sync/manifest', opts.token, {}, 120_000)) as {
    entries: ManifestEntry[]
    skipped?: Array<{ path: string; reason: string }>
  }
  const manifest = Array.isArray(remote.entries) ? remote.entries : []

  const plan = await planSync({
    vaultRoot: opts.vaultRoot,
    manifest,
    scanDirs: SYNC_DIRS,
  })

  const result: VaultPullResult = {
    unchanged: plan.unchanged,
    downloaded: 0,
    failed: plan.rejected.map((r) => ({ path: r.path, reason: `local refused: ${r.reason}` })),
    skipped: remote.skipped ?? [],
    extraLocal: plan.extra,
    bytesDownloaded: 0,
    conflicts: [],
    ledgerMerged: false,
  }

  let done = 0
  for (const rel of plan.wanted) {
    if (opts.signal?.aborted) {
      result.failed.push({ path: rel, reason: 'cancelled' })
      break
    }
    opts.onProgress?.(++done, plan.wanted.length, rel)
    try {
      const fetched = (await post(base, '/sync/fetch', opts.token, { path: rel }, 60_000)) as {
        path: string
        sha256: string
        contentBase64: string
        size: number
      }
      const content = Buffer.from(fetched.contentBase64, 'base64')
      const applied = await applyFile({
        vaultRoot: opts.vaultRoot,
        path: fetched.path ?? rel,
        content,
        sha256: fetched.sha256,
      })
      if (!applied.ok) {
        result.failed.push({ path: rel, reason: applied.reason })
        continue
      }
      if (applied.conflict) result.conflicts.push(applied.conflict)
      if (applied.ledgerMerged) result.ledgerMerged = true
      if (applied.unchanged) {
        result.unchanged++
      } else {
        result.downloaded++
        result.bytesDownloaded += content.length
      }
    } catch (e) {
      result.failed.push({ path: rel, reason: (e as Error).message })
    }
  }

  log.info(
    `vault sync pull ← ${base}: ${result.downloaded} downloaded, ${result.unchanged} unchanged, ` +
      `${result.conflicts.length} conflicts, ${result.failed.length} failed, ` +
      `${result.extraLocal.length} extra local`,
  )
  return result
}

/**
 * Bidirectional surface sync: pull then push.
 *
 * Pull first so local gains peer notes (and ledger ids) before offering ours.
 * Manual Connect button and post-distill auto-sync both use this.
 */
export async function syncVaultSurface(opts: VaultSyncOptions): Promise<VaultSurfaceSyncResult> {
  const pull = await pullVaultFromPeer(opts)
  const push = await syncVaultToReplica(opts)
  return { pull, push }
}
