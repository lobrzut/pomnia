// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Build a surface-sync manifest: path + content sha256 + size.
 *
 * Hashes one file at a time so ~2400 notes do not require holding the whole
 * vault in memory — only the compact entry list (~path + 64 hex + size).
 */

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { MAX_FILE_BYTES, SYNC_DIRS, SYNC_ROOT_FILES } from './paths.js'
import type { ManifestEntry } from './receive.js'

/** Mirrors MACHINE_STATE_FILES in paths.ts — never offer the ownership marker. */
const MACHINE_STATE_RELS = new Set(['state/vault-writer.json'])

const ALLOWED_EXT = /\.(md|markdown|txt|json|ya?ml)$/i

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

export interface BuildManifestResult {
  entries: ManifestEntry[]
  skipped: Array<{ path: string; reason: string }>
}

/**
 * Walk the synced subset of a vault. Blobs, snapshots, and vault-writer are
 * never offered. Missing optional dirs are normal, not errors.
 */
export async function buildSyncManifest(vaultRoot: string): Promise<BuildManifestResult> {
  const entries: ManifestEntry[] = []
  const skipped: Array<{ path: string; reason: string }> = []

  const consider = async (abs: string, rel: string): Promise<void> => {
    if (!ALLOWED_EXT.test(rel)) return
    if (MACHINE_STATE_RELS.has(rel)) return
    let stat
    try {
      stat = await fs.stat(abs)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        skipped.push({ path: rel, reason: (e as Error).message })
      }
      return
    }
    if (stat.size > MAX_FILE_BYTES) {
      skipped.push({
        path: rel,
        reason: `${(stat.size / 1024 / 1024).toFixed(1)} MB — over the 8 MB limit`,
      })
      return
    }
    try {
      // Read one file, hash, discard body — do not accumulate content.
      const body = await fs.readFile(abs)
      entries.push({ path: rel, sha256: sha256(body), size: stat.size })
    } catch (e) {
      skipped.push({ path: rel, reason: (e as Error).message })
    }
  }

  const walk = async (dirRel: string): Promise<void> => {
    let items
    try {
      items = await fs.readdir(join(vaultRoot, dirRel), { withFileTypes: true })
    } catch {
      return
    }
    for (const it of items) {
      const rel = `${dirRel}/${it.name}`
      if (it.isDirectory()) await walk(rel)
      else await consider(join(vaultRoot, rel), rel)
    }
  }

  for (const d of SYNC_DIRS) await walk(d)
  for (const f of SYNC_ROOT_FILES) await consider(join(vaultRoot, f), f)
  return { entries, skipped }
}
