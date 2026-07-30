// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** Polish + English UI chrome labels. Brain knowledge stays auto bilingual (no knowledgeLang). */

import { formatPipelineProgressLabel } from '@core/pipelineLabels.js'
import type { ActivityState } from './types'
import { getUiLocale } from './uiLocale'

const ACTIVITY_KIND_PL: Record<Exclude<ActivityState['kind'], 'idle'>, string> = {
  distill: 'destylacja',
  'doc-import': 'import dokumentu',
  'brain-start': 'uruchamianie Brain',
  indexing: 'indeksowanie',
  embed: 'embeddingi',
  'mcp-query': 'zapytanie MCP',
  finale: 'indeks gotowy',
}

const ACTIVITY_KIND_EN: Record<Exclude<ActivityState['kind'], 'idle'>, string> = {
  distill: 'distillation',
  'doc-import': 'document import',
  'brain-start': 'starting Brain',
  indexing: 'indexing',
  embed: 'embeddings',
  'mcp-query': 'MCP query',
  finale: 'index ready',
}

function truncateDetail(s: string, max = 60): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export const formatBrainProgressLabel = formatPipelineProgressLabel

export function formatActivityBanner(state: ActivityState): string {
  if (state.kind === 'idle') return ''
  const kind = ACTIVITY_KIND_PL[state.kind]
  const progress =
    state.done != null && state.total != null && state.total > 0 ? ` (${state.done}/${state.total})` : ''
  const detail = state.detail ? ` · ${truncateDetail(state.detail)}` : ''
  return `Trwa: ${kind}${progress}${detail}`
}

function formatActivityBannerEn(state: ActivityState): string {
  if (state.kind === 'idle') return ''
  const kind = ACTIVITY_KIND_EN[state.kind]
  const progress =
    state.done != null && state.total != null && state.total > 0 ? ` (${state.done}/${state.total})` : ''
  const detail = state.detail ? ` · ${truncateDetail(state.detail)}` : ''
  return `In progress: ${kind}${progress}${detail}`
}

export function formatFlowLastMcpBadge(tool: string): string {
  const t = tool.trim() || 'MCP'
  return `Ostatnie: ${t} · przed chwilą`
}

function formatFlowLastMcpBadgeEn(tool: string): string {
  const t = tool.trim() || 'MCP'
  return `Last: ${t} · just now`
}

export function formatFlowLiveBadge(state: ActivityState): string {
  if (state.kind === 'idle') return ''
  if (state.kind === 'finale') return 'Gotowe: pamięć zindeksowana'
  if (state.kind === 'mcp-query') {
    const tool = state.phase ?? ''
    const toolNames = new Set(['search_library', 'get_skill', 'run_skill', 'list_skills', 'list_cli_skills'])
    if (tool === 'search_library' || (state.detail && !toolNames.has(state.detail))) {
      return 'Na żywo: wyszukiwanie w Brain'
    }
    if (tool === 'get_skill' || tool === 'run_skill') return 'Na żywo: skill z Brain'
    return 'Na żywo: zapytanie MCP'
  }
  const kind = ACTIVITY_KIND_PL[state.kind]
  const progress =
    state.done != null && state.total != null && state.total > 0 ? ` ${state.done}/${state.total}` : ''
  return `Na żywo: ${kind}${progress}`
}

function formatFlowLiveBadgeEn(state: ActivityState): string {
  if (state.kind === 'idle') return ''
  if (state.kind === 'finale') return 'Done: memory indexed'
  if (state.kind === 'mcp-query') {
    const tool = state.phase ?? ''
    const toolNames = new Set(['search_library', 'get_skill', 'run_skill', 'list_skills', 'list_cli_skills'])
    if (tool === 'search_library' || (state.detail && !toolNames.has(state.detail))) {
      return 'Live: searching Brain'
    }
    if (tool === 'get_skill' || tool === 'run_skill') return 'Live: Brain skill'
    return 'Live: MCP query'
  }
  const kind = ACTIVITY_KIND_EN[state.kind]
  const progress =
    state.done != null && state.total != null && state.total > 0 ? ` ${state.done}/${state.total}` : ''
  return `Live: ${kind}${progress}`
}

/** Large on-diagram status banner during focus mode. */
export function formatFlowFocusBanner(state: ActivityState): string {
  if (state.kind === 'idle') return ''
  if (state.kind === 'finale') return 'Teraz: indeks gotowy — pamięć dostępna dla agenta'
  if (state.kind === 'mcp-query') {
    const tool = state.phase ?? ''
    const toolNames = new Set(['search_library', 'get_skill', 'run_skill', 'list_skills', 'list_cli_skills'])
    if (tool === 'search_library' || (state.detail && !toolNames.has(state.detail))) {
      return 'Teraz: wyszukiwanie w Brain'
    }
    if (tool === 'get_skill' || tool === 'run_skill') return 'Teraz: ładowanie skilla z Brain'
    return 'Teraz: zapytanie MCP'
  }
  const kind = ACTIVITY_KIND_PL[state.kind]
  const progress =
    state.done != null && state.total != null && state.total > 0 ? ` ${state.done}/${state.total}` : ''
  const detail = state.detail ? ` · ${truncateDetail(state.detail, 60)}` : ''
  return `Teraz: ${kind}${progress}${detail}`
}

function formatFlowFocusBannerEn(state: ActivityState): string {
  if (state.kind === 'idle') return ''
  if (state.kind === 'finale') return 'Now: index ready — memory available to the agent'
  if (state.kind === 'mcp-query') {
    const tool = state.phase ?? ''
    const toolNames = new Set(['search_library', 'get_skill', 'run_skill', 'list_skills', 'list_cli_skills'])
    if (tool === 'search_library' || (state.detail && !toolNames.has(state.detail))) {
      return 'Now: searching Brain'
    }
    if (tool === 'get_skill' || tool === 'run_skill') return 'Now: loading Brain skill'
    return 'Now: MCP query'
  }
  const kind = ACTIVITY_KIND_EN[state.kind]
  const progress =
    state.done != null && state.total != null && state.total > 0 ? ` ${state.done}/${state.total}` : ''
  const detail = state.detail ? ` · ${truncateDetail(state.detail, 60)}` : ''
  return `Now: ${kind}${progress}${detail}`
}

