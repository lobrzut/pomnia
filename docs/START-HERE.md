# Pomnia — START HERE

> Jedna strona dla beta testera. Szczegóły techniczne: [README](../README.md) · audyt: [ROADMAP-CLARITY.md](./ROADMAP-CLARITY.md).

## Czym jest Pomnia?

**Lokalna aplikacja**, która zbiera rozmowy ze wszystkich asystentów AI w **jeden zaszyfrowany vault**, a potem — przez **Brain** — pozwala agentom (np. Cursor) **przypominać sobie** kontekst przez MCP.

Nic nie idzie do chmury, dopóki sam nie skonfigurujesz deployu na swój serwer.

> **W aplikacji:** zakładka **Jak to działa** (Mapa Pomnia) w menu bocznym — wizualny przepływ po polsku + pasek „Gdzie jesteś teraz” na Dashboardzie. Link „Nie wiem od czego zacząć →” też tam prowadzi.

## Dwa magazyny — nie myl ich!

| Nazwa | Gdzie | Co trzyma |
|-------|-------|-----------|
| **Pomnia Vault** | Folder vaultu, który wybierasz (np. `C:\Vault` — nazwa dowolna, też `*.pomnia`) | Zaszyfrowane czaty + dokumenty; **plaintext** obok: `skills/`, `USER.md`, `sessions/`, distilled |
| **Brain data** | `%AppData%/Pomnia/brain-core-data/` | Indeks RAG (`library.db`) + notatki distill — **nieszyfrowane** na dysku |

Vault = archiwum i backup (AES dla blobów czatów/dokumentów). Sidecary wiedzy i indeks Brain = plaintext na dysku — chroń folder. Brain data = silnik wyszukiwania semantycznego.

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

**Windows (aplikacja Pomnia):** zakładka **Connect** → tryb remote/embedded → skopiuj pełny snippet → wklej → Reload Window.

**Mac / bez aplikacji:** zobacz [docs/CURSOR-MCP.md](./CURSOR-MCP.md) → URL `:7862` + token z dashboardu `:7860` → **Kopiuj mcp.json** → `~/.cursor/mcp.json` → Reload Window.

Remote zawsze wymaga **trzech** serwerów: `pomnia`, `pomnia-vault`, `pomnia-library`. Sam `pomnia` = niepełna konfiguracja (legacy klucz `brain-rag` status jeszcze akceptuje).

### 5. Weryfikacja

**Settings → Diagnostyka** — Ollama, modele, vault, brain-core, MCP powinny być zielone.

W Cursorze zapytaj agenta o coś z wcześniejszej sesji — powinien wołać `search_library` z Brain MCP.

## Dwa pipeline'y treści

| Typ | Ścieżka | LLM? |
|-----|---------|------|
| **Czaty** (live backup, import ZIP) | Vault → **Distill** → index | Tak (qwen) |
| **Dokumenty** (PDF, DOCX, EPUB) | Vault → **Direct index** (+ opcjonalnie thin OCR) | Nie (tylko embed; OCR = tesseract) |

Nie destyluj PDF-ów — indeksuj je bezpośrednio z zakładki Import. Skan PDF (mało tekstu) → **Uruchom OCR**, potem indeks. **Odśwież indeks** pomija niezmienione pliki. Auto-checkpoint vs „zapisz do Pomnia”: [README](../README.md#kontynuacja-sesji-mcp).

## Import vs Backup

- **Backup** — czyta żywe pliki asystentów z dysku (Claude Code, Cursor…).
- **Import** — wczytuje eksporty ZIP/JSON (Claude.ai, ChatGPT, Gemini) lub pojedyncze pliki.

Jeśli Cursor backup pokazuje 0 czatów — użyj Import.

## Gdzie szukać pomocy

| Problem | Gdzie |
|---------|-------|
| Nie wiem jak to działa | **Jak to działa** (menu) lub Dashboard → „Nie wiem od czego zacząć” |
| Status systemu | Dashboard → pasek „Gdzie jesteś teraz” · Settings → Diagnostyka |
| Logi | `%AppData%/Pomnia/logs/` |
| Pełny pipeline dokumentów | [DOCUMENT-PIPELINE.md](./DOCUMENT-PIPELINE.md) |
| Integracja z homelab Brain | [BRAIN-INTEGRATION.md](./BRAIN-INTEGRATION.md) (internal/historical) |

## Czego ta beta jeszcze nie ma

- Podpisany instalator (SmartScreen / Gatekeeper)
- Pełny OCR wszystkich stron / Ollama vision (jest thin OCR: pierwsze sparse pages)
- Sync vault do chmury
- Gwarancja Antigravity na każdej maszynie (adapter w testach)

Linux Desktop (AppImage/deb): budowa na Linux/CI — [LINUX-BUILD.md](./LINUX-BUILD.md).

---

*Pomnia · local-first AI memory · [pomnia.ai](https://pomnia.ai)*
