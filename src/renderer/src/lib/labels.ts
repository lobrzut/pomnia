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

function truncateDetail(s: string, max = 48): string {
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
  const detail = state.detail ? ` · ${truncateDetail(state.detail, 40)}` : ''
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
  const detail = state.detail ? ` · ${truncateDetail(state.detail, 40)}` : ''
  return `Now: ${kind}${progress}${detail}`
}

export interface UiLabels {
  distill: string
  distillBacklog: (n: number) => string
  runPipeline: string
  deployToBrain: string
  remoteDeployLead: string
  embedded: string
  remote: string
  reindex: string
  mcpConnect: string
  brainPageTitle: string
  brainPageLead: string
  embeddedBrain: string
  embeddedBrainStart: string
  embeddedBrainStop: string
  embeddedBrainStoppedToast: string
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
  /** Footer under Settings → Bezpieczeństwo; `version` from app.getVersion(). */
  securityAboutCli: (version: string) => string
  /** Settings → Windows AV — signed path first; exclusions = last resort only. */
  antivirusTitle: string
  antivirusLead: string
  antivirusWhy: string
  antivirusSteps: string
  antivirusPathInstall: string
  antivirusPathVault: string
  antivirusPathSetup: string
  antivirusPathBrain: string
  antivirusSigningNote: string
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
  importDocSection: string
  importDocPick: string
  importDocBusy: string
  importDocFormats: string
  importDocSelect: string
  importDocDrop: string
  importDropFailed: string
  importDropNoPath: string
  importUnsupportedFormat: string
  importDocDone: string
  importDocOcrHint: string
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
  importDocProgressIndex: string
  importDocProgressBrainStart: string
  importDocProgressEncrypt: string
  importProviders: string
  importLegalNote: string
  brainStateTitle: string
  brainStateLastDistill: (rel: string) => string
  brainStateLoading: string
  brainStateChatsInTools: string
  brainStateDistilled: string
  brainStateBacklog: string
  brainStatePendingNew: (n: number) => string
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
  sidebarBusyDistill: string
  sidebarBusyImport: string
  sidebarBusyGeneric: string
  lockVaultBtn: string
  vaultLocked: string
  guideTitle: string
  guideSubtitle: string
  guideLead: string
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
  statusVault: string
  statusVaultOpen: string
  statusVaultClosed: string
  statusBrain: string
  statusBrainRunning: string
  statusBrainStopped: string
  statusOllama: string
  statusOllamaOk: string
  statusOllamaFail: string
  statusLastDistill: string
  statusNoDistill: string
  statusPendingDocs: (n: number) => string
  statusPendingDocsNone: string
  statusDocuments: string
  dashboardTitle: string
  dashboardLead: string
  dashboardStatSources: string
  dashboardStatSourcesSub: string
  dashboardStatChats: string
  dashboardStatChatsSub: string
  dashboardStatSnapshots: string
  dashboardStatSnapshotsClosed: string
  dashboardStatSkills: string
  dashboardStatSkillsSub: string
  dashboardStatDistilled: string
  dashboardStatDistilledSub: string
  dashboardStatKnowledge: string
  dashboardStatKnowledgeOpen: string
  dashboardStatKnowledgeClosed: string
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
  runPipeline: 'Przygotuj pamięć',
  deployToBrain: 'Wyślij do wyszukiwarki',
  remoteDeployLead: 'To jest dla Brain na serwerze / KVM — lokalnie nie wypełniaj.',
  embedded: 'Lokalnie',
  remote: 'Na serwerze',
  reindex: 'Odśwież indeks',
  mcpConnect: 'Podłącz agenta',
  brainPageTitle: 'Pamięć i wyszukiwarka',
  brainPageLead:
    'Przygotuj rozmowy do wyszukiwania i uruchom lokalną wyszukiwarkę — bez serwera w chmurze.',
  embeddedBrain: 'Lokalna wyszukiwarka',
  embeddedBrainStart: 'Start',
  embeddedBrainStop: 'Stop',
  embeddedBrainStoppedToast: 'Lokalna wyszukiwarka zatrzymana',
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
    'Bez aplikacji Desktop: landing/cursor-mcp.html albo docs/CURSOR-MCP.md — ten sam pełny JSON MCP (przykład Cursor; kształt dla innych klientów w Connect).',
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
    'Wybierz, które klienty widać w zakładce Connect. Wykryte pokazują się domyślnie — przypnij brakujące albo ukryj nieużywane.',
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
  securityAboutCli: (version) =>
    `Pomnia v${version} · ten sam silnik działa też w trybie CLI (bez okna).`,
  antivirusTitle: 'Windows / antywirus',
  antivirusLead:
    'Cel produktu: Pomnia działa od razu na Windows (Defender / Symantec) bez proszenia o wykluczenia. Wykluczenia to nie strategia — to tymczasowe obejście.',
  antivirusWhy:
    'Lokalny Brain (MCP 127.0.0.1:7862, helper pomnia-brain.exe) + vault wyglądają heurystykom jak „dziwny” soft, zwłaszcza przy niepodpisanym instalatorze. To problem reputacji / podpisu, nie „trzeba dodać wyjątek w AV”.',
  antivirusSteps:
    'Ostatnia deska ratunku — tylko niepodpisane buildy deweloperskie albo polityka IT w firmie (nie wyłączaj AV). Symantec / Norton / Defender → wyjątki folderów:',
  antivirusPathInstall: '%LOCALAPPDATA%\\Programs\\Pomnia',
  antivirusPathVault: 'Folder vaultu (np. C:\\Vault)',
  antivirusPathSetup: 'Folder z instalatorem *-setup.exe (np. Pulpit)',
  antivirusPathBrain: '…\\Pomnia\\resources\\brain-core (opcjonalnie)',
  antivirusSigningNote:
    'Publiczny release Windows: ship blocker = Authenticode (OV/EV lub Azure Trusted Signing). Bez podpisu nie marketingujemy „just works” i nie budujemy onboardingu wokół wykluczeń.',
  antivirusOpenInstallFolder: 'Otwórz folder instalacji',
  previewMode: 'Tryb podglądu (bez backendu Electron) — dane są przykładowe.',
  importTitle: 'Importuj',
  importLead: 'Wgraj eksport z Claude.ai, ChatGPT, Gemini albo Grok — trafi do vaultu.',
  importPick: 'Wybierz plik eksportu',
  importPickBusy: 'Importuję…',
  importVaultClosed: 'Najpierw odblokuj vault',
  importFormats: 'ZIP · JSON · JSONL · MD — rozpoznaje źródło automatycznie',
  importSelect: 'Wybierz plik…',
  importChatSection: 'Eksporty czatów',
  importDocSection: 'Dokumenty',
  importDocPick: 'Wybierz PDF, DOCX lub EPUB',
  importDocBusy: 'Importuję dokument…',
  importDocFormats: 'PDF · DOCX · EPUB · MD · TXT — zaszyfrowane w vault, indeks w wyszukiwarce',
  importDocSelect: 'Wybierz dokument…',
  importDocDrop: 'Upuść plik tutaj',
  importDropFailed: 'Upuszczenie nie powiodło się',
  importDropNoPath: 'Nie udało się odczytać ścieżki pliku. Użyj „Wybierz plik…”.',
  importUnsupportedFormat: 'Nieobsługiwany format',
  importDocDone: 'Dokument zaimportowany',
  importDocOcrHint: 'Mało tekstu — w v0.3 uruchom OCR dla skanów.',
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
  importDocProgressIndex: 'Indeksowanie',
  importDocProgressBrainStart: 'Uruchamianie wyszukiwarki',
  importDocProgressEncrypt: 'Szyfrowanie w vault',
  importProviders: 'Skąd pobrać eksport',
  importLegalNote:
    'Pomnia importuje tylko oficjalne eksporty — bez logowania do kont. Claude Desktop / Gemini wymagają eksportu z wersji webowej.',
  brainStateTitle: 'Stan Brain',
  brainStateLastDistill: (rel) => `Ostatnia destylacja ${rel}`,
  brainStateLoading: 'Wczytywanie stanu pipeline…',
  brainStateChatsInTools: 'Czaty w narzędziach',
  brainStateDistilled: 'Zdestylowane',
  brainStateBacklog: 'Kolejka',
  brainStatePendingNew: (n) => `+${n} nowych`,
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
  sidebarBusyDistill: 'destylacja…',
  sidebarBusyImport: 'import…',
  sidebarBusyGeneric: 'praca w tle…',
  lockVaultBtn: 'Zablokuj vault',
  vaultLocked: 'zablokowany',
  guideTitle: 'Mapa Pomnia',
  guideSubtitle: 'Jak to działa',
  guideLead:
    'Gdzie co się dzieje — od surowych logów asystentów po wyszukiwanie przez MCP. Bez chmury, dopóki sam nie włączysz deployu.',
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
  dashboardActivityNow: (state) => formatFlowFocusBanner(state),
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
  statusVault: 'Vault',
  statusVaultOpen: 'otwarty',
  statusVaultClosed: 'zamknięty',
  statusBrain: 'Brain lokalny',
  statusBrainRunning: 'działa',
  statusBrainStopped: 'wyłączony',
  statusOllama: 'Ollama',
  statusOllamaOk: 'OK',
  statusOllamaFail: 'brak połączenia',
  statusLastDistill: 'Ostatnia destylacja',
  statusNoDistill: 'jeszcze nie było',
  statusPendingDocs: (n) => `${n} dok. czeka na indeks`,
  statusPendingDocsNone: 'brak oczekujących',
  statusDocuments: 'Dokumenty',
  dashboardTitle: 'Centrum dowodzenia',
  dashboardLead:
    'Zbierz rozmowy ze wszystkich asystentów do jednego zaszyfrowanego vaultu — backup to tylko mechanizm.',
  dashboardStatSources: 'Źródła',
  dashboardStatSourcesSub: 'zainstalowane',
  dashboardStatChats: 'Czaty',
  dashboardStatChatsSub: 'do wyciągnięcia',
  dashboardStatSnapshots: 'Snapshoty',
  dashboardStatSnapshotsClosed: 'brak vaultu',
  dashboardStatSkills: 'Skills',
  dashboardStatSkillsSub: 'w vault/skills',
  dashboardStatDistilled: 'Notatki',
  dashboardStatDistilledSub: 'distilled',
  dashboardStatKnowledge: 'Wiedza',
  dashboardStatKnowledgeOpen: 'otwarta',
  dashboardStatKnowledgeClosed: 'zamknięta',
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
  runPipeline: 'Prepare memory',
  deployToBrain: 'Send to search',
  remoteDeployLead: 'For Brain on a server / KVM — leave empty for local.',
  embedded: 'Local',
  remote: 'Remote',
  reindex: 'Refresh index',
  mcpConnect: 'Connect agent',
  brainPageTitle: 'Memory & search',
  brainPageLead: 'Prepare chats for search and start the local search engine — no cloud server.',
  embeddedBrain: 'Local search',
  embeddedBrainStart: 'Start',
  embeddedBrainStop: 'Stop',
  embeddedBrainStoppedToast: 'Local search stopped',
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
  mcpClientsLead: 'Which clients show up on the Connect tab.',
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
  securityAboutCli: (version) => `Pomnia ${version}`,
  antivirusTitle: 'Windows / antivirus',
  antivirusLead:
    'Product goal: Pomnia works out of the box on Windows (Defender / Symantec) without asking for exclusions. Exclusions are not a product strategy — only a temporary workaround.',
  antivirusWhy:
    'Local Brain (MCP 127.0.0.1:7862, pomnia-brain.exe) plus an encrypted vault look suspicious to heuristics, especially with an unsigned installer. That is a reputation / signing problem — not “users must whitelist us”.',
  antivirusSteps:
    'Last resort only — unsigned developer builds or enterprise IT policy (never turn AV off). Symantec / Norton / Defender → folder exceptions:',
  antivirusPathInstall: '%LOCALAPPDATA%\\Programs\\Pomnia',
  antivirusPathVault: 'Your vault folder (e.g. C:\\Vault)',
  antivirusPathSetup: 'Folder with the *-setup.exe (e.g. Desktop)',
  antivirusPathBrain: '…\\Pomnia\\resources\\brain-core (optional)',
  antivirusSigningNote:
    'Public Windows release ship blocker: Authenticode (OV/EV or Azure Trusted Signing). Without a signature we do not market “just works” and we do not center onboarding on exclusions.',
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
  sidebarBusyDistill: 'distilling…',
  sidebarBusyImport: 'import…',
  sidebarBusyGeneric: 'working…',
  lockVaultBtn: 'Lock vault',
  vaultLocked: 'locked',
  helpDontKnowStart: 'Not sure where to start →',
  statusStripTitle: 'Where you are now',
  statusVault: 'Vault',
  statusVaultOpen: 'open',
  statusVaultClosed: 'closed',
  statusBrain: 'Local Brain',
  statusBrainRunning: 'running',
  statusBrainStopped: 'stopped',
  statusOllama: 'Ollama',
  statusOllamaOk: 'OK',
  statusOllamaFail: 'unreachable',
  statusLastDistill: 'Last distill',
  statusNoDistill: 'none yet',
  statusPendingDocs: (n) => `${n} doc(s) waiting for index`,
  statusPendingDocsNone: 'none pending',
  statusDocuments: 'Documents',
  dashboardTitle: 'Command center',
  dashboardLead:
    'Collect chats from all assistants into one encrypted vault — backup is just the mechanism.',
  dashboardStatSources: 'Sources',
  dashboardStatSourcesSub: 'installed',
  dashboardStatChats: 'Chats',
  dashboardStatChatsSub: 'to capture',
  dashboardStatSnapshots: 'Snapshots',
  dashboardStatSnapshotsClosed: 'no vault',
  dashboardStatSkills: 'Skills',
  dashboardStatSkillsSub: 'in vault/skills',
  dashboardStatDistilled: 'Notes',
  dashboardStatDistilledSub: 'distilled',
  dashboardStatKnowledge: 'Knowledge',
  dashboardStatKnowledgeOpen: 'open',
  dashboardStatKnowledgeClosed: 'closed',
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
  brainStateLastDistill: (rel) => `Last distill ${rel}`,
  brainStateLoading: 'Loading…',
  brainStateChatsInTools: 'Chats in tools',
  brainStateDistilled: 'Distilled',
  brainStateBacklog: 'Queue',
  brainStatePendingNew: (n) => `+${n} new`,
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
  importDocIndexedToast: (chunks) => `Indexed ${chunks} chunk(s)`,
  importDocQueuedToast: 'Saved — index after Brain starts',
  importDocNotIndexedBadge: 'no index',
  importDocProgressBrainStart: 'Starting search',
  guideTitle: 'Pomnia map',
  guideSubtitle: 'How it works',
  guideFlowReplay: 'Replay demo',
  guideFlowReplayLast: 'Replay last activity',
  connectPageLead:
    'Copy the MCP config and paste it in your client (Cursor, Claude, Antigravity…) — Pomnia never touches your files.',
  connectStepReload: 'Reload the MCP client (e.g. Reload Window)',
  connectMacNoAppHint:
    'Without Desktop: landing/cursor-mcp.html or docs/CURSOR-MCP.md — same MCP JSON (Cursor example; other clients via Connect).',
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

