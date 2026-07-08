/** Polish UI labels — simple mode only hides advanced sections, not language. */

import type { ActivityState } from './types'

const ACTIVITY_KIND: Record<Exclude<ActivityState['kind'], 'idle'>, string> = {
  distill: 'destylacja',
  'doc-import': 'import dokumentu',
  'brain-start': 'uruchamianie Brain',
  indexing: 'indeksowanie',
  embed: 'embeddingi',
}

const ACTIVITY_PHASE: Record<string, string> = {
  collect: 'zbieranie',
  distill: 'destylacja',
  index: 'indeksowanie',
  deploy: 'wdrożenie',
  parse: 'parsowanie',
  encrypt: 'szyfrowanie',
  reindex: 'odświeżanie indeksu',
  start: 'start',
}

function truncateDetail(s: string, max = 48): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export function formatBrainProgressLabel(phase: string, detail?: string): string {
  const pl = ACTIVITY_PHASE[phase] ?? phase
  return detail ? `${pl} · ${truncateDetail(detail, 40)}` : pl
}

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
  activityBanner: (state: ActivityState) => string
  activityTrayBusy: string
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
  activityBanner: formatActivityBanner,
  activityTrayBusy: 'Operacja w tle'
}

/** @param _simple ignored — kept for call-site compatibility; language does not depend on simple mode */
export function uiLabels(_simple?: boolean): UiLabels {
  return PL_LABELS
}
