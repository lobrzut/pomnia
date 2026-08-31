// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Strings the main process shows to a person.
 *
 * The renderer has had `uiLabels()` since the beginning; the main process
 * never did, so every toast, every tray entry and every health verdict was
 * written straight into the code in Polish. Switching the language changed the
 * window and left the notifications — which is worse than being monolingual,
 * because it promises a translation that is not there.
 *
 * Same shape as the renderer's labels on purpose: one interface, two objects,
 * so TypeScript refuses to compile when a key exists in one language and not
 * the other. That is what makes "the English build" a fact instead of an
 * intention.
 *
 * The locale is read per call rather than captured: Settings can change it
 * while the app runs, and a cached copy would keep answering in the language
 * the user just left.
 */

import { getAppSettings } from './appSettings.js'


export interface MainStrings {
  // ── ledger / startup ─────────────────────────────────────────────────────
  ledgerTravels: (known: number) => string
  ledgerRecovered: (recovered: number) => string
  pendingDocs: string

  // ── embedded brain ───────────────────────────────────────────────────────
  brainStartFailedTitle: string
  brainNotNeededTitle: string
  brainNotNeededDetail: (server: string) => string
  brainStartFailedDetail: (why: string) => string
  brainNoEmbedTitle: string
  brainStartTooLong: string
  searchUnavailable: string

  // ── remote brain ─────────────────────────────────────────────────────────
  remoteUnreachableTitle: string
  remoteUnreachableDetail: (url: string, why: string) => string
  remoteNotBrainCoreTitle: string
  remoteNotBrainCoreDetail: (root: string, engine: string) => string
  vaultNotSyncedTitle: string
  vaultNotSyncedDetail: (server: string) => string

  // ── index ────────────────────────────────────────────────────────────────
  fullReindexTitle: string
  fullReindexDetail: string
  reindexNothingTitle: string
  reindexMatchedTitle: string
  reindexPruned: (pruned: number) => string
  reindexFailedDetail: (why: string) => string
  reindexCounts: (files: number, chunks: number) => string
  reindexAfterOpenFailedTitle: string
  vaultNotOpen: string
  updateCheckHttp: (status: number) => string
  /** Refusal when indexing is asked for while the brain lives on a server. */
  indexingIsRemote: (url: string) => string

  // ── replication ──────────────────────────────────────────────────────────
  replicaUrlScheme: string
  replicaNoTarget: string
  replicaComparing: string
  replicaSending: (done: number, total: number, name: string) => string
  replicaPartialTitle: (uploaded: number, failed: number) => string
  replicaUpToDateTitle: string
  replicaUpToDateDetail: (unchanged: number) => string
  replicaSyncedTitle: (uploaded: number) => string
  replicaSyncedDetail: (unchanged: number, size: string) => string
  replicaExtraSuffix: (extra: number) => string
  replicaAutoFailedTitle: (failed: number) => string
  replicaAutoFailedDetail: (uploaded: number, reason: string) => string
  replicaOfflineTitle: string
  replicaOfflineDetail: (why: string) => string

  // ── profile ──────────────────────────────────────────────────────────────
  profileSavedTitle: (chars: number) => string
  profileTooLongTitle: string
  profileTooLongDetail: (max: number, now: string) => string
  profileWriteFailed: string
  profilePreviewFailed: string

  // ── tray ─────────────────────────────────────────────────────────────────
  trayBrainRunning: (url: string) => string
  trayOpen: string
  trayFloatingMonitor: string
  trayStopBrainCancelIndex: string
  trayStopBrain: string
  trayQuit: string
  trayBrainStarting: string
  trayBrainStopped: string
  trayBrainStoppedWith: (why: string) => string
  trayProfile: string

  // ── update check ─────────────────────────────────────────────────────────
  updateAvailableTitle: (version: string) => string
  updateAvailableDetail: (current: string) => string
  checkingOllama: string

  // ── ollama ───────────────────────────────────────────────────────────────
  ollamaMissingModel: (model: string, cmd: string) => string
  ollamaUnreachable: (url: string, suffix: string) => string
  brainProcessFailed: (detail: string) => string

