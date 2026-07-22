/** Polish UI labels — simple mode only hides advanced sections, not language. */

import { formatPipelineProgressLabel } from '@core/pipelineLabels.js'
import type { ActivityState } from './types'

const ACTIVITY_KIND: Record<Exclude<ActivityState['kind'], 'idle'>, string> = {
  distill: 'destylacja',
  'doc-import': 'import dokumentu',
  'brain-start': 'uruchamianie Brain',
  indexing: 'indeksowanie',
  embed: 'embeddingi',
  'mcp-query': 'zapytanie MCP',
  finale: 'indeks gotowy',
}

function truncateDetail(s: string, max = 48): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export const formatBrainProgressLabel = formatPipelineProgressLabel

export function formatActivityBanner(state: ActivityState): string {
  if (state.kind === 'idle') return ''
  const kind = ACTIVITY_KIND[state.kind]
  const progress =
    state.done != null && state.total != null && state.total > 0 ? ` (${state.done}/${state.total})` : ''
  const detail = state.detail ? ` · ${truncateDetail(state.detail)}` : ''
  return `Trwa: ${kind}${progress}${detail}`
}

export function formatFlowLastMcpBadge(tool: string): string {
  const t = tool.trim() || 'MCP'
  return `Ostatnie: ${t} · przed chwilą`
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
  const kind = ACTIVITY_KIND[state.kind]
  const progress =
    state.done != null && state.total != null && state.total > 0 ? ` ${state.done}/${state.total}` : ''
  return `Na żywo: ${kind}${progress}`
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
  const kind = ACTIVITY_KIND[state.kind]
  const progress =
    state.done != null && state.total != null && state.total > 0 ? ` ${state.done}/${state.total}` : ''
  const detail = state.detail ? ` · ${truncateDetail(state.detail, 40)}` : ''
  return `Teraz: ${kind}${progress}${detail}`
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
  floatingMonitor: string
  floatingMonitorOnMinimize: string
  floatingMonitorOnMinimizeHint: string
  floatingMonitorIdleBadge: string
  floatingMonitorClose: string
  floatingMonitorPin: string
  floatingMonitorUnpin: string
  floatingMonitorOpenHint: string
  handshake: string
  handshakeHint: string
  handshakePlaceholder: string
  handshakeSubmit: string
  handshakeWrong: string
  handshakeReady: string
  handshakeClose: string
  handshakeArmedBadge: string
  handshakeToastReady: string
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
  /** Footer under Settings → Bezpieczeństwo; `version` from app.getVersion(). */
  securityAboutCli: (version: string) => string
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
  dashboardTitle: string
  dashboardLead: string
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
  mcpConnect: 'Podłącz Cursora',
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
    'Ukrywa serwer zdalny, deploy i ustawienia GPU. Wystarczy vault → backup → wyszukiwarka → Cursor.',
  systemTray: 'Zasobnik systemowy',
  closeToTray: 'Zamknij do zasobnika',
  closeToTrayHint:
    'Przycisk X chowa aplikację do traya zamiast kończyć proces. Gdy działa lokalna wyszukiwarka — zawsze.',
  minimizeToTray: 'Minimalizuj do zasobnika',
  minimizeToTrayHint: 'Przycisk minimalizacji chowa okno do traya zamiast paska zadań.',
  openAtLogin: 'Uruchom przy starcie Windows',
  openAtLoginHint: 'Pomnia startuje automatycznie po zalogowaniu do Windows. Domyślnie wyłączone.',
  floatingMonitor: 'Pływający diagram',
  floatingMonitorOnMinimize: 'Pokaż przy minimalizacji',
  floatingMonitorOnMinimizeHint:
    'Gdy chowasz okno do traya lub minimalizujesz — mały diagram na pulpicie pokazuje na żywo destylację, indeksowanie i zapytania MCP (jak PiP na YouTube).',
  floatingMonitorIdleBadge: 'Na żywo',
  floatingMonitorClose: 'Zamknij pływający diagram',
  floatingMonitorPin: 'Przypnij — zawsze na wierzchu',
  floatingMonitorUnpin: 'Odepnij — nie trzymaj na wierzchu',
  floatingMonitorOpenHint: 'Kliknij, aby otworzyć Pomnię na „Jak to działa”. Podwójne kliknięcie — zamknij.',
  handshake: 'Handshake',
  handshakeHint: 'Twój rytuał — wpisz frazę i ruszamy.',
  handshakePlaceholder: 'OK to Go Go Go',
  handshakeSubmit: 'OK',
  handshakeWrong: 'Nie ta fraza — spróbuj jeszcze raz.',
  handshakeReady: 'Gotowy',
  handshakeClose: 'Zamknij Handshake',
  handshakeArmedBadge: 'Go',
  handshakeToastReady: 'Gotowy',
  connectPageLead:
    'Skopiuj konfigurację MCP i wklej w Cursorze — Pomnia nigdy nie dotyka Twoich plików.',
  connectChecklistTitle: 'Pierwsze podłączenie (4 kroki)',
  connectStepUrl: 'URL Brain MCP (:7862)',
  connectStepToken: 'Token Bearer z dashboardu (:7860)',
  connectStepCopy: 'Kopiuj pełny mcp.json (3 serwery)',
  connectStepReload: 'Reload Window w Cursorze',
  connectCopyForClient: (name) =>
    name === 'Cursor' ? 'Kopiuj mcp.json dla Cursora' : `Kopiuj mcp.json dla ${name}`,
  connectTokenPlaceholder: 'Bearer token (wymagany dla remote)',
  connectTokenRequired: 'Bez tokena remote MCP zwykle nie zadziała — wklej lub utwórz poniżej.',
  connectOpenDashboard: 'Otwórz dashboard tokenów',
  connectPartialTitle: 'Niepełny mcp.json — brak vault/library',
  connectPartialDetail:
    'Wykryto tylko część serwerów Brain. Remote wymaga brain-rag + brain-vault + brain-library.',
  connectPartialFix: 'Skopiuj pełny config poniżej i nadpisz / zmerguj mcp.json',
  connectMacNoAppHint:
    'Na Macu bez aplikacji: landing/cursor-mcp.html albo docs/CURSOR-MCP.md — ten sam pełny JSON.',
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
  securityAboutCli: (version) =>
    `Pomnia v${version} · ten sam silnik działa też w trybie CLI (bez okna).`,
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
    'Folder *.pomnia (zaszyfrowany) — snapshoty backupów + dokumenty library.cvb. To archiwum, nie wyszukiwarka.',
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
    'Klient MCP (Cursor i inne) łączy agenta z lokalną wyszukiwarką. Podczas kodowania agent może wołać search_library (RAG) i opcjonalnie ładować skills — to nie jest zapis do pamięci, tylko pytanie w trakcie pracy.',
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
  flowNodeVaultLabel: 'Vault .pomnia',
  flowNodeVaultLabelPip: 'Vault',
  flowNodeVaultHint: 'Zaszyfrowane archiwum snapshotów backupów i dokumentów library.cvb.',
  flowNodeVaultDisk: 'folder *.pomnia',
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
  flowNodeMcpHint: 'Agent (Cursor i inni) łączy się przez MCP — most do lokalnej wyszukiwarki Brain.',
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
  dashboardTitle: 'Centrum dowodzenia',
  dashboardLead:
    'Zbierz rozmowy ze wszystkich asystentów do jednego zaszyfrowanego vaultu — backup to tylko mechanizm.',
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

/** @param _simple ignored — kept for call-site compatibility; language does not depend on simple mode */
export function uiLabels(_simple?: boolean): UiLabels {
  return PL_LABELS
}
