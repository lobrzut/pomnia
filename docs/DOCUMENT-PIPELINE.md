# Pomnia — Document Ingestion Pipeline (master doc)

> **Purpose:** one document describing the **whole chain** from a user action to RAG search — for chats (working today) and documents (under construction).  
> Related: [PDF-LOCAL.md](./PDF-LOCAL.md) (parser detail), [BRAIN-KVM-ARCHITECTURE.md](./BRAIN-KVM-ARCHITECTURE.md), [BRAIN-INTEGRATION.md](./BRAIN-INTEGRATION.md) (internal/historical).

**Audit state:** 2026-07-08 · repo `pomnia` plus patterns from `reliqua-brain-hub` (Python on 192.168.x.x).

---

## 1. Two "vaults" — do not confuse them

Pomnia works with **two independent stores** with different roles and different encryption:

| Store | Path | Encryption | Contents today | Intended contents |
|---------|---------|-------------|----------------|-------------------|
| **Pomnia Vault** | `*.pomnia/` (the user picks the folder) | AES-256-GCM + scrypt | Chat snapshots, raw assistant files | + PDF/DOCX originals + extracted .md as blobs |
| **Brain data dir** | `%AppData%/pomnia/brain-core-data/` or `~/.pomnia/brain` | Plaintext on disk (`library.db` chunks + distilled md) | `vault/distilled`, `vault/sessions`, `USER.md` | No plaintext sources — the RAG index only |
| **Encrypted backup** | NAS / a copy of `.pomnia` | Same as the vault | Full portability of chats and documents | Documents as vault blobs ✅ v0.2 |

**Publication rule:** the vault encryption code (`src/core/vault.ts`, `crypto.ts`) is in the public source under **AGPL-3.0-only**. User data — vaults, passphrases — never belongs in the repo; only locally, or in private backups.

---

## 2. Format and parser matrix

Legend: **L** = locally in Pomnia, **S** = homelab Brain server, **Q** = extraction quality, **Off** = works offline in the exe.

| Format | Local (Pomnia) | Server (Brain Python) | Q text | Q scan/tables | Off | Bundle / deps |
|--------|-----------------|----------------------|---------|---------------|-----|----------------|
| **PDF (text layer)** | `unpdf` ✅ spike | PyMuPDF (`fitz`) ✅ | good | poor (flat text) | ✅ | ~2 MB JS, no native code |
| **PDF (scan)** | Tier 2: `pdfjs`+`tesseract.js` 🔲 | OCR optional 🔲 | poor→fair | fair | ✅* | +8 MB WASM per language |
| **PDF (tables)** | Tier 1 = flat text | PyMuPDF = flat text | poor | poor | ✅ | — |
| **DOCX** | `mammoth` 🔲 v1 | `python-docx` ✅ | good | simplified | ✅ | ~200 KB JS |
| **MD / TXT** | passthrough ✅ | passthrough ✅ | full | — | ✅ | 0 |
| **HTML / HTM** | 🔲 (a BS4 equivalent) | BeautifulSoup ✅ | good | — | ✅ | markitdown-ts is heavy |
| **EPUB** | `fflate`+HTML ✅ v0.2 | `ebooklib`+BS4 ✅ | good | — | ✅ | ~100 KB JS (fflate) |
| **MOBI/AZW** | 🔲 v2+ | the `mobi` library ✅ | fair | — | partly | Python only today |
| **Images (PNG/JPG)** | Tier 2 OCR / Ollama vision 🔲 | 🔲 | depends on OCR | — | ✅ | vision is slow |
| **ZIP/7z archives** | 🔲 unpack → recurse | `zipfile`/`py7zr` ✅ | — | — | ✅ | fflate is already in chat import |
| **Chat exports** | `archives.ts` ✅ | `transcripts/` ✅ | N/A (→ distill) | — | ✅ | fflate |
| **Code repo / zip** | 🔲 v2 (tree walk + `.gitignore`) | the `code/*` API ✅ | good for code | — | ✅ | a separate `search_code` path |