  // ── ocr ──────────────────────────────────────────────────────────────────
  ocrNoText: string

  // ── vault health ─────────────────────────────────────────────────────────
  healthNoIndexTitle: string
  healthNoIndexDetail: (notes: number) => string
  healthIncompleteTitle: string
  healthIncompleteDetail: (chunks: number, notes: number, ratio: string, min: number) => string
  healthLibraryHint: string
  healthMoreIndexDetail: (chunks: number, root: string, notes: number) => string
  healthChangedTitle: string
  healthChangedDetail: (distilled: number, sessions: number, chunks: string) => string
  healthConsistentTitle: string
  healthConsistentDetail: (notes: number, chunks: string) => string
  healthOpenVault: string
}

const PL: MainStrings = {
  ledgerTravels: (known) => `${known} rozmów · od teraz podróżuje razem z danymi`,
  vaultNotSyncedTitle: 'Notatki z tego komputera nie trafiają na serwer',
  vaultNotSyncedDetail: (server: string) =>
    `Brain wskazuje na ${server}, ale wysyłka repliki jest wyłączona. Nowe notatki ` +
    `zostają tylko tutaj, a agenci czytają serwer — im dłużej tak stoi, tym bardziej ` +
    `oba vaulty się rozjeżdżają. Włącz w Connect → Replikacja vaultu.`,
  ledgerRecovered: (recovered) => `${recovered} rozmów odzyskanych — nie trzeba ich mielić od nowa`,
  pendingDocs: 'oczekujące dokumenty…',

  brainStartFailedTitle: 'Lokalna wyszukiwarka nie wystartowała',
  brainNotNeededTitle: 'Lokalna wyszukiwarka nie jest potrzebna',
  brainNotNeededDetail: (server: string) =>
    `Mózg jest na ${server} i to on trzyma indeks. Lokalne indeksowanie zapisywałoby ` +
    `do bazy, której żaden agent nie czyta. To jest stan poprawny — nic nie musisz robić.`,
  brainStartFailedDetail: (why) => `${why} — dopóki nie ruszy, agenci nie widzą pamięci.`,
  brainNoEmbedTitle: 'Wyszukiwarka nie ma czym liczyć',
  brainStartTooLong: 'Uruchamianie wyszukiwarki trwa zbyt długo',
  searchUnavailable: 'Wyszukiwarka niedostępna',

  remoteUnreachableTitle: 'Zdalny Brain nie odpowiada',
  remoteUnreachableDetail: (url, why) =>
    `${url} — ${why}. Popraw adres w zakładce Podłącz albo przełącz się na tryb lokalny.`,
  remoteNotBrainCoreTitle: 'Zdalny serwer to nie brain-core',
  remoteNotBrainCoreDetail: (root, engine) =>
    `${root} — ${engine}. Agenci dostaną z niego inną pamięć niż ta aplikacja. Popraw adres w zakładce Podłącz albo wróć do trybu lokalnego.`,

  fullReindexTitle: 'Pełny reindex indeksu',
  fullReindexDetail:
    'Vault przenośny — po starcie lokalnej wyszukiwarki kliknij „Odśwież indeks” (raz), żeby usunąć stare ścieżki AppData z wyszukiwania.',
  reindexNothingTitle: 'Reindeks nie zaindeksował niczego',
  reindexMatchedTitle: 'Indeks dopasowany do vaultu',
  reindexPruned: (pruned) => ` · usunięto ${pruned} starych ścieżek`,
  reindexFailedDetail: (why) => `${why} — kliknij „Odśwież indeks” w Brain.`,
  reindexCounts: (files, chunks) => `${files} plików · ${chunks} chunków`,
  reindexAfterOpenFailedTitle: 'Reindex po otwarciu vaultu nieudany',
  vaultNotOpen: 'Vault nie jest otwarty.',
  updateCheckHttp: (status) => `GitHub odpowiedział ${status}`,
  indexingIsRemote: (url) =>
    `Mózg jest na serwerze (${url}) — to on trzyma indeks. Lokalne indeksowanie ` +
    'zapisałoby do bazy, której żaden agent nie czyta. Wyślij notatki przez ' +
    'Podłącz → wyślij zmiany, a serwer je zaindeksuje. Dokumenty (PDF/EPUB) ' +
    'importujesz na razie tylko w trybie lokalnym.',

  replicaUrlScheme: 'Adres repliki musi zaczynać się od http:// lub https://',
  replicaNoTarget: 'Podaj adres serwera (zakładka Podłącz).',
  replicaComparing: 'porównuję z repliką…',
  replicaSending: (done, total, name) => `wysyłam ${done}/${total} — ${name}`,
  replicaPartialTitle: (uploaded, failed) => `Wysłano ${uploaded}, nie udało się ${failed}`,
  replicaUpToDateTitle: 'Replika była już aktualna',
  replicaUpToDateDetail: (unchanged) => `${unchanged} plików identycznych — nic do wysłania.`,
  replicaSyncedTitle: (uploaded) => `Zsynchronizowano ${uploaded} plik(ów)`,
  replicaSyncedDetail: (unchanged, size) => `${unchanged} bez zmian · ${size}`,
  replicaExtraSuffix: (extra) => ` · ${extra} plik(ów) jest tylko na replice (nic nie skasowano)`,
  replicaAutoFailedTitle: (failed) => `Replikacja: ${failed} plik(ów) nie poszło`,
  replicaAutoFailedDetail: (uploaded, reason) => `${uploaded} wysłane · ${reason}`,
  replicaOfflineTitle: 'Replikacja na serwer nieudana',
  replicaOfflineDetail: (why) => `${why} — serwer ma teraz starszą kopię niż ten komputer.`,

  profileSavedTitle: (chars) => `USER.md · ${chars} znaków`,
  profileTooLongTitle: 'Profil za długi',
  profileTooLongDetail: (max, now) => `Maks. ${max} znaków (teraz ${now}).`,
  profileWriteFailed: 'Błąd zapisu USER.md',
  profilePreviewFailed: 'Podgląd profilu nieudany',

  trayBrainRunning: (url) => `Lokalna wyszukiwarka: działa (${url})`,
  trayOpen: 'Otwórz Pomnię',
  trayFloatingMonitor: 'Pływający diagram',
  trayStopBrainCancelIndex: 'Zatrzymaj lokalną wyszukiwarkę (anuluj indeks)',
  trayStopBrain: 'Zatrzymaj lokalną wyszukiwarkę',
  trayQuit: 'Zakończ',
  trayBrainStarting: 'Lokalna wyszukiwarka: uruchamianie…',
  trayBrainStopped: 'Lokalna wyszukiwarka: zatrzymana',
  trayBrainStoppedWith: (why) => `Lokalna wyszukiwarka: zatrzymana (${why})`,
  trayProfile: 'Profil',

  updateAvailableTitle: (version) => `Jest nowsza wersja: ${version}`,
  updateAvailableDetail: (current) =>
    `Masz ${current}. Pobierz z GitHuba — Pomnia nie instaluje aktualizacji sama.`,
  checkingOllama: 'sprawdzam Ollama…',

  ollamaMissingModel: (model, cmd) =>
    `Brak modelu embeddingów „${model}" — wyszukiwanie i indeksowanie nie zadziałają. Uruchom: ${cmd}`,
  ollamaUnreachable: (url, suffix) => `Ollama niedostępne pod ${url} (GET /api/tags${suffix})`,
  brainProcessFailed: (detail) => `Proces wyszukiwarki nie wystartował: ${detail}`,

  ocrNoText: 'OCR nie zwrócił tekstu — sprawdź tessdata (eng/pol) i @napi-rs/canvas',

  healthNoIndexTitle: 'Brak lokalnego indeksu',
  healthNoIndexDetail: (notes) =>
    `Vault ma ${notes} notatek, ale nie ma lokalnego indeksu. Uruchom wyszukiwarkę i Odśwież indeks.`,
  healthIncompleteTitle: 'Indeks wygląda na niekompletny',
  healthIncompleteDetail: (chunks, notes, ratio, min) =>
    `~${chunks} chunków dla ${notes} notatek (~${ratio} chunk/plik; oczekiwane ≥${min}).`,
  healthLibraryHint:
    ' Serwer mógł mieć dziesiątki tysięcy chunków z PDF/EPUB w library/ — rozważ pełny reindeks / kopię biblioteki.',
  healthMoreIndexDetail: (chunks, root, notes) =>
    `Indeks ma ~${chunks} chunków (OK dla agentów), ale w ${root} jest tylko ${notes} notatek.`,
  healthChangedTitle: 'Vault się zmienił od ostatniego sprawdzenia',
  healthChangedDetail: (distilled, sessions, chunks) =>
    `Notatki: distilled ${distilled}, sessions ${sessions}; indeks ~${chunks} chunków.`,
  healthConsistentTitle: 'Vault i indeks wyglądają spójnie',
  healthConsistentDetail: (notes, chunks) =>
    `${notes} notatek w vaultcie · ~${chunks} chunków w indeksie`,
  healthOpenVault: 'Otwórz vault (C:\\Vault), żeby Pomnia wiedziała, gdzie jest pamięć.',
}

