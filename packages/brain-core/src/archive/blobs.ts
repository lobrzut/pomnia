// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** List completed content-addressed blobs under vaultRoot/blobs/. */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { BLOB_HASH_RE, MAX_HASH_LIST } from './paths.js'

/**
 * Hashes of completed blobs. Partial uploads (*.partial / *.tmp) are ignored
 * so a crashed transfer is not treated as present.
 */
export async function listBlobHashes(vaultRoot: string): Promise<string[]> {
  const dir = join(vaultRoot, 'blobs')
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  const hashes: string[] = []
  for (const name of names) {
    if (!name.endsWith('.cvb')) continue
    if (name.includes('.partial') || name.endsWith('.tmp')) continue
    const hash = name.slice(0, -'.cvb'.length)
    if (!BLOB_HASH_RE.test(hash)) continue
    hashes.push(hash)
  }
  hashes.sort()
  if (hashes.length > MAX_HASH_LIST) {
    throw new Error(`archive hash list too large: ${hashes.length}`)
  }
  return hashes
}
