// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** Pomnia engine — public API. Pure Node, no Electron, usable from CLI or main process. */
export * from './model.js'
export * from './platform.js'
export { Vault, libraryDocLogicalPath } from './vault.js'
export type { SnapshotPayload, FileSource } from './vault.js'
export { runBackup } from './backup.js'
export type { BackupProgress } from './backup.js'
export { detectAll, getAdapter, ADAPTERS } from './adapters/index.js'
export { conversationToMarkdown, exportConversationsToDir } from './brainExport.js'
export { log, setLogSink, addLogSink } from './log.js'
export { initFileLog } from './logFile.js'
export { SOURCES, descriptorFor } from './locations.js'
export * from './brain/index.js'
export { parseExportBuffer, parseExportFile, parseExportPath } from './import/archives.js'
export type { ImportResult } from './import/archives.js'
export {
  PIPELINE_PHASE_LABELS,
  formatPipelineProgressLabel,
  localizePipelineProgress,
  pipelinePhaseLabel,
} from './pipelineLabels.js'
export type { PipelineProgressPayload } from './pipelineLabels.js'