**Note:** `docs/PDF-LOCAL.md` mentions **opendataloader-pdf (Java)** as Tier 3 — the current `reliqua-brain-hub` **does not have** that dependency; the server uses **PyMuPDF**. Tier 3 means uploading the file and letting Python reindex, not a separate Java parser.

---

## 3. Two pipelines — when to distil, when to index directly

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PATH A: CHATS (✅ working)                           │
└─────────────────────────────────────────────────────────────────────────────┘

  Live adapters          ZIP/JSON import
  (Claude Code,          (Claude.ai, ChatGPT,
   Cursor, …)             Grok, Gemini)
       │                        │
       └──────────┬─────────────┘
                  ▼
         ┌─────────────────┐
         │  Pomnia Vault   │  ← encrypted snapshots (.pomnia)
         │  vault.ts       │
         └────────┬────────┘
                  │ browse / searchText (substring, no GPU)
                  ▼
         ┌─────────────────┐     needs Ollama + a chat model
         │    DISTILL      │     qwen2.5:14b, JSON → an .md note
         │  distill.ts     │     quality gate: ok | stub | garbage
         └────────┬────────┘
                  ▼
         ┌─────────────────┐
         │  brain-notes/   │  staging: %AppData%/pomnia/brain-notes
         │  *.md           │  _review/ for low quality
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
│                    PATH B: DOCUMENTS (🔲 phases 1–3)                         │
└─────────────────────────────────────────────────────────────────────────────┘

  User: import PDF/DOCX (GUI / CLI / drag-drop)
                  │
                  ▼
         ┌─────────────────┐
         │ @pomnia/doc-parser│  Tier 1: unpdf + mammoth + passthrough
         │ parseDocument()   │  Tier 2: OCR / Ollama vision (on demand)
         └────────┬────────┘  Tier 3: POST to Brain upload (local cache)
                  ▼
         ┌─────────────────┐
         │ Pomnia Vault    │  sources + extracted → encrypted blobs
         │ library.cvb     │  manifest in .pomnia (AES-256-GCM)
         └────────┬────────┘
                  │  parse and index once at import time (in RAM)
                  ▼
         ┌─────────────────┐
         │ brain-core      │  indexDocument() with page_num per page
         │ chunk → embed   │  nomic-embed-text (Ollama)
         └────────┬────────┘
                  ▼
            library.db  →  search_library source=library
