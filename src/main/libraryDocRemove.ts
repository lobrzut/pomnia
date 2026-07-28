// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Safe library document delete — vault blobs + optional library.db chunks.
 */
import { libraryDocLogicalPath, type Vault } from '@core/vault.js'
import { brainCore } from './brainCore.js'
import { log } from '@core/log.js'

export type LibraryDocRemoveResult = {
  id: string
  originalName: string
  removedBlobs: string[]
  keptBlobs: string[]
  chunksRemoved: number
  indexError?: string
}

export async function removeLibraryDocumentWithIndex(
  vault: Vault,
  vaultDir: string,
  docId: string,
): Promise<LibraryDocRemoveResult> {
  const doc = vault.getLibraryDocument(docId)
  if (!doc) throw new Error(`Library document not found: ${docId}`)
  const originalName = doc.originalName

  const vaultResult = await vault.removeLibraryDocument(docId)
  const logicalPath = libraryDocLogicalPath(vaultDir, docId)

  let chunksRemoved = 0
  let indexError: string | undefined
  if (brainCore.status().running) {
    try {
      const r = await brainCore.removeDocument(logicalPath)
      chunksRemoved = r.chunks
    } catch (err) {
      indexError = err instanceof Error ? err.message : String(err)
      log.warn('library doc vault removed but index cleanup failed', docId, indexError)
    }
  }

  return {
    id: vaultResult.id,
    originalName,
    removedBlobs: vaultResult.removedBlobs,
    keptBlobs: vaultResult.keptBlobs,
    chunksRemoved,
    indexError,
  }
}
