/** Human-friendly UI labels — Polish in simple mode, technical in advanced. */

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
  searchKnowledge: string
  advanced: string
  simpleMode: string
  simpleModeHint: string
  closeToTray: string
  closeToTrayHint: string
  minimizeToTray: string
  minimizeToTrayHint: string
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
  importDocDone: string
  importDocOcrHint: string
  importDocBrainOff: string
  importProviders: string
  importLegalNote: string
}

export function uiLabels(simple: boolean): UiLabels {
  if (simple) {
    return {
      distill: 'Przygotuj pamięć',
      distillBacklog: (n) => `Przygotuj pamięć (${n} nowych)`,
      runPipeline: 'Przygotuj pamięć',
      deployToBrain: 'Wyślij do wyszukiwarki',
      embedded: 'Lokalnie',
      remote: 'Na serwerze',
      reindex: 'Odśwież indeks',
      mcpConnect: 'Podłącz Cursora',
      brainPageTitle: 'Pamięć i wyszukiwarka',
      brainPageLead: 'Przygotuj rozmowy do wyszukiwania i uruchom lokalną wyszukiwarkę — bez serwera w chmurze.',
      embeddedBrain: 'Lokalna wyszukiwarka',
      searchKnowledge: 'Szukaj w swojej pamięci',
      advanced: 'Zaawansowane',
      simpleMode: 'Tryb prosty',
      simpleModeHint: 'Ukrywa serwer zdalny, deploy i ustawienia GPU. Wystarczy vault → backup → wyszukiwarka → Cursor.',
      closeToTray: 'Zamknij do zasobnika',
      closeToTrayHint: 'Przycisk X chowa aplikację do traya zamiast kończyć proces. Gdy działa lokalna wyszukiwarka — zawsze.',
      minimizeToTray: 'Minimalizuj do zasobnika',
      minimizeToTrayHint: 'Przycisk minimalizacji chowa okno do traya zamiast paska zadań.',
      importTitle: 'Importuj',
      importLead: 'Wgraj eksport z Claude.ai, ChatGPT, Gemini albo Grok — trafi do vaultu.',
      importPick: 'Wybierz plik eksportu',
      importPickBusy: 'Importuję…',
      importVaultClosed: 'Najpierw odblokuj vault',
      importFormats: 'ZIP · JSON · JSONL · MD — rozpoznaje źródło automatycznie',
      importSelect: 'Wybierz plik…',
      importChatSection: 'Eksporty czatów',
      importDocSection: 'Dokumenty',
      importDocPick: 'Wybierz PDF lub DOCX',
      importDocBusy: 'Importuję dokument…',
      importDocFormats: 'PDF · DOCX · MD · TXT — zaszyfrowane w vault, indeks w wyszukiwarce',
      importDocSelect: 'Wybierz dokument…',
      importDocDone: 'Dokument zaimportowany',
      importDocOcrHint: 'Mało tekstu — w v0.3 uruchom OCR dla skanów.',
      importDocBrainOff: 'Uruchom lokalną wyszukiwarkę (Brain), żeby zindeksować chunki.',
      importProviders: 'Skąd pobrać eksport',
      importLegalNote:
        'Pomnia importuje tylko oficjalne eksporty — bez logowania do kont. Claude Desktop / Gemini wymagają eksportu z wersji webowej.'
    }
  }
  return {
    distill: 'Distill',
    distillBacklog: (n) => `Distill backlog (${n})`,
    runPipeline: 'Run pipeline',
    deployToBrain: 'Deploy to Brain',
    embedded: 'Local embedded',
    remote: 'Remote master',
    reindex: 'Reindex',
    mcpConnect: 'Connect to Brain',
    brainPageTitle: 'Send to Brain',
    brainPageLead:
      'Hand your aggregated chats to your Brain server — it distills + indexes (GPU work stays server-side).',
    embeddedBrain: 'Embedded brain',
    searchKnowledge: 'Search your knowledge (local RAG)',
    advanced: 'Advanced',
    simpleMode: 'Simple mode',
    simpleModeHint: 'Hides remote brain URL, deploy/SMB/reindex, manual Ollama URL, and VRAM profiles.',
    closeToTray: 'Close to tray',
    closeToTrayHint: 'The X button hides Pomnia to the system tray instead of quitting. Always on while embedded brain runs.',
    minimizeToTray: 'Minimize to tray',
    minimizeToTrayHint: 'The minimize button hides to tray instead of the taskbar.',
    importTitle: 'Import',
    importLead: 'Pull chats you exported from Claude.ai, ChatGPT, Gemini or Grok into your vault.',
    importPick: 'Choose an export file',
    importPickBusy: 'Importing…',
    importVaultClosed: 'Open a vault first',
    importFormats: 'ZIP · JSON · JSONL · MD — auto-detects the source',
    importSelect: 'Select export…',
    importChatSection: 'Chat exports',
    importDocSection: 'Documents',
    importDocPick: 'Choose a PDF or DOCX',
    importDocBusy: 'Importing document…',
    importDocFormats: 'PDF · DOCX · MD · TXT — encrypted in vault, indexed in library.db',
    importDocSelect: 'Select document…',
    importDocDone: 'Document imported',
    importDocOcrHint: 'Sparse text layer — OCR recommended in v0.3 for scans.',
    importDocBrainOff: 'Start embedded brain to embed chunks into library.db.',
    importProviders: 'Where to export from',
    importLegalNote:
      'Pomnia imports official exports only — no scraping or logging into accounts (fragile + against terms). Claude Desktop / Gemini chats live server-side, so you export them from the web, then import here.'
  }
}
