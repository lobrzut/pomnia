// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Pomnia — normalized data model.
 *
 * Everything that goes into the vault is described by these types. The two
 * cornerstones are:
 *   - `Conversation`  : structured, assistant-agnostic chat transcript
 *   - `CaptureItem`   : a raw file/blob captured verbatim (config, sqlite, leveldb…)
 *
 * A `Snapshot` bundles both for a single source at a point in time. Snapshots are
 * the unit of backup and restore.
 */

export type OS = 'win32' | 'darwin' | 'linux'

export type SourceId =
  | 'claude-code'
  | 'claude-desktop'
  | 'cursor'
  | 'antigravity'
  | 'vscode'
  | 'windsurf'
  | 'continue'
  // import-only origins (from export archives, never live-detected)
  | 'claude-ai'
  | 'chatgpt'
  | 'grok'
  | 'gemini'
  | 'generic'

/** How an adapter pulls data out of a source. */
export type CaptureStrategy =
  | 'structured' // parsed into Conversation[]
  | 'snapshot' // raw files captured verbatim
  | 'hybrid' // both

export type Role = 'user' | 'assistant' | 'system' | 'tool'

export interface Message {
  role: Role
  /** Plain-text content (tool calls/results are summarized into text where needed). */
  text: string
  /** ISO-8601 timestamp if known. */
  ts?: string
  /** Optional structured extras kept for high-fidelity restore / re-distill. */
  meta?: Record<string, unknown>
}

export interface Conversation {
  /** Stable id within the source (sessionId, composerId, uuid…). */
  id: string
  source: SourceId
  title: string
  /** ISO-8601. */
  createdAt?: string
  updatedAt?: string
  /** Project / workspace / cwd this conversation belonged to, if any. */
  project?: string
  messages: Message[]
  /** Anything the adapter wants to preserve (model, cwd, gitBranch…). */
  meta?: Record<string, unknown>
}

/**
 * A raw artifact captured verbatim. `relPath` is RELATIVE to the source's root
 * so it can be restored on a different machine / OS. `absRoot` records where it
 * came from (informational + for same-machine restore).
 */
export interface CaptureItem {
  /** Path relative to the source root, always stored with forward slashes. */
  relPath: string
  /** The source root this item was rooted at, on the capturing machine. */
  absRoot: string
  bytes: number
  sha256: string
  /** True for paths that contain absolute machine paths needing remap on restore. */
  pathSensitive?: boolean
  /** mtime ISO-8601 for incremental backups. */
  mtime?: string
}

export interface SnapshotSourceInfo {
  id: SourceId
  /** Human label, e.g. "Claude Code". */
  label: string
  strategy: CaptureStrategy
  /** Absolute root on the capturing machine (e.g. ~/.claude). */
  root: string
  os: OS
  /** App version if detectable. */
  appVersion?: string
}

export interface Snapshot {
  /** Vault-unique snapshot id. */
  id: string
  createdAt: string
  source: SnapshotSourceInfo
  /** Counts for quick display. */
  stats: {
    conversations: number
    messages: number
    files: number
    bytes: number
    /** Files skipped because they were locked/unreadable (app running). */
    skipped?: number
  }
  /** Optional label / note the user attached. */
  note?: string
  /** Where this snapshot was produced — needed to remap paths on cross-host restore. */
  origin: { host: string; user: string; home: string }
}

/** The vault's top-level manifest (stored encrypted). */
export interface VaultManifest {
  formatVersion: 1
  vaultId: string
  createdAt: string
  /** Friendly name the user gave the vault. */
  name: string
  snapshots: Snapshot[]
}

/** Imported document stored as encrypted blobs in the vault (library.cvb manifest). */
export interface LibraryDocument {
  /** Stable id — `{contentSha16}_{originalName}`. */
  id: string
  originalName: string
  format: string
  /** Full sha256 hex of the source file (dedup key). */
  contentSha: string
  sourceBlobSha: string
  sourceBytes: number
  extractedBlobSha: string
  extractedBytes: number
  pages: number
  sparse: boolean
  extractionPath: string
  importedAt: string
  /** Encrypted in vault but not yet embedded in library.db — flush when Brain starts. */
  pendingIndex?: boolean
  /** ISO timestamp when library.db indexing completed. */
  indexedAt?: string
}

/** Encrypted document library manifest (`library.cvb`). */
export interface LibraryManifest {
  formatVersion: 1
  vaultId: string
  documents: LibraryDocument[]
}

/** Result of scanning the local machine for installed assistants. */
export interface DetectedSource {
  id: SourceId
  label: string
  strategy: CaptureStrategy
  installed: boolean
  root: string
  os: OS
  /** Rough size on disk of the capturable payload, bytes. */
  sizeBytes: number
  /** Quick preview counts (conversations) when cheap to compute. */
  conversations?: number
  /** Anything notable for the UI (e.g. "WAL present", "cloud-synced"). */
  notes?: string[]
}

export interface BackupOptions {
  sources: SourceId[]
  note?: string
  /** Skip raw capture of cache-like files (default true). */
  skipCaches?: boolean
  /** Max single-file size to capture in snapshot mode, bytes (default 200MB). */
  maxFileBytes?: number
  /** Reuse blobs from the previous snapshot for files unchanged by mtime+size (default true). */
  incremental?: boolean
}

