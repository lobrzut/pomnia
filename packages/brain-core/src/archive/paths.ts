// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Path rules for content-addressed archive replication (TOR B).
 *
 * Deliberately separate from `sync/paths.ts`: surface sync never admits `.cvb`,
 * and archive sync never admits markdown. Widening either side into the other
 * is how a 2.5 GB backup run becomes every note sync.
 */

/** Blob id: lowercase hex sha256 of the bytes stored under that name. */
export const BLOB_HASH_RE = /^[a-f0-9]{64}$/

/** Soft ceiling for a single blob body. Vault documents can be large; notes are not. */
export const MAX_BLOB_BYTES = 512 * 1024 * 1024

/** How many hash strings one /archive/hashes response may list. */
export const MAX_HASH_LIST = 100_000

export type ArchivePathRejection =
  | 'empty'
  | 'bad-hash'
  | 'not-blob'
  | 'traversal'
  | 'illegal-char'

export type ArchivePathVerdict =
  | { ok: true; hash: string; relative: string }
  | { ok: false; reason: ArchivePathRejection }

/**
 * Accept only `blobs/<64-hex>.cvb`. Anything else — nested dirs, uppercase,
 * wrong extension — is refused before any write.
 */
export function safeBlobPath(hashOrPath: string): ArchivePathVerdict {
  const raw = (hashOrPath ?? '').trim()
  if (!raw) return { ok: false, reason: 'empty' }
  if (raw.includes('\\') || raw.includes('\0')) return { ok: false, reason: 'illegal-char' }
  if (raw.includes('..')) return { ok: false, reason: 'traversal' }

  let hash = raw
  if (raw.includes('/')) {
    const parts = raw.split('/')
    if (parts.length !== 2 || parts[0] !== 'blobs') return { ok: false, reason: 'not-blob' }
    const file = parts[1]
    if (!file.endsWith('.cvb')) return { ok: false, reason: 'not-blob' }
    hash = file.slice(0, -'.cvb'.length)
  } else if (raw.endsWith('.cvb')) {
    hash = raw.slice(0, -'.cvb'.length)
  }

  if (!BLOB_HASH_RE.test(hash)) return { ok: false, reason: 'bad-hash' }
  return { ok: true, hash, relative: `blobs/${hash}.cvb` }
}

/** Relative path of a completed blob. */
export function blobRelative(hash: string): string {
  return `blobs/${hash}.cvb`
}

/** In-progress upload — never counted as present until renamed into place. */
export function blobPartialRelative(hash: string): string {
  return `blobs/${hash}.cvb.partial`
}
