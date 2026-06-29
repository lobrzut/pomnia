import type { BackupOptions, Conversation, DetectedSource, OS, SourceId } from '../model.js'

export interface CollectedFile {
  relPath: string
  abs: string
  bytes: number
  mtime: string
  pathSensitive?: boolean
}

export interface Adapter {
  id: SourceId
  label: string
  /** Resolve the source root for a target OS + home. null → not applicable. */
  resolveRoot(targetOS: OS, home: string): string | null
  /** Detect installation on the *current* machine, with cheap stats. */
  detect(): Promise<DetectedSource>
  /** Structured conversation extraction (optional — snapshot-only adapters omit it). */
  collectConversations?(root: string): Promise<Conversation[]>
  /** Raw files to capture verbatim into the vault. */
  collectFiles?(root: string, opts: BackupOptions): Promise<CollectedFile[]>
}

export const DEFAULT_MAX_FILE = 200 * 1024 * 1024 // 200 MB