export interface UiLabels {
  distill: string
  distillBacklog: (n: number) => string
  /** Full re-distill — must NEVER share distillBacklog / distill wording. */
  runPipeline: string
  redistillEverythingConfirm: (conversationCount: number) => string
  deployToBrain: string
  remoteDeployLead: string
  embedded: string
  remote: string
  reindex: string
  mcpConnect: string
  brainPageTitle: string
  brainPageLead: string
  brainDistillSelectedHint: (model: string, profile: string) => string
  brainAttachExport: string
  brainAttachExportHint: string
  quarantineTitle: string
  quarantineLead: string
  quarantineHeader: (count: number) => string
  quarantineReview: string
  quarantineWeak: string
  quarantineWeakToggle: (count: number) => string
  quarantineEmpty: string
  quarantineSearchPlaceholder: string
  quarantineNoMatches: string
  quarantineSelectToRead: string
  quarantineMetaQuality: string
  quarantineMetaMsgCount: string
  quarantineView: string
  quarantinePromote: string
  quarantinePromotedToast: (name: string) => string
  quarantinePromoteFailed: string
  quarantineDelete: string
  quarantineDeleteConfirm: (name: string) => string
  quarantineDeletedToast: (name: string) => string
  quarantineDeleteFailed: string
  quarantineDeleteAll: string
  quarantineDeleteAllConfirm: (count: number) => string
  quarantineDeletedAllToast: (count: number) => string
  quarantineDeleteAllFailed: string
  quarantineClose: string
  quarantineVaultClosed: string
  onboardingFirstRun: string
  onboardingSidebarFooter: string
  onboardingStepWelcome: string
  onboardingStepStart: string
  onboardingStepVault: string
  onboardingStepBackup: string
  onboardingStepEngine: string
  onboardingStepMemory: string
  onboardingStepConnect: string
  onboardingStepReady: string
  onboardingWelcomeTitle: string
  onboardingWelcomeLeadSimple: string
  onboardingWelcomeLeadFull: string
  onboardingWelcomeCtaSimple: string
  onboardingWelcomeCtaFull: string
  onboardingValueCollectTitle: string
  onboardingValueCollectText: string
  onboardingValueEncryptTitle: string
  onboardingValueEncryptText: string
  onboardingValueRecallTitle: string
  onboardingValueRecallText: string
  onboardingVaultTitle: string
  onboardingVaultLead: string
  onboardingVaultCreateTab: string
  onboardingVaultOpenTab: string
  onboardingVaultNewFolder: string
  onboardingVaultFolder: string
  onboardingVaultCreateContinue: string
  onboardingVaultUnlockContinue: string
  onboardingPassphrase: string
  onboardingConfirmPass: string
  onboardingPassMismatch: string
  onboardingVaultCryptoHint: string
  onboardingEnterApp: string
  onboardingBackupTitle: string
  onboardingBackupLead: string
  onboardingBackupScanning: string
  onboardingBackupNone: string
  onboardingBackupChats: (n: number) => string
  onboardingBackupBackingUp: string
  onboardingBackupSkip: string
  onboardingBackupNow: string
  onboardingEngineTitle: string
  onboardingEngineLead: string
  onboardingEngineLocal: string
  onboardingEngineLocalHint: (url: string) => string
  onboardingEngineRemote: string
  onboardingEngineRemoteHint: string
  onboardingEngineMasterUrl: string
  onboardingEngineTestConn: string
  onboardingEngineRemoteOk: string
  onboardingEngineRemoteFail: string
  onboardingEngineLooking: string
  onboardingEngineRunning: string
  onboardingEngineMoreModels: (n: number) => string
  onboardingEngineEmbedHint: (model: string) => string
  onboardingEngineDistillHint: (model: string) => string
  onboardingEngineModelsNeeded: string
  onboardingEngineEmbedMissing: (cmd: string) => string
  onboardingEngineDistillMissing: (cmd: string, size: string) => string
  onboardingEngineNotFound: string
  onboardingEngineInstall1: string
  onboardingEngineInstall2: string
  onboardingEngineInstall3: string
  onboardingEngineRecheck: string
  onboardingEngineRemoteOllamaOptional: string
  onboardingEngineSkip: string
  onboardingContinue: string
  onboardingSimpleBrainTitle: string
  onboardingSimpleBrainLead: string
  onboardingSimpleBrainChecking: string
  onboardingSimpleBrainRunning: string
  onboardingSimpleBrainReady: string
  onboardingSimpleBrainReadyDetail: (url: string) => string
  onboardingSimpleBrainSkip: string
  onboardingSimpleBrainStart: string
  onboardingConnectTitle: string
  onboardingConnectLead: string
  onboardingConnectCopied: string
  onboardingConnectCopy: string
  onboardingConnectSkip: string
  onboardingReadyTitle: string
  onboardingReadyLeadDone: string
  onboardingReadyLeadPartial: string
  onboardingReadyVault: string
  onboardingReadyBackup: string
  onboardingReadySearch: string
  onboardingReadyRemote: string
  onboardingReadyMcp: string
  onboardingReadyMcpFirst: string
  onboardingSkipForNow: string
  onboardingBack: string
  embeddedBrain: string
  embeddedBrainStart: string
  embeddedBrainStop: string
  embeddedBrainStoppedToast: string
  toastModelReady: string
  toastPullFailed: string
  toastLocalIndexRefreshed: string
  toastReindexFailed: string
  toastSearchFailed: string
  toastDeployed: string
  toastDeployFailed: string
  brainSearchPlaceholder: string
  brainSearchButton: string
  brainSearchEmpty: string
  brainAdvancedDistillTitle: string
  brainAdvancedOllamaNeed: string
  brainEmbeddedProcessHint: string
  vaultGateTitle: string
  vaultGateLead: string
  vaultGateUnlockTab: string
  vaultGateCreateTab: string
  vaultGateName: string
  vaultGateDefaultName: string
  vaultGateCreateSubmit: string
  vaultGateUnlockSubmit: string
  vaultPathPlaceholder: string
  brainServer: string
  searchKnowledge: string
  advanced: string
  simpleMode: string
  simpleModeHint: string
  systemTray: string
  closeToTray: string
  closeToTrayHint: string
  minimizeToTray: string
  minimizeToTrayHint: string
  openAtLogin: string
  openAtLoginHint: string
  colorScheme: string
  colorSchemeHint: string
  colorSchemeMint: string
  colorSchemeIris: string
  colorSchemeGlass: string
  /** Settings → Język interfejsu (UI chrome only). */
  uiLocale: string
  uiLocaleHint: string
  uiLocalePl: string
  uiLocaleEn: string
  floatingMonitor: string
  floatingMonitorOnMinimize: string
  floatingMonitorOnMinimizeHint: string
  floatingMonitorIdleBadge: string
  /** Idle PiP status when embedded Brain is stopped. */
  floatingMonitorBrainOff: string
  floatingMonitorBrainStarting: string
  floatingMonitorBrainReady: string
  floatingMonitorBrainError: string
  floatingMonitorClose: string
  floatingMonitorPin: string
  floatingMonitorUnpin: string
  floatingMonitorOpenHint: string
  handshake: string
  handshakePlaceholder: string
  handshakePhrase: string
  handshakePhraseHint: string
  handshakePhraseSave: string
  handshakePhraseSaved: string
  /** Preview of the exact phrase agents will say. */
  handshakePhrasePreview: (phrase: string) => string
  handshakePhraseEmpty: string
  handshakePhraseTooShort: string
  handshakeEnabled: string
  handshakeEnabledHint: string
  /** After changing phrase — refresh Connect rules + new Claude session. */
  handshakeRefreshHint: string
  /** Auto milestone checkpoints (checkpoint_session). */
  autoCheckpoint: string
  autoCheckpointEnabled: string
  autoCheckpointEnabledHint: string
  profilePreview: string
  profilePreviewTitle: string
  profilePreviewSubtitle: string
  profilePreviewClose: string
  profilePreviewFooter: string
  profilePreviewSave: string
  profilePreviewSaving: string
  profilePreviewSaved: string
  profilePreviewSaveFailed: string
  profilePreviewSaveTooLong: (max: number) => string
  profilePreviewEditorHint: string
  profilePreviewCopy: string
  profilePreviewCopySummary: string
  profilePreviewCopied: string
  profilePreviewCopiedSummary: string
  profilePreviewCopyFailed: string
  profilePreviewLoading: string
  profilePreviewProgressVault: string
  profilePreviewProgressNotes: string
  profilePreviewProgressSearch: string
  profilePreviewProgressModel: string
  profilePreviewProgressDone: string
  profilePreviewEmptyVault: string
  profilePreviewEmptyBrain: string
  profilePreviewEmptyKnowledge: string
  connectPageLead: string
  connectChecklistTitle: string
  connectStepUrl: string
  connectStepToken: string
  connectStepCopy: string
  connectStepReload: string
  /** Copy-button label; `name` = selected MCP client (Cursor, Antigravity, …). */
  connectCopyForClient: (name: string) => string
  connectTokenPlaceholder: string
  connectTokenRequired: string
  connectOpenDashboard: string
  connectPartialTitle: string
  connectPartialDetail: string
  connectPartialFix: string
  connectMacNoAppHint: string
  /** Connect → opt-in agent rule (read auto / write on command). Not Desktop auto-capture. */
  agentBrainMode: string
  agentBrainModeHint: string
  agentBrainModeBriefTitle: string
  agentBrainModeBriefCopy: string
  agentBrainModeBriefWrite: string
  agentBrainModeBriefWritten: string
  agentBrainModeBriefWriteFailed: string
  agentBrainModeRuleCopy: string
  agentBrainModeNoPath: string
  agentBrainModeRefreshHint: string
  embeddedBrainNotRunning: string
  embeddedBrainNotRunningLink: string
  settingsTitle: string
  settingsLead: string
  vault: string
  lockVault: string
  noVaultOpen: string
  knowledgePathOpen: (path: string) => string
  knowledgePathLocked: string
  brainBridge: string
  brainBridgeLead: string
  snapshot: string
  outDir: string
  exportNotes: string
  mcpClients: string
  mcpClientsLead: string
  strategyHybrid: string
  strategySnapshot: string
  strategySnapshotHint: string
  sourceMcpReads: string
  sourceMcpNotConnected: string
  sourceChatsCount: (n: number) => string
  sourceNoChats: string
  detectedOnMachine: string
  notFound: string
  customOverride: string
  resetAutoDetect: string
  snapshots: string
  verifyIntegrity: string
  snapshotsEmpty: string
  snapshotsCount: (n: number) => string
  unlockVaultForSnapshots: string
  moreSnapshots: (n: number) => string
  securityAbout: string
  /** Settings → Bezpieczeństwo: portable unit = whole vault folder, not AppData / vague `.pomnia`. */
  securityPortability: string
  /** Footer under Settings → Bezpieczeństwo; `identity` = `0.1.44 · sha · YYYY-MM-DD HH:mm`. */
  securityAboutCli: (identity: string) => string
  /** Settings → Windows AV — OOB + signing framing; no exclusion checklist in UI. */
  antivirusTitle: string
  antivirusLead: string
  antivirusWhy: string
  antivirusSigningNote: string
  /** Generic open-install-dir utility (not an AV-exclusion affordance). */
  antivirusOpenInstallFolder: string
  previewMode: string
  importTitle: string
  importLead: string
  importPick: string
  importPickBusy: string
  importVaultClosed: string
  importFormats: string
  importSelect: string
  importChatSection: string
  importChatDrop: string
  importChatSealedToast: (added: number, updated: number, skipped: number) => string
  importChatAllDuplicatesDetail: string
  importChatNothingRecognized: string
  importChatFailedToast: string
  importChatConfirmTitle: string
  importChatConfirmSource: (source: string) => string
  importChatConfirmStats: (conversations: number, messages: number) => string
  importChatConfirmTitles: string
  importChatConfirmGenericWarn: string
  importChatConfirmSeal: string
  importChatConfirmCancel: string
  importChatConfirmDedup: (added: number, updated: number, skipped: number) => string
  importDocSection: string
  importDocPick: string
  importDocBusy: string
  importDocFormats: string
  importDocSelect: string
  importDocDrop: string
  importDropFailed: string
  importDropNoPath: string
  importUnsupportedFormat: string
  importDocDuplicateToast: string
  importDocDone: string
  importDocOcrHint: string
  importDocOcrRun: string
  importDocOcrBusy: string
  importDocOcrDoneToast: (pages: number) => string
  importDocOcrFailedToast: string
  importDocBrainOff: string
  importDocQueuedHint: string
  importDocIndexedToast: (chunks: number) => string
  importDocQueuedToast: string
  importDocQueuedDetail: string
  importDocFailedToast: string
  importDocNotIndexedBadge: string
  importDocIndexedBadge: (chunks: number) => string
  importDocPagesBadge: (n: number) => string
  importDocEncryptedBadge: string
  importDocProgressParse: string
  importDocProgressOcr: string
  importDocProgressIndex: string
  importDocProgressBrainStart: string
  importDocProgressEncrypt: string
  importDocLibraryTitle: string
  importDocLibraryEmpty: string
  importDocLibraryStats: (count: number, size: string) => string
  importDocLibraryFilter: string
  importDocLibraryFilterEmpty: string
  importDocLibrarySort: string
  importDocLibrarySortDate: string
  importDocLibrarySortName: string
  importDocLibrarySortSize: string
  importDocLibraryPending: string
  importDocLibraryIndexed: string
  importDocDelete: string
  importDocDeleteAria: (name: string) => string
  importDocDeleteConfirm: (name: string) => string
  importDocDeletedToast: (name: string) => string
  importDocDeleteFailedToast: string
  importProviders: string
  importProviderClaude: string
  importProviderChatgpt: string
  importProviderGemini: string
  importProviderGrok: string
  importLegalNote: string
  brainStateTitle: string
  brainDoctorRun: string
  brainDoctorRunning: string
  brainDoctorTitle: string
  brainDoctorCopy: string
  brainDoctorCopied: string
  brainDoctorCopyFailed: string
  brainDoctorOpenLogs: string
  brainDoctorSummary: (ok: number, warn: number, fail: number) => string
  brainStateLastDistill: (rel: string) => string
  brainStateLoading: string
  brainStateChatsInTools: string
  brainStateDistilled: string
  /** Clarifies the tile counts tool-scan matches, not vault notes. */
  brainStateDistilledHint: string
  brainStateVaultNotes: (n: number) => string
  brainStateBacklog: string
  brainStatePendingNew: (n: number) => string
  brainStateUncountable: string
  brainPipeCollect: string
  brainPipeCollectNote: string
  brainPipeDistill: string
  brainPipeDistillNote: string
  brainPipeIndex: string
  brainPipeIndexNote: string
  brainPipeDeploy: string
  brainPipeDeployNote: string
  cancel: string
  distillEmptyBacklog: string
  distillEmptyBacklogDetail: string
  activityBanner: (state: ActivityState) => string
  flowLiveBadge: (state: ActivityState) => string
  flowFocusBanner: (state: ActivityState) => string
  flowLastMcpBadge: (tool: string) => string
  flowFinaleCaption: string
  flowWaitingCaption: string
  flowMiniStatus: (state: ActivityState) => string
  dashboardActivityNow: (state: ActivityState) => string
  dashboardActivityLast: (relative: string) => string
  dashboardActivityNone: string
  guideFlowReplayHint: string
  activityTrayBusy: string
  healthTitle: string
  healthLead: string
  healthRefresh: string
  healthVault: string
  healthOllama: string
  healthEmbedModel: string
  healthChatModel: string
  healthBrainCore: string
  healthMcp: string
  healthDeployPath: string
  healthOpenLogs: string
  healthOk: string
  healthFail: string
  healthSkip: string
  healthChecking: string
  navDashboard: string
  navBrowse: string
  navImport: string
  navBrain: string
  navConnect: string
  navSettings: string
  navGuide: string
  navNavigate: string
  /** Browse tab — aggregated chats */
  browseLeadLoading: string
  browseLeadEmpty: string
  browseLeadCount: (n: number) => string
  browseSearchPlaceholder: string
  browseFilterAll: string
  browseNoVaultLead: string
  browseLoading: string
  browseNoMatches: string
  browseEmptyYet: string
  browseEmptySource: string
  browseEmptyYetHint: string
  browseEmptySourceHint: string
  browseSelectToRead: string
  browseHits: (n: number) => string
  browseMsgs: (n: number) => string
  browseMessages: (n: number) => string
  sidebarBusyDistill: string
  sidebarBusyImport: string
  sidebarBusyGeneric: string
  lockVaultBtn: string
  vaultLocked: string
  guideTitle: string
  guideSubtitle: string
  guideLead: string
  /** Idle FlowDiagram caption — hover hint; not the page lead. */
  flowIdleHoverCaption: string
  guideStep1Title: string
  guideStep1Body: string
  guideStep1Where: string
  guideStep2Title: string
  guideStep2Body: string
  guideStep2Where: string
  guideStep3Title: string
  guideStep3Body: string
  guideStep3Where: string
  guideStep4Title: string
  guideStep4Body: string
  guideStep4Where: string
  guideStep5Title: string
  guideStep5Body: string
  guideStep5Where: string
  guideStepOptionalTitle: string
  guideStepOptionalBody: string
  guideStepOptionalWhere: string
  guideDocsTitle: string
  guideDocsBody: string
  guideDocsWhere: string
  guideOpenTab: string
  guideDiagramToggle: string
  guideDiagramHide: string
  guideFlowReplay: string
  guideFlowReplayLast: string
  guideFlowReplayLastNone: string
  guideFlowReplayLastBusy: string
  guideFlowMainLegend: string
  guideFlowDocsLegend: string
  guideFlowOptionalLegend: string
  guideFlowAgentLegend: string
  guideFlowMiniExpand: string
  flowEdgeMemoryReturn: string
  flowAgentConsumptionCaption: string
  flowAgentLayerSkills: string
  flowAgentLayerSkillsOptional: string
  flowAgentLayerSearch: string
  flowIllustrationCaption: string
  flowNodeAiLabel: string
  flowNodeAiHint: string
  flowNodeAiDisk: string
  flowNodeVaultLabel: string
  /** Short label for floating PiP (~300px) — no wrap. */
  flowNodeVaultLabelPip: string
  flowNodeVaultHint: string
  flowNodeVaultDisk: string
  flowNodeDistillLabel: string
  flowNodeDistillHint: string
  flowNodeDistillDisk: string
  flowNodeNotesLabel: string
  flowNodeNotesHint: string
  flowNodeNotesDisk: string
  flowNodeLibraryLabel: string
  flowNodeLibraryLabelPip: string
  flowNodeLibraryHint: string
  flowNodeLibraryDisk: string
  flowNodeMcpLabel: string
  flowNodeMcpLabelPip: string
  flowNodeMcpHint: string
  flowNodeMcpDisk: string
  flowNodeImportLabel: string
  flowNodeImportHint: string
  flowNodeImportDisk: string
  flowNodeDocsIndexLabel: string
  flowNodeDocsIndexHint: string
  flowNodeDocsIndexDisk: string
  flowNodeDeployLabel: string
  flowNodeDeployHint: string
  flowNodeDeployDisk: string
  helpDontKnowStart: string
  statusStripTitle: string
  /** Dashboard badge when last doctor run had FAIL — links to Brain. */
  statusDoctorFail: string
  statusVault: string
  statusVaultOpen: string
  statusVaultClosed: string
  statusBrain: string
  statusBrainRunning: string
  statusBrainStopped: string
  statusOllama: string
  statusOllamaOk: string
  statusOllamaFail: string
  statusChecking: string
  statusLastDistill: string
  statusNoDistill: string
  statusPendingDocs: (n: number) => string
  statusPendingDocsNone: string
  statusDocuments: string
  dashboardTitle: string
  dashboardLead: string
  dashboardRescan: string
  dashboardStatSources: string
  dashboardStatSourcesSub: string
  dashboardStatChats: string
  dashboardStatChatsSub: string
  dashboardStatSnapshots: string
  dashboardStatSnapshotsClosed: string
  dashboardStatSkills: string
  dashboardStatSkillsSub: (own: number, imported: number) => string
  dashboardStatDistilled: string
  dashboardStatDistilledSub: string
  dashboardStatDocs: string
  dashboardStatDocsSub: (size: string, indexed: number) => string
  dashboardStatDocsPending: (n: number) => string
  dashboardStatDocsClosed: string
  skillsPageTitle: string
  skillsPageLead: string
  skillsSectionOwn: string
  skillsSectionImported: string
  skillsOpenFile: string
  skillsOpenFolder: string
  skillsEmptyOwn: string
  skillsEmptyImported: string
  skillsBack: string
  skillsSize: (bytes: number) => string
  skillsModified: (isoOrRelative: string) => string
  dashboardSourcesHeading: string
  dashboardSelectAll: string
  dashboardDeselectAll: string
  dashboardNoSourcesTitle: string
  dashboardNoSourcesDetail: string
  dashboardSourcesSelected: (n: number) => string
  dashboardReadyVault: (name: string) => string
  dashboardOpenVaultHint: string
  dashboardBackupNotePlaceholder: string
  dashboardBackupAndBrain: string
  dashboardBackupOnly: string
  dashboardWorking: string
  dashboardDistilling: string
  dashboardBackupStarting: string
  dashboardNoVaultTitle: string
  dashboardNoVaultDetail: string
  dashboardNothingSelected: string
  dashboardBackupDone: (n: number) => string
  dashboardBackupDoneSkipped: (n: number) => string
  dashboardBackupSkippedHint: string
  dashboardBackupFailed: string
  dashboardNoDistillSourcesTitle: string
  dashboardNoDistillSourcesDetail: string
  dashboardBrainOffTitle: string
  dashboardBrainOffDetail: string
  dashboardBrainStarted: string
  dashboardBrainStartFailed: string
}

