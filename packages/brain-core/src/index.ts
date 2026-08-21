// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * @pomnia/brain-core — public API.
 *
 * Split by concern so both the Pomnia Electron main and the standalone
 * daemon entrypoint (bin/brain-core.js) can pull only what they need.
 */

// MCP server (tool handlers over MCP HTTP transport)
export { createBrainServer } from './mcp/server.js'
export type { BrainServer, BrainServerOptions } from './mcp/server.js'

// MCP tools — public tool catalog + dispatch. Server wires these to the SDK.
export { listTools, callTool } from './mcp/tools/index.js'
export type { ToolDef, ToolContext } from './mcp/tools/index.js'

// RAG core (embed + cosine + chunking)
// Re-exports live here so tools/, tests/ and consumers stay decoupled from the file layout.
export { EmbedClient, EMBED_DIMS, FASTEMBED_MODEL_ID, parseEmbedBackend, prefetchFastembed, defaultEmbedCacheDir, embedClientFromConfig, applyEmbedPrefix } from './rag/embed.js'
export type { EmbedClientConfig, EmbedBackendName, EmbedKind } from './rag/embed.js'
export { chunkText, CHUNK_CHAR, CHUNK_OVERLAP } from './rag/chunk.js'
export { vecToBlob, blobToVec } from './rag/vec.js'
export { search } from './rag/search.js'
export type { SearchOptions, SearchSource } from './rag/search.js'
export type { RagIndex, SearchHit } from './rag/types.js'
export { indexFiles, indexDir, indexDocument, contentHash, removeDocumentChunks } from './rag/indexer.js'
export type { IndexStats, IndexProgressEvent, IndexFileInput, IndexDocumentInput } from './rag/indexer.js'

// Storage (sqlite-vec + vault filesystem)
export { openDb } from './storage/db.js'
export type { OpenDbOptions, BrainDb } from './storage/db.js'
export { defaultVaultConfig, vaultConfigFromRoot, ensureLibraryDirs } from './storage/vault.js'
export type { VaultConfig } from './storage/vault.js'

// Config (env + optional TOML/JSON file)
export { loadConfig, defaultConfig } from './config/index.js'
export type { BrainConfig } from './config/index.js'

// Surface sync (knowledge layer — not blobs / library.db)
export {
  SYNC_DIRS,
  SYNC_ROOT_FILES,
  MAX_FILE_BYTES,
  safeVaultPath,
  planSync,
  applyFile,
  sha256,
  buildSyncManifest,
  DISTILL_LEDGER_REL,
  mergeDistillLedgerBytes,
  MAX_MANIFEST_ENTRIES,
} from './sync/index.js'
export type {
  PathRejection,
  ManifestEntry,
  SyncPlan,
  ApplyResult,
  BuildManifestResult,
} from './sync/index.js'

// Archive replication (TOR B — content-addressed blobs + snapshot-union merge)
export {
  BLOB_HASH_RE,
  MAX_BLOB_BYTES,
  safeBlobPath,
  listBlobHashes,
  applyArchiveBlob,
  applyArchiveManifest,
  applyMergedManifest,
  mergeSnapshotsById,
  planArchive,
  pushArchive,
  localArchiveBlobs,
  sha256 as archiveSha256,
  atomicWrite,
  writeFileKeepingPrev,
} from './archive/index.js'
export type {
  ArchivePathRejection,
  ApplyBlobResult,
  ApplyManifestResult,
  ApplyMergedManifestResult,
  ArchivePushOptions,
  ArchivePushResult,
  MergeableVaultManifest,
} from './archive/index.js'
