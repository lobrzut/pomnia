# Pomnia — Document Ingestion Pipeline (master doc)

> **Cel:** jeden dokument opisujący **cały łańcuch** od akcji użytkownika do wyszukiwania RAG — dla czatów (działa dziś) i dokumentów (w budowie).  
> Powiązane: [PDF-LOCAL.md](./PDF-LOCAL.md) (szczegóły parserów), [BRAIN-KVM-ARCHITECTURE.md](./BRAIN-KVM-ARCHITECTURE.md), [BRAIN-INTEGRATION.md](../BRAIN-INTEGRATION.md).

**Stan audytu:** 2026-07-08 · repo `pomnia` + wzorce z `reliqua-brain-hub` (Python na brain.example.local).

---

## 1. Dwa „vaulty" — nie mylić

Pomnia operuje na **dwóch niezależnych magazynach** o różnej roli i szyfrowaniu:

| Magazyn | Ścieżka | Szyfrowanie | Zawartość dziś | Zawartość docelowa |
|---------|---------|-------------|----------------|-------------------|
| **Pomnia Vault** | `*.pomnia/` (user wybiera folder) | AES-256-GCM + scrypt | Snapshoty czatów, surowe pliki asystentów | + opcjonalnie oryginały PDF/DOCX jako bloby (roadmap) |
| **Brain data dir** | `%AppData%/Pomnia/brain-core-data/` lub `~/.pomnia/brain` | Plaintext na dysku | `vault/distilled`, `vault/sessions`, `USER.md` | + `vault/library/sources`, `vault/library/extracted` |
| **Encrypted backup** | NAS / kopia `.pomnia` | Jak vault | Pełna przenośność czatów | Docs jako bloby w vault (faza 1.5) |

**Zasada publikacji:** kod szyfrowania vault (`src/core/vault.ts`, `crypto.ts`) **nigdy** nie trafia do publicznego repo — tylko zamknięty instalator.

---

## 2. Macierz formatów i parserów

Legenda: **L** = lokalnie w Pomnia, **S** = serwer Brain homelab, **Q** = jakość ekstrakcji, **Off** = działa offline w exe.

| Format | Lokalnie (Pomnia) | Serwer (Brain Python) | Q tekst | Q skan/tabele | Off | Bundle / deps |
|--------|-----------------|----------------------|---------|---------------|-----|----------------|
| **PDF (warstwa tekstu)** | `unpdf` ✅ spike | PyMuPDF (`fitz`) ✅ | dobra | słaba (płaski tekst) | ✅ | ~2 MB JS, zero native |
| **PDF (skan)** | Tier 2: `pdfjs`+`tesseract.js` 🔲 | OCR opcjonalnie 🔲 | słaba→średnia | średnia | ✅* | +8 MB WASM/lang |
| **PDF (tabele)** | Tier 1 = płaski tekst | PyMuPDF = płaski tekst | słaba | słaba | ✅ | — |
| **DOCX** | `mammoth` 🔲 v1 | `python-docx` ✅ | dobra | uproszczone | ✅ | ~200 KB JS |
| **MD / TXT** | passthrough ✅ | passthrough ✅ | pełna | — | ✅ | 0 |
| **HTML / HTM** | 🔲 (BS4-equivalent) | BeautifulSoup ✅ | dobra | — | ✅ | markitdown-ts ciężki |
| **EPUB** | 🔲 (`epub.js` / zip+html) | `ebooklib`+BS4 ✅ | dobra | — | ✅ | ~1–3 MB |
| **MOBI/AZW** | 🔲 v2+ | `mobi` lib ✅ | średnia | — | częściowo | Python only dziś |
| **Obrazy (PNG/JPG)** | Tier 2 OCR / Ollama vision 🔲 | 🔲 | zależy od OCR | — | ✅ | vision = wolne |
| **ZIP/7z archiwum** | 🔲 rozpakuj → rekursja | `zipfile`/`py7zr` ✅ | — | — | ✅ | fflate już w import czatów |
| **Eksporty czatów** | `archives.ts` ✅ | `transcripts/` ✅ | N/A (→ distill) | — | ✅ | fflate |
| **Repo kodu / zip** | 🔲 v2 (tree walk + `.gitignore`) | `code/*` API ✅ | dobra dla kodu | — | ✅ | osobna ścieżka `search_code` |

