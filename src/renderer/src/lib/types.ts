// Re-export engine types for the renderer (type-only — erased at build, no node code pulled in).
export type {
  DetectedSource,
  Snapshot,
  SourceId,
  Conversation,
  Message,
  RestorePlan,
  RestorePlanEntry
} from '@core/model'

export interface VaultStatus {
  open: boolean
  path?: string
  name?: string
  snapshots: number
}

export interface BackupProgressEvent {
  source: string
  phase: 'scan' | 'conversations' | 'files' | 'store' | 'done'
  detail?: string
}

export interface RestoreResultDTO {
  written: number
  remapped: number
  skipped: number
  failed: number
  bytes: number
  targetRoot: string
}

export interface BrainStatus {
  reachable: boolean
  baseUrl: string
  chatModel: string
  embedModel: string
  models: string[]
}

export interface BrainRunResult {
  notesDir: string
  notes: number
  stubs: number
  chunks: number
  dim: number
}

export interface BrainHit {
  score: number
  source: string
  notePath: string
  text: string
}

export interface BrainProgressEvent {
  phase: 'collect' | 'distill' | 'index'
  done: number
  total: number
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