```

**The rule:** **distil** only **dialogue** (chats). **Index directly** anything that is **already written prose** (PDF/DOCX/EPUB/MD). Mixing the two is a design error — an LLM should not "summarise" a report that is already written unless the user asks for it.

### 3.1 Distill vs `save_conversation` (live chat)

| | **`save_conversation` (MCP, in a chat)** | **Distill (Pomnia)** |
|---|---|---|
| **When** | The agent calls it at the end of a session ("save to brain"), or from a rule in `.cursor/rules` | Manually, or "distill backlog" in the Brain tab, or the CLI `brain pipeline` |
| **Input** | What the agent *remembers* from the current conversation | The **raw log** from an adapter (Antigravity's `transcript.jsonl`, Cursor's DB) |
| **Who writes the note** | The agent in the chat (Cursor/Claude/Antigravity) | Local Ollama (qwen) — in batch, after the fact |
| **Where the file lands** | `vault/sessions/` · `saved_via: mcp_save_conversation` | staging `%AppData%/pomnia/brain-notes/` → deploy → `vault/distilled/` · `distilled_via: pomnia` |
| **Full transcript?** | **No** — a structured summary only (Summary, Decisions, Files, Commands…) | **No** — also a summary, but drawn from the whole log (head+tail up to ~12k characters) |
| **RAG index** | After a reindex → chunks in `library.db` | The same (plus a local `.pomnia-index.json` immediately after distillation) |

**These are not the same files.** Different folder, different name, different author. One session *may* have both — that is not a 1:1 duplicate, it is two descriptions of the same chat.

**Why distil at all, if the agent saves during the chat?** Because most sessions **never** get a `save_conversation` — only the ones where you ask, or a rule fires. Distillation covers **every** collected conversation retroactively. A ledger (`distill-ledger.json`) makes sure the same session is not processed twice.

### 3.2 The Brain bridge (`brainExport`) — when, and when not

UI: **Settings → Brain bridge** (`Settings.tsx`). Code: `core/brainExport.ts`, IPC `brain:export`.

| | **Brain bridge** | **Distill + deploy** | **`save_conversation`** |
|---|---|---|---|
| **What it does** | Writes the **full transcript** of every message as `.md` | Ollama produces a **summary** (Summary, Decisions, …) and sends it to the server | The agent in the chat writes a **summary** at the end of a session |
| **Where the data comes from** | One chosen **snapshot** from the Pomnia vault | Every conversation (or the backlog) from adapters / the vault | The current conversation in Cursor/Claude |
| **Where it lands** | `vault/sessions/` · `exported_via: pomnia` | `vault/distilled/` · `distilled_via: pomnia` | `vault/sessions/` · `saved_via: mcp_save_conversation` |
| **LLM / Ollama** | No | Yes (locally) | Yes (the agent in the chat) |
| **RAG reindex** | Manually on the Brain server after dropping the files in | Automatically on deploy | After a reindex |

**When to use the bridge:** a quick dump of raw conversations into a Brain folder (say an SMB mount on `…/vault/sessions`), without Ollama, when you want to keep **all** the text — distillation trims long logs. **When to skip it:** the normal flow is the **Brain** tab → "Prepare memory" → "Send to the searcher"; or the agent already calls `save_conversation`. A snapshot with **0 chats** (Claude Desktop without agent mode) has nothing to export.

**Claude Desktop · 0 chats:** ordinary Desktop chat lives in Anthropic's cloud. Pomnia only extracts conversations from local JSONL (`claude-code-sessions`, `local-agent-mode-sessions`, `claude-code`). Without those folders a snapshot has configuration files (MCP, restore) but **no conversations**.

---

## 4. End-to-end diagram (mermaid)

```mermaid
flowchart TB
  subgraph sources [Sources]
    LIVE[Live adapters<br/>Claude Code, Cursor, …]
    IMP[Import archives<br/>ZIP/JSON exports]
    DOC[Documents<br/>PDF DOCX EPUB MD]
  end

  subgraph pomnia [Pomnia Desktop]
    PV[(Pomnia Vault<br/>encrypted .pomnia)]
    DP[@pomnia/doc-parser<br/>Tier 1-3]
    LIB[library.cvb<br/>encrypted doc blobs]
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

### Encryption boundaries

| Stage | Plaintext | Encrypted |
|------|-----------|--------------|
| Reading from Cursor/Claude | ✅ on the host | — |
| Writing a snapshot | — | ✅ vault blobs |
| Distillation (Ollama) | ✅ RAM + staging md | — |
| doc-parser extraction | ✅ RAM at import time | ✅ source + extracted blobs in the vault |
| brain-core-data on disk | ✅ library.db chunks, distilled md | ✅ PDF/DOCX originals in the vault |
| Deploy to the Brain VM | ✅ SMB/HTTP | up to the VM's admin |
| `.pomnia` on a NAS | — | ✅ always (chats and documents) |

### Performance: the cost of encrypting documents

Document encryption is paid **at import time only**, never in the search loop:

- **The KDF (scrypt)** runs when the vault is **unlocked**, once per open.
- For every imported file we write **two blobs** into the vault (the original plus the extracted `.md`). AES-256-GCM over buffers of around 5 MB typically costs **milliseconds** including the write, with no jitter in the UI.
- **Search** uses the chunks and embeddings already in `library.db` — we do not decrypt a PDF or DOCX on every query.

**Conclusion:** no noticeable effect on search UX, and documents stay encrypted at rest.

---

## 5. Integration modes

### 5.1 Pure offline Pomnia

- Vault + browse + `vault:searchText` (substring).
- **Without** Ollama: no distillation, no embedding, no semantic search.
- Documents: after phases 1–3 — parse plus embedded brain-core, **if** the user enables a local Ollama for `nomic-embed-text` alone (~274 MB).

### 5.2 Pomnia + local Ollama (the default power user)