**Uwaga:** `docs/PDF-LOCAL.md` wspomina **opendataloader-pdf (Java)** jako Tier 3 — w aktualnym `reliqua-brain-hub` **nie ma** tej zależności; serwer używa **PyMuPDF**. Tier 3 = upload pliku + reindex Python, nie osobny Java parser.

---

## 3. Dwa pipeline'y — kiedy distill, kiedy direct index

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ŚCIEŻKA A: CZATY (✅ działa)                         │
└─────────────────────────────────────────────────────────────────────────────┘

  Live adapters          Import ZIP/JSON
  (Claude Code,          (Claude.ai, ChatGPT,
   Cursor, …)             Grok, Gemini)
       │                        │
       └──────────┬─────────────┘
                  ▼
         ┌─────────────────┐
         │  Pomnia Vault   │  ← zaszyfrowane snapshoty (.pomnia)
         │  vault.ts       │
         └────────┬────────┘
                  │ browse / searchText (substring, bez GPU)
                  ▼
         ┌─────────────────┐     wymaga Ollama + model chat
         │    DISTILL      │     qwen2.5:14b, JSON → notatka .md
         │  distill.ts     │     quality gate: ok | stub | garbage
         └────────┬────────┘
                  ▼
         ┌─────────────────┐
         │  brain-notes/   │  staging: %AppData%/Pomnia/brain-notes
         │  *.md           │  _review/ dla niskiej jakości
         └────────┬────────┘
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
 localIndex   embedded     deploy → Brain
 (.pomnia-    brain-core    SMB / save-note
  index.json) reindex       + library/reindex
 (JSON RAG)   library.db
```

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ŚCIEŻKA B: DOKUMENTY (🔲 fazy 1–3)                        │
└─────────────────────────────────────────────────────────────────────────────┘

  User: Import PDF/DOCX (GUI / CLI / drag-drop)
                  │
                  ▼
         ┌─────────────────┐
         │ @pomnia/doc-parser│  Tier 1: unpdf + mammoth + passthrough
         │ parseDocument()   │  Tier 2: OCR / Ollama vision (on-demand)
         └────────┬────────┘  Tier 3: POST Brain upload (cache lokalny)
                  ▼
         ┌─────────────────┐
         │ vault/library/  │  sources/ = oryginały
         │                 │  extracted/ = .md + frontmatter
         └────────┬────────┘
                  │  BEZ distill — tekst już jest „dokumentem"
                  ▼
         ┌─────────────────┐
         │ brain-core      │  indexDocument() z page_num per strona
         │ chunk → embed   │  nomic-embed-text (Ollama)
         └────────┬────────┘
                  ▼
            library.db  →  search_library source=library
```

