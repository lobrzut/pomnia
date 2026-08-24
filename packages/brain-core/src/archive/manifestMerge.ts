// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * VaultManifest merge (TOR B2).
 *
 * Header fields (vaultId, createdAt, name) are fixed at creation and identical
 * across copies of the same vault. The only growing part is snapshots[].
 * Snapshot.id is a UUID — collision is impossible — so merge is set-union by id.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { BLOB_HASH_RE, blobRelative } from './paths.js'
import { writeFileKeepingPrev } from './durableWrite.js'
import { listBlobHashes } from './blobs.js'

/** Minimal shape — full Snapshot fields are preserved through merge. */
export interface MergeableSnapshot {
  id: string
  [key: string]: unknown
}

export interface MergeableVaultManifest {
  formatVersion: 1
  vaultId: string
  createdAt: string
  name: string
  snapshots: MergeableSnapshot[]
}

export type MergeManifestResult =
  | {
      ok: true
      manifest: MergeableVaultManifest
      added: number
      total: number
      unchanged: boolean
    }
  | { ok: false; reason: 'vault-id-mismatch' | 'header-mismatch'; detail: string }

/**
 * Set-union of snapshots by id. Incoming wins nothing over local for the same
 * id — they are the same snapshot by construction (UUID + immutable blobs).
 * Local header fields are kept when both sides exist.
 */
export function mergeSnapshotsById(
  local: MergeableVaultManifest | null,
  incoming: MergeableVaultManifest,
): MergeManifestResult {
  if (!incoming || incoming.formatVersion !== 1 || !incoming.vaultId || !Array.isArray(incoming.snapshots)) {
    return {
      ok: false,
      reason: 'header-mismatch',
      detail: 'incoming manifest missing formatVersion/vaultId/snapshots',
    }
  }

  if (!local) {
    const seen = new Set<string>()
    const snapshots: MergeableSnapshot[] = []
    for (const s of incoming.snapshots) {
      if (!s?.id || seen.has(s.id)) continue
      seen.add(s.id)
      snapshots.push(s)
    }
    return {
      ok: true,
      manifest: { ...incoming, snapshots },
      added: snapshots.length,
      total: snapshots.length,
      unchanged: false,
    }
  }

  if (local.vaultId !== incoming.vaultId) {
    return {
      ok: false,
      reason: 'vault-id-mismatch',
      detail: `local vaultId ${local.vaultId} ≠ incoming ${incoming.vaultId}`,
    }
  }
  if (local.createdAt !== incoming.createdAt || local.name !== incoming.name) {
    // Same vaultId with diverged creation metadata is not a legal pair of copies.
    return {
      ok: false,
      reason: 'header-mismatch',
      detail:
        local.createdAt !== incoming.createdAt
          ? `createdAt differs for vault ${local.vaultId}`
          : `name differs for vault ${local.vaultId}`,
    }
  }

  const byId = new Map<string, MergeableSnapshot>()
  for (const s of local.snapshots) {
    if (s?.id) byId.set(s.id, s)
  }
  let added = 0
  for (const s of incoming.snapshots) {
    if (!s?.id) continue
    if (byId.has(s.id)) continue
    byId.set(s.id, s)
    added++
  }
  const snapshots = [...byId.values()]
  return {
    ok: true,
    manifest: {
      formatVersion: 1,
      vaultId: local.vaultId,
      createdAt: local.createdAt,
      name: local.name,
      snapshots,
    },
    added,
    total: snapshots.length,
    unchanged: added === 0 && snapshots.length === local.snapshots.length,
  }
}

/** Every listed blob hash must exist as a completed `blobs/<hash>.cvb`. */
export async function findMissingBlobs(
  vaultRoot: string,
  referencedBlobs: readonly string[],
): Promise<string[]> {
  const have = new Set(await listBlobHashes(vaultRoot))
  const missing: string[] = []
  const seen = new Set<string>()
  for (const raw of referencedBlobs) {
    const hash = String(raw ?? '').trim().toLowerCase()
    if (!BLOB_HASH_RE.test(hash)) {
      missing.push(hash || '(empty)')
      continue
    }
    if (seen.has(hash)) continue
    seen.add(hash)
    if (!have.has(hash)) missing.push(hash)
  }
  return missing
}

export type ApplyMergedManifestResult =
  | {
      ok: true
      path: string
      bytes: number
      added: number
      total: number
      unchanged: boolean
      fromPrev?: boolean
    }
  | {
      ok: false
      path: string
      reason:
        | 'too-large'
        | 'missing-blobs'
        | 'vault-id-mismatch'
        | 'header-mismatch'
        | 'bad-manifest'
        | 'write-failed'
      detail?: string
      missingBlobs?: string[]
    }

const MANIFEST_REL = 'manifest.cvb'
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024

function parseManifestJson(buf: Buffer): MergeableVaultManifest | null {
  try {
    // Encrypted vault blobs start with CVB1 — not JSON.
    if (buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === 'CVB1') return null
    const parsed = JSON.parse(buf.toString('utf8')) as MergeableVaultManifest
    if (parsed?.formatVersion !== 1 || typeof parsed.vaultId !== 'string') return null
    if (!Array.isArray(parsed.snapshots)) return null
    return parsed
  } catch {
    return null
  }
}

