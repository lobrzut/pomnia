// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
// Re-export engine types for the renderer (type-only — erased at build, no node code pulled in).
import type { SourceId } from '@core/model'
export type {
  DetectedSource,
  Snapshot,
  SourceId,
  Conversation,
  Message
} from '@core/model'
export type { ClientId, ClientStatus, WiredState, Snippet, BrainPing, BrainTarget } from '@core/brain/index'

export interface VaultStatus {
  open: boolean
  path?: string
  name?: string
  snapshots: number
  /** Library docs waiting for embedded brain indexing. */
  pendingLibraryIndex?: number
  /** Total brain/.../*.md + cli/.../SKILL.md (legacy single counter). */
  skillsCount?: number
  /** Own workflow skills: vault/skills/brain/*.md */
  skillsOwnCount?: number
  /** Imported CLI packages: vault/skills/cli/.../SKILL.md */
  skillsImportedCount?: number
  /** .md files under vault/distilled (excludes `_review`). */
  distilledNotes?: number
  /** Plaintext knowledge root (USER.md, distilled/) when vault is open. */
  knowledgePath?: string
}

export interface LocalSkillEntry {
  kind: 'own' | 'imported'
  name: string
  description: string
  path: string
  folderPath: string
  sizeBytes: number
  mtimeMs: number
}

export interface SkillsListResult {
  skillsRoot: string | null
  own: LocalSkillEntry[]
  imported: LocalSkillEntry[]
}

export interface BackupProgressEvent {
  source: string
  phase: 'scan' | 'conversations' | 'files' | 'store' | 'done'
  detail?: string
}

export interface BrainStatus {
  reachable: boolean
  baseUrl: string
  chatModel: string
  embedModel: string
  models: string[]
}

// VRAM profiles are plain data (no node imports) — safe to deep-import as a value.
export type { VramProfile } from '@core/brain/profiles'

export interface OllamaPullEvent {
  model: string
  status: string
  completed?: number
  total?: number
}

/** Embedded brain-core child process state. */
export interface EmbeddedBrainStatus {
  running: boolean
  starting: boolean
  indexing: boolean
  url: string | null
  dataDir: string
  lastError: string | null
}

/** Honest distill-pipeline state — live source counts vs the distill ledger. */
export interface BrainStatePerSource {
  source: SourceId
  label: string
  total: number
  /** null = cannot match ledger IDs honestly (never a fake “all pending”). */
  pending: number | null
  /** Shown when pending is null, e.g. Cursor DB > 256 MB without transcript IDs. */
  uncountableHint?: string
}

export interface BrainStateInfo {
  total: number
  distilled: number
  pending: number
  /** At least one source could not compute pending against the registry. */
  pendingPartial?: boolean
  perSource: BrainStatePerSource[]
  lastRun: string | null
}

export interface BrainRunResult {
  notesDir: string
  notes: number
  stubs: number
  garbage: number
  skipped: number
  failed?: number
  chunks: number
  dim: number
  deployed?: number
  deployMethod?: 'filesystem' | 'http' | 'none'
  reindexed?: boolean
  /** All conversations already in the distill ledger — nothing to process. */
  emptyBacklog?: boolean
}

export interface DocImportResult {
  docId: string
  sourcePath: string
  extractedPath: string
  format: string
  pages: number
  chunks: number
  sparse: boolean
  extractionPath: string
  suggestOcr: boolean
  indexed: boolean
  pendingIndex: boolean
  brainRunning: boolean
  brainAutoStarted: boolean
  indexError?: string
  encrypted: boolean
  /** True when content already in library — import was a no-op. */
  skipped?: boolean
}

export interface DocOcrResult extends DocImportResult {
  ocrMethod: 'tesseract' | 'ollama-vision' | 'none'
  ocrPages: number
}

export interface DocImportProgressEvent {
  phase: string
  done: number
  total: number
  detail?: string
  label?: string
}

export interface LibraryDocListItem {
  id: string
  originalName: string
  format: string
  pages: number
  importedAt: string
  pendingIndex: boolean
  indexedAt: string | null
  sourceBytes: number
  extractedBytes: number
}

/** Preview of a chat export before sealing into the vault. */
export interface ImportChatPreview {
  path: string
  fileName: string
  conversationCount: number
  messageCount: number
  sources: { source: string; count: number }[]
  titles: string[]
  hasGeneric: boolean
  added: number
  updated: number
  skipped: number
}

export type QuarantineBucket = 'review' | 'weak'

export interface QuarantineNoteMeta {
  bucket: QuarantineBucket
  name: string
  mtimeMs: number
  sizeBytes: number
}

export interface LibraryDocRemoveResult {
  id: string
  originalName: string
  removedBlobs: string[]
  keptBlobs: string[]
  chunksRemoved: number
  indexError?: string
}

export interface BrainHit {
  score: number
  source: string
  notePath: string
  text: string
}

export interface BrainProgressEvent {
  phase: 'collect' | 'distill' | 'index' | 'deploy' | 'idle'
  done: number
  total: number
  detail?: string
  label?: string
}

export type ActivityKind =
  | 'idle'
  | 'distill'
  | 'doc-import'
  | 'brain-start'
  | 'indexing'
  | 'embed'
  | 'mcp-query'
  | 'finale'

export interface ActivityState {
  kind: ActivityKind
  phase?: string
  done?: number
  total?: number
  detail?: string
}

export interface ActivityReplayStep {
  kind: Exclude<ActivityKind, 'idle'>
  phase?: string
  done?: number
  total?: number
  detail?: string
  durationMs: number
}

export interface LastActivityReplay {
  completedAt: string
  steps: ActivityReplayStep[]
}

export interface ConversationMeta {
  id: string
  source: SourceId
  title: string
  messages: number
  updatedAt?: string
  project?: string
  snapshotId: string
}

export interface TextHit {
  snapshotId: string
  id: string
  source: SourceId
  title: string
  snippet: string
  matches: number
}