- Distillation on the host GPU (qwen2.5:14b).
- A JSON pre-index (`localIndex.ts`) — immediate search over the notes.
- An embedded `brain-core` fork → `library.db` plus MCP on `127.0.0.1:7862` for Cursor / Claude Code.
- Documents: parsed offline, indexed into the same `library.db`.

### 5.3 Pomnia + a homelab Brain online (remote master)

- Distil locally → auto-deploy (`deployDistilledToBrain`).
- SMB into `vault/distilled/` **or** HTTP `POST /api/vault/save-note`.
- `POST /api/library/reindex` — the VM only embeds (nomic).
- Documents at Tier 3: `POST /api/library/upload` → Python reindex (better EPUB/MOBI than desktop v1).
- Agents: MCP `:7862` → `search_library` against the **master** `library.db` (54k+ chunks).

### 5.4 Vault → NAS → Brain reindex

- The user copies `.pomnia` to the NAS (a backup).
- Brain **does not read** `.pomnia` directly — an export or distillation on a PC with the passphrase is required.
- Flow: open the vault on the PC → distil/deploy → Brain reindex.
- Future: an encrypted "vault sync" keyed to the user (not in v1).

### 5.5 Future: mobile / web

| Surface | Role | Ingest |
|---------|------|--------|
| **Landing** (outside this repo — Cloudflare / pomnia.ai) | marketing | no ingest |
| **Mobile** | read-only vault browsing? | export only, distillation on the desktop |
| **Web Brain dashboard** | admin, upload, reindex | already exists in the homelab |

---

## 6. Components — file map

### 6.1 `packages/doc-parser` (spike ✅)

| File | State |
|------|------|
| `src/pdf.ts` | `parsePdf()` via unpdf, sparse heuristic |
| `src/index.ts` | API exports |
| `src/types.ts` | `ParsedDocument`, tiers 1–3 |
| **Missing** | `parseDocx`, the `parseDocument` router, mammoth |

### 6.2 `packages/brain-core`

| File | State | Intended |
|------|------|----------|
| `src/rag/indexer.ts` | `.md`/`.txt` only, `page_num=1` | `indexDocument(parsed)` with real page numbers |
| `src/rag/chunk.ts` | 1800/200, matching Python | unchanged |
| `src/rag/search.ts` | hybrid, `source=vault\|library` | library = non-`.md` paths |
| `src/storage/vault.ts` | distilled/sessions/USER | + library dirs |
| `src/storage/db.ts` | schema = the Python library.db | no migration |
| `src/embedded.ts` | IPC: start, reindex, stop | + `index-document` |
| `src/mcp/tools/` | search_library, save_conversation, … | + optionally `ingest_document` |

### 6.3 `src/core` (the Pomnia engine)

| File | Role in the chain |
|------|----------------|
| `vault.ts` | Encrypted chat store |
| `import/archives.ts` | Assistant exports → Conversation |
| `brain/distill.ts` | Chat → markdown note |
| `brain/localIndex.ts` | **Legacy parallel index** (JSON, chunk 1500) |
| `brain/deploy.ts` | Push to Brain + reindex |
| `brain/index.ts` | Pipeline orchestration |
| `backup.ts` | Collect → vault snapshot |

### 6.4 `src/main` + renderer

| Element | State |
|---------|------|
| IPC `import:toVault` | ✅ chats |
| IPC `brain:run` | ✅ distill + index + deploy |
| IPC `doc:import` | 🔲 missing |
| `Import.tsx` | chat exports only |
| `brainCore.ts` | utilityProcess/fork embedded, reindex of the distilled dir |

### 6.5 Homelab Brain (`reliqua-brain-hub`)

| Element | Role |
|---------|------|
| `pipeline/rag.py` | PDF/EPUB/DOCX extraction + chunk + embed |
| `dashboard/app.py` | `/api/library/upload`, `/api/library/reindex` |
| `dashboard/mcp_rag.py` | MCP tools for agents |
| `data/library/` | Book and PDF originals (42 documents today) |
| `data/vault/distilled/` | Distilled notes |

---

## 7. Search — what looks where

