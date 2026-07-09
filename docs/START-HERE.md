# Pomnia — START HERE

> Jedna strona dla beta testera. Szczegóły techniczne: [README](../README.md) · audyt: [ROADMAP-CLARITY.md](./ROADMAP-CLARITY.md).

## Czym jest Pomnia?

**Lokalna aplikacja**, która zbiera rozmowy ze wszystkich asystentów AI w **jeden zaszyfrowany vault**, a potem — przez **Brain** — pozwala agentom (np. Cursor) **przypominać sobie** kontekst przez MCP.

Nic nie idzie do chmury, dopóki sam nie skonfigurujesz deployu na swój serwer.

## Dwa magazyny — nie myl ich!

| Nazwa | Gdzie | Co trzyma |
|-------|-------|-----------|
| **Pomnia Vault** | Folder `*.pomnia` (wybierasz przy tworzeniu) | Zaszyfrowane czaty + dokumenty |
| **Brain data** | `%AppData%/Pomnia/brain-core-data/` | Indeks RAG (`library.db`) + notatki distill — **nieszyfrowane** na dysku |

Vault = archiwum i backup. Brain data = silnik wyszukiwania semantycznego.

## Dwa tryby Brain

```
┌─────────────────────────────────────────────────────────┐
│  EMBEDDED (zalecane na start)                           │
│  Brain działa WEWNĄTRZ Pomnia na 127.0.0.1:7862        │
│  Wymaga: Ollama na TEJ maszynie                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  REMOTE (homelab)                                       │
│  Twój serwer Brain na LAN, np. http://twoj-serwer:7862  │
│  Wymaga: token Bearer + działający MCP proxy            │
└─────────────────────────────────────────────────────────┘
```

W **Connect** wybierz tryb zanim skopiujesz snippet MCP.

## 5 kroków do „Cursor mnie pamięta"

### 1. Ollama + modele

Zainstaluj [Ollama](https://ollama.com), uruchom, pobierz:

```bash
ollama pull nomic-embed-text    # embeddingi — WYMAGANE do wyszukiwania
ollama pull qwen2.5:14b         # destylacja czatów — WYMAGANE do distill
```

### 2. Vault + backup

- Kreator przy pierwszym uruchomieniu **lub** Dashboard → utwórz/otwórz vault.
- **Backup** — zaznacz wykryte źródła (Claude Code, Cursor…) → Backup.

### 3. Distill (czaty → notatki)

Zakładka **Brain** → sprawdź status Ollama → **Distill backlog**.

To zamienia surowe logi rozmów w skondensowane notatki `.md` i buduje indeks wektorowy.

### 4. Connect (MCP)

Zakładka **Connect** → wybierz klienta (Cursor) → skopiuj snippet → wklej w konfigurację MCP → zrestartuj Cursor.

### 5. Weryfikacja

**Settings → Diagnostyka** — Ollama, modele, vault, brain-core, MCP powinny być zielone.

W Cursorze zapytaj agenta o coś z wcześniejszej sesji — powinien wołać `search_library` z Brain MCP.

## Dwa pipeline'y treści

| Typ | Ścieżka | LLM? |
|-----|---------|------|
| **Czaty** (live backup, import ZIP) | Vault → **Distill** → index | Tak (qwen) |
| **Dokumenty** (PDF, DOCX, EPUB) | Vault → **Direct index** | Nie (tylko embed) |

Nie destyluj PDF-ów — indeksuj je bezpośrednio z zakładki Import.

## Import vs Backup

- **Backup** — czyta żywe pliki asystentów z dysku (Claude Code, Cursor…).
- **Import** — wczytuje eksporty ZIP/JSON (Claude.ai, ChatGPT, Gemini) lub pojedyncze pliki.

Jeśli Cursor backup pokazuje 0 czatów — użyj Import.

## Gdzie szukać pomocy

| Problem | Gdzie |
|---------|-------|
| Status systemu | Settings → Diagnostyka |
| Logi | `%AppData%/Pomnia/logs/` |
| Pełny pipeline dokumentów | [DOCUMENT-PIPELINE.md](./DOCUMENT-PIPELINE.md) |
| Integracja z homelab Brain | [BRAIN-INTEGRATION.md](../BRAIN-INTEGRATION.md) |

## Czego ta beta jeszcze nie ma

- Podpisany instalator (SmartScreen / Gatekeeper)
- Instalator Linux
- OCR skanów PDF
- Sync vault do chmury
- Gwarancja Antigravity na każdej maszynie (adapter w testach)

---

*Pomnia · local-first AI memory · [pomnia.ai](https://pomnia.ai)*