const PL_LABELS: UiLabels = {
  distill: 'Przygotuj pamięć',
  distillBacklog: (n) => `Przygotuj pamięć (${n} nowych)`,
  runPipeline: 'Przemiel wszystko od nowa…',
  redistillEverythingConfirm: (n) =>
    `Przemielisz od nowa ${n} rozmów. Istniejące notatki zostaną nadpisane — to kosztowne i trudne do cofnięcia. Kontynuować?`,
  deployToBrain: 'Wyślij do wyszukiwarki',
  remoteDeployLead: 'To jest dla Brain na serwerze / KVM — lokalnie nie wypełniaj.',
  embedded: 'Lokalnie',
  remote: 'Na serwerze',
  reindex: 'Odśwież indeks',
  mcpConnect: 'Podłącz agenta',
  brainPageTitle: 'Pamięć i wyszukiwarka',
  brainPageLead:
    'Przygotuj rozmowy do wyszukiwania i uruchom lokalną wyszukiwarkę — bez serwera w chmurze.',
  brainDistillSelectedHint: (model, profile) =>
    `Destyluje wybrane źródła modelem ${model} (profil ${profile}) i buduje indeks wyszukiwania.`,
  brainAttachExport: 'Dołącz eksport do tego przebiegu…',
  brainAttachExportHint:
    'Przebieg zdestyluje dołączone archiwum (Claude.ai / ChatGPT / Grok / Gemini) zamiast żywych źródeł.',
  quarantineTitle: 'Notatki do przeglądu',
  quarantineLead:
    'Po destylacji słabe notatki lądują w _weak/ (indeksowane) lub _review/ (kwarantanna). Tylko Ty możesz przywrócić do distilled/.',
  quarantineHeader: (count) => `Kwarantanna · ${count}`,
  quarantineReview: '_review (kwarantanna)',
  quarantineWeak: '_weak (słabe)',
  quarantineWeakToggle: (count) => `${count} słabych (już w indeksie)`,
  quarantineEmpty: 'Brak notatek w kwarantannie.',
  quarantineSearchPlaceholder: 'filtruj po nazwie…',
  quarantineNoMatches: 'Brak notatek pasujących do filtra.',
  quarantineSelectToRead: 'Wybierz notatkę, żeby zobaczyć, dlaczego trafiła do kwarantanny',
  quarantineMetaQuality: 'quality',
  quarantineMetaMsgCount: 'msg_count',
  quarantineView: 'Podgląd',
  quarantinePromote: 'Przywróć do distilled/',
  quarantinePromotedToast: (name) => `Przywrócono ${name} do distilled/`,
  quarantinePromoteFailed: 'Nie udało się przywrócić notatki',
  quarantineDelete: 'Kasuj',
  quarantineDeleteConfirm: (name) =>
    `Trwale usunąć „${name}” z kwarantanny? Tej operacji nie da się cofnąć.`,
  quarantineDeletedToast: (name) => `Usunięto ${name}`,
  quarantineDeleteFailed: 'Nie udało się usunąć notatki',
  quarantineDeleteAll: 'Kasuj wszystkie',
  quarantineDeleteAllConfirm: (count) =>
    `Trwale usunąć ${count} ${count === 1 ? 'notatkę' : count < 5 ? 'notatki' : 'notatek'} z _review/ (kwarantanna)? Usuwane są tylko widoczne na liście (filtr). _weak/ pozostaje. Nie da się cofnąć.`,
  quarantineDeletedAllToast: (count) =>
    `Usunięto ${count} ${count === 1 ? 'notatkę' : count < 5 ? 'notatki' : 'notatek'} z _review/`,
  quarantineDeleteAllFailed: 'Nie udało się usunąć notatek z kwarantanny',
  quarantineClose: 'Zamknij',
  quarantineVaultClosed: 'Otwórz vault, żeby zobaczyć _review / _weak.',
  onboardingFirstRun: 'pierwszy start',
  onboardingSidebarFooter: 'Local-first. Zaszyfrowane. Nic nie wychodzi z dysku bez Twojej zgody.',
  onboardingStepWelcome: 'Witaj',
  onboardingStepStart: 'Start',
  onboardingStepVault: 'Vault',
  onboardingStepBackup: 'Backup',
  onboardingStepEngine: 'Silnik',
  onboardingStepMemory: 'Pamięć',
  onboardingStepConnect: 'Connect',
  onboardingStepReady: 'Gotowe',
  onboardingWelcomeTitle: 'Twoja pamięć AI\nw jednym miejscu',
  onboardingWelcomeLeadSimple:
    'Vault → backup rozmów → lokalna wyszukiwarka → agent. Bez żargonu, bez serwera w chmurze.',
  onboardingWelcomeLeadFull:
    'Pomnia zamienia rozproszone rozmowy z asystentami w jedną zaszyfrowaną, przeszukiwalną pamięć — i oddaje ją każdemu AI, z którym pracujesz.',
  onboardingWelcomeCtaSimple: 'Zaczynamy',
  onboardingWelcomeCtaFull: 'Konfiguracja w 2 minuty',
  onboardingValueCollectTitle: 'Zbieraj',
  onboardingValueCollectText:
    'Każdy czat z Claude Code, Cursor, Antigravity i innych — w jednym miejscu.',
  onboardingValueEncryptTitle: 'Szyfruj',
  onboardingValueEncryptText: 'Vault AES-256-GCM na Twoim dysku. Twoje prompty należą tylko do Ciebie.',
  onboardingValueRecallTitle: 'Przywołuj',
  onboardingValueRecallText: 'Oddaj kontekst dowolnemu AI przez MCP — agenci, którzy Cię pamiętają.',
  onboardingVaultTitle: 'Utwórz vault',
  onboardingVaultLead:
    'Jeden folder vaultu trzyma wszystko (np. C:\\Vault — nazwa dowolna, też *.pomnia). Wybierz lokalizację i hasło, którego nie zgubisz. Przenośność = skopiuj cały ten folder → Otwórz vault → hasło.',
  onboardingVaultCreateTab: 'Nowy vault',
  onboardingVaultOpenTab: 'Mam już folder',
  onboardingVaultNewFolder: 'Nowy folder vaultu',
  onboardingVaultFolder: 'Folder vaultu',
  onboardingVaultCreateContinue: 'Utwórz i dalej',
  onboardingVaultUnlockContinue: 'Odblokuj i dalej',
  onboardingPassphrase: 'Hasło',
  onboardingConfirmPass: 'Potwierdź',
  onboardingPassMismatch: 'Hasła się nie zgadzają.',
  onboardingVaultCryptoHint:
    'AES-256-GCM · scrypt · hasło nigdy nie jest zapisywane. Utrata hasła = brak odzyskania vaultu.',
  onboardingEnterApp: 'Wejdź do Pomnia',
  onboardingBackupTitle: 'Zrób backup czatów',
  onboardingBackupLead:
    'Automatycznie zaznaczamy asystentów znalezionych na tym komputerze. Jeden klik zapisuje je do vaultu.',
  onboardingBackupScanning: 'Szukam Claude Code, Cursor, Antigravity…',
  onboardingBackupNone:
    'Nie wykryto asystentów. Zainstaluj Cursor lub Claude Code, potem zrób backup z Dashboardu — albo pomiń na razie.',
  onboardingBackupChats: (n) => `${n} czatów`,
  onboardingBackupBackingUp: 'Backupuję…',
  onboardingBackupSkip: 'Pomiń — backup później z Dashboardu',
  onboardingBackupNow: 'Backup teraz',
  onboardingEngineTitle: 'Jak ma działać Brain?',
  onboardingEngineLead:
    'Wybierz lokalną wyszukiwarkę (wbudowaną w Pomnia) albo opcjonalny zdalny serwer Brain. Ollama na tym PC: embeddingi (nomic-embed-text, ~0,3 GB) i destylacja (qwen2.5:14b, ~9 GB).',
  onboardingEngineLocal: 'Lokalnie (embedded)',
  onboardingEngineLocalHint: (url) => `Jeden .exe, MCP na ${url} — bez zdalnego serwera, bez tokena.`,
  onboardingEngineRemote: 'Zdalny master',
  onboardingEngineRemoteHint: 'Twój serwer Brain w LAN — trzy serwery MCP + Bearer token.',
  onboardingEngineMasterUrl: 'URL Master MCP',
  onboardingEngineTestConn: 'Test połączenia',
  onboardingEngineRemoteOk: 'Serwer Brain odpowiada',
  onboardingEngineRemoteFail: 'Brak połączenia — sprawdź URL i sieć',
  onboardingEngineLooking: 'Szukam Ollama na tym komputerze…',
  onboardingEngineRunning: 'Ollama działa',
  onboardingEngineMoreModels: (n) => `+${n} więcej`,
  onboardingEngineEmbedHint: (model) =>
    `Model embeddingów: ${model} (~0,3 GB) — lokalne wyszukiwanie semantyczne.`,
  onboardingEngineDistillHint: (model) =>
    `Model destylacji: ${model} (~9 GB) — skraca rozmowy do notatek.`,
  onboardingEngineModelsNeeded: 'Potrzebne modele Ollama',
  onboardingEngineEmbedMissing: (cmd) => `Brak modelu embeddingów — uruchom: ${cmd}`,
  onboardingEngineDistillMissing: (cmd, size) =>
    `Brak modelu destylacji — uruchom: ${cmd} (ok. ${size}; nie blokuje dalszej konfiguracji).`,
  onboardingEngineNotFound: 'Nie znaleziono Ollama',
  onboardingEngineInstall1: 'Pobierz z ollama.com/download i zainstaluj (~2 min).',
  onboardingEngineInstall2:
    'Pobierz modele: ollama pull nomic-embed-text (~0,3 GB) oraz ollama pull qwen2.5:14b (~9 GB).',
  onboardingEngineInstall3: 'Wróć i sprawdź ponownie.',
  onboardingEngineRecheck: 'Sprawdź ponownie',
  onboardingEngineRemoteOllamaOptional:
    'W trybie zdalnym Ollama na tym PC jest opcjonalna — destylacja idzie na serwerze master.',
  onboardingEngineSkip: 'Pomiń — wybierz później w Connect',
  onboardingContinue: 'Dalej',
  onboardingSimpleBrainTitle: 'Uruchom lokalną wyszukiwarkę',
  onboardingSimpleBrainLead:
    'Mała wyszukiwarka na tym komputerze — agent może pytać Twoją pamięć bez zdalnego serwera.',
  onboardingSimpleBrainChecking: 'Sprawdzam lokalną wyszukiwarkę…',
  onboardingSimpleBrainRunning: 'Lokalna wyszukiwarka działa',
  onboardingSimpleBrainReady: 'Gotowe do startu',
  onboardingSimpleBrainReadyDetail: (url) => `Jeden klik uruchamia lokalny MCP na ${url}.`,
  onboardingSimpleBrainSkip: 'Pomiń — uruchom później w Brain',
  onboardingSimpleBrainStart: 'Start i dalej',
  onboardingConnectTitle: 'Podłącz agenta',
  onboardingConnectLead:
    'Skopiuj konfigurację MCP i wklej u klienta — Pomnia nigdy nie dotyka Twoich plików.',
  onboardingConnectCopied: 'Skopiowano',
  onboardingConnectCopy: 'Kopiuj config',
  onboardingConnectSkip: 'Pomiń — podepnij klientów później w Connect',
  onboardingReadyTitle: 'Gotowe',
  onboardingReadyLeadDone: 'Vault, backup i wyszukiwarka są gotowe. Agent może teraz przeszukiwać Twoją pamięć.',
  onboardingReadyLeadPartial: 'Uruchom pierwszy backup z Dashboardu — reszta jest podłączona.',
  onboardingReadyVault: 'Zaszyfrowany vault',
  onboardingReadyBackup: 'Pierwszy backup',
  onboardingReadySearch: 'Lokalna wyszukiwarka',
  onboardingReadyRemote: 'Zdalny serwer Brain',
  onboardingReadyMcp: 'Konfiguracja MCP agenta',
  onboardingReadyMcpFirst: 'Pierwszy klient MCP',
  onboardingSkipForNow: 'Pomiń na razie',
  onboardingBack: 'Wstecz',
  embeddedBrain: 'Lokalna wyszukiwarka',
  embeddedBrainStart: 'Start',
  embeddedBrainStop: 'Stop',
  embeddedBrainStoppedToast: 'Lokalna wyszukiwarka zatrzymana',
  toastModelReady: 'Model gotowy',
  toastPullFailed: 'Pobieranie nieudane',
  toastLocalIndexRefreshed: 'Lokalny indeks odświeżony',
  toastReindexFailed: 'Reindeksacja nieudana',
  toastSearchFailed: 'Wyszukiwanie nieudane',
  toastDeployed: 'Wysłano',
  toastDeployFailed: 'Deploy nieudany',
  brainSearchPlaceholder: 'zapytaj o coś, o czym już rozmawiałeś…',
  brainSearchButton: 'Szukaj',
  brainSearchEmpty:
    'Brak trafień. Indeks obejmuje tylko zdestylowane notatki — najpierw uruchom pipeline powyżej.',
  brainAdvancedDistillTitle: 'Zaawansowane · destylacja na tym hoście',
  brainAdvancedOllamaNeed: 'opcjonalne — wymaga lokalnej Ollamy',
  brainEmbeddedProcessHint:
    'Uruchamia brain-core jako proces potomny — klienci MCP na tej maszynie (Claude Code, Cursor, Antigravity…) dostają search_library / save_conversation z 127.0.0.1 bez serwera. Destylacja odświeża indeks automatycznie.',
  vaultGateTitle: 'Pomnia Vault',
  vaultGateLead: 'Pamięć AI w folderze vaultu — zaszyfrowana, przenośna, Twoja.',
  vaultGateUnlockTab: 'Odblokuj',
  vaultGateCreateTab: 'Utwórz',
  vaultGateName: 'Nazwa vaultu',
  vaultGateDefaultName: 'Mój vault',
  vaultGateCreateSubmit: 'Utwórz zaszyfrowany vault',
  vaultGateUnlockSubmit: 'Odblokuj vault',
  vaultPathPlaceholder: 'C:\\Vault',
  brainServer: 'Serwer Brain',
  searchKnowledge: 'Szukaj w swojej pamięci',
  advanced: 'Zaawansowane',
  simpleMode: 'Tryb prosty',
  simpleModeHint:
    'Ukrywa serwer zdalny, deploy i ustawienia GPU. Wystarczy vault → backup → wyszukiwarka → agent.',
  systemTray: 'Zasobnik systemowy',
  closeToTray: 'Zamknij do zasobnika',
  closeToTrayHint:
    'Przycisk X chowa aplikację do traya zamiast kończyć proces. Gdy działa lokalna wyszukiwarka — zawsze.',
  minimizeToTray: 'Minimalizuj do zasobnika',
  minimizeToTrayHint: 'Przycisk minimalizacji chowa okno do traya zamiast paska zadań.',
  openAtLogin: 'Uruchom przy starcie Windows',
  openAtLoginHint: 'Pomnia startuje automatycznie po zalogowaniu do Windows. Domyślnie wyłączone.',
  colorScheme: 'Kolorystyka',
  colorSchemeHint: 'Wygląd aplikacji — tła, akcenty i szkło paneli. Logo pomarańczowe bez zmian.',
  colorSchemeMint: 'Mint',
  colorSchemeIris: 'Iris',
  colorSchemeGlass: 'Szkło',
  uiLocale: 'Język interfejsu',
  uiLocaleHint:
    'Tylko chrome aplikacji (menu, Settings, toasty). Brain działa dwujęzycznie automatycznie — bez osobnego ustawienia języka wiedzy.',
  uiLocalePl: 'PL',
  uiLocaleEn: 'EN',
  floatingMonitor: 'Pływający diagram',
  floatingMonitorOnMinimize: 'Pokaż przy minimalizacji',
  floatingMonitorOnMinimizeHint:
    'Gdy chowasz okno do traya lub minimalizujesz — mały diagram na pulpicie pokazuje na żywo destylację, indeksowanie i zapytania MCP (jak PiP na YouTube).',
  floatingMonitorIdleBadge: 'Na żywo',
  floatingMonitorBrainOff: 'Brain wyłączony',
  floatingMonitorBrainStarting: 'Brain startuje…',
  floatingMonitorBrainReady: 'Brain gotowy',
  floatingMonitorBrainError: 'Brain: błąd',
  floatingMonitorClose: 'Zamknij pływający diagram',
  floatingMonitorPin: 'Przypnij — zawsze na wierzchu',
  floatingMonitorUnpin: 'Odepnij — nie trzymaj na wierzchu',
  floatingMonitorOpenHint: 'Kliknij, aby otworzyć Pomnię na „Jak to działa”. Podwójne kliknięcie — zamknij.',
  handshake: 'Handshake',
  handshakePlaceholder: 'OK to Go Go Go',
  handshakePhrase: 'Fraza dowodu',
  handshakePhraseHint:
    'Fraza, którą agent (Claude/Cursor…) ma powiedzieć na start pierwszej odpowiedzi = dowód, że Pomnia Brain działa. Po zmianie frazy: Connect → odśwież/zapisz reguły Brain, potem nowa sesja Claude.',
  handshakePhraseSave: 'Zapisz frazę',
  handshakePhraseSaved: 'Fraza Handshake zaktualizowana',
  handshakePhrasePreview: (phrase) => `Agent otworzy odpowiedź: „${phrase}”`,
  handshakePhraseEmpty: 'Fraza nie może być pusta.',
  handshakePhraseTooShort: 'Wpisz swoją frazę (min. 2 znaki).',
  handshakeEnabled: 'Handshake',
  handshakeEnabledHint:
    'Gdy włączone — agent ma zacząć pierwszą odpowiedź w rozmowie tą frazą. Wyłącz, jeśli nie chcesz powitania. Po zmianie: Connect → zapisz reguły Brain + nowa sesja Claude.',
  handshakeRefreshHint:
    'Po zmianie frazy: Connect → klient (Claude / Cursor / Antigravity) → Tryb Brain → „Zapisz regułę na dysk”, potem NOWA sesja (aktywne nie przeładują CLAUDE.md / pomnia.mdc / GEMINI.md).',
  autoCheckpoint: 'Kontynuacja sesji',
  autoCheckpointEnabled: 'Auto-checkpoint',
  autoCheckpointEnabledHint:
    'Gdy włączone (domyślnie) — agent może zapisać milestone przez checkpoint_session bez frazy „zapisz do Pomnia” (decyzja, fix+ścieżka, błąd+komenda, architektura). Świadomy pełny zapis nadal wymaga frazy → save_conversation.',
  profilePreview: 'Profil',
  profilePreviewTitle: 'PROFIL',
  profilePreviewSubtitle: 'Kim jesteś dla agenta',
  profilePreviewClose: 'Zamknij podgląd profilu',
  profilePreviewFooter: '§ PROFIL = osoba · Zapisz → USER.md',
  profilePreviewSave: 'Zapisz',
  profilePreviewSaving: 'Zapisuję…',
  profilePreviewSaved: 'Zapisano USER.md w vault',
  profilePreviewSaveFailed: 'Nie udało się zapisać',
  profilePreviewSaveTooLong: (max) => `Za długi profil — maks. ${max} znaków`,
  profilePreviewEditorHint: '§ PROFIL = Ty · § TECH = tożsamość projektu (nie changelog) · § KOMUNIKACJA',
  profilePreviewCopy: 'Kopiuj',
  profilePreviewCopySummary: 'Kopiuj streszczenie',
  profilePreviewCopied: 'Skopiowano USER.md',
  profilePreviewCopiedSummary: 'Skopiowano streszczenie',
  profilePreviewCopyFailed: 'Nie udało się skopiować',
  profilePreviewLoading: 'Profiluję…',
  profilePreviewProgressVault: 'Czytam USER.md…',
  profilePreviewProgressNotes: 'Szukam sygnałów w notatkach…',
  profilePreviewProgressSearch: 'Szukam w Brain…',
  profilePreviewProgressModel: 'Składam profil…',
  profilePreviewProgressDone: 'Gotowe',
  profilePreviewEmptyVault: 'Sejf zablokowany — odblokuj vault, żeby zobaczyć profil.',
  profilePreviewEmptyBrain: 'Lokalna wyszukiwarka nie działa — uruchom Brain na stronie Brain.',
  profilePreviewEmptyKnowledge: 'Uzupełnij § PROFIL (kim jesteś) i Zapisz — TECH to projekt, nie Ty.',
  connectPageLead:
    'Skopiuj konfigurację MCP i wklej u klienta (Cursor, Claude, Antigravity…) — Pomnia nigdy nie dotyka Twoich plików.',
  connectChecklistTitle: 'Pierwsze podłączenie (4 kroki)',
  connectStepUrl: 'URL Brain MCP (:7862)',
  connectStepToken: 'Token Bearer z dashboardu (:7860)',
  connectStepCopy: 'Kopiuj pełny mcp.json (3 serwery)',
  connectStepReload: 'Przeładuj klienta MCP (np. Reload Window)',
  connectCopyForClient: (name) => `Kopiuj mcp.json dla ${name}`,
  connectTokenPlaceholder: 'Bearer token (wymagany dla remote)',
  connectTokenRequired: 'Bez tokena remote MCP zwykle nie zadziała — wklej lub utwórz poniżej.',
  connectOpenDashboard: 'Otwórz dashboard tokenów',
  connectPartialTitle: 'Niepełny mcp.json — brak vault/library',
  connectPartialDetail:
    'Wykryto tylko część serwerów Pomnia. Remote wymaga pomnia + pomnia-vault + pomnia-library.',
  connectPartialFix: 'Skopiuj pełny config poniżej i nadpisz / zmerguj mcp.json',
  connectMacNoAppHint:
    'Bez aplikacji Desktop: docs/CURSOR-MCP.md — ten sam pełny JSON MCP (przykład Cursor; kształt dla innych klientów w Connect).',
  agentBrainMode: 'Tryb Brain dla agenta',
  agentBrainModeHint:
    'Dokłada regułę (Cursor rules / CLAUDE.md / Antigravity ~/.gemini/config/GEMINI.md) + silniejsze opisy narzędzi MCP: agent sam czyta profil, skille i pamięć; milestone → checkpoint_session (gdy Auto-checkpoint ON); świadomy zapis na „zapisz do Pomnia”. „Połączony” w Connect = plik MCP `pomnia`, nie gwarancja że agent już sprawdził w Pomnia.',
  agentBrainModeBriefTitle: 'Reguła agenta (Tryb Brain / Pomnia)',
  agentBrainModeBriefCopy: 'Kopiuj regułę do pliku',
  agentBrainModeBriefWrite: 'Zapisz regułę na dysk',
  agentBrainModeBriefWritten: 'Reguła Pomnia zapisana',
  agentBrainModeBriefWriteFailed: 'Nie udało się zapisać reguły',
  agentBrainModeRuleCopy: 'Kopiuj regułę (AGENTS.md / rules)',
  agentBrainModeNoPath:
    'Ten klient nie ma stałej ścieżki reguł — wklej blok do AGENTS.md albo system promptu.',
  agentBrainModeRefreshHint:
    'Po zmianie frazy Handshake: zapisz regułę ponownie. Cursor: skopiuj pomnia.mdc też do `.cursor/rules/` w projekcie (Agent ładuje reguły workspace), potem Reload Window + NOWA sesja. Claude / Antigravity: pełny restart + nowy czat. Aktywne czaty nie przeładują CLAUDE.md / pomnia.mdc / GEMINI.md.',
  embeddedBrainNotRunning: 'Lokalna wyszukiwarka nie działa. Otwórz zakładkę',
  embeddedBrainNotRunningLink: 'Brain',
  settingsTitle: 'Ustawienia',
  settingsLead: 'Vault, integracje i bezpieczeństwo.',
  vault: 'Vault',
  lockVault: 'Zablokuj',
  noVaultOpen: 'Brak otwartego vaultu.',
  knowledgePathOpen: (path) => `Wiedza (USER.md, distilled): ${path}`,
  knowledgePathLocked: 'otwórz vault',
  brainBridge: 'Most do Brain',
  brainBridgeLead:
    'Eksportuj rozmowy ze snapshotu jako notatki markdown — trafią do vaultu Brain i do indeksu RAG.',
  snapshot: 'Snapshot',
  outDir: 'Folder docelowy',
  exportNotes: 'Eksportuj',
  mcpClients: 'Klienci MCP',
  mcpClientsLead:
    'Te aplikacje czytają pamięć z Pomni. To niezależne od tego, czy oddają swoje rozmowy — czytać potrafi każdy klient mówiący MCP. Wybierz, które widać w zakładce Connect: wykryte pokazują się domyślnie — przypnij brakujące albo ukryj nieużywane.',
  strategyHybrid: 'czaty + config',
  strategySnapshot: 'tylko config',
  strategySnapshotHint:
    'To narzędzie nie udostępnia swoich rozmów w czytelnym formacie — zbieramy tylko jego konfigurację. Pamięć czyta normalnie, przez MCP.',
  sourceMcpReads: '✅ czyta pamięć przez MCP',
  sourceMcpNotConnected: '◽ MCP niepodłączone — skonfiguruj w Connect',
  sourceChatsCount: (n) => `${n} rozmów`,
  sourceNoChats: 'brak czatów do wyciągnięcia',
  detectedOnMachine: 'Wykryty na tym komputerze',
  notFound: 'Nie znaleziono',
  customOverride: 'własne',
  resetAutoDetect: 'Przywróć auto-wykrywanie',
  snapshots: 'Snapshoty',
  verifyIntegrity: 'Sprawdź integralność',
  snapshotsEmpty:
    'Brak snapshotów — uruchom backup z Dashboardu, żeby utworzyć pierwszą zamkniętą kopię.',
  snapshotsCount: (n) =>
    `${n} zamkniętych kopii punktowych. Nowe snapshoty tworzysz z Dashboardu.`,
  unlockVaultForSnapshots: 'Odblokuj vault, żeby zobaczyć snapshoty.',
  moreSnapshots: (n) => `+ ${n} więcej…`,
  securityAbout: 'Bezpieczeństwo i informacje',
  securityPortability:
    'Skopiuj cały folder vaultu (np. C:\\Vault) na inny komputer → Otwórz vault → hasło.',
  securityAboutCli: (identity) =>
    `${identity} · ten sam silnik działa też w trybie CLI (bez okna).`,
  antivirusTitle: 'Windows / antywirus',
  antivirusLead:
    'Obecne buildy open-source są niepodpisane — SmartScreen i Symantec/Defender mogą ostrzegać przy każdym nowym setup.exe. To normalne (nowy hash = zerowa reputacja), nie wirus.',
  antivirusWhy:
    'SmartScreen: „Więcej info → Uruchom mimo to”. Symantec: „ufam temu plikowi” raz jest OK. Folder instalacji wykluczaj tylko gdy AV dalej kwarantannuje instalację albo vault — to obejście, nie docelowy UX.',
  antivirusSigningNote:
    'Cel: Authenticode (OV/EV lub Azure Trusted Signing), żeby instalator „po prostu działał” bez ostrzeżeń. Do tego czasu nie wyłączaj AV i nie budujemy produktu na liście wyjątków.',
  antivirusOpenInstallFolder: 'Otwórz folder instalacji',
  previewMode: 'Tryb podglądu (bez backendu Electron) — dane są przykładowe.',
  importTitle: 'Importuj',
  importLead: 'Wgraj eksport z Claude.ai, ChatGPT, Gemini albo Grok — trafi do vaultu.',
  importPick: 'Wybierz plik eksportu lub upuść tutaj',
  importPickBusy: 'Importuję…',
  importVaultClosed: 'Najpierw odblokuj vault',
  importFormats: 'ZIP · JSON · JSONL · MD — rozpoznaje źródło automatycznie',
  importSelect: 'Wybierz plik…',
  importChatSection: 'Eksporty czatów',
  importChatDrop: 'Upuść eksport tutaj',
  importChatSealedToast: (added, updated, skipped) => {
    const parts: string[] = []
    if (added) parts.push(`Zapieczętowano ${added} nowe`)
    if (updated) parts.push(`zaktualizowano ${updated}`)
    if (skipped) parts.push(`pominięto ${skipped}`)
    return parts.join(' · ')
  },
  importChatAllDuplicatesDetail: 'Wszystkie rozmowy były już w vaulcie.',
  importChatNothingRecognized: 'Nic rozpoznawalnego w tym pliku',
  importChatFailedToast: 'Import czatów nie powiódł się',
  importChatConfirmTitle: 'Potwierdź zapis do vaultu',
  importChatConfirmSource: (source) => `Źródło: ${source}`,
  importChatConfirmStats: (conversations, messages) =>
    `${conversations} rozmów · ${messages} wiadomości`,
  importChatConfirmTitles: 'Pierwsze tytuły',
  importChatConfirmGenericWarn:
    'Nie rozpoznano formatu eksportu — treść zostanie zapisana jako pojedyncza rozmowa',
  importChatConfirmSeal: 'Zapisz do vaultu',
  importChatConfirmCancel: 'Anuluj',
  importChatConfirmDedup: (added, updated, skipped) => {
    const parts: string[] = []
    if (added) parts.push(`${added} nowych`)
    if (updated) parts.push(`${updated} zaktualizowanych`)
    if (skipped) parts.push(`${skipped} już w vaultcie`)
    return parts.join(' · ')
  },
  importDocSection: 'Dokumenty',
  importDocPick: 'Wybierz PDF, DOCX lub EPUB — albo upuść tutaj',
  importDocBusy: 'Importuję dokument…',
  importDocFormats: 'PDF · DOCX · EPUB · MD · TXT — zaszyfrowane w vault, indeks w wyszukiwarce',
  importDocSelect: 'Wybierz dokument…',
  importDocDrop: 'Upuść plik tutaj',
  importDropFailed: 'Upuszczenie nie powiodło się',
  importDropNoPath: 'Nie udało się odczytać ścieżki pliku. Użyj „Wybierz plik…”.',
  importUnsupportedFormat: 'Nieobsługiwany format',
  importDocDuplicateToast: 'Dokument już jest w vaulcie — pominięto',
  importDocDone: 'Dokument zaimportowany',
  importDocOcrHint: 'Mało tekstu — prawdopodobnie skan. Uruchom OCR, potem zindeksujemy ten dokument.',
  importDocOcrRun: 'Uruchom OCR',
  importDocOcrBusy: 'OCR w toku…',
  importDocOcrDoneToast: (pages) => `OCR gotowy (${pages} str.)`,
  importDocOcrFailedToast: 'OCR nie powiódł się',
  importDocBrainOff: 'Uruchom lokalną wyszukiwarkę (Brain), żeby zindeksować chunki.',
  importDocQueuedHint: 'Zapisano w vault — indeks po uruchomieniu Brain.',
  importDocIndexedToast: (chunks) => `Zindeksowano ${chunks} chunków`,
  importDocQueuedToast: 'Zapisano — indeks po uruchomieniu Brain',
  importDocQueuedDetail: 'Dokument jest w vault; indeks powstanie po starcie wyszukiwarki.',
  importDocFailedToast: 'Import dokumentu nie powiódł się',
  importDocNotIndexedBadge: 'bez indeksu',
  importDocIndexedBadge: (chunks) => `${chunks} chunków`,
  importDocPagesBadge: (n) => `${n} str.`,
  importDocEncryptedBadge: 'zaszyfrowany w vault',
  importDocProgressParse: 'Parsowanie',
  importDocProgressOcr: 'OCR',
  importDocProgressIndex: 'Indeksowanie',
  importDocProgressBrainStart: 'Uruchamianie wyszukiwarki',
  importDocProgressEncrypt: 'Szyfrowanie w vault',
  importDocLibraryTitle: 'Dokumenty w vault',
  importDocLibraryEmpty: 'Brak zaimportowanych dokumentów w library.cvb.',
  importDocLibraryStats: (count, size) => `${count} dok. · ${size}`,
  importDocLibraryFilter: 'Filtruj po nazwie…',
  importDocLibraryFilterEmpty: 'Brak dokumentów pasujących do filtra.',
  importDocLibrarySort: 'Sortuj dokumenty',
  importDocLibrarySortDate: 'Data dodania',
  importDocLibrarySortName: 'Nazwa',
  importDocLibrarySortSize: 'Rozmiar',
  importDocLibraryPending: 'czeka na indeks',
  importDocLibraryIndexed: 'zindeksowany',
  importDocDelete: 'Usuń',
  importDocDeleteAria: (name) => `Usuń „${name}”`,
  importDocDeleteConfirm: (name) =>
    `Usunąć „${name}”? Usuniemy tylko bloby tego dokumentu (nie czaty/snapshoty).`,
  importDocDeletedToast: (name) => `Usunięto ${name}`,
  importDocDeleteFailedToast: 'Nie udało się usunąć dokumentu',
  importProviders: 'Skąd pobrać eksport',
  importProviderClaude: 'Settings → Privacy → Export data → conversations.json (ZIP)',
  importProviderChatgpt: 'Settings → Data controls → Export data → conversations.json (ZIP)',
  importProviderGemini:
    'Takeout → My Activity → tylko Gemini Apps → Multiple formats → JSON (nie HTML / nie Gems)',
  importProviderGrok: 'Account → export conversations → ZIP/JSON',
  importLegalNote:
    'Pomnia importuje tylko oficjalne eksporty — bez logowania do kont. Claude Desktop / Gemini wymagają eksportu z wersji webowej.',
  brainStateTitle: 'Stan Brain',
  brainDoctorRun: 'Sprawdź stan',
  brainDoctorRunning: 'Sprawdzanie…',
  brainDoctorTitle: 'Diagnostyka (doctor)',
  brainDoctorCopy: 'Kopiuj raport',
  brainDoctorCopied: 'Raport skopiowany',
  brainDoctorCopyFailed: 'Nie udało się skopiować raportu',
  brainDoctorOpenLogs: 'Otwórz logi',
  brainDoctorSummary: (ok, warn, fail) => `${ok} OK · ${warn} WARN · ${fail} FAIL`,
  brainStateLastDistill: (rel) => `Ostatnia destylacja ${rel}`,
  brainStateLoading: 'Wczytywanie stanu pipeline…',
  brainStateChatsInTools: 'Czaty w narzędziach',
  brainStateDistilled: 'Zdestylowane',
  brainStateDistilledHint: 'z bieżącego skanu narzędzi',
  brainStateVaultNotes: (n) => `vault: ${n} notatek`,
  brainStateBacklog: 'Kolejka',
  brainStatePendingNew: (n) => `+${n} nowych`,
  brainStateUncountable: 'nie do policzenia (DB > 256 MB)',
  brainPipeCollect: 'Zbieraj',
  brainPipeCollectNote: 'z asystentów',
  brainPipeDistill: 'Destyluj',
  brainPipeDistillNote: 'lokalny model',
  brainPipeIndex: 'Indeksuj',
  brainPipeIndexNote: 'embeddingi',
  brainPipeDeploy: 'Wyślij',
  brainPipeDeployNote: 'do Brain',
  cancel: 'Anuluj',
  distillEmptyBacklog: 'Brak nowych sesji do destylacji',
  distillEmptyBacklogDetail: 'Wszystkie czaty z wybranych źródeł są już w ledgerze destylacji.',
  activityBanner: formatActivityBanner,
  flowLiveBadge: formatFlowLiveBadge,
  flowFocusBanner: formatFlowFocusBanner,
  flowLastMcpBadge: formatFlowLastMcpBadge,
  activityTrayBusy: 'Operacja w tle',
  healthTitle: 'Diagnostyka',
  healthLead: 'Szybki przegląd — co musi działać, żeby pamięć i MCP były gotowe.',
  healthRefresh: 'Odśwież',
  healthVault: 'Vault',
  healthOllama: 'Ollama',
  healthEmbedModel: 'Model embeddingów',
  healthChatModel: 'Model destylacji',
  healthBrainCore: 'Lokalna wyszukiwarka',
  healthMcp: 'Brain MCP',
  healthDeployPath: 'Folder deploy (opcjonalnie)',
  healthOpenLogs: 'Otwórz logi',
  healthOk: 'OK',
  healthFail: 'Problem',
  healthSkip: 'Pominięte',
  healthChecking: 'Sprawdzam…',
  navDashboard: 'Dashboard',
  navBrowse: 'Czaty',
  navImport: 'Import',
  navBrain: 'Brain',
  navConnect: 'Connect',
  navSettings: 'Ustawienia',
  navGuide: 'Jak to działa',
  navNavigate: 'Nawigacja',
  browseLeadLoading: 'Ładowanie rozmów z vaultu…',
  browseLeadEmpty: 'Brak rozmów w tym vaulcie — zaimportuj je z zakładki Import.',
  browseLeadCount: (n) =>
    `${n} rozmów ze wszystkich źródeł — wyszukiwanie lokalne, bez GPU.`,
  browseSearchPlaceholder: 'szukaj w treści wszystkich czatów…',
  browseFilterAll: 'Wszystkie',
  browseNoVaultLead: 'Odblokuj vault, żeby przeglądać i szukać w zagregowanych czatach.',
  browseLoading: 'ładowanie…',
  browseNoMatches: 'Brak trafień w treści.',
  browseEmptyYet: 'Tu jeszcze nic nie ma.',
  browseEmptySource: 'Brak czatów z tego źródła.',
  browseEmptyYetHint: 'Uruchom backup z Dashboardu albo wgraj eksporty przez Import.',
  browseEmptySourceHint: 'Wybierz inny filtr źródła powyżej.',
  browseSelectToRead: 'Wybierz rozmowę, żeby ją przeczytać.',
  browseHits: (n) => `${n} trafień`,
  browseMsgs: (n) => `${n} wiad.`,
  browseMessages: (n) => `${n} wiadomości`,
  sidebarBusyDistill: 'destylacja…',
  sidebarBusyImport: 'import…',
  sidebarBusyGeneric: 'praca w tle…',
  lockVaultBtn: 'Zablokuj vault',
  vaultLocked: 'zablokowany',
  guideTitle: 'Mapa Pomnia',
  guideSubtitle: 'Jak to działa',
  guideLead:
    'Gdzie co się dzieje — od surowych logów asystentów po wyszukiwanie przez MCP. Lokalnie domyślnie; chmura tylko gdy sam włączysz deploy LAN albo opcjonalne API destylacji.',
  flowIdleHoverCaption: 'Najedź na element, żeby zobaczyć, co robi',
  guideStep1Title: 'Krok 1 — Zbieranie',
  guideStep1Body:
    'Cursor, Claude Code, Antigravity… — Pomnia czyta żywe logi z dysku albo importuje eksporty ZIP/JSON.',
  guideStep1Where: 'Dashboard → Backup · Import',
  guideStep2Title: 'Krok 2 — Vault Pomnia',
  guideStep2Body:
    'Folder vaultu, który wybrałeś przy tworzeniu (np. C:\\Vault — nazwa dowolna, czasem *.pomnia). Zaszyfrowane snapshoty + dokumenty. To archiwum, nie wyszukiwarka i nie AppData.',
  guideStep2Where: 'Dashboard · Ustawienia → Vault',
  guideStep3Title: 'Krok 3 — Destylacja',
  guideStep3Body:
    'Ollama (qwen) skraca rozmowy do notatek w brain-notes/ — skróty, NIE pełne kopie czatów.',
  guideStep3Where: 'Brain → Przygotuj pamięć',
  guideStep4Title: 'Krok 4 — Wyszukiwarka',
  guideStep4Body:
    'Embedded brain buduje library.db — chunki + embeddingi lokalnie na tym komputerze.',
  guideStep4Where: 'Brain → Lokalna wyszukiwarka',
  guideStep5Title: 'Krok 5 — Agent przez MCP',
  guideStep5Body:
    'Klient MCP łączy agenta z lokalną wyszukiwarką. Podczas kodowania agent może wołać search_library (RAG) i opcjonalnie ładować skills — to nie jest zapis do pamięci, tylko pytanie w trakcie pracy.',
  guideStep5Where: 'Connect · search_library · get_skill',
  guideStepOptionalTitle: 'Opcjonalnie — serwer Brain',
  guideStepOptionalBody:
    'Deploy kopii notatek na opcjonalny serwer Brain w sieci LAN — wspólna pamięć dla wielu maszyn.',
  guideStepOptionalWhere: 'Brain → Zaawansowane → Deploy',
  guideDocsTitle: 'Dokumenty (PDF / EPUB)',
  guideDocsBody:
    'Import → vault (zaszyfrowane) → bezpośredni indeks embeddingów. BEZ destylacji LLM — tylko chunk + embed.',
  guideDocsWhere: 'Import → Dokumenty',
  guideOpenTab: 'Otwórz zakładkę',
  guideDiagramToggle: 'Pokaż diagram',
  guideDiagramHide: 'Ukryj diagram',
  guideFlowReplay: 'Odtwórz demo',
  guideFlowReplayLast: 'Odtwórz ostatnią aktywność',
  guideFlowReplayLastNone: 'Brak zapisanej aktywności — uruchom destylację, import lub zapytanie MCP.',
  guideFlowReplayLastBusy: 'Poczekaj — trwa operacja na żywo.',
  guideFlowReplayHint: 'Demo kroków albo odtworzenie ostatniej realnej operacji (destylacja, import, MCP)',
  guideFlowMainLegend: 'Ścieżka czatów',
  guideFlowDocsLegend: 'Ścieżka dokumentów',
  guideFlowOptionalLegend: 'Opcjonalnie',
  guideFlowAgentLegend: 'Zapytanie agenta',
  flowAgentConsumptionCaption: 'Konsumpcja (nie zapis):',
  guideFlowMiniExpand: 'Pełna mapa →',
  flowEdgeMemoryReturn: 'odpowiedź z pamięci',
  flowNodeAiLabel: 'Narzędzia AI',
  flowNodeAiHint: 'Cursor, Claude Code, Antigravity — surowe logi sesji na dysku lokalnym.',
  flowNodeAiDisk: 'Cursor · Claude · Antigravity',
  flowNodeVaultLabel: 'Folder vaultu',
  flowNodeVaultLabelPip: 'Vault',
  flowNodeVaultHint:
    'Zaszyfrowane archiwum (header.json, blobs, skills/, USER.md, distilled…) — cały folder, np. C:\\Vault.',
  flowNodeVaultDisk: 'np. C:\\Vault',
  flowNodeDistillLabel: 'Destylacja',
  flowNodeDistillHint: 'Ollama (qwen) skraca rozmowy do zwięzłych notatek — nie pełne kopie czatów.',
  flowNodeDistillDisk: 'localhost:11434',
  flowNodeNotesLabel: 'brain-notes',
  flowNodeNotesHint: 'Zdestylowane skróty sesji gotowe do indeksowania.',
  flowNodeNotesDisk: 'notes/distilled',
  flowNodeLibraryLabel: 'library.db',
  flowNodeLibraryLabelPip: 'library.db',
  flowNodeLibraryHint: 'Embedded brain: chunki tekstu + wektory embeddingów lokalnie na tym PC.',
  flowNodeLibraryDisk: 'core-data/library.db',
  flowNodeMcpLabel: 'Agent przez MCP',
  flowNodeMcpLabelPip: 'Agent MCP',
  flowNodeMcpHint: 'Agent łączy się przez MCP — most do lokalnej wyszukiwarki Brain.',
  flowNodeMcpDisk: 'Connect · mcp.json',
  flowAgentLayerSkills: 'skills',
  flowAgentLayerSkillsOptional: 'opcj.',
  flowAgentLayerSearch: 'search_library',
  flowFinaleCaption: 'Indeks gotowy — pamięć dostępna dla agenta',
  flowWaitingCaption: 'Gdy coś się dzieje, podświetli się tylko aktywna ścieżka',
  flowMiniStatus: (state) => (state.kind === 'idle' ? 'Bezczynnie' : formatFlowFocusBanner(state)),
  dashboardActivityNow: (state) => formatFlowLiveBadge(state),
  dashboardActivityLast: (relative) => `Ostatnia aktywność: destylacja ${relative}`,
  dashboardActivityNone: 'Brak ostatniej destylacji — uruchom Brain, aby przygotować pamięć',
  flowIllustrationCaption:
    'Oczekiwanie — animacja ruszy przy destylacji, imporcie, indeksowaniu lub zapytaniu MCP',
  flowNodeImportLabel: 'Import',
  flowNodeImportHint: 'PDF, EPUB, ZIP — trafia do vaultu bez destylacji LLM.',
  flowNodeImportDisk: 'vault/library.cvb',
  flowNodeDocsIndexLabel: 'Indeks',
  flowNodeDocsIndexHint: 'Chunk + embed — bez destylacji.',
  flowNodeDocsIndexDisk: 'library.db (docs)',
  flowNodeDeployLabel: 'Deploy',
  flowNodeDeployHint: 'Opcjonalna kopia notatek na zdalny serwer Brain (np. LAN :7860).',
  flowNodeDeployDisk: 'serwer Brain (opc.)',
  helpDontKnowStart: 'Nie wiem od czego zacząć →',
  statusStripTitle: 'Gdzie jesteś teraz',
  statusDoctorFail: 'Doctor FAIL',
  statusVault: 'Vault',
  statusVaultOpen: 'otwarty',
  statusVaultClosed: 'zamknięty',
  statusBrain: 'Brain lokalny',
  statusBrainRunning: 'działa',
  statusBrainStopped: 'wyłączony',
  statusOllama: 'Ollama',
  statusOllamaOk: 'OK',
  statusOllamaFail: 'brak połączenia',
  statusChecking: 'sprawdzam…',
  statusLastDistill: 'Ostatnia destylacja',
  statusNoDistill: 'jeszcze nie było',
  statusPendingDocs: (n) => `${n} dok. czeka na indeks`,
  statusPendingDocsNone: 'brak oczekujących',
  statusDocuments: 'Dokumenty',
  dashboardTitle: 'Centrum dowodzenia',
  dashboardLead:
    'Rozmowy z twoich asystentów w jednym zaszyfrowanym vaulcie — czyta je każdy agent mówiący MCP.',
  dashboardRescan: 'Rescan',
  dashboardStatSources: 'Źródła',
  dashboardStatSourcesSub: 'zainstalowane',
  dashboardStatChats: 'Czaty',
  dashboardStatChatsSub: 'do wyciągnięcia',
  dashboardStatSnapshots: 'Snapshoty',
  dashboardStatSnapshotsClosed: 'brak vaultu',
  dashboardStatSkills: 'Skills',
  dashboardStatSkillsSub: (own, imported) => `${own} własnych · ${imported} zaimportowanych`,
  dashboardStatDistilled: 'Notatki',
  dashboardStatDistilledSub: 'distilled',
  dashboardStatDocs: 'Dokumenty',
  dashboardStatDocsSub: (size, indexed) => `${size} · ${indexed} zindeksowane`,
  dashboardStatDocsPending: (n) => (n === 1 ? '1 czeka na indeks' : `${n} czeka na indeks`),
  dashboardStatDocsClosed: 'brak vaultu',
  skillsPageTitle: 'Skills',
  skillsPageLead:
    'Skille to instrukcje, po które agent sięga sam przez `get_skill`. Nie są częścią wyszukiwania — to gotowe procedury, nie wiedza.',
  skillsSectionOwn: 'Własne (brain/)',
  skillsSectionImported: 'Zaimportowane (cli/)',
  skillsOpenFile: 'Otwórz plik',
  skillsOpenFolder: 'Otwórz folder',
  skillsEmptyOwn: 'Brak własnych skilli w vault/skills/brain/.',
  skillsEmptyImported: 'Brak zaimportowanych pakietów w vault/skills/cli/.',
  skillsBack: '← Dashboard',
  skillsSize: (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  },
  skillsModified: (s) => s,
  dashboardSourcesHeading: 'Źródła',
  dashboardSelectAll: 'Zaznacz wszystkie',
  dashboardDeselectAll: 'Odznacz wszystkie',
  dashboardNoSourcesTitle: 'Brak wykrytych narzędzi AI na tej maszynie.',
  dashboardNoSourcesDetail:
    'Pomnia szuka Claude Code, Cursor, Claude Desktop, Antigravity i VS Code. Zainstaluj, porozmawiaj, potem Rescan — albo Import.',
  dashboardSourcesSelected: (n) =>
    n === 1 ? '1 źródło zaznaczone' : `${n} źródeł zaznaczonych`,
  dashboardReadyVault: (name) => `Gotowe — backup do „${name}”`,
  dashboardOpenVaultHint: 'Otwórz vault, żeby włączyć backup',
  dashboardBackupNotePlaceholder: 'opcjonalna notatka…',
  dashboardBackupAndBrain: 'Backup i do Brain',
  dashboardBackupOnly: 'Tylko backup',
  dashboardWorking: 'Pracuję…',
  dashboardDistilling: 'Destylacja do Brain…',
  dashboardBackupStarting: 'startuję…',
  dashboardNoVaultTitle: 'Brak otwartego vaultu',
  dashboardNoVaultDetail: 'Najpierw utwórz lub odblokuj vault.',
  dashboardNothingSelected: 'Nic nie zaznaczono',
  dashboardBackupDone: (n) => `Zrobiono backup ${n} źródeł`,
  dashboardBackupDoneSkipped: (n) => `Backup gotowy — pominięto ${n} zablokowanych plików`,
  dashboardBackupSkippedHint: 'zamknij działające aplikacje i zrób backup ponownie',
  dashboardBackupFailed: 'Backup nieudany',
  dashboardNoDistillSourcesTitle: 'Backup gotowy — brak źródeł do destylacji',
  dashboardNoDistillSourcesDetail:
    'Destylacja działa dla Claude Code, Cursor i Claude Desktop. Zaznacz jedno z nich albo użyj zakładki Brain.',
  dashboardBrainOffTitle: 'Backup gotowy — Brain wyłączony',
  dashboardBrainOffDetail:
    'Destylacja wymaga lokalnej wyszukiwarki. Uruchom Brain, a potem kontynuuj destylację.',
  dashboardBrainStarted: 'Brain uruchomiony — destyluję…',
  dashboardBrainStartFailed: 'Nie udało się uruchomić Brain',
}

