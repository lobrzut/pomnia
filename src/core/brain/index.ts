// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** Brain pipeline — public API. Collect (engine) → Distill → Pre-index → Deploy. */
export { Ollama, defaultOllamaConfig } from './ollama.js'
export type { OllamaConfig, OllamaModel } from './ollama.js'
export { distillConversation, assembleNote, transcript, sanitizeUnicode, isWorthDistilling } from './distill.js'
export type { DistilledNote } from './distill.js'
export { DISTILLABLE_SOURCES, isDistillableSource } from './distillSources.js'
export {
  processedIdsAfterDistill,
  pendingConversationIds,
} from './distillLedger.js'
export type { LedgerConv, LedgerNote } from './distillLedger.js'
export {
  buildIndex,
  saveIndex,
  loadIndex,
  searchIndex,
  chunkText,
  cosine
} from './localIndex.js'
export type { LocalIndex, IndexEntry, SearchHit, NoteForIndex } from './localIndex.js'
export {
  deployFilesystem,
  noteFilename,
  sessionIdFileSuffix,
  matchesSessionNote,
  removePriorSessionNotes,
  deployDistilledToBrain,
  deployDistilledFiles,
  copyNoteThroughQualityGate,
} from './deploy.js'
export type { DeployDistilledResult } from './deploy.js'
export {
  destinationForQuality,
  qualityFromScoreAsymmetric,
  rateUnratedMarkdown,
  parseFrontmatterQuality,
  upsertQualityFrontmatter,
} from './qualityGate.js'
export type { QualityLabel, QualityDestination } from './qualityGate.js'
export {
  CLIENTS,
  getClient,
  listClients,
  buildSnippet,
  buildBrainBriefMd,
  upsertPomniaBrainBrief,
  buildVaultAgentsHandshakeSection,
  upsertVaultAgentsHandshake,
  BRAIN_BRIEF_MD,
  BRAIN_BRIEF_EMBEDDED_MD,
  brainBriefCursorMdc,
  brainBriefHandshakeCursorMdc,
  EMBEDDED_BRAIN_DEFAULT_URL,
  REMOTE_BRAIN_DEFAULT_URL,
  REMOTE_BRAIN_URL_PLACEHOLDER,
} from './snippet.js'
export type {
  ClientId,
  ClientSpec,
  Snippet,
  SnippetBrief,
  BrainTarget,
  RemoteHubKind,
  BuildSnippetOptions,
  BrainBriefOptions,
} from './snippet.js'
export { checkClient, checkAllClients, pingBrain, probeMcpUrl, fetchMcpActivity } from './status.js'
export { urlsPointAtSameBrain } from './mcpUrl.js'
export { syncManagedMcpConfigs, mergeManagedServers } from './mcpSync.js'
export { identifyEngine } from './engine.js'
export type { BrainEngine, EngineInfo } from './engine.js'
export type {
  ClientStatus,
  WiredState,
  BrainPing,
  McpProbe,
  CheckClientOptions,
  McpActivityRecord,
  McpActivityResponse,
} from './status.js'
export {
  DEFAULT_OWNER,
  LEDGER_SCHEMA_VERSION,
  emptyLedger,
  ledgerPathInVault,
  loadLedgerForVault,
  markProcessedIn,
  ownerProcessed,
  parseLedger,
  readLedgerFile,
  reconcileWithNotes,
  sessionIdsFromNotes,
  writeLedgerFile,
} from './ledgerStore.js'
export type { DistillLedgerFile, LedgerOwner, LoadLedgerResult, ProcessedMap } from './ledgerStore.js'
export {
  buildVaultManifest,
  syncVaultToReplica,
  pullVaultFromPeer,
  syncVaultSurface,
  SYNCED_DIRS,
  SYNCED_ROOT_FILES,
} from './vaultSync.js'
export type {
  VaultSyncResult,
  VaultPullResult,
  VaultSurfaceSyncResult,
  VaultSyncOptions,
  SyncManifestEntry,
} from './vaultSync.js'
export { createMcpToken } from './mcpTokens.js'
export type { McpTokenEntry } from './mcpTokens.js'

import type { Conversation } from '../model.js'
import { log } from '../log.js'
import { Ollama } from './ollama.js'
import { distillConversation, isWorthDistilling, type DistilledNote } from './distill.js'

/** Per-chat cap — long code dumps (Pine Script, etc.) stall remote Ollama. */
const DISTILL_TIMEOUT_MS = 120_000

export interface PipelineProgress {
  phase: 'distill' | 'index' | 'deploy'
  done: number
  total: number
  detail?: string
}

export interface DistillAllResult {
  notes: DistilledNote[]
  /** Conversations skipped by the pre-filter (too short/trivial) — no LLM call spent. */
  skipped: number
  /** Conversation ids where Ollama timed out or returned an error. */
  failed: string[]
}

export interface DistillAllOptions {
  signal?: AbortSignal
}

/** Distill many conversations on the host, with progress + resilience. */
export async function distillAll(
  conversations: Conversation[],
  ollama: Ollama,
  model?: string,
  onProgress?: (p: PipelineProgress) => void,
  opts?: DistillAllOptions
): Promise<DistillAllResult> {
  const out: DistilledNote[] = []
  let done = 0
  let skipped = 0
  const failed: string[] = []
  for (const c of conversations) {
    if (opts?.signal?.aborted) break
    if (!isWorthDistilling(c)) {
      skipped++
      onProgress?.({ phase: 'distill', done: ++done, total: conversations.length, detail: `${c.title} — skipped (too short)` })
      continue
    }
    onProgress?.({ phase: 'distill', done, total: conversations.length, detail: `${c.title}…` })
    try {
      out.push(
        await distillConversation(c, ollama, model, { timeoutMs: DISTILL_TIMEOUT_MS, signal: opts?.signal })
      )
    } catch (e) {
      failed.push(c.id)
      log.warn('distill failed:', c.title, (e as Error).message)
      onProgress?.({
        phase: 'distill',
        done: done + 1,
        total: conversations.length,
        detail: `${c.title} — failed (${(e as Error).message.slice(0, 48)})`
      })
    }
    done++
    onProgress?.({ phase: 'distill', done, total: conversations.length, detail: c.title })
  }
  return { notes: out, skipped, failed }
}
