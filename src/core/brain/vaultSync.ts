// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Sending half of vault replication: push this machine's vault to a replica.
 *
 * Until now "the server has a copy" meant a tar somebody ran once. That is
 * fine for standing a replica up and useless afterwards — the copy starts
 * rotting the moment the next conversation is saved, and nothing says so.
 *
 * Direction is deliberate and one-way. The desktop owns the vault (see
 * `state/vault-writer.json`), so it is the only side that can be right when
 * the two disagree. A replica that could push back would be able to resurrect
 * notes the owner deleted.
 *
 * The manifest handshake exists because the alternative does not get used:
 * uploading 2000 files to discover three changed is a button nobody presses
 * twice. Blobs are excluded — 2.51 GB the replica's search never reads.
 */

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { log } from '../log.js'

/** Mirrors brain-core's SYNC_DIRS — the replica rejects anything else anyway. */
export const SYNCED_DIRS = [
  'sessions',
  'distilled',
  'notes',
  'digests',
  'skills',
  'chats',
  'state',
] as const

export const SYNCED_ROOT_FILES = ['USER.md', 'AGENTS.md'] as const

const ALLOWED_EXT = /\.(md|markdown|txt|json|ya?ml)$/i
const MAX_FILE_BYTES = 8 * 1024 * 1024

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
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

/** Walk the synced subset of a vault, newest-relevant files included. */
export async function buildVaultManifest(
  vaultRoot: string,
): Promise<{ entries: SyncManifestEntry[]; skipped: Array<{ path: string; reason: string }> }> {
  const entries: SyncManifestEntry[] = []
  const skipped: Array<{ path: string; reason: string }> = []

  const consider = async (abs: string, rel: string): Promise<void> => {
    if (!ALLOWED_EXT.test(rel)) return
    let stat
    try {
      stat = await fs.stat(abs)
    } catch (e) {
      // Absent is not skipped. A vault with no AGENTS.md is an ordinary vault,
      // and listing it as a problem trains people to ignore the problem list.
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        skipped.push({ path: rel, reason: (e as Error).message })
      }
      return
    }
    if (stat.size > MAX_FILE_BYTES) {
      skipped.push({ path: rel, reason: `${(stat.size / 1024 / 1024).toFixed(1)} MB — over the 8 MB limit` })
      return
    }
    try {
      entries.push({ path: rel, sha256: sha256(await fs.readFile(abs)), size: stat.size })
    } catch (e) {
      skipped.push({ path: rel, reason: (e as Error).message })
    }
  }

  const walk = async (dirRel: string): Promise<void> => {
    let items
    try {
      items = await fs.readdir(join(vaultRoot, dirRel), { withFileTypes: true })
    } catch {
      return // a vault without `chats/` is normal, not an error
    }
    for (const it of items) {
      const rel = `${dirRel}/${it.name}`
      if (it.isDirectory()) await walk(rel)
      else await consider(join(vaultRoot, rel), rel)
    }
  }

  for (const d of SYNCED_DIRS) await walk(d)
  for (const f of SYNCED_ROOT_FILES) await consider(join(vaultRoot, f), f)
  return { entries, skipped }
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
    // Surface ownership refusals in plain language — "409" alone looks like a
    // network glitch, and "not_a_replica" is jargon for "you pushed at the SoT".
    if (err === 'not_a_replica') {
      // Plain language leads, but the code stays in the message and on the error.
      // Two reasons it cannot be dropped: it is what someone greps out of a log
      // when a user reports this, and the wording is ours to reword any time.
      // The server's hint is deliberately not the whole message — it is remote
      // text, so it goes after our sentence rather than replacing it.
      const e: Error & { code?: string } = new Error(
        'Target owns the vault (writable) — push only to a read-only replica, not the source of truth. [not_a_replica]',
      )
      e.code = 'not_a_replica'
      throw e
    }
    throw new Error(
      `${path} → ${r.status} ${err}${p?.hint ? ` — ${p.hint}` : ''}${p?.detail ? ` — ${p.detail}` : ''}`.trim(),
    )
  }
  return parsed
}

export interface VaultSyncOptions {
  vaultRoot: string
  /** Replica base URL, e.g. https://brain.example.com */
  target: string
  token?: string
  onProgress?: (done: number, total: number, path: string) => void
  signal?: AbortSignal
}

/**
 * Replicate the vault to `target`.
 *
 * Never deletes. Files present on the replica and absent here come back as
 * `extraOnReplica` for a human to look at — a sync that prunes on a manifest
 * it cannot fully verify is a sync that can destroy the only copy.
 */
export async function syncVaultToReplica(opts: VaultSyncOptions): Promise<VaultSyncResult> {
  const base = opts.target.replace(/\/+$/, '').replace(/\/mcp$/, '')
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
  }

  const byPath = new Map(entries.map((e) => [e.path, e]))
  let done = 0
  for (const rel of plan.wanted) {
    if (opts.signal?.aborted) {
      result.failed.push({ path: rel, reason: 'anulowane' })
      break
    }
    const entry = byPath.get(rel)
    if (!entry) {
      // The replica asked for something we never offered.
      result.failed.push({ path: rel, reason: 'not in local manifest' })
      continue
    }
    opts.onProgress?.(++done, plan.wanted.length, rel)
    try {
      const content = await fs.readFile(join(opts.vaultRoot, rel))
      // Re-hash what we are actually sending rather than trusting the manifest:
      // the file may have changed between building the manifest and getting here.
      await post(
        base,
        '/sync/file',
        opts.token,
        { path: rel, sha256: sha256(content), contentBase64: content.toString('base64') },
        60_000,
      )
      result.uploaded++
      result.bytesUploaded += content.length
    } catch (e) {
      result.failed.push({ path: rel, reason: (e as Error).message })
    }
  }

  // Files a replica holds but never indexed are files no agent can find, so
  // the upload is only half the job. Fire-and-forget: the replica reindexes in
  // the background and the count lands in its log, not in this result.
  if (result.uploaded > 0) {
    try {
      await post(base, '/sync/reindex', opts.token, {}, 15_000)
    } catch (e) {
      result.failed.push({ path: '(reindeks repliki)', reason: (e as Error).message })
    }
  }

  log.info(
    `vault sync → ${base}: ${result.uploaded} uploaded, ${result.unchanged} unchanged, ` +
      `${result.failed.length} failed, ${result.extraOnReplica.length} extra on replica`,
  )
  return result
}

/** Relative path in POSIX form, for callers that have an absolute one. */
export function toVaultRelative(vaultRoot: string, abs: string): string {
  return relative(vaultRoot, abs).split(sep).join('/')
}