| Layer | API | Backend | `source` filter |
|---------|-----|---------|-----------------|
| Vault browse | `vault:searchText` | substring in RAM | chats only |
| Local pre-index | `brain:search` / CLI | `.pomnia-index.json` + cosine | distilled notes |
| Embedded MCP | `search_library` | local `library.db` | all / vault / library |
| Remote MCP | `search_library` :7862 | master `library.db` | all / vault / library |

**`source` semantics (brain-core = Python):**

- `vault` — paths ending in `.md` (distilled notes)
- `library` — everything else (PDF, EPUB, … once indexed)
- `all` — both

---

## 8. Gaps, duplicates, contradictions

### 8.1 Missing (critical for documents)

| # | Gap | Impact |
|---|------|-------|
| G1 | No `indexDocument()` and no per-page `page_num` | PDFs cannot cite pages in RAG |
| G2 | No `vault/library/*` in brain-core | Nowhere to put originals |
| G3 | No `doc:import` IPC and no document UI | Users have no path in the GUI |
| G4 | `mammoth` not added to doc-parser | No DOCX locally |
| G5 | ~~Documents outside the encrypted vault~~ | ✅ v0.2 — blobs in `library.cvb` |

### 8.2 Duplicated

| # | Duplicate | Recommendation |
|---|----------|--------------|
| D1 | `localIndex.ts` chunks at 1500 vs `chunk.ts` at 1800 | Eventually: one indexer (brain-core); the JSON index becomes cache/legacy |
| D2 | Two `library.db` files (local embedded vs homelab) | Fine — synced by deploy + reindex; `merge-index` would speed it up |
| D3 | `brainExport.ts` vs `distill.ts` output | Export is the raw transcript; distillation is structure — both are needed |

### 8.3 Contradictions in docs and code

