# Local PDF and document parsing (Pomnia desktop)

> **Goal:** Pomnia has to index PDF/DOCX **offline**, from the packaged installer, without requiring Java, Python or a homelab Brain. The Brain server (opendataloader-pdf) stays an optional Tier 3 and does not block v1.

## Context

| Where we are | Problem |
|-----------|---------|
| `distill` handles conversations only (Ollama JSON → `.md`) | No path for files |
| The `brain-core` indexer takes `.md` / `.txt` only | PDF/EPUB treated as a "library-server concern" |
| Homelab Brain uses opendataloader-pdf (Java) | Not always online, and not on every PC |

**Conclusion:** we need a separate `packages/doc-parser` module plus an extension to the indexing pipeline — independent of whether a server is available.

---

## 1. Options compared (Electron / Node, offline)

### Recommended ✅

| Library | Text | OCR | Native deps | Offline exe | Notes |
|------------|-------|-----|-------------|-------------|-------|
| **[unpdf](https://github.com/unjs/unpdf)** | ✅ | ❌ | **None** (bundled pdfjs) | ✅ | **v1 pick** — no canvas, works inside a forked child |
| **pdfjs-dist legacy** | ✅ | ❌ (rendering needs canvas) | `@napi-rs/canvas` optionally | ✅ | Lower level; unpdf wraps it |
| **mammoth** | DOCX ✅ | — | None | ✅ | Small, proven; the v1 choice for Word |
| **tesseract.js** | — | ✅ (images) | WASM ~4–8 MB per language | ✅* | *Needs pdfjs to render pages to canvas; slow on CPU |

### Acceptable later (v2+)

| Library | Problem for the installer |
|------------|-------------------------|
| **markitdown-ts** / **@markitdownjs/*** | Large dependency set (jsdom, xlsx…); PDF via pdf-parse; more formats, heavier bundle |
| **Ollama vision** (llava, moondream) | Ollama is already on the host; render pages with pdfjs and describe them — good for scans, slow |
| **scribe.js** | PDF+OCR in one; AGPL/commercial — check the licence before shipping |

### Avoid in the installer ❌

| Option | Why not |
|-------|--------------|
| **@opendataloader/pdf** | Needs **Java 11+** — either +80–150 MB of JRE or a requirement on the user |
| **Microsoft markitdown (Python)** | Python runtime plus pip extras; painful in electron-builder |
| **PyMuPDF sidecar** | Same problem as the Python brain — a second interpreter, and AV false positives |
| **docling** | IBM stack, ML models, Python — overkill for a desktop MVP |
| **@mote-software/markitdown** | Bundles a Python binary per platform — large, and a second runtime |
| **pdf-lib** | Creates and edits PDFs; does not extract text |
| **pdf2json** | JSON layout — brittle, and awkward to chunk for RAG |
| **pdf-parse** | A wrapper around pdfjs; **unpdf** is maintained and serverless-ready |
| **Windows print-to-text** | No API, non-deterministic, not cross-platform |

---

## 2. Architecture — three tiers

```
┌─────────────────────────────────────────────────────────────────┐
│  User: import PDF/DOCX (GUI / CLI / drag-drop)                  │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  @pomnia/doc-parser  (new workspace package)                    │
│  Tier 1: unpdf (text layer) + mammoth (docx) + markdown passthru│
│  Tier 2: pdfjs render → tesseract.js WASM (scanned pages)       │
│          or Ollama vision (when Ollama has a vision model)      │
│  Tier 3: HTTP → homelab Brain opendataloader (when online)      │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  vault/library/                                                 │
│    sources/     originals (pdf, docx)                           │
│    extracted/   {sha256}_{name}.md + frontmatter                │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  @pomnia/brain-core — indexFiles / indexDir                     │
│  chunk → nomic-embed-text (Ollama) → library.db                 │
│  search_library source=library                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Tier 1 — always local (v1)

- **PDF:** `unpdf` → text per page → markdown with `## Page N` headings
- **DOCX:** `mammoth` → markdown (tables flattened)
- **MD/TXT:** passthrough
- **Quality heuristic:** if the average is under 50 characters per page, mark `extraction: sparse` in the frontmatter — the signal for Tier 2

### Tier 2 — local, CPU/GPU (v1.1)

- Page rendering: `pdfjs-dist` + `@napi-rs/canvas` (only when doing OCR or vision)
- **OCR:** `tesseract.js` with `eng.traineddata` in `extraResources` (~4 MB)
- **Vision:** optionally Ollama `llava` / `moondream` on a page PNG — better quality than OCR, slower
- Run **on demand** per document, never on every start

### Tier 3 — remote, optional

- When `brainTarget === remote` and the endpoint answers:
  - `POST /api/library/upload` + opendataloader (the existing Python Brain)
  - or a dedicated `POST /api/library/parse` returning markdown
- Pomnia stores the result locally and indexes it in the embedded engine — an **offline cache**
- No server → Tier 1/2 without an error (graceful degradation)

---

## 3. Integration points in Pomnia

### New package: `packages/doc-parser`

```typescript
// API (proposed)
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

**v1 dependencies:** `unpdf`, `mammoth` — both pure JS, no native addons.

### `packages/brain-core`

| File | Change |
|------|--------|
| `src/storage/vault.ts` | `libraryDir: join(root, 'library')`, `librarySourcesDir`, `libraryExtractedDir` |
| `src/rag/indexer.ts` | `indexDocument(parsed: ParsedDocument)` — chunk per page (`page_num` from the PDF) |
| `src/embedded.ts` | New IPC message: `{ type: 'index-document', path }` |
| `src/mcp/tools/` | Optionally an `ingest_document` tool |

**Important:** today `indexFiles` sets `page_num = 1` for every chunk. For PDFs we need to chunk within a page, or tag each chunk with its page — the schema already has `page_num` (a legacy field from the Python RAG).

### Electron main (`src/main/`)

- `ipcMain.handle('doc:import', …)` — pick a file → parse → write the extracted markdown → `brainCore.indexDocument`
- Progress events: `doc:import-progress` (page N of M)
- CLI: `pomnia doc import <path>` in `src/cli/index.ts`

### Renderer

- The Import page: a "Documents" section beside the chat archives
- A listing of `vault/library/sources/` with extraction status

### Where the files land

| Location | Contents |
|-------------|-----------|
| `%AppData%/pomnia/brain-core-data/vault/library/sources/` | PDF/DOCX originals |
| `…/vault/library/extracted/` | `.md` with frontmatter |
| `…/vectordb/library.db` | RAG chunks (`pdf_path` = the source path) |

Extracted frontmatter (proposed):

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

## 4. Recommended v1 stack (shippable)

| Layer | Choice | Size / risk |
|---------|-------|------------------|
| PDF text | **unpdf** | no native code, ~2 MB in the bundle |
| DOCX | **mammoth** | ~200 KB |
| Index | existing **brain-core** + Ollama embed | unchanged |
| UI | Import page + IPC | S |
| OCR | **out of v1** | +8 MB per language, and slow on CPU |
| Java opendataloader | **Tier 3 remote only** | 0 in the exe |

**Why unpdf rather than raw pdfjs-dist:** unpdf bundles a serverless pdfjs that needs no `canvas` / `DOMMatrix` polyfills — which matters inside `child_process.fork` for brain-core and in the Electron main process.

**Why not markitdown-ts in v1:** a heavier dependency tree (jsdom, xlsx, the ai SDK) for formats v1 does not need (PPTX, YouTube…).

---

## 5. Rollout plan and estimates

| Phase | Scope | Effort |
|------|--------|--------|
| **0. Spike** | `packages/doc-parser` + unpdf + a test | **S** (done) |
| **1. Core** | parse PDF/DOCX → markdown + vault dirs | **M** (~2–3 days) |
| **2. Index** | `indexDocument` with `page_num`, embedded IPC | **M** (~2 days) |
| **3. UI** | Document import, progress, listing | **M** (~2 days) |
| **4. Tier 2 OCR** | tesseract + canvas rendering, sparse heuristic | **L** (~4–5 days) |
| **5. Tier 3 remote** | upload to Brain + local cache | **S** (~1 day, if the API is ready) |

**Shippable v1 = phases 0–3** → roughly **1 to 1.5 weeks** of focused work.

---

## 6. Risks and mitigations

| Risk | Mitigation |
|--------|-----------|
| Scanned PDFs with no text layer | Frontmatter `sparse: true` plus a UI prompt to "run OCR" (v1.1) |
| Large PDFs (500+ pages) | A page limit in v1 (say 200), batch progress, cancel |
| Electron asar + the pdfjs worker | Worker path via `extraResources` / `pathToFileURL` (as with brain-core staging) |
| Table quality in PDFs | Tier 1 is flat text; Tier 3 opendataloader handles tables when online |
| AV reacting to the tesseract WASM | `asarUnpack: **/*.wasm` is already in `electron-builder.yml` |

---

## 7. v1 test plan

1. **Digital PDF** (arxiv paper, invoice) — complete text, `sparse: false`
2. **Scan** — `sparse: true`, chunks empty or garbage → the UI suggests OCR
3. **DOCX** — headings and lists survive into markdown
4. **Offline** — airplane mode; import and `search_library` still work
5. **Packaged exe** — `npm run pack:win`, import a PDF on a clean PC
6. **Remote fallback** — Brain online → better markdown, cached locally

---

## 8. Spike: `packages/doc-parser`

A minimal workspace package with `parsePdf()` built on unpdf:

```bash
npm run build -w @pomnia/doc-parser
npm test -w @pomnia/doc-parser
```

Next step: wire it into `brain-core`'s `indexDocument()` and the `doc:import` IPC.

---

## Related files

- `packages/brain-core/src/rag/indexer.ts` — the indexer (today `.md`/`.txt` only)
- `packages/brain-core/src/embedded.ts` — the fork IPC protocol
- `packages/brain-core/src/storage/vault.ts` — vault layout
- `src/core/import/archives.ts` — chat import (a separate path from documents)
- `docs/BRAIN-KVM-ARCHITECTURE.md` — Tier 3 remote deploy
- `docs/BRAIN-INTEGRATION.md` — Python library upload (homelab; internal/historical)
