/** Polish UI labels — simple mode only hides advanced sections, not language. */

import { formatPipelineProgressLabel } from '@core/pipelineLabels.js'
import type { ActivityState } from './types'

const ACTIVITY_KIND: Record<Exclude<ActivityState['kind'], 'idle'>, string> = {
  distill: 'destylacja',
  'doc-import': 'import dokumentu',
  'brain-start': 'uruchamianie Brain',
  indexing: 'indeksowanie',
  embed: 'embeddingi',
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

export interface UiLabels {
  distill: string
  distillBacklog: (n: number) => string
  runPipeline: string
  deployToBrain: string
  embedded: string
  remote: string
  reindex: string
  mcpConnect: string
  brainPageTitle: string
  brainPageLead: string
  embeddedBrain: string
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
  connectPageLead: string
  embeddedBrainNotRunning: string
  embeddedBrainNotRunningLink: string
  settingsTitle: string
  settingsLead: string
  vault: string
  lockVault: string
  noVaultOpen: string
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
  guideFlowMainLegend: string
  guideFlowDocsLegend: string
  guideFlowOptionalLegend: string
  guideFlowMiniTitle: string
  guideFlowMiniExpand: string
  flowEdgeMemoryReturn: string
  flowNodeAiLabel: string
  flowNodeAiHint: string
  flowNodeAiDisk: string
  flowNodeVaultLabel: string
  flowNodeVaultHint: string
  flowNodeVaultDisk: string
  flowNodeDistillLabel: string
  flowNodeDistillHint: string
  flowNodeDistillDisk: string
  flowNodeNotesLabel: string
  flowNodeNotesHint: string
  flowNodeNotesDisk: string
  flowNodeLibraryLabel: string
  flowNodeLibraryHint: string
  flowNodeLibraryDisk: string
  flowNodeMcpLabel: string
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
}

const PL_LABELS: UiLabels = {
  distill: 'Przygotuj pamięć',
  distillBacklog: (n) => `Przygotuj pamięć (${n} nowych)`,
  runPipeline: 'Przygotuj pamięć',
  deployToBrain: 'Wyślij do wyszukiwarki',
  embedded: 'Lokalnie',
  remote: 'Na serwerze',
  reindex: 'Odśwież indeks',
  mcpConnect: 'Podłącz Cursora',
  brainPageTitle: 'Pamięć i wyszukiwarka',
  brainPageLead:
    'Przygotuj rozmowy do wyszukiwania i uruchom lokalną wyszukiwarkę — bez serwera w chmurze.',
  embeddedBrain: 'Lokalna wyszukiwarka',
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
  connectPageLead:
    'Skopiuj konfigurację MCP i wklej w Cursorze — Pomnia nigdy nie dotyka Twoich plików.',
  embeddedBrainNotRunning: 'Lokalna wyszukiwarka nie działa. Otwórz zakładkę',
  embeddedBrainNotRunningLink: 'Brain',
  settingsTitle: 'Ustawienia',
  settingsLead: 'Vault, integracje i bezpieczeństwo.',
  vault: 'Vault',
  lockVault: 'Zablokuj',
  noVaultOpen: 'Brak otwartego vaultu.',
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
    'Klient MCP (Cursor i inne) — agent woła search_library podczas pracy i przypomina sobie kontekst z lokalnego indeksu.',
  guideStep5Where: 'Connect · search_library · mcp.json',
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
  guideFlowReplay: 'Odtwórz animację',
  guideFlowMainLegend: 'Ścieżka czatów',
  guideFlowDocsLegend: 'Ścieżka dokumentów',
  guideFlowOptionalLegend: 'Opcjonalnie',
  guideFlowMiniTitle: 'Przepływ danych',
  guideFlowMiniExpand: 'Pełna mapa →',
  flowEdgeMemoryReturn: 'odpowiedź z pamięci',
  flowNodeAiLabel: 'Narzędzia AI',
  flowNodeAiHint: 'Cursor, Claude Code, Antigravity — surowe logi sesji na dysku lokalnym.',
  flowNodeAiDisk: 'Cursor · Claude · Antigravity',
  flowNodeVaultLabel: 'Vault .pomnia',
  flowNodeVaultHint: 'Zaszyfrowane archiwum snapshotów backupów i dokumentów library.cvb.',
  flowNodeVaultDisk: 'folder *.pomnia',
  flowNodeDistillLabel: 'Destylacja',
  flowNodeDistillHint: 'Ollama (qwen) skraca rozmowy do zwięzłych notatek — nie pełne kopie czatów.',
  flowNodeDistillDisk: 'localhost:11434',
  flowNodeNotesLabel: 'brain-notes',
  flowNodeNotesHint: 'Zdestylowane skróty sesji gotowe do indeksowania.',
  flowNodeNotesDisk: 'brain-notes/distilled',
  flowNodeLibraryLabel: 'library.db',
  flowNodeLibraryHint: 'Embedded brain: chunki tekstu + wektory embeddingów lokalnie na tym PC.',
  flowNodeLibraryDisk: 'brain-core-data/library.db',
  flowNodeMcpLabel: 'Agent przez MCP',
  flowNodeMcpHint:
    'Agent (Cursor i inni): najpierw skills (opcjonalnie), potem search_library — lokalny indeks RAG.',
  flowNodeMcpDisk: 'Connect · skills → search_library · mcp.json',
  flowNodeImportLabel: 'Import',
  flowNodeImportHint: 'PDF, EPUB, ZIP — trafia do vaultu bez destylacji LLM.',
  flowNodeImportDisk: 'vault/library.cvb',
  flowNodeDocsIndexLabel: 'Indeks',
  flowNodeDocsIndexHint: 'Chunk + embed bezpośrednio — omija krok destylacji.',
  flowNodeDocsIndexDisk: 'library.db (docs)',
  flowNodeDeployLabel: 'Deploy Brain',
  flowNodeDeployHint: 'Opcjonalna kopia notatek na zdalny serwer Brain (np. LAN :7860).',
  flowNodeDeployDisk: 'Opcjonalny serwer Brain',
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
}

/** @param _simple ignored — kept for call-site compatibility; language does not depend on simple mode */
export function uiLabels(_simple?: boolean): UiLabels {
  return PL_LABELS
}
