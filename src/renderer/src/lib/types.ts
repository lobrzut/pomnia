// Re-export engine types for the renderer (type-only — erased at build, no node code pulled in).
export type {
  DetectedSource,
  Snapshot,
  SourceId,
  Conversation,
  Message
} from '@core/model'
export type { ClientId, ClientStatus, WiredState, Snippet, BrainPing, SkillListEntry, SkillSyncResult } from '@core/brain/index'

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
  garbage: number
  skipped: number
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