**Reguła:** **Distill** tylko dla **narracji dialogowej** (czaty). **Direct index** dla **gotowego tekstu** (PDF/DOCX/EPUB/MD). Mieszanie = błąd projektowy (LLM nie powinien „streszczać" już napisanego raportu bez wyraźnej prośby usera).

---

## 4. Diagram end-to-end (mermaid)

```mermaid
flowchart TB
  subgraph sources [Źródła]
    LIVE[Live adapters<br/>Claude Code, Cursor, …]
    IMP[Import archives<br/>ZIP/JSON exports]
    DOC[Documents<br/>PDF DOCX EPUB MD]
  end

  subgraph pomnia [Pomnia Desktop]
    PV[(Pomnia Vault<br/>encrypted .pomnia)]
    DP[@pomnia/doc-parser<br/>Tier 1-3]
    LIB[vault/library/<br/>sources + extracted]
    DIST[distill.ts<br/>Ollama chat model]
    STG[brain-notes staging]
    LI[localIndex JSON<br/>.pomnia-index.json]
    BC[@pomnia/brain-core<br/>fork child_process]
    DB[(library.db<br/>sqlite-vec)]
  end

  subgraph remote [Brain Homelab optional]
    DASH[Dashboard :7860]
    MCP[MCP :7862]
    PY[pipeline/rag.py<br/>PyMuPDF EPUB DOCX]
    RDB[(library.db master)]
  end

  LIVE --> PV
  IMP --> PV
  PV --> DIST
  DIST --> STG
  STG --> LI
  STG --> BC
  STG -->|auto-deploy| DASH

  DOC --> DP
  DP --> LIB
  LIB --> BC
  BC --> DB

  DASH -->|upload + reindex| PY
  PY --> RDB
  MCP --> RDB
  BC -->|MCP search_library| DB

  style DOC fill:#334,stroke:#88a
  style DP fill:#334,stroke:#88a
  style LIB fill:#334,stroke:#88a
```

### Granice szyfrowania

| Etap | Plaintext | Zaszyfrowane |
|------|-----------|--------------|
| Odczyt z Cursor/Claude | ✅ na hoście | — |
| Zapis snapshotu | — | ✅ vault blobs |
| Distill (Ollama) | ✅ RAM + staging md | — |
| doc-parser extract | ✅ extracted .md | — |
| brain-core-data na dysku | ✅ (lokalny profil) | 🔲 opcjonalnie w 2.0 |
| Deploy do Brain VM | ✅ SMB/HTTP | zależy od admina VM |
| `.pomnia` na NAS | — | ✅ zawsze |

---

## 5. Tryby integracji

### 5.1 Pure offline Pomnia

- Vault + browse + `vault:searchText` (substring).
- **Bez** Ollama: brak distill, brak embed, brak semantic search.
- Dokumenty: po fazie 1–3 — parse + embedded brain-core **jeśli** user włączy lokalny Ollama tylko do `nomic-embed-text` (~274 MB).

### 5.2 Pomnia + lokalny Ollama (domyślny power user)

- Distill na GPU hosta (qwen2.5:14b).
- Pre-index JSON (`localIndex.ts`) — natychmiastowy search nad notatkami.
- Embedded `brain-core` fork → `library.db` + MCP na `127.0.0.1:7862` dla Cursor/Claude Code.
- Dokumenty: parse offline → index w tym samym `library.db`.

### 5.3 Pomnia + Brain homelab online (Remote master)

- Distill lokalnie → auto-deploy (`deployDistilledToBrain`).
- SMB do `vault/distilled/` **lub** HTTP `POST /api/vault/save-note`.
- `POST /api/library/reindex` — VM robi tylko embed (nomic).
- Dokumenty Tier 3: `POST /api/library/upload` → Python reindex (lepsze EPUB/MOBI niż desktop v1).
- Agenci: MCP `:7862` → `search_library` na **master** `library.db` (54k+ chunków).

### 5.4 Vault → NAS → Brain reindex

- Użytkownik kopiuje `.pomnia` na NAS (backup).
- Brain **nie czyta** `.pomnia` bezpośrednio — potrzebny export/distill na PC z hasłem.
- Flow: otwórz vault na PC → distill/deploy → Brain reindex.
- Przyszłość: zaszyfrowany „vault sync" z kluczem użytkownika (nie w v1).

### 5.5 Przyszłość: mobile / web

| Surface | Rola | Ingest |
|---------|------|--------|
| **Landing** (`landing/`) | marketing, waitlist | brak ingest |
| **Mobile** | read-only vault browse? | export-only, distill na desktop |
| **Web Brain dashboard** | admin, upload, reindex | już istnieje na homelab |

---

## 6. Komponenty — mapa plików

### 6.1 `packages/doc-parser` (spike ✅)

| Plik | Stan |
|------|------|
| `src/pdf.ts` | `parsePdf()` via unpdf, sparse heurystyka |
| `src/index.ts` | eksport API |
| `src/types.ts` | `ParsedDocument`, tiers 1–3 |
| **Brak** | `parseDocx`, `parseDocument` router, mammoth |

### 6.2 `packages/brain-core`

| Plik | Stan | Docelowo |
|------|------|----------|
| `src/rag/indexer.ts` | `.md`/`.txt` only, `page_num=1` | `indexDocument(parsed)` z page_num |
| `src/rag/chunk.ts` | 1800/200, zgodność z Python | bez zmian |
| `src/rag/search.ts` | hybrid, `source=vault\|library` | library = non-.md paths |
| `src/storage/vault.ts` | distilled/sessions/USER | + library dirs |
| `src/storage/db.ts` | schema = Python library.db | bez migracji |
| `src/embedded.ts` | IPC: start, reindex, stop | + `index-document` |
| `src/mcp/tools/` | search_library, save_conversation, … | + opcjonalnie `ingest_document` |

### 6.3 `src/core` (Pomnia engine)

| Plik | Rola w łańcuchu |
|------|----------------|
| `vault.ts` | Zaszyfrowany store czatów |
| `import/archives.ts` | Eksporty asystentów → Conversation |
| `brain/distill.ts` | Czat → notatka md |
| `brain/localIndex.ts` | **Legacy parallel index** (JSON, chunk 1500) |
| `brain/deploy.ts` | Push do Brain + reindex |
| `brain/index.ts` | Orkiestracja pipeline |
| `backup.ts` | Collect → vault snapshot |

### 6.4 `src/main` + renderer

| Element | Stan |
|---------|------|
| IPC `import:toVault` | ✅ czaty |
| IPC `brain:run` | ✅ distill + index + deploy |
| IPC `doc:import` | 🔲 brak |
| `Import.tsx` | tylko eksporty czatów |
| `brainCore.ts` | fork embedded, reindex distilled dir |

### 6.5 Brain homelab (`reliqua-brain-hub`)

| Element | Rola |
|---------|------|
| `pipeline/rag.py` | Ekstrakcja PDF/EPUB/DOCX/… + chunk + embed |
| `dashboard/app.py` | `/api/library/upload`, `/api/library/reindex` |
| `dashboard/mcp_rag.py` | MCP tools dla agentów |
| `data/library/` | Oryginały książek/PDF (42 docs dziś) |
| `data/vault/distilled/` | Notatki z destylacji |

---

## 7. Search — gdzie co szuka

| Warstwa | API | Backend | `source` filter |
|---------|-----|---------|-----------------|
| Vault browse | `vault:searchText` | substring w RAM | tylko czaty |
| Local pre-index | `brain:search` / CLI | `.pomnia-index.json` + cosine | notatki distill |
| Embedded MCP | `search_library` | `library.db` lokalny | all / vault / library |
| Remote MCP | `search_library` :7862 | master `library.db` | all / vault / library |

**Semantyka `source` (brain-core = Python):**

- `vault` — ścieżki kończące się na `.md` (notatki destylowane)
- `library` — wszystko inne (PDF, EPUB, … po indeksacji)
- `all` — oba

---

## 8. Luki, duplikaty, sprzeczności

### 8.1 Brakujące (krytyczne dla dokumentów)

| # | Luka | Wpływ |
|---|------|-------|
| G1 | Brak `indexDocument()` i `page_num` per strona | PDF bez cytowania stron w RAG |
| G2 | Brak `vault/library/*` w brain-core | Brak miejsca na oryginały |
| G3 | Brak IPC `doc:import` + UI dokumentów | User nie ma ścieżki w GUI |
| G4 | `mammoth` nie dodany do doc-parser | Brak DOCX lokalnie |
| G5 | Dokumenty poza encrypted vault | Backup `.pomnia` nie obejmuje PDF usera |

### 8.2 Zduplikowane

| # | Duplikat | Rekomendacja |
|---|----------|--------------|
| D1 | `localIndex.ts` chunk 1500 vs `chunk.ts` 1800 | Docelowo: jeden indexer (brain-core); JSON index = cache/legacy |
| D2 | Dwa `library.db` (lokalny embedded vs homelab) | OK — sync via deploy + reindex; `merge-index` przyspieszy |
| D3 | `brainExport.ts` vs `distill.ts` output | Export = surowy transcript; distill = struktura — oba potrzebne |

### 8.3 Sprzeczności w docs/kodzie

| # | Sprzeczność | Rozstrzygnięcie |
|---|-------------|-----------------|
| C1 | `indexer.ts` komentarz: „PDF = library-server concern" vs `PDF-LOCAL.md` | **PDF-LOCAL wygrywa** — embedded MUSI parsować offline; komentarz w indexer.ts jest przestarzały |
| C2 | `brain-core/README.md`: „Phase 0 scaffolding only" | Nieaktualne — MCP+RAG działają; zaktualizować README |
| C3 | `PDF-LOCAL.md` Tier 3 = opendataloader Java | Brain Python używa PyMuPDF; Tier 3 = upload + Python extract |
| C4 | README: „distill na serwerze domyślnie" vs KVM doc: „distill na PC" | Produkt: **distill na PC** (GPU usera), serwer tylko embed — README do korekty |

---

## 9. Roadmap (fazy z zależnościami)

```
Phase 0 ── spike doc-parser (unpdf)          ✅ DONE
   │
Phase 1 ── doc-parser core                    │  ~2–3 dni
   │   mammoth, parseDocument(), frontmatter  │
   │   vault/library dirs w brain-core       │
   ▼
Phase 2 ── indexDocument + page_num           │  ~2 dni
   │   embedded IPC index-document            │
   ▼
Phase 3 ── UI + IPC doc:import                │  ~2 dni
   │   Import page sekcja Dokumenty           │
   ▼
─── v0.2 SHIPPABLE (offline PDF/DOCX) ───
   │
Phase 4 ── Tier 2 OCR / vision                │  ~4–5 dni
   │   sparse → prompt „uruchom OCR"         │
   ▼
Phase 5 ── Tier 3 remote upload + cache       │  ~1 dzień
   │   graceful degradation                  │
   ▼
Phase 6 ── EPUB lokalnie                      │  ~2 dni
   │
Phase 7 ── docs w encrypted vault (blob)      │  v1.0
   │
Phase 8 ── merge-index API (Brain)            │  zero re-embed deploy
   │
Phase 9 ── code repo ingest                   │  v1.x
```

### Co w której wersji

| Wersja | Zakres |
|--------|--------|
| **0.1 (dziś)** | Czaty: vault, import, distill, deploy, embedded brain-core, localIndex |
| **0.2** | Fazy 1–3: PDF text + DOCX offline, search `source=library` lokalnie |
| **0.3** | Tier 2 OCR, Tier 3 remote, EPUB lokalnie |
| **1.0** | Docs w vault backup, packaged exe validated, conflict resolution local↔remote |
| **1.x** | Code ingest, mobile read-only, `merge-index` |

### Zależności twarde

1. Phase 2 **wymaga** Phase 1 (extracted md musi istnieć).
2. UI (Phase 3) **wymaga** IPC z Phase 2.
3. Tier 2 **wymaga** `@napi-rs/canvas` w packaged build — test na `pack:win`.
4. Remote Tier 3 **wymaga** Brain online, ale **nie blokuje** v0.2 (graceful skip).

---

## 10. Test plan (akceptacja łańcucha)

### Czaty (regresja)

1. Import `claude.zip` → vault snapshot → distill → `search_library` trafny wynik.
2. Offline: vault browse + searchText bez sieci.
3. Auto-deploy → homelab `library/reindex` → Cursor MCP search.

### Dokumenty (v0.2+)

1. Digital PDF (arxiv) → `sparse: false` → chunk z `page_num`.
2. Skan → `sparse: true` → UI sugeruje OCR (v0.3).
3. DOCX z nagłówkami → markdown sensowny.
4. Airplane mode: import PDF → local search działa.
5. `npm run pack:win` na czystym PC — import bez Java/Python.
6. Brain online: upload tego samego PDF → lepszy wynik zapisany lokalnie (Tier 3 cache).

---

## 11. Decyzje architektoniczne (zamknięte)

| Decyzja | Wybór | Uzasadnienie |
|---------|-------|--------------|
| PDF lokalnie | **unpdf** | Zero native, działa w fork child |
| DOCX lokalnie | **mammoth** | Mały, pure JS |
| Java opendataloader | **NIE w exe** | +80–150 MB JRE |
| Distill dla docs | **NIE** | Bezpośredni index |
| Schema DB | **Bez migracji** | Kompatybilność z Python library.db |
| Chunking | **1800/200** (brain-core) | Parity z `pipeline/rag.py` |

---

## 12. Powiązane pliki (indeks)

```
packages/doc-parser/          spike PDF
packages/brain-core/          indexer, MCP, embedded fork
src/core/vault.ts             encrypted chat vault
src/core/import/archives.ts   chat export import
src/core/brain/distill.ts     chat → md
src/core/brain/localIndex.ts  JSON parallel index
src/core/brain/deploy.ts      push to homelab
src/main/brainCore.ts         fork lifecycle
src/main/index.ts             IPC handlers
src/renderer/pages/Import.tsx UI import (czaty only)
docs/PDF-LOCAL.md             parser deep-dive
docs/BRAIN-KVM-ARCHITECTURE.md split client/server
BRAIN-INTEGRATION.md          host-side pipeline analysis
```

---

*Ostatnia aktualizacja: audyt łańcucha 2026-07-08. Aktualizuj ten plik przy każdej fazie ingest dokumentów.*