const EN: MainStrings = {
  ledgerTravels: (known) => `${known} conversations · travels with your data from now on`,
  ledgerRecovered: (recovered) =>
    `${recovered} conversations recovered — no need to distill them again`,
  pendingDocs: 'pending documents…',

  brainStartFailedTitle: 'The local search engine did not start',
  brainNotNeededTitle: 'The local search engine is not needed',
  brainNotNeededDetail: (server: string) =>
    `Brain runs on ${server} and holds the index there. Indexing locally would fill ` +
    `a database no agent reads. This is the correct state — nothing to do.`,
  brainStartFailedDetail: (why) => `${why} — until it runs, agents cannot see your memory.`,
  brainNoEmbedTitle: 'The search engine has nothing to compute with',
  brainStartTooLong: 'The search engine is taking too long to start',
  searchUnavailable: 'Search unavailable',

  remoteUnreachableTitle: 'The remote Brain is not answering',
  remoteUnreachableDetail: (url, why) =>
    `${url} — ${why}. Fix the address in the Connect tab, or switch back to local mode.`,
  remoteNotBrainCoreTitle: 'That remote server is not brain-core',
  remoteNotBrainCoreDetail: (root, engine) =>
    `${root} — ${engine}. Agents would get a different memory from it than this app has. Fix the address in Connect, or go back to local mode.`,
  vaultNotSyncedTitle: 'Notes from this computer are not reaching the server',
  vaultNotSyncedDetail: (server: string) =>
    `Brain points at ${server}, but replica push is off. New notes stay here while ` +
    `agents read the server, so the two vaults drift further apart the longer it runs. ` +
    `Turn it on in Connect → Vault replication.`,

  fullReindexTitle: 'Full index rebuild',
  fullReindexDetail:
    'Portable vault — once the local search engine is running, click “Refresh index” once to drop the old AppData paths from search.',
  reindexNothingTitle: 'The rebuild indexed nothing',
  reindexMatchedTitle: 'Index matched to the vault',
  reindexPruned: (pruned) => ` · removed ${pruned} stale paths`,
  reindexFailedDetail: (why) => `${why} — click “Refresh index” in Brain.`,
  reindexCounts: (files, chunks) => `${files} file(s) · ${chunks} chunk(s)`,
  reindexAfterOpenFailedTitle: 'Reindex after opening the vault failed',
  vaultNotOpen: 'The vault is not open.',
  updateCheckHttp: (status) => `GitHub answered ${status}`,
  indexingIsRemote: (url) =>
    `The brain lives on a server (${url}) and holds the index there. Indexing ` +
    'locally would write to a database no agent reads. Send notes with ' +
    'Connect → push changes and the server will index them. Documents ' +
    '(PDF/EPUB) can only be imported in local mode for now.',

  replicaUrlScheme: 'The replica address must start with http:// or https://',
  replicaNoTarget: 'Set the server address first (Connect tab).',
  replicaComparing: 'comparing with the replica…',
  replicaSending: (done, total, name) => `sending ${done}/${total} — ${name}`,
  replicaPartialTitle: (uploaded, failed) => `${uploaded} sent, ${failed} failed`,
  replicaUpToDateTitle: 'The replica was already current',
  replicaUpToDateDetail: (unchanged) => `${unchanged} files identical — nothing to send.`,
  replicaSyncedTitle: (uploaded) => `Replicated ${uploaded} file(s)`,
  replicaSyncedDetail: (unchanged, size) => `${unchanged} unchanged · ${size}`,
  replicaExtraSuffix: (extra) => ` · ${extra} file(s) exist only on the replica (nothing was deleted)`,
  replicaAutoFailedTitle: (failed) => `Replication: ${failed} file(s) did not go through`,
  replicaAutoFailedDetail: (uploaded, reason) => `${uploaded} sent · ${reason}`,
  replicaOfflineTitle: 'Replication to the server failed',
  replicaOfflineDetail: (why) => `${why} — the server now holds an older copy than this machine.`,

  profileSavedTitle: (chars) => `USER.md · ${chars} characters`,
  profileTooLongTitle: 'Profile too long',
  profileTooLongDetail: (max, now) => `Maximum ${max} characters (currently ${now}).`,
  profileWriteFailed: 'Could not write USER.md',
  profilePreviewFailed: 'Profile preview failed',

  trayBrainRunning: (url) => `Local search engine: running (${url})`,
  trayOpen: 'Open Pomnia',
  trayFloatingMonitor: 'Floating monitor',
  trayStopBrainCancelIndex: 'Stop the local search engine (cancel indexing)',
  trayStopBrain: 'Stop the local search engine',
  trayQuit: 'Quit',
  trayBrainStarting: 'Local search engine: starting…',
  trayBrainStopped: 'Local search engine: stopped',
  trayBrainStoppedWith: (why) => `Local search engine: stopped (${why})`,
  trayProfile: 'Profile',

  updateAvailableTitle: (version) => `A newer version is available: ${version}`,
  updateAvailableDetail: (current) =>
    `You have ${current}. Download it from GitHub — Pomnia never installs updates by itself.`,
  checkingOllama: 'checking Ollama…',

  ollamaMissingModel: (model, cmd) =>
    `Embedding model “${model}” is missing — search and indexing will not work. Run: ${cmd}`,
  ollamaUnreachable: (url, suffix) => `Ollama unreachable at ${url} (GET /api/tags${suffix})`,
  brainProcessFailed: (detail) => `The search engine process did not start: ${detail}`,

  ocrNoText: 'OCR returned no text — check tessdata (eng/pol) and @napi-rs/canvas',

  healthNoIndexTitle: 'No local index',
  healthNoIndexDetail: (notes) =>
    `The vault holds ${notes} notes but there is no local index. Start the search engine and refresh the index.`,
  healthIncompleteTitle: 'The index looks incomplete',
  healthIncompleteDetail: (chunks, notes, ratio, min) =>
    `~${chunks} chunks for ${notes} notes (~${ratio} chunks/file; expected ≥${min}).`,
  healthLibraryHint:
    ' A server may have held tens of thousands of chunks from PDFs/EPUBs in library/ — consider a full rebuild or copying the library.',
  healthMoreIndexDetail: (chunks, root, notes) =>
    `The index holds ~${chunks} chunks (fine for agents), but ${root} only has ${notes} notes.`,
  healthChangedTitle: 'The vault changed since the last check',
  healthChangedDetail: (distilled, sessions, chunks) =>
    `Notes: distilled ${distilled}, sessions ${sessions}; index ~${chunks} chunks.`,
  healthConsistentTitle: 'Vault and index look consistent',
  healthConsistentDetail: (notes, chunks) => `${notes} notes in the vault · ~${chunks} chunks indexed`,
  healthOpenVault: 'Open a vault (C:\\Vault) so Pomnia knows where your memory lives.',
}

/** Read per call: Settings can change the language while the app is running. */
/** Shared by modules that keep their own lookup tables (see activity.ts). */
export function isEnLocale(): boolean {
  return getAppSettings().uiLocale === 'en'
}

export function m(): MainStrings {
  return isEnLocale() ? EN : PL
}
