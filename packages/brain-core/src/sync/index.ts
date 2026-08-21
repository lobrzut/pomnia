// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** Surface-sync public surface for brain-core and desktop. */

export {
  SYNC_DIRS,
  SYNC_ROOT_FILES,
  DISTILL_LEDGER_REL,
  MAX_FILE_BYTES,
  safeVaultPath,
} from './paths.js'
export type { PathRejection, PathVerdict } from './paths.js'

export {
  planSync,
  applyFile,
  sha256,
  conflictSuffixPath,
  readSyncFile,
  MAX_MANIFEST_ENTRIES,
} from './receive.js'
export type { ManifestEntry, SyncPlan, ApplyResult } from './receive.js'

export { buildSyncManifest } from './manifest.js'
export type { BuildManifestResult } from './manifest.js'

export {
  parseDistillLedger,
  unionDistillLedgers,
  mergeDistillLedgerBytes,
  serializeDistillLedger,
} from './ledgerMerge.js'
