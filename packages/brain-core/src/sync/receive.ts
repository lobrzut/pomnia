// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Receiving half of vault replication: a replica accepts pushes from the
 * instance that owns the vault.
 *
 * Direction is fixed and enforced, not conventional. Only an instance that is
 * *not* the vault owner accepts a push — the authoritative corpus is never
 * writable over the network, so a misconfigured peer cannot overwrite the vault
 * everything else is replicated from.
 *
 * Two steps, because sending 1996 files to discover 3 changed would make sync
 * something nobody runs:
 *
 *   1. the sender offers a manifest (path + sha256 + size)
 *   2. the replica answers with the subset it does not already have
 *   3. the sender uploads only those
 *
 * Deletions are reported, never performed. A replica that quietly deletes on a
 * bad manifest is a replica that can lose the only copy of something.
 */

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

import { MAX_FILE_BYTES, safeVaultPath, type PathRejection } from './paths.js'

/** Refuse absurd manifests before allocating anything for them. */
export const MAX_MANIFEST_ENTRIES = 100_000

export interface ManifestEntry {
  path: string
  sha256: string
  size: number
}

export interface SyncPlan {
  /** Paths the replica wants uploaded (missing or different). */
  wanted: string[]
  /** Already identical here — nothing to do. */
  unchanged: number
  /**
   * Present on the replica but absent from the manifest. Reported so a human
   * can decide; this code never removes them.
   */
  extra: string[]
  /** Entries refused, with the reason. Never silently dropped. */
  rejected: Array<{ path: string; reason: PathRejection | 'too-large' | 'bad-hash' }>
}

const SHA256_RE = /^[a-f0-9]{64}$/

export function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex')
}

async function hashFile(abs: string): Promise<string | null> {
  try {
    return sha256(await fs.readFile(abs))
  } catch {
    return null
  }
}

async function listExisting(vaultRoot: string, dirs: readonly string[]): Promise<string[]> {
  const out: string[] = []
  const walk = async (rel: string): Promise<void> => {
    let entries
    try {
      entries = await fs.readdir(join(vaultRoot, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const child = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(child)
      else if (safeVaultPath(child).ok) out.push(child)
    }
  }
  for (const d of dirs) await walk(d)
  return out
}

/**
 * Compare an offered manifest against what is on disk.
 *
 * Pure read — decides what to ask for and changes nothing.
 */
export async function planSync(opts: {
  vaultRoot: string
  manifest: ManifestEntry[]
  /** Root files and dirs to consider when reporting extras. */
  scanDirs?: readonly string[]
}): Promise<SyncPlan> {
  const plan: SyncPlan = { wanted: [], unchanged: 0, extra: [], rejected: [] }
  if (opts.manifest.length > MAX_MANIFEST_ENTRIES) {
    throw new Error(`manifest too large: ${opts.manifest.length} entries`)
  }

  const offered = new Set<string>()
  for (const entry of opts.manifest) {
    const verdict = safeVaultPath(entry?.path ?? '')
    if (!verdict.ok) {
      plan.rejected.push({ path: String(entry?.path ?? ''), reason: verdict.reason })
      continue
    }
    if (!SHA256_RE.test(entry.sha256 ?? '')) {
      plan.rejected.push({ path: verdict.relative, reason: 'bad-hash' })
      continue
    }
    if (!Number.isFinite(entry.size) || entry.size < 0 || entry.size > MAX_FILE_BYTES) {
      plan.rejected.push({ path: verdict.relative, reason: 'too-large' })
      continue
    }
    offered.add(verdict.relative)
    const have = await hashFile(join(opts.vaultRoot, verdict.relative))
    if (have === entry.sha256) plan.unchanged++
    else plan.wanted.push(verdict.relative)
  }

  if (opts.scanDirs?.length) {
    for (const p of await listExisting(opts.vaultRoot, opts.scanDirs)) {
      if (!offered.has(p)) plan.extra.push(p)
    }
  }
  return plan
}

export type ApplyResult =
  | { ok: true; path: string; bytes: number }
  | { ok: false; path: string; reason: PathRejection | 'too-large' | 'hash-mismatch' | 'write-failed'; detail?: string }

/**
 * Write one received file.
 *
 * The hash is verified against the content actually received, not against what
 * the sender claimed in the manifest — a truncated upload that still lands
 * under the right name is the failure mode that would poison the replica's
 * index while every counter said success.
 */
export async function applyFile(opts: {
  vaultRoot: string
  path: string
  content: Buffer
  sha256: string
}): Promise<ApplyResult> {
  const verdict = safeVaultPath(opts.path)
  if (!verdict.ok) return { ok: false, path: opts.path, reason: verdict.reason }
  if (opts.content.length > MAX_FILE_BYTES) {
    return { ok: false, path: verdict.relative, reason: 'too-large' }
  }
  const actual = sha256(opts.content)
  if (actual !== opts.sha256) {
    return {
      ok: false,
      path: verdict.relative,
      reason: 'hash-mismatch',
      detail: `expected ${opts.sha256.slice(0, 12)}…, received ${actual.slice(0, 12)}…`,
    }
  }
  const abs = join(opts.vaultRoot, verdict.relative)
  try {
    await fs.mkdir(dirname(abs), { recursive: true })
    // Write then rename: a reader (the indexer runs on a timer) must never see
    // a half-written note and record it as the file's content.
    const tmp = `${abs}.sync-tmp`
    await fs.writeFile(tmp, opts.content)
    await fs.rename(tmp, abs)
    return { ok: true, path: verdict.relative, bytes: opts.content.length }
  } catch (e) {
    return { ok: false, path: verdict.relative, reason: 'write-failed', detail: (e as Error).message }
  }
}