async function loadLocalManifest(
  vaultRoot: string,
): Promise<{ manifest: MergeableVaultManifest | null; fromPrev: boolean }> {
  const abs = join(vaultRoot, MANIFEST_REL)
  // Mirror vault loadManifest: try primary, and only when that *content* is
  // unusable fall back to .prev. A zeroed primary still has the right size and
  // readFile succeeds — parse/decrypt is what fails.
  try {
    const primary = await fs.readFile(abs)
    const parsed = parseManifestJson(primary)
    if (parsed) return { manifest: parsed, fromPrev: false }
  } catch {
    // absent or unreadable — try spare
  }
  try {
    const prev = await fs.readFile(`${abs}.prev`)
    const parsed = parseManifestJson(prev)
    if (parsed) return { manifest: parsed, fromPrev: true }
  } catch {
    // no spare
  }
  return { manifest: null, fromPrev: false }
}

/**
 * Merge incoming VaultManifest into the archive copy and write durably.
 *
 * Refuses to write if any referenced blob is missing — a manifest that points
 * at absent blobs is the power-loss bad-magic footgun (vault.ts:79).
 */
export async function applyMergedManifest(opts: {
  vaultRoot: string
  incoming: MergeableVaultManifest
  referencedBlobs: readonly string[]
}): Promise<ApplyMergedManifestResult> {
  const pathLabel = MANIFEST_REL
  const missing = await findMissingBlobs(opts.vaultRoot, opts.referencedBlobs)
  if (missing.length > 0) {
    const first = missing[0]
    const named = BLOB_HASH_RE.test(first) ? blobRelative(first) : first
    return {
      ok: false,
      path: pathLabel,
      reason: 'missing-blobs',
      detail: `missing blob ${named}`,
      missingBlobs: missing.map((h) => (BLOB_HASH_RE.test(h) ? blobRelative(h) : h)),
    }
  }

  const { manifest: local, fromPrev } = await loadLocalManifest(opts.vaultRoot)
  const merged = mergeSnapshotsById(local, opts.incoming)
  if (!merged.ok) {
    return {
      ok: false,
      path: pathLabel,
      reason: merged.reason,
      detail: merged.detail,
    }
  }

  const bytes = Buffer.from(JSON.stringify(merged.manifest), 'utf8')
  if (bytes.length > MAX_MANIFEST_BYTES) {
    return { ok: false, path: pathLabel, reason: 'too-large' }
  }

  try {
    await writeFileKeepingPrev(join(opts.vaultRoot, MANIFEST_REL), bytes)
    return {
      ok: true,
      path: pathLabel,
      bytes: bytes.length,
      added: merged.added,
      total: merged.total,
      unchanged: merged.unchanged,
      ...(fromPrev ? { fromPrev: true } : {}),
    }
  } catch (e) {
    return {
      ok: false,
      path: pathLabel,
      reason: 'write-failed',
      detail: (e as Error).message,
    }
  }
}

/** Opaque encrypted/binary manifest write (B1) — still uses .prev + fsync. */
export async function applyOpaqueManifest(opts: {
  vaultRoot: string
  content: Buffer
  referencedBlobs?: readonly string[]
}): Promise<ApplyMergedManifestResult> {
  const pathLabel = MANIFEST_REL
  if (opts.content.length > MAX_MANIFEST_BYTES) {
    return { ok: false, path: pathLabel, reason: 'too-large' }
  }
  if (opts.referencedBlobs?.length) {
    const missing = await findMissingBlobs(opts.vaultRoot, opts.referencedBlobs)
    if (missing.length > 0) {
      const first = missing[0]
      const named = BLOB_HASH_RE.test(first) ? blobRelative(first) : first
      return {
        ok: false,
        path: pathLabel,
        reason: 'missing-blobs',
        detail: `missing blob ${named}`,
        missingBlobs: missing.map((h) => (BLOB_HASH_RE.test(h) ? blobRelative(h) : h)),
      }
    }
  }
  try {
    await writeFileKeepingPrev(join(opts.vaultRoot, MANIFEST_REL), opts.content)
    return {
      ok: true,
      path: pathLabel,
      bytes: opts.content.length,
      added: 0,
      total: 0,
      unchanged: false,
    }
  } catch (e) {
    return {
      ok: false,
      path: pathLabel,
      reason: 'write-failed',
      detail: (e as Error).message,
    }
  }
}

/** Test helper: force-read using .prev when primary content is junk. */
export async function readArchiveManifestJson(
  vaultRoot: string,
): Promise<{ manifest: MergeableVaultManifest; from: 'primary' | 'prev' }> {
  const loaded = await loadLocalManifest(vaultRoot)
  if (!loaded.manifest) throw new Error('manifest.cvb is not a JSON VaultManifest')
  return { manifest: loaded.manifest, from: loaded.fromPrev ? 'prev' : 'primary' }
}

/** Ensure a zeroed/corrupt primary still yields the spare for tests. */
export async function primaryManifestExists(vaultRoot: string): Promise<boolean> {
  try {
    await fs.access(join(vaultRoot, MANIFEST_REL))
    return true
  } catch {
    return false
  }
}
