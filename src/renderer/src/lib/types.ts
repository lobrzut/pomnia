// Re-export engine types for the renderer (type-only — erased at build, no node code pulled in).
import type { SourceId } from '@core/model'
export type {
  DetectedSource,
  Snapshot,
  SourceId,
  Conversation,
  Message
} from '@core/model'
export type { ClientId, ClientStatus, WiredState, Snippet, BrainPing, SkillListEntry, SkillSyncResult, BrainTarget } from '@core/brain/index'

export interface VaultStatus {
  open: boolean
  path?: string
  name?: string
  snapshots: number
  /** Library docs waiting for embedded brain indexing. */
  pendingLibraryIndex?: number
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
export interface BrainStateInfo {
  total: number
  distilled: number
  pending: number
  perSource: { source: SourceId; label: string; total: number; pending: number }[]
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
}

export interface DocImportProgressEvent {
  phase: string
  done: number
  total: number
  detail?: string
  label?: string
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