| # | Contradiction | Resolution |
|---|-------------|-----------------|
| C1 | The `indexer.ts` comment "PDF = library-server concern" vs `PDF-LOCAL.md` | **PDF-LOCAL wins** — embedded MUST parse offline; the comment in indexer.ts is stale |
| C2 | `brain-core/README.md`: "Phase 0 scaffolding only" | Out of date — MCP and RAG work; update the README |
| C3 | `PDF-LOCAL.md` Tier 3 = opendataloader Java | The Python Brain uses PyMuPDF; Tier 3 is upload plus Python extraction |
| C4 | README: "distillation on the server by default" vs the KVM doc: "distillation on the PC" | Product decision: **distillation on the PC** (the user's GPU); the server only embeds — the README needs correcting |

---

## 9. Roadmap (phases with dependencies)

```
Phase 0 ── doc-parser spike (unpdf)           ✅ DONE
   │
Phase 1 ── doc-parser core                    │  ~2–3 days
   │   mammoth, parseDocument(), frontmatter  │
   │   vault/library dirs in brain-core       │
   ▼
Phase 2 ── indexDocument + page_num           │  ~2 days
   │   embedded IPC index-document            │
   ▼
Phase 3 ── UI + IPC doc:import                │  ~2 days
   │   Documents section on the Import page   │
   ▼
─── v0.2 SHIPPABLE (offline PDF/DOCX) ───
   │
Phase 4 ── Tier 2 OCR / vision                │  ~4–5 days
   │   sparse → prompt to "run OCR"           │
   ▼
Phase 5 ── Tier 3 remote upload + cache       │  ~1 day
   │   graceful degradation                   │
   ▼
Phase 6 ── EPUB locally                       │  ~2 days
   │
Phase 7 ── documents in the encrypted vault   │  ✅ v0.2
   │
Phase 8 ── merge-index API (Brain)            │  deploy with zero re-embedding
   │
Phase 9 ── code repo ingest                   │  v1.x
```

### What ships in which version

| Version | Scope |
|--------|--------|
| **0.1 (today)** | Chats: vault, import, distill, deploy, embedded brain-core, localIndex |
| **0.2** | Phases 1–3: PDF text + DOCX offline, encrypted vault blobs, local `source=library` search |
| **0.3** | Tier 2 OCR, Tier 3 remote, EPUB locally |
| **1.0** | Packaged exe validated, conflict resolution between local and remote |
| **1.x** | Code ingest, read-only mobile, `merge-index` |

### Hard dependencies

1. Phase 2 **requires** Phase 1 (the extracted markdown has to exist).
2. The UI (Phase 3) **requires** the IPC from Phase 2.
3. Tier 2 **requires** `@napi-rs/canvas` in the packaged build — test with `pack:win`.
4. Remote Tier 3 **requires** Brain online, but does **not** block v0.2 (it skips gracefully).

---

## 10. Test plan (chain acceptance)

### Chats (regression)

1. Import `claude.zip` → vault snapshot → distil → `search_library` returns the right hit.
2. Offline: vault browse and searchText with no network.
3. Auto-deploy → homelab `library/reindex` → Cursor MCP search.

### Documents (v0.2+)

1. A digital PDF (arxiv) → `sparse: false` → chunks carrying `page_num`.
2. A scan → `sparse: true` → the UI suggests OCR (v0.3).
3. A DOCX with headings → sensible markdown.
4. Airplane mode: import a PDF → local search still works.
5. `npm run pack:win` on a clean PC — import with no Java and no Python.
6. Brain online: upload the same PDF → a better result, cached locally (Tier 3).

---

## 11. Architectural decisions (closed)

| Decision | Choice | Rationale |
|---------|-------|--------------|
| PDF locally | **unpdf** | No native code, works in a forked child |
| DOCX locally | **mammoth** | Small, pure JS |
| Java opendataloader | **NOT in the exe** | +80–150 MB of JRE |
| Distillation for documents | **NO** | Index them directly |
| DB schema | **No migration** | Compatibility with the Python library.db |
| Chunking | **1800/200** (brain-core) | Parity with `pipeline/rag.py` |

---

## 12. Related files (index)

```
packages/doc-parser/          PDF spike
packages/brain-core/          indexer, MCP, embedded fork
src/core/vault.ts             encrypted chat vault
src/core/import/archives.ts   chat export import
src/core/brain/distill.ts     chat → md
src/core/brain/localIndex.ts  JSON parallel index
src/core/brain/deploy.ts      push to the homelab
src/main/brainCore.ts         utilityProcess / fork lifecycle
src/main/index.ts             IPC handlers
src/renderer/pages/Import.tsx import UI (chats only)
docs/PDF-LOCAL.md             parser deep dive
docs/BRAIN-KVM-ARCHITECTURE.md client/server split
docs/BRAIN-INTEGRATION.md     host-side pipeline analysis (internal/historical)
```

---

## 13. Product decisions (2026-07-08)

Closed choices from a review with the product owner:

| Topic | Decision | Rationale |
|-------|---------|--------------|
| **PDF backup** | Encrypted document blobs in the vault **immediately (v0.2)** | No "plaintext deferral": the source and the extracted `.md` both land in `.pomnia`, and `library.db` gets finished chunks for search. |
| **Index** | **`library.db` is the single source of truth** long term; the `localIndex` JSON is optional fast staging during migration; **new document imports go only through `indexDocument` → library.db** | One chunker (1800/200), one embedder, one MCP `search_library`; avoids drift between JSON and SQLite |
| **OCR (Phase 4)** | **Both** — `tesseract.js` offline by default; upgrade to Ollama vision when Ollama is available; the UI shows which path was used | Offline-first, with better quality when a GPU and a vision model are to hand; does not block v0.2 |

**v0.2 scope (phases 1–3 — shipped in that commit):**

- `@pomnia/doc-parser`: mammoth plus a `parseDocument()` router (pdf/docx/md/txt)
- `brain-core`: `indexDocument()` with `page_num` per PDF page
- `vault/library.cvb` (encrypted blobs: the original plus the extracted `.md`)
- IPC `doc:import` plus a "Documents" section in Import
- OCR: a stub/hook only (`ocr.ts`, `suggestOcr`) — implementation in Phase 4

---

*Last updated: v0.2 doc import MVP, 2026-07-08. Update this file at every document ingest phase.*
