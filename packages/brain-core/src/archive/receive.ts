// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Receiving half of content-addressed archive replication (TOR B).
 *
 * Blobs are conflict-free: the name is the sha256 of the bytes. Listing what
 * the target already has, then uploading only the missing set, is enough for
 * idempotent and resumable transfers — a half-finished run simply continues.
 *
 * Manifest merge (B2) is set-union of snapshots by UUID — see manifestMerge.ts.
 * Writes go through durableWrite (same fsync+.prev path as vault.ts).
 */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import {
  MAX_BLOB_BYTES,
  MAX_HASH_LIST,
  safeBlobPath,
  type ArchivePathRejection,
} from './paths.js'
import { atomicWrite } from './durableWrite.js'
import { listBlobHashes } from './blobs.js'
import { applyOpaqueManifest } from './manifestMerge.js'

export { listBlobHashes } from './blobs.js'
export { blobRelative } from './paths.js'

export function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex')
}

export type ApplyBlobResult =
  | { ok: true; hash: string; path: string; bytes: number; skipped?: boolean }
  | {
      ok: false
      path: string
      reason: ArchivePathRejection | 'too-large' | 'hash-mismatch' | 'write-failed'
      detail?: string
    }

/**
 * Store one blob. Bytes must hash to `hash` — otherwise reject with the
 * intended filename in the error so a corrupt transfer is diagnosable.
 *
 * Idempotent: if the file already exists with identical bytes, no write.
 */
export async function applyArchiveBlob(opts: {
  vaultRoot: string
  hash: string
  content: Buffer
}): Promise<ApplyBlobResult> {
  const verdict = safeBlobPath(opts.hash)
  if (!verdict.ok) {
    return { ok: false, path: String(opts.hash ?? ''), reason: verdict.reason }
  }
  const { hash, relative } = verdict
  if (opts.content.length > MAX_BLOB_BYTES) {
    return { ok: false, path: relative, reason: 'too-large' }
  }
  const actual = sha256(opts.content)
  if (actual !== hash) {
    return {
      ok: false,
      path: relative,
      reason: 'hash-mismatch',
      detail: `sha256(content)=${actual} does not match filename ${relative}`,
    }
  }

  const abs = join(opts.vaultRoot, relative)
  if (existsSync(abs)) {
    try {
      const existing = await fs.readFile(abs)
      if (sha256(existing) === hash) {
        return { ok: true, hash, path: relative, bytes: 0, skipped: true }
      }
    } catch {
      // Fall through and overwrite a corrupt/unreadable file.
    }
  }

  try {
    await atomicWrite(abs, opts.content)
    return { ok: true, hash, path: relative, bytes: opts.content.length }
  } catch (e) {
    return {
      ok: false,
      path: relative,
      reason: 'write-failed',
      detail: (e as Error).message,
    }
  }
}

export type ApplyManifestResult =
  | { ok: true; path: string; bytes: number }
  | { ok: false; path: string; reason: 'too-large' | 'write-failed' | 'missing-blobs'; detail?: string }

/** Opaque manifest write — durable .prev + fsync (see applyOpaqueManifest). */
export async function applyArchiveManifest(opts: {
  vaultRoot: string
  content: Buffer
  referencedBlobs?: readonly string[]
}): Promise<ApplyManifestResult> {
  const r = await applyOpaqueManifest(opts)
  if (r.ok) return { ok: true, path: r.path, bytes: r.bytes }
  return {
    ok: false,
    path: r.path,
    reason:
      r.reason === 'missing-blobs' ? 'missing-blobs' : r.reason === 'too-large' ? 'too-large' : 'write-failed',
    detail: r.detail,
  }
}

/** Local blobs under sourceRoot that the target does not yet list. */
export function missingHashes(local: readonly string[], remote: ReadonlySet<string>): string[] {
  return local.filter((h) => !remote.has(h))
}

/** Diff helper used by POST /archive/plan. */
export async function planArchive(opts: {
  vaultRoot: string
  hashes: string[]
}): Promise<{ missing: string[]; present: number; rejected: Array<{ hash: string; reason: string }> }> {
  if (opts.hashes.length > MAX_HASH_LIST) {
    throw new Error(`hash list too large: ${opts.hashes.length}`)
  }
  const have = new Set(await listBlobHashes(opts.vaultRoot))
  const missing: string[] = []
  const rejected: Array<{ hash: string; reason: string }> = []
  let present = 0
  const seen = new Set<string>()
  for (const raw of opts.hashes) {
    const verdict = safeBlobPath(String(raw ?? ''))
    if (!verdict.ok) {
      rejected.push({ hash: String(raw ?? ''), reason: verdict.reason })
      continue
    }
    if (seen.has(verdict.hash)) continue
    seen.add(verdict.hash)
    if (have.has(verdict.hash)) present++
    else missing.push(verdict.hash)
  }
  return { missing, present, rejected }
}
