# Lokalne parsowanie PDF i dokumentów (Pomnia desktop)

> **Cel:** Pomnia musi indeksować PDF/DOCX **offline**, w spakowanym instalatorze, bez wymagania Javy, Pythona ani homelab Brain. Serwer Brain (opendataloader-pdf) zostaje opcjonalnym Tier 3 — nie blokującym v1.

## Kontekst

| Stan dziś | Problem |
|-----------|---------|
| `distill` = tylko rozmowy (Ollama JSON → `.md`) | Brak ścieżki dla plików |
| `brain-core` indexer = `.md` / `.txt` tylko | PDF/EPUB „library-server concern" |
| Homelab Brain = opendataloader-pdf (Java) | Nie zawsze online / nie na każdym PC |

**Wniosek:** potrzebny jest osobny moduł `packages/doc-parser` + rozszerzenie pipeline indeksowania — niezależnie od dostępności serwera.

---

## 1. Porównanie opcji (Electron / Node, offline)

### Rekomendowane ✅

| Biblioteka | Tekst | OCR | Native deps | Offline exe | Uwagi |
|------------|-------|-----|-------------|-------------|-------|
| **[unpdf](https://github.com/unjs/unpdf)** | ✅ | ❌ | **Brak** (bundled pdfjs) | ✅ | **v1 pick** — zero canvas, działa w fork child |
| **pdfjs-dist legacy** | ✅ | ❌ (render wymaga canvas) | `@napi-rs/canvas` opcjonalnie | ✅ | Niższy poziom; unpdf to wrapper |
| **mammoth** | DOCX ✅ | — | Brak | ✅ | Mały, sprawdzony; v1 dla Word |
| **tesseract.js** | — | ✅ (obrazy) | WASM ~4–8 MB/lang | ✅* | *Wymaga renderu stron pdfjs→canvas; wolne CPU |

### Akceptowalne później (v2+)

| Biblioteka | Problem dla instalatora |
|------------|-------------------------|
| **markitdown-ts** / **@markitdownjs/*** | Duży zestaw zależności (jsdom, xlsx…); PDF przez pdf-parse; więcej formatów, ale cięższy bundle |
| **Ollama vision** (llava, moondream) | Już mamy Ollama na hoście; render stron pdfjs + opis — dobre dla skanów, wolne |
| **scribe.js** | PDF+OCR w jednym; AGPL/commercial — sprawdzić licencję przed produkcją |

### Unikać w instalatorze ❌

| Opcja | Dlaczego nie |
|-------|--------------|
| **@opendataloader/pdf** | Wymaga **Java 11+** — +80–150 MB JRE lub wymóg instalacji u usera |
| **Microsoft markitdown (Python)** | Python runtime + pip extras; trudne w electron-builder |
| **PyMuPDF sidecar** | Ten sam problem co Python brain — osobny interpreter, AV false positives |
| **docling** | IBM stack, modele ML, Python — overkill na desktop MVP |
| **@mote-software/markitdown** | Bundluje Python binary per platforma — duży, drugi runtime |
| **pdf-lib** | Tworzenie/edycja PDF, nie ekstrakcja tekstu |
| **pdf2json** | JSON layout — kruche, trudne do chunkingu RAG |
| **pdf-parse** | Opakowanie pdfjs; **unpdf** jest utrzymywany i serverless-ready |
| **Windows Print-to-text** | Brak API, niedeterministyczne, nie cross-platform |

---

## 2. Architektura — trzy tiery

```
┌─────────────────────────────────────────────────────────────────┐
│  User: Import PDF/DOCX (GUI / CLI / drag-drop)                  │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  @pomnia/doc-parser  (nowy workspace package)                   │
│  Tier 1: unpdf (text layer) + mammoth (docx) + passthrough md   │
│  Tier 2: pdfjs render → tesseract.js WASM (scanned pages)       │
│          lub Ollama vision (jeśli Ollama + model vision)        │
│  Tier 3: HTTP → Brain homelab opendataloader (gdy online)       │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  vault/library/                                                 │
│    sources/     oryginały (pdf, docx)                           │
│    extracted/   {sha256}_{name}.md + frontmatter                │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  @pomnia/brain-core — indexFiles / indexDir                     │
│  chunk → nomic-embed-text (Ollama) → library.db                 │
│  search_library source=library                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Tier 1 — zawsze lokalnie (v1)

- **PDF:** `unpdf` → tekst per strona → markdown z nagłówkami `## Page N`
- **DOCX:** `mammoth` → markdown (tabele uproszczone)
- **MD/TXT:** passthrough
- **Heurystyka jakości:** jeśli średnio &lt; 50 znaków/stronę → oznacz `extraction: sparse` w frontmatter (sygnał dla Tier 2)

### Tier 2 — lokalnie + CPU/GPU (v1.1)

- Render strony: `pdfjs-dist` + `@napi-rs/canvas` (tylko gdy OCR/vision)
- **OCR:** `tesseract.js` + `eng.traineddata` w `extraResources` (~4 MB)
- **Vision:** opcjonalnie Ollama `llava` / `moondream` na PNG strony — lepsza jakość niż OCR, wolniejsze
- Uruchamiane **on-demand** per dokument, nie przy każdym starcie

### Tier 3 — zdalnie, opcjonalnie

- Gdy `brainTarget === remote` i endpoint odpowiada:
  - `POST /api/library/upload` + opendataloader (istniejący Python Brain)
  - Lub dedykowany `POST /api/library/parse` zwracający markdown
- Pomnia zapisuje wynik lokalnie i indeksuje embedded — **cache offline**
- Brak serwera → Tier 1/2 bez błędu (graceful degradation)

---

## 3. Punkty integracji w Pomnia

### Nowy pakiet: `packages/doc-parser`

```typescript
// API (propozycja)
export interface ParsedPage { page: number; text: string }
export interface ParsedDocument {
  sourcePath: string
  format: 'pdf' | 'docx' | 'md' | 'txt'
  pages: ParsedPage[]
  markdown: string
  meta: { tier: 1 | 2 | 3; sparse: boolean; charCount: number }
}

export async function parseDocument(path: string, opts?: ParseOptions): Promise<ParsedDocument>
```

**Zależności v1:** `unpdf`, `mammoth` — obie pure JS, bez native addonów.

### `packages/brain-core`

| Plik | Zmiana |
|------|--------|
| `src/storage/vault.ts` | `libraryDir: join(root, 'library')`, `librarySourcesDir`, `libraryExtractedDir` |
| `src/rag/indexer.ts` | `indexDocument(parsed: ParsedDocument)` — chunk per page (`page_num` z PDF) |
| `src/embedded.ts` | Nowy IPC: `{ type: 'index-document', path }` |
| `src/mcp/tools/` | Opcjonalnie `ingest_document` tool |

**Ważne:** dziś `indexFiles` ustawia `page_num = 1` dla wszystkich chunków. Dla PDF trzeba chunkować w obrębie strony lub tagować chunk metadanym strony — schema już ma `page_num` (legacy z Python RAG).

### Electron main (`src/main/`)

- `ipcMain.handle('doc:import', …)` — wybór pliku → parse → zapis extracted → `brainCore.indexDocument`
- Progress events: `doc:import-progress` (strona N/M)
- CLI: `pomnia doc import <path>` w `src/cli/index.ts`

### Renderer

- Strona Import: sekcja „Dokumenty" obok archiwów czatów
- Lista `vault/library/sources/` + status ekstrakcji

### Gdzie lądują pliki

| Lokalizacja | Zawartość |
|-------------|-----------|
| `%AppData%/Pomnia/brain-core-data/vault/library/sources/` | Oryginały PDF/DOCX |
| `…/vault/library/extracted/` | `.md` z frontmatter |
| `…/vectordb/library.db` | Chunki RAG (`pdf_path` = ścieżka źródła) |

Frontmatter extracted (propozycja):

```yaml
---
source_file: report-Q1.pdf
source_sha256: abc123…
format: pdf
extraction_tier: 1
extraction_sparse: false
pages: 42
imported_at: 2026-07-08T18:00:00Z
imported_via: pomnia
---
```

---

## 4. Rekomendowany stack v1 (shippable)

| Warstwa | Wybór | Rozmiar / ryzyko |
|---------|-------|------------------|
| PDF text | **unpdf** | ~0 native, ~2 MB w bundle |
| DOCX | **mammoth** | ~200 KB |
| Indeks | istniejący **brain-core** + Ollama embed | bez zmian |
| UI | Import page + IPC | S |
| OCR | **poza v1** | +8 MB lang + wolne CPU |
| Java opendataloader | **tylko Tier 3 remote** | 0 w exe |

**Dlaczego unpdf a nie surowy pdfjs-dist:** unpdf bundluje serverless pdfjs bez wymogu `canvas` / `DOMMatrix` polyfillów — krytyczne w `child_process.fork` brain-core i Electron main.

**Dlaczego nie markitdown-ts w v1:** cięższy dependency tree (jsdom, xlsx, ai SDK) dla formatów których v1 nie potrzebuje (PPTX, YouTube…).

---

## 5. Plan wdrożenia i estymaty

| Faza | Zakres | Effort |
|------|--------|--------|
| **0. Spike** | `packages/doc-parser` + unpdf + test | **S** (done) |
| **1. Core** | parse PDF/DOCX → markdown + vault dirs | **M** (~2–3 dni) |
| **2. Index** | `indexDocument` z `page_num`, embedded IPC | **M** (~2 dni) |
| **3. UI** | Import dokumentów, progress, lista | **M** (~2 dni) |
| **4. Tier 2 OCR** | tesseract + canvas render, heurystyka sparse | **L** (~4–5 dni) |
| **5. Tier 3 remote** | upload do Brain + cache lokalny | **S** (~1 dzień, jeśli API gotowe) |

**v1 shippable = fazy 0–3** → **~1–1.5 tygodnia** focused work.

---

## 6. Ryzyka i mitigacje

| Ryzyko | Mitigacja |
|--------|-----------|
| Skanowane PDF bez warstwy tekstu | Frontmatter `sparse: true` + prompt w UI „uruchom OCR" (v1.1) |
| Duże PDF (500+ stron) | Limit stron w v1 (np. 200), batch progress, cancel |
| Electron asar + pdfjs worker | Worker path via `extraResources` / `pathToFileURL` (jak brain-core staging) |
| Jakość tabel w PDF | Tier 1 = płaski tekst; Tier 3 opendataloader dla tabel gdy online |
| AV na tesseract WASM | `asarUnpack: **/*.wasm` już w `electron-builder.yml` |

---

## 7. Test plan v1

1. **Digital PDF** (arxiv, faktura) — tekst kompletny, `sparse: false`
2. **Skan** — `sparse: true`, chunki puste lub śmieci → UI sugeruje OCR
3. **DOCX** — nagłówki i listy w markdown
4. **Offline** — airplane mode, import + search_library działa
5. **Packaged exe** — `npm run pack:win`, import PDF na czystym PC
6. **Remote fallback** — Brain online → lepszy markdown, zapisany lokalnie

---

## 8. Spike: `packages/doc-parser`

Minimalny pakiet workspace z `parsePdf()` opartym o unpdf:

```bash
npm run build -w @pomnia/doc-parser
npm test -w @pomnia/doc-parser
```

Kolejny krok: podpiąć pod `brain-core` `indexDocument()` i IPC `doc:import`.

---

## Powiązane pliki

- `packages/brain-core/src/rag/indexer.ts` — indexer (dziś tylko `.md`/`.txt`)
- `packages/brain-core/src/embedded.ts` — fork IPC protocol
- `packages/brain-core/src/storage/vault.ts` — layout vault
- `src/core/import/archives.ts` — import czatów (osobna ścieżka niż docs)
- `docs/BRAIN-KVM-ARCHITECTURE.md` — Tier 3 remote deploy
- `BRAIN-INTEGRATION.md` — Python library upload (homelab)
