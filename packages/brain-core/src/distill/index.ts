// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** Server-side distill — port of Desktop distill pipeline into brain-core. */

export { GARBAGE_THRESHOLD, scoreFields, destinationForQuality } from './quality.js'
export {
  sanitizeUnicode,
  transcript,
  assembleNote,
  coerceFields,
  noteFilename,
  sessionIdFileSuffix,
} from './note.js'
export { distillConversation, isWorthDistilling } from './engine.js'
export { deployDistilledNotes, removePriorSessionNotes } from './deploy.js'
export {
  DEFAULT_DISTILL_MODEL,
  ollamaGenerate,
  dryRunOllamaGenerate,
} from './ollamaChat.js'
export {
  createDistillJob,
  distillRunnable,
  parseConversationsJson,
} from './job.js'
export type {
  DistillJob,
  DistillJobLiveConfig,
  DistillJobStatus,
  DistillServiceConfig,
  DistillStatus,
  DistillLastRun,
} from './job.js'
export type {
  DistillConversation,
  DistillMessage,
  DistillRole,
  DistilledNote,
  DistilledFields,
  DistillQuality,
  QualityDestination,
} from './types.js'
export {
  loadLedger,
  saveLedger,
  markProcessedIn,
  ownerProcessed,
  ledgerPathInVault,
} from './ledgerStore.js'
export {
  loadInbox,
  archiveInboxFiles,
  parseConversation,
  pendingOnly,
  DISTILL_INBOX_REL,
} from './inbox.js'