/**
 * English chrome overlay — critical paths (nav, Settings, Dashboard, common toasts).
 * Missing keys fall back to PL via merge in uiLabels(). Grow over time.
 */
const EN_LABELS: Partial<UiLabels> = {
  distill: 'Prepare memory',
  distillBacklog: (n) => `Prepare memory (${n} new)`,
  runPipeline: 'Re-distill everything…',
  redistillEverythingConfirm: (n) =>
    `Re-distill all ${n} conversations? Existing notes will be overwritten — costly and hard to reverse.`,
  deployToBrain: 'Send to search',
  remoteDeployLead: 'For Brain on a server / KVM — leave empty for local.',
  embedded: 'Local',
  remote: 'Remote',
  reindex: 'Refresh index',
  mcpConnect: 'Connect agent',
  brainPageTitle: 'Memory & search',
  brainPageLead: 'Prepare chats for search and start the local search engine — no cloud server.',
  brainDistillSelectedHint: (model, profile) =>
    `Distills selected sources with ${model} (${profile} profile) and builds a searchable index.`,
  brainAttachExport: 'Add export to this run…',
  brainAttachExportHint:
    'Run will distill the attached archive (Claude.ai / ChatGPT / Grok / Gemini) instead of live sources.',
  quarantineTitle: 'Notes for review',
  quarantineLead:
    'After distill, weak notes go to _weak/ (indexed) or _review/ (quarantine). Only you can move them back to distilled/.',
  quarantineHeader: (count) => `Quarantine · ${count}`,
  quarantineReview: '_review (quarantine)',
  quarantineWeak: '_weak (weak)',
  quarantineWeakToggle: (count) => `${count} weak (already indexed)`,
  quarantineEmpty: 'No notes in quarantine.',
  quarantineSearchPlaceholder: 'filter by name…',
  quarantineNoMatches: 'No notes match the filter.',
  quarantineSelectToRead: 'Select a note to see why it landed in quarantine',
  quarantineMetaQuality: 'quality',
  quarantineMetaMsgCount: 'msg_count',
  quarantineView: 'View',
  quarantinePromote: 'Restore to distilled/',
  quarantinePromotedToast: (name) => `Restored ${name} to distilled/`,
  quarantinePromoteFailed: 'Could not restore note',
  quarantineDelete: 'Delete',
  quarantineDeleteConfirm: (name) =>
    `Permanently delete “${name}” from quarantine? This cannot be undone.`,
  quarantineDeletedToast: (name) => `Deleted ${name}`,
  quarantineDeleteFailed: 'Could not delete note',
  quarantineDeleteAll: 'Delete all',
  quarantineDeleteAllConfirm: (count) =>
    `Permanently delete ${count} note${count === 1 ? '' : 's'} from _review/ (quarantine)? Only notes currently listed (filter applied). _weak/ is left untouched. This cannot be undone.`,
  quarantineDeletedAllToast: (count) =>
    `Deleted ${count} note${count === 1 ? '' : 's'} from _review/`,
  quarantineDeleteAllFailed: 'Could not delete quarantine notes',
  quarantineClose: 'Close',
  quarantineVaultClosed: 'Open a vault to see _review / _weak.',
  onboardingFirstRun: 'first run',
  onboardingSidebarFooter: 'Local-first. Encrypted. Nothing leaves your hardware unless you say so.',
  onboardingStepWelcome: 'Welcome',
  onboardingStepStart: 'Start',
  onboardingStepVault: 'Vault',
  onboardingStepBackup: 'Backup',
  onboardingStepEngine: 'Engine',
  onboardingStepMemory: 'Memory',
  onboardingStepConnect: 'Connect',
  onboardingStepReady: 'Ready',
  onboardingWelcomeTitle: 'Your AI memory\nin one place',
  onboardingWelcomeLeadSimple:
    'Vault → chat backup → local search → agent. No jargon, no cloud server.',
  onboardingWelcomeLeadFull:
    'Pomnia turns scattered assistant chats into one encrypted, searchable memory — and gives it to every AI you work with.',
  onboardingWelcomeCtaSimple: 'Let’s go',
  onboardingWelcomeCtaFull: 'Setup in 2 minutes',
  onboardingValueCollectTitle: 'Collect',
  onboardingValueCollectText: 'Every chat from Claude Code, Cursor, Antigravity and more — in one place.',
  onboardingValueEncryptTitle: 'Encrypt',
  onboardingValueEncryptText: 'AES-256-GCM vault on your disk. Your prompts stay yours.',
  onboardingValueRecallTitle: 'Recall',
  onboardingValueRecallText: 'Hand context to any AI via MCP — agents that remember you.',
  onboardingVaultTitle: 'Create a vault',
  onboardingVaultLead:
    'One vault folder holds everything (e.g. C:\\Vault — any name, including *.pomnia). Pick a location and a passphrase you won’t lose. Portability = copy that whole folder → Open vault → passphrase.',
  onboardingVaultCreateTab: 'New vault',
  onboardingVaultOpenTab: 'I already have a folder',
  onboardingVaultNewFolder: 'New vault folder',
  onboardingVaultFolder: 'Vault folder',
  onboardingVaultCreateContinue: 'Create & continue',
  onboardingVaultUnlockContinue: 'Unlock & continue',
  onboardingPassphrase: 'Passphrase',
  onboardingConfirmPass: 'Confirm',
  onboardingPassMismatch: "Passphrases don't match.",
  onboardingVaultCryptoHint:
    'AES-256-GCM · scrypt · the passphrase is never stored. Lose it and the vault is unrecoverable.',
  onboardingEnterApp: 'Enter Pomnia',
  onboardingBackupTitle: 'Backup your chats',
  onboardingBackupLead:
    'We auto-select assistants found on this machine. One click saves them into your vault.',
  onboardingBackupScanning: 'Scanning for Claude Code, Cursor, Antigravity…',
  onboardingBackupNone:
    'No assistants detected yet. Install Cursor or Claude Code, then run backup from the Dashboard — or skip for now.',
  onboardingBackupChats: (n) => `${n} chats`,
  onboardingBackupBackingUp: 'Backing up…',
  onboardingBackupSkip: 'Skip — backup later from Dashboard',
  onboardingBackupNow: 'Backup now',
  onboardingEngineTitle: 'How will Brain run?',
  onboardingEngineLead:
    'Pick local embedded brain (built into Pomnia) or an optional remote Brain server. Ollama on this machine: embeddings (nomic-embed-text, ~0.3GB) and distill (qwen2.5:14b, ~9GB).',
  onboardingEngineLocal: 'Local embedded',
  onboardingEngineLocalHint: (url) => `One .exe, MCP on ${url} — no remote server, no token.`,
  onboardingEngineRemote: 'Remote master',
  onboardingEngineRemoteHint: 'Your Brain server on the LAN — three MCP servers + Bearer token.',
  onboardingEngineMasterUrl: 'Master MCP URL',
  onboardingEngineTestConn: 'Test connection',
  onboardingEngineRemoteOk: 'Brain server is responding',
  onboardingEngineRemoteFail: 'Unreachable — check URL and network',
  onboardingEngineLooking: 'Looking for Ollama on this machine…',
  onboardingEngineRunning: 'Ollama is running',
  onboardingEngineMoreModels: (n) => `+${n} more`,
  onboardingEngineEmbedHint: (model) =>
    `Embedding model: ${model} (~0.3GB) — powers local semantic search.`,
  onboardingEngineDistillHint: (model) =>
    `Distill model: ${model} (~9GB) — shortens chats into notes.`,
  onboardingEngineModelsNeeded: 'Ollama models needed',
  onboardingEngineEmbedMissing: (cmd) => `Embedding model missing — run: ${cmd}`,
  onboardingEngineDistillMissing: (cmd, size) =>
    `Distill model missing — run: ${cmd} (~${size}; does not block setup).`,
  onboardingEngineNotFound: 'Ollama not found',
  onboardingEngineInstall1: 'Download from ollama.com/download and install (2 min).',
  onboardingEngineInstall2:
    'Pull models: ollama pull nomic-embed-text (~0.3GB) and ollama pull qwen2.5:14b (~9GB).',
  onboardingEngineInstall3: 'Come back and re-check.',
  onboardingEngineRecheck: 'Re-check',
  onboardingEngineRemoteOllamaOptional:
    'Ollama on this PC is optional in remote mode — distillation runs on your master server.',
  onboardingEngineSkip: 'Skip — pick later in Connect tab',
  onboardingContinue: 'Continue',
  onboardingSimpleBrainTitle: 'Start local search',
  onboardingSimpleBrainLead:
    'Runs a small search engine on this machine — an agent can query your memory without any remote server.',
  onboardingSimpleBrainChecking: 'Checking local search engine…',
  onboardingSimpleBrainRunning: 'Local search is running',
  onboardingSimpleBrainReady: 'Ready to start',
  onboardingSimpleBrainReadyDetail: (url) => `One click starts the local MCP server on ${url}.`,
  onboardingSimpleBrainSkip: 'Skip — start later in Brain tab',
  onboardingSimpleBrainStart: 'Start & continue',
  onboardingConnectTitle: 'Connect an agent',
  onboardingConnectLead:
    'Copy the MCP config and paste it in your client — Pomnia never touches your files.',
  onboardingConnectCopied: 'Copied',
  onboardingConnectCopy: 'Copy config',
  onboardingConnectSkip: 'Skip — wire clients later from the Connect tab',
  onboardingReadyTitle: 'Ready',
  onboardingReadyLeadDone: 'Vault, backup and search are ready. An agent can now search your memory.',
  onboardingReadyLeadPartial: 'Run the first backup from the Dashboard — the rest is connected.',
  onboardingReadyVault: 'Encrypted vault',
  onboardingReadyBackup: 'First backup',
  onboardingReadySearch: 'Local search',
  onboardingReadyRemote: 'Remote Brain server',
  onboardingReadyMcp: 'Agent MCP config',
  onboardingReadyMcpFirst: 'First MCP client',
  onboardingSkipForNow: 'Skip for now',
  onboardingBack: 'Back',
  embeddedBrain: 'Local search',
  embeddedBrainStart: 'Start',
  embeddedBrainStop: 'Stop',
  embeddedBrainStoppedToast: 'Local search stopped',
  toastModelReady: 'Model ready',
  toastPullFailed: 'Pull failed',
  toastLocalIndexRefreshed: 'Local index refreshed',
  toastReindexFailed: 'Reindex failed',
  toastSearchFailed: 'Search failed',
  toastDeployed: 'Deployed',
  toastDeployFailed: 'Deploy failed',
  brainSearchPlaceholder: "ask anything you've discussed before…",
  brainSearchButton: 'Search',
  brainSearchEmpty:
    "No matches. The index only covers distilled notes — run the pipeline above first if you haven't yet.",
  brainAdvancedDistillTitle: 'Advanced · distill on this host',
  brainAdvancedOllamaNeed: 'optional — needs local Ollama',
  brainEmbeddedProcessHint:
    'Runs brain-core as a child process — MCP clients on this machine (Claude Code, Cursor, Antigravity…) get search_library / save_conversation from 127.0.0.1 without any server. Distill runs refresh its index automatically.',
  vaultGateTitle: 'Pomnia Vault',
  vaultGateLead: 'AI memory in a vault folder — encrypted, portable, yours.',
  vaultGateUnlockTab: 'Unlock',
  vaultGateCreateTab: 'Create',
  vaultGateName: 'Vault name',
  vaultGateDefaultName: 'My Vault',
  vaultGateCreateSubmit: 'Create encrypted vault',
  vaultGateUnlockSubmit: 'Unlock vault',
  vaultPathPlaceholder: 'C:\\Vault',
  brainServer: 'Brain server',
  searchKnowledge: 'Search your memory',
  advanced: 'Advanced',
  simpleMode: 'Simple mode',
  simpleModeHint: 'Hides remote server, deploy, and GPU settings. Vault → backup → search → agent is enough.',
  systemTray: 'System tray',
  closeToTray: 'Close to tray',
  closeToTrayHint:
    'The X button hides the app to the tray instead of quitting. Always on while local search is running.',
  minimizeToTray: 'Minimize to tray',
  minimizeToTrayHint: 'Minimize hides to the tray instead of the taskbar.',
  openAtLogin: 'Open at Windows login',
  openAtLoginHint: 'Start Pomnia automatically after Windows sign-in. Off by default.',
  colorScheme: 'Color scheme',
  colorSchemeHint: 'App look — backgrounds, accents, and panel glass. Orange logo stays.',
  colorSchemeMint: 'Mint',
  colorSchemeIris: 'Iris',
  colorSchemeGlass: 'Szkło',
  uiLocale: 'Interface language',
  uiLocaleHint:
    'App chrome only (menus, Settings, toasts). Brain stays automatically bilingual — no separate knowledge language setting.',
  uiLocalePl: 'PL',
  uiLocaleEn: 'EN',
  floatingMonitor: 'Floating diagram',
  floatingMonitorOnMinimize: 'Show on minimize',
  floatingMonitorOnMinimizeHint:
    'When you hide to tray or minimize — a small desktop diagram shows live distill, indexing, and MCP queries (like YouTube PiP).',
  floatingMonitorIdleBadge: 'Live',
  floatingMonitorBrainOff: 'Brain off',
  floatingMonitorBrainStarting: 'Brain starting…',
  floatingMonitorBrainReady: 'Brain ready',
  floatingMonitorBrainError: 'Brain: error',
  floatingMonitorClose: 'Close floating diagram',
  floatingMonitorPin: 'Pin — always on top',
  floatingMonitorUnpin: 'Unpin — do not stay on top',
  floatingMonitorOpenHint: 'Click to open Pomnia on “How it works”. Double-click — close.',
  handshake: 'Handshake',
  handshakePlaceholder: 'OK to Go Go Go',
  handshakePhrase: 'Proof phrase',
  handshakePhraseHint:
    'Phrase the agent (Claude/Cursor…) should say at the start of its first reply = proof Pomnia Brain is wired. After changing it: Connect → refresh/save Brain rules, then a new Claude session.',
  handshakePhraseSave: 'Save phrase',
  handshakePhraseSaved: 'Handshake phrase updated',
  handshakePhrasePreview: (phrase) => `Agent opens with: “${phrase}”`,
  handshakePhraseEmpty: 'Phrase cannot be empty.',
  handshakePhraseTooShort: 'Enter your phrase (min. 2 characters).',
  handshakeEnabled: 'Handshake',
  handshakeEnabledHint:
    'When on — the agent should open the first reply in a conversation with this phrase. Turn off to skip the greeting. After a change: Connect → save Brain rules + new Claude session.',
  handshakeRefreshHint:
    'After changing the phrase: Connect → client (Claude / Cursor / Antigravity) → Brain Mode → “Save rule to disk”, then a NEW session (active ones do not reload CLAUDE.md / pomnia.mdc / GEMINI.md).',
  autoCheckpoint: 'Session continuity',
  autoCheckpointEnabled: 'Auto-checkpoint',
  autoCheckpointEnabledHint:
    'When on (default) — the agent may write a milestone via checkpoint_session without “save to Pomnia” (decision, fix+path, error+command, architecture). Conscious full save still needs the phrase → save_conversation.',
  profilePreview: 'Profile preview',
  profilePreviewTitle: 'PROFILE',
  profilePreviewSubtitle: 'Who you are to the agent',
  profilePreviewClose: 'Close',
  profilePreviewFooter: '§ PROFIL = you · Save → USER.md',
  profilePreviewSave: 'Save',
  profilePreviewSaving: 'Saving…',
  profilePreviewSaved: 'USER.md saved to vault',
  profilePreviewSaveFailed: 'Could not save',
  profilePreviewSaveTooLong: (max) => `Profile too long — max ${max} characters`,
  profilePreviewEditorHint: '§ PROFIL = you · § TECH = project identity (not changelog) · § KOMUNIKACJA',
  profilePreviewCopy: 'Copy',
  profilePreviewCopySummary: 'Copy summary',
  profilePreviewCopied: 'USER.md copied',
  profilePreviewCopiedSummary: 'Summary copied',
  profilePreviewCopyFailed: 'Could not copy',
  profilePreviewLoading: 'Profiling…',
  profilePreviewProgressVault: 'Reading USER.md…',
  profilePreviewProgressNotes: 'Gathering note signals…',
  profilePreviewProgressSearch: 'Searching Brain…',
  profilePreviewProgressModel: 'Building profile…',
  profilePreviewProgressDone: 'Done',
  profilePreviewEmptyVault: 'Open a vault to preview the profile.',
  profilePreviewEmptyBrain: 'Start Brain to load profile context.',
  profilePreviewEmptyKnowledge: 'No knowledge about you yet — fill § PROFIL and Save.',
  settingsTitle: 'Settings',
  settingsLead: 'Vault, tray, theme, and MCP client visibility.',
  vault: 'Vault',
  lockVault: 'Lock vault',
  noVaultOpen: 'No vault open',
  knowledgePathOpen: (path) => `Knowledge (USER.md, distilled): ${path}`,
  knowledgePathLocked: 'Unlock the vault to see the knowledge path.',
  brainBridge: 'Brain bridge',
  brainBridgeLead: 'Export distilled notes to a Brain sessions folder.',
  snapshot: 'Snapshot',
  outDir: 'Output folder',
  exportNotes: 'Export notes',
  mcpClients: 'MCP clients',
  mcpClientsLead:
    'These apps read memory from Pomnia. That is independent of whether they give up their chats — any MCP-speaking client can read. Choose which appear on the Connect tab: detected ones show by default — pin missing ones or hide unused.',
  strategyHybrid: 'chats + config',
  strategySnapshot: 'config only',
  strategySnapshotHint:
    'This tool does not expose its chats in a readable format — we only collect its configuration. Memory is still read normally, via MCP.',
  sourceMcpReads: '✅ reads memory via MCP',
  sourceMcpNotConnected: '◽ MCP not connected — set up in Connect',
  sourceChatsCount: (n) => `${n} chats`,
  sourceNoChats: 'no chats to capture',
  detectedOnMachine: 'Detected on this machine',
  notFound: 'Not found',
  customOverride: 'custom override',
  resetAutoDetect: 'Reset to auto-detect',
  snapshots: 'Snapshots',
  verifyIntegrity: 'Verify integrity',
  snapshotsEmpty: 'No snapshots yet — run a backup from the Dashboard.',
  snapshotsCount: (n) => `${n} snapshot(s)`,
  unlockVaultForSnapshots: 'Unlock the vault to list snapshots.',
  moreSnapshots: (n) => `…and ${n} more`,
  securityAbout: 'Security',
  securityPortability: 'Portable unit = the whole vault folder (not AppData).',
  securityAboutCli: (identity) => identity,
  antivirusTitle: 'Windows / antivirus',
  antivirusLead:
    'Current open-source builds are unsigned — SmartScreen and Symantec/Defender may warn on every new setup.exe. That is normal (new hash = zero reputation), not malware.',
  antivirusWhy:
    'SmartScreen: More info → Run anyway. Symantec: trusting the file once is fine. Only exclude the install folder if AV keeps quarantining the install or vault — a workaround, not the long-term UX.',
  antivirusSigningNote:
    'Goal: Authenticode (OV/EV or Azure Trusted Signing) so the installer just works without warnings. Until then: do not turn off AV, and we do not build the product around exclusion lists.',
  antivirusOpenInstallFolder: 'Open install folder',
  previewMode: 'Browser preview — Electron bridge unavailable.',
  cancel: 'Cancel',
  distillEmptyBacklog: 'No new sessions to distill',
  distillEmptyBacklogDetail: 'Backup new chats first, or everything is already distilled.',
  activityBanner: formatActivityBannerEn,
  flowLiveBadge: formatFlowLiveBadgeEn,
  flowFocusBanner: formatFlowFocusBannerEn,
  flowLastMcpBadge: formatFlowLastMcpBadgeEn,
  flowFinaleCaption: 'Index ready — memory available to the agent',
  flowWaitingCaption: 'When something runs, only the active path lights up',
  activityTrayBusy: 'Background task',
  healthTitle: 'Diagnostics',
  healthLead: 'Quick check — what must work for memory and MCP.',
  healthRefresh: 'Refresh',
  healthVault: 'Vault',
  healthOllama: 'Ollama',
  healthEmbedModel: 'Embedding model',
  healthChatModel: 'Distill model',
  healthBrainCore: 'Local search',
  healthMcp: 'Brain MCP',
  healthDeployPath: 'Deploy folder (optional)',
  healthOpenLogs: 'Open logs',
  healthOk: 'OK',
  healthFail: 'Issue',
  healthSkip: 'Skipped',
  healthChecking: 'Checking…',
  navDashboard: 'Dashboard',
  navBrowse: 'Chats',
  navImport: 'Import',
  navBrain: 'Brain',
  navConnect: 'Connect',
  navSettings: 'Settings',
  navGuide: 'How it works',
  navNavigate: 'Navigate',
  browseLeadLoading: 'Loading conversations from your vault…',
  browseLeadEmpty: 'No conversations in this vault yet — import some from the Import tab.',
  browseLeadCount: (n) =>
    `${n} conversations aggregated from every source — searched locally, no GPU.`,
  browseSearchPlaceholder: 'search across all chat content…',
  browseFilterAll: 'All',
  browseNoVaultLead: 'Unlock a vault to browse and search your aggregated chats.',
  browseLoading: 'loading…',
  browseNoMatches: 'No content matches.',
  browseEmptyYet: 'Nothing here yet.',
  browseEmptySource: 'No chats from this source.',
  browseEmptyYetHint: 'Run a backup from the Dashboard or bring exports in via Import.',
  browseEmptySourceHint: 'Pick another source filter above.',
  browseSelectToRead: 'Select a conversation to read it.',
  browseHits: (n) => `${n} hits`,
  browseMsgs: (n) => `${n} msgs`,
  browseMessages: (n) => `${n} messages`,
  sidebarBusyDistill: 'distilling…',
  sidebarBusyImport: 'import…',
  sidebarBusyGeneric: 'working…',
  lockVaultBtn: 'Lock vault',
  vaultLocked: 'locked',
  helpDontKnowStart: 'Not sure where to start →',
  statusStripTitle: 'Where you are now',
  statusDoctorFail: 'Doctor FAIL',
  statusVault: 'Vault',
  statusVaultOpen: 'open',
  statusVaultClosed: 'closed',
  statusBrain: 'Local Brain',
  statusBrainRunning: 'running',
  statusBrainStopped: 'stopped',
  statusOllama: 'Ollama',
  statusOllamaOk: 'OK',
  statusOllamaFail: 'unreachable',
  statusChecking: 'checking…',
  statusLastDistill: 'Last distill',
  statusNoDistill: 'none yet',
  statusPendingDocs: (n) => `${n} doc(s) waiting for index`,
  statusPendingDocsNone: 'none pending',
  statusDocuments: 'Documents',
  dashboardTitle: 'Command center',
  dashboardLead:
    'Chats from your assistants in one encrypted vault — every MCP-speaking agent can read them.',
  dashboardRescan: 'Rescan',
  dashboardStatSources: 'Sources',
  dashboardStatSourcesSub: 'installed',
  dashboardStatChats: 'Chats',
  dashboardStatChatsSub: 'to capture',
  dashboardStatSnapshots: 'Snapshots',
  dashboardStatSnapshotsClosed: 'no vault',
  dashboardStatSkills: 'Skills',
  dashboardStatSkillsSub: (own, imported) => `${own} own · ${imported} imported`,
  dashboardStatDistilled: 'Notes',
  dashboardStatDistilledSub: 'distilled',
  dashboardStatDocs: 'Documents',
  dashboardStatDocsSub: (size, indexed) => `${size} · ${indexed} indexed`,
  dashboardStatDocsPending: (n) => (n === 1 ? '1 waiting for index' : `${n} waiting for index`),
  dashboardStatDocsClosed: 'no vault',
  skillsPageTitle: 'Skills',
  skillsPageLead:
    'Skills are procedures the agent loads itself via `get_skill`. They are not part of search — ready-made workflows, not knowledge.',
  skillsSectionOwn: 'Own (brain/)',
  skillsSectionImported: 'Imported (cli/)',
  skillsOpenFile: 'Open file',
  skillsOpenFolder: 'Open folder',
  skillsEmptyOwn: 'No own skills in vault/skills/brain/.',
  skillsEmptyImported: 'No imported packages in vault/skills/cli/.',
  skillsBack: '← Dashboard',
  skillsSize: (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  },
  skillsModified: (s) => s,
  dashboardSourcesHeading: 'Sources',
  dashboardSelectAll: 'Select all',
  dashboardDeselectAll: 'Deselect all',
  dashboardNoSourcesTitle: 'No AI tools detected on this machine.',
  dashboardNoSourcesDetail:
    'Pomnia looks for Claude Code, Cursor, Claude Desktop, Antigravity, and VS Code. Install, chat, then Rescan — or Import.',
  dashboardSourcesSelected: (n) => (n === 1 ? '1 source selected' : `${n} sources selected`),
  dashboardReadyVault: (name) => `Ready — backup to “${name}”`,
  dashboardOpenVaultHint: 'Open a vault to enable backup',
  dashboardBackupNotePlaceholder: 'optional note…',
  dashboardBackupAndBrain: 'Backup & to Brain',
  dashboardBackupOnly: 'Backup only',
  dashboardWorking: 'Working…',
  dashboardDistilling: 'Distilling to Brain…',
  dashboardBackupStarting: 'starting…',
  dashboardNoVaultTitle: 'No vault open',
  dashboardNoVaultDetail: 'Create or unlock a vault first.',
  dashboardNothingSelected: 'Nothing selected',
  dashboardBackupDone: (n) => `Backed up ${n} source(s)`,
  dashboardBackupDoneSkipped: (n) => `Backup done — skipped ${n} locked file(s)`,
  dashboardBackupSkippedHint: 'close running apps and backup again',
  dashboardBackupFailed: 'Backup failed',
  dashboardNoDistillSourcesTitle: 'Backup done — nothing to distill',
  dashboardNoDistillSourcesDetail:
    'Distill works for Claude Code, Cursor, and Claude Desktop. Select one of those or use the Brain tab.',
  dashboardBrainOffTitle: 'Backup done — Brain is off',
  dashboardBrainOffDetail: 'Distill needs local search. Start Brain, then continue distill.',
  dashboardBrainStarted: 'Brain started — distilling…',
  dashboardBrainStartFailed: 'Could not start Brain',
  brainStateTitle: 'Brain status',
  brainDoctorRun: 'Check health',
  brainDoctorRunning: 'Checking…',
  brainDoctorTitle: 'Diagnostics (doctor)',
  brainDoctorCopy: 'Copy report',
  brainDoctorCopied: 'Report copied',
  brainDoctorCopyFailed: 'Could not copy report',
  brainDoctorOpenLogs: 'Open logs',
  brainDoctorSummary: (ok, warn, fail) => `${ok} OK · ${warn} WARN · ${fail} FAIL`,
  brainStateLastDistill: (rel) => `Last distill ${rel}`,
  brainStateLoading: 'Loading…',
  brainStateChatsInTools: 'Chats in tools',
  brainStateDistilled: 'Distilled',
  brainStateDistilledHint: 'from current tools scan',
  brainStateVaultNotes: (n) => `vault: ${n} notes`,
  brainStateBacklog: 'Queue',
  brainStatePendingNew: (n) => `+${n} new`,
  brainStateUncountable: 'uncountable (DB > 256 MB)',
  brainPipeCollect: 'Collect',
  brainPipeCollectNote: 'from assistants',
  brainPipeDistill: 'Distill',
  brainPipeDistillNote: 'local model',
  brainPipeIndex: 'Index',
  brainPipeIndexNote: 'embeddings',
  brainPipeDeploy: 'Send',
  brainPipeDeployNote: 'to Brain',
  importDropFailed: 'Drop failed',
  importDropNoPath: 'Pick a file from disk (browser preview has no path).',
  importPick: 'Choose an export file or drop it here',
  importChatDrop: 'Drop export here',
  importChatSealedToast: (added, updated, skipped) => {
    const parts: string[] = []
    if (added) parts.push(`Sealed ${added} new`)
    if (updated) parts.push(`updated ${updated}`)
    if (skipped) parts.push(`skipped ${skipped}`)
    return parts.join(' · ')
  },
  importChatAllDuplicatesDetail: 'Every conversation was already in the vault.',
  importChatNothingRecognized: 'Nothing recognized in that file',
  importChatFailedToast: 'Chat import failed',
  importChatConfirmTitle: 'Confirm seal to vault',
  importChatConfirmSource: (source) => `Source: ${source}`,
  importChatConfirmStats: (conversations, messages) =>
    `${conversations} conversations · ${messages} messages`,
  importChatConfirmTitles: 'Sample titles',
  importChatConfirmGenericWarn:
    'Export format not recognized — content will be saved as a single conversation',
  importChatConfirmSeal: 'Seal to vault',
  importChatConfirmCancel: 'Cancel',
  importChatConfirmDedup: (added, updated, skipped) => {
    const parts: string[] = []
    if (added) parts.push(`${added} new`)
    if (updated) parts.push(`${updated} updated`)
    if (skipped) parts.push(`${skipped} already in vault`)
    return parts.join(' · ')
  },
  importDocPick: 'Choose PDF, DOCX, or EPUB — or drop it here',
  importDocDuplicateToast: 'Document already in the vault — skipped',
  importDocIndexedToast: (chunks) => `Indexed ${chunks} chunk(s)`,
  importDocQueuedToast: 'Saved — index after Brain starts',
  importDocNotIndexedBadge: 'no index',
  importDocOcrHint: 'Little text — likely a scan. Run OCR, then we re-index this document.',
  importDocOcrRun: 'Run OCR',
  importDocOcrBusy: 'OCR running…',
  importDocOcrDoneToast: (pages) => `OCR done (${pages} page(s))`,
  importDocOcrFailedToast: 'OCR failed',
  importDocProgressOcr: 'OCR',
  importDocProgressBrainStart: 'Starting search',
  importDocLibraryTitle: 'Documents in vault',
  importDocLibraryEmpty: 'No imported documents in library.cvb.',
  importDocLibraryStats: (count, size) => `${count} doc(s) · ${size}`,
  importDocLibraryFilter: 'Filter by name…',
  importDocLibraryFilterEmpty: 'No documents match the filter.',
  importDocLibrarySort: 'Sort documents',
  importDocLibrarySortDate: 'Date added',
  importDocLibrarySortName: 'Name',
  importDocLibrarySortSize: 'Size',
  importDocLibraryPending: 'pending index',
  importDocLibraryIndexed: 'indexed',
  importDocDelete: 'Delete',
  importDocDeleteAria: (name) => `Delete “${name}”`,
  importDocDeleteConfirm: (name) =>
    `Delete “${name}”? Only this document’s blobs are removed (not chats/snapshots).`,
  importDocDeletedToast: (name) => `Deleted ${name}`,
  importDocDeleteFailedToast: 'Could not delete document',
  importProviderClaude: 'Settings → Privacy → Export data → conversations.json (ZIP)',
  importProviderChatgpt: 'Settings → Data controls → Export data → conversations.json (ZIP)',
  importProviderGemini:
    'Takeout → My Activity → Gemini Apps only → Multiple formats → JSON (not HTML / not Gems)',
  importProviderGrok: 'Account → export conversations → ZIP/JSON',
  guideTitle: 'Pomnia map',
  guideSubtitle: 'How it works',
  guideLead:
    'Where things live — from raw assistant logs to search via MCP. Local by default; cloud only if you enable LAN deploy or the optional distill API.',
  flowIdleHoverCaption: 'Hover an element to see what it does',
  guideFlowReplay: 'Replay demo',
  guideFlowReplayLast: 'Replay last activity',
  connectPageLead:
    'Copy the MCP config and paste it in your client (Cursor, Claude, Antigravity…) — Pomnia never touches your files.',
  connectStepReload: 'Reload the MCP client (e.g. Reload Window)',
  connectMacNoAppHint:
    'Without Desktop: docs/CURSOR-MCP.md — same MCP JSON (Cursor example; other clients via Connect).',
  agentBrainMode: 'Agent Brain Mode',
  agentBrainModeHint:
    'Adds a rule (Cursor rules / CLAUDE.md / Antigravity ~/.gemini/config/GEMINI.md) plus stronger MCP tool descriptions: agent auto-reads profile, skills, and memory; milestone → checkpoint_session (when Auto-checkpoint ON); conscious save on “save to Pomnia”. Connect “wired” = MCP config `pomnia`, not a guarantee the agent already checked Pomnia.',
  agentBrainModeBriefTitle: 'Agent rule (Brain Mode / Pomnia)',
  agentBrainModeBriefCopy: 'Copy rule to file path',
  agentBrainModeBriefWrite: 'Save rule to disk',
  agentBrainModeBriefWritten: 'Pomnia rule saved',
  agentBrainModeBriefWriteFailed: 'Could not save rule',
  agentBrainModeRuleCopy: 'Copy rule (AGENTS.md / rules)',
  agentBrainModeNoPath:
    'This client has no fixed rules path — paste the block into AGENTS.md or the system prompt.',
  agentBrainModeRefreshHint:
    'After changing the Handshake phrase: save the rule again. Cursor: also copy pomnia.mdc into the project `.cursor/rules/` (Agent loads workspace rules), then Reload Window + NEW chat. Claude / Antigravity: full restart + new chat. Active chats do not reload CLAUDE.md / pomnia.mdc / GEMINI.md.',
}

let cachedEn: UiLabels | null = null

/** @param _simple ignored — kept for call-site compatibility; language does not depend on simple mode */
export function uiLabels(_simple?: boolean): UiLabels {
  if (getUiLocale() === 'en') {
    if (!cachedEn) cachedEn = { ...PL_LABELS, ...EN_LABELS }
    return cachedEn
  }
  return PL_LABELS
}

/** Invalidate EN merge cache after locale switch (store calls this). */
export function invalidateUiLabelsCache(): void {
  cachedEn = null
}

