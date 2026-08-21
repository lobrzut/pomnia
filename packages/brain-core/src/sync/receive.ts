// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Receiving half of vault replication.
 *
 * Surface sync is bidirectional: each side uses this same plan → apply
 * handshake. Ownership + admin tokens still gate writes; pull is a read of the
 * peer's manifest plus local apply.
 *
 * Two steps, because sending 1996 files to discover 3 changed would make sync
 * something nobody runs:
 *
 *   1. the sender offers a manifest (path + sha256 + size)
 *   2. the replica answers with the subset it does not already have
 *   3. the sender uploads only those
 *
 * Deletions are reported, never performed.
 *
 * Conflicts (same path, different content hash): keep both — leave the local
 * file, write the incoming bytes under a numeric suffix, and report. Identical
 * hash is a no-op. Never silent overwrite (same rule as save_conversation).
 *
 * distill-ledger.json is special: set-union of conversation ids, never replace.
 */

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

import { DISTILL_LEDGER_REL, MAX_FILE_BYTES, safeVaultPath, type PathRejection } from './paths.js'
import { mergeDistillLedgerBytes } from './ledgerMerge.js'

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
  | {
      ok: true
      path: string
      bytes: number
      /** True when content matched an existing file — nothing written. */
      unchanged?: boolean
      /** Incoming landed under a suffix because the path already differed. */
      conflict?: { kept: string; wrote: string }
      /** distill-ledger was union-merged rather than replaced. */
      ledgerMerged?: boolean
    }
  | {
      ok: false
      path: string
      reason: PathRejection | 'too-large' | 'hash-mismatch' | 'write-failed'
      detail?: string
    }

export type ReadSyncResult =
  | { ok: true; path: string; sha256: string; size: number; content: Buffer }
  | {
      ok: false
      path: string
      reason: PathRejection | 'not-found' | 'too-large' | 'read-failed'
      detail?: string
    }

/**
 * Next free path: `note.md` → `note-2.md` → `note-3.md` …
 * Same collision rule as save_conversation — never replace what is already there.
 */
export async function conflictSuffixPath(vaultRoot: string, relative: string): Promise<string> {
  const dir = dirname(relative)
  const base = basename(relative)
  const ext = extname(base)
  const stem = ext ? base.slice(0, -ext.length) : base
  for (let n = 2; n < 1000; n++) {
    const candidate = dir === '.' ? `${stem}-${n}${ext}` : `${dir}/${stem}-${n}${ext}`
    try {
      await fs.access(join(vaultRoot, candidate))
    } catch {
      return candidate
    }
  }
  throw new Error(`no free conflict suffix for ${relative}`)
}

async function writeAtomic(abs: string, content: Buffer): Promise<void> {
  await fs.mkdir(dirname(abs), { recursive: true })
  const tmp = `${abs}.sync-tmp`
  await fs.writeFile(tmp, content)
  await fs.rename(tmp, abs)
}

/** Read one synced file for pull (`/sync/fetch`). Validates path first. */
export async function readSyncFile(opts: {
  vaultRoot: string
  path: string
}): Promise<ReadSyncResult> {
  const verdict = safeVaultPath(opts.path)
  if (!verdict.ok) return { ok: false, path: opts.path, reason: verdict.reason }
  try {
    const content = await fs.readFile(join(opts.vaultRoot, verdict.relative))
    if (content.length > MAX_FILE_BYTES) {
      return { ok: false, path: verdict.relative, reason: 'too-large' }
    }
    return {
      ok: true,
      path: verdict.relative,
      sha256: sha256(content),
      size: content.length,
      content,
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: false, path: verdict.relative, reason: 'not-found' }
    }
    return { ok: false, path: verdict.relative, reason: 'read-failed', detail: (e as Error).message }
  }
}

/**
 * Write one received file.
 *
 * The hash is verified against the content actually received, not against what
 * the sender claimed in the manifest — a truncated upload that still lands
 * under the right name is the failure mode that would poison the replica's
 * index while every counter said success.
 *
 * Same path + different hash → keep local, write incoming under a suffix, report.
 * distill-ledger.json → set-union of ids, never replace or conflict-suffix.
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

  if (verdict.relative === DISTILL_LEDGER_REL) {
    try {
      let localBuf: Buffer | null = null
      try {
        localBuf = await fs.readFile(join(opts.vaultRoot, DISTILL_LEDGER_REL))
      } catch {
        localBuf = null
      }
      const merged = mergeDistillLedgerBytes(localBuf, opts.content)
      await writeAtomic(join(opts.vaultRoot, DISTILL_LEDGER_REL), merged)
      return {
        ok: true,
        path: DISTILL_LEDGER_REL,
        bytes: merged.length,
        ledgerMerged: true,
        unchanged: localBuf !== null && sha256(localBuf) === sha256(merged),
      }
    } catch (e) {
      return {
        ok: false,
        path: DISTILL_LEDGER_REL,
        reason: 'write-failed',
        detail: (e as Error).message,
      }
    }
  }

  const abs = join(opts.vaultRoot, verdict.relative)
  try {
    const existingHash = await hashFile(abs)
    if (existingHash === actual) {
      return { ok: true, path: verdict.relative, bytes: opts.content.length, unchanged: true }
    }
    if (existingHash !== null) {
      const alt = await conflictSuffixPath(opts.vaultRoot, verdict.relative)
      const altVerdict = safeVaultPath(alt)
      if (!altVerdict.ok) {
        return {
          ok: false,
          path: verdict.relative,
          reason: 'write-failed',
          detail: `conflict path refused: ${altVerdict.reason}`,
        }
      }
      await writeAtomic(join(opts.vaultRoot, alt), opts.content)
      return {
        ok: true,
        path: alt,
        bytes: opts.content.length,
        conflict: { kept: verdict.relative, wrote: alt },
      }
    }
    await writeAtomic(abs, opts.content)
    return { ok: true, path: verdict.relative, bytes: opts.content.length }
  } catch (e) {
    return { ok: false, path: verdict.relative, reason: 'write-failed', detail: (e as Error).message }
  }
}
