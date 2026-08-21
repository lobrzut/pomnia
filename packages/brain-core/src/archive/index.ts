// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** Archive replication (TOR B) — content-addressed blobs + snapshot-union manifest merge. */

export {
  BLOB_HASH_RE,
  MAX_BLOB_BYTES,
  MAX_HASH_LIST,
  safeBlobPath,
  blobRelative,
  blobPartialRelative,
} from './paths.js'
export type { ArchivePathRejection, ArchivePathVerdict } from './paths.js'

export { atomicWrite, writeFileKeepingPrev, readFileWithPrevFallback } from './durableWrite.js'

export {
  sha256,
  listBlobHashes,
  applyArchiveBlob,
  applyArchiveManifest,
  missingHashes,
  planArchive,
} from './receive.js'
export type { ApplyBlobResult, ApplyManifestResult } from './receive.js'

export {
  mergeSnapshotsById,
  applyMergedManifest,
  applyOpaqueManifest,
  findMissingBlobs,
  readArchiveManifestJson,
} from './manifestMerge.js'
export type {
  MergeableVaultManifest,
  MergeableSnapshot,
  MergeManifestResult,
  ApplyMergedManifestResult,
} from './manifestMerge.js'

export { localArchiveBlobs, pushArchive, listLocalFilenameHashes } from './push.js'
export type { ArchivePushOptions, ArchivePushResult } from './push.js'
