# Continuum × Brain — analiza i host-side pipeline

Analiza Twojego BRAIN (przez API dashboardu :7860 + dane w vault, 2026-06-11) i projekt, jak Continuum staje się **on-rampem**: wciąga rozproszoną wiedzę, **destyluje i wstępnie indeksuje na hoście**, a do brain wrzuca gotowy produkt.

## 1. Jak działa BRAIN (zrekonstruowane)

```
ŹRÓDŁA                INGEST (VM, Ollama)                    RAG
exporty ZIP  ─┐                                        ┌─ search_library
(claude.zip,  ├─► brain-raw/inbox ─► transcripts/run ──┤   (vector top-k)
 grok.zip)    │     (1668 sesji!)     distill qwen2.5   │
claude-code ──┘                       ↓                 │
                              vault/{distilled,sessions,│
                                notes,digests} 1682 md  │
                                      ↓                 │
                              library/reindex ──────────┘
                              embed nomic-embed-text → vectordb/library.db (307 MB)
```

Komponenty (z `/api/status` + `/openapi.json`):
- **Dashboard** FastAPI :7860 — pełne API: `transcripts/*` (ingest+distill), `vault/*` (save-chat, notes, read, redistill, quality, dedupe), `library/*` (upload, reindex, search, status), `skills/*`, `code/*`, `user-profile/*`, `agents/*`, `schedule/*`.
- **MCP** mcp-proxy :7862 (SSE) — wystawia brain-rag/vault/library zdalnym agentom.
- **Ollama** docker :11434 — **32 modele** (qwen2.5:14b default chat, nomic-embed-text dla embeddingów, do deepseek-r1:32b/qwen3:30b). 2× RTX 3060 (24 GB).
- **Vault** `/opt/BRAIN/data/vault` — 1682 notatki md (frontmatter + Summary/Decisions/Solutions/Facts/Open Questions).
- **vectordb** `library.db` 307 MB. **Library** 42 PDF/EPUB (sec/trading).

## 2. Gdzie jest luka (i okazja)

- **Inbox czeka z ~1668 sesjami** (claude.zip 1188 + grok.zip 480) — niezdestylowane. To dosłownie „wiedza, którą już masz, ale z której jeszcze nie czerpiesz".
- Destylacja na VM ≈ **83 s/sesja** (qwen2.5:14b) → 1668 sesji ≈ **~38 h GPU VM**. Dysk VM **85%** (1930/2282 GB).
- Twój box ma **RX 6800 16 GB** (ROCm/Vulkan) — często bezczynny. Naturalne: **przerzucić destylację+indeksację na host**, do brain słać gotowe notatki (lekki embed) albo gotowe wektory (zero embeddingu).
- Dla *kogokolwiek* z lokalnym Ollama to ten sam wzorzec → feature adopcyjny brain jako produktu.

## 3. Rola Continuum: Collect → Distill → Pre-index → Deploy

| Etap | Co robi Continuum (na hoście) | Moduł |
|---|---|---|
| **Collect** | normalizuje rozmowy z żywych asystentów | `core/adapters` |
| **Import** | wciąga eksporty Claude.ai/ChatGPT/Grok/Gemini (ZIP/JSON/JSONL/MD) | `core/import/archives.ts` |
| **Distill** | każda rozmowa → notatka w **schemacie brain** przez lokalny Ollama (qwen2.5:14b), JSON-mode, sanityzacja surrogatów | `core/brain/distill.ts` |
| **Pre-index** | embed `nomic-embed-text` → przenośny index JSON → **natychmiastowy lokalny RAG** nad wiedzą | `core/brain/localIndex.ts` |
| **Deploy** | (a) zapis notatek do vault dir + `library/reindex`, lub (b) `vault/save-chat` (brain destyluje) | `core/brain/deploy.ts` |

**Zgodność:** wygenerowana notatka jest drop-in dla vault (`distilled_via: continuum`, `quality: ok|stub`, te same sekcje). Brain musi tylko zembedować (albo i nie — patrz §5).

## 4. Co już zwalidowane (na żywym Ollama VM, 2026-06-11)

- `brain status` → Ollama osiągalne po LAN, 32 modele.
- `brain pipeline --sources claude-code --limit 1` → realna sesja (329 wiad.) zdestylowana qwen2.5:14b w poprawny note (0 stubów), zindeksowana nomic-embed-text → **dim 768**.
- `brain search "szyfrowanie sejfu i deduplikacja"` → cosine **0.611** na trafny chunk.
- CLI + UI (strona „Brain") + IPC — build zielony, typecheck czysty.

CLI:
```bash
CONTINUUM_OLLAMA=http://localhost:11434 \
  npm run cli brain pipeline --out ~/brain-notes --sources all --model qwen2.5:14b
npm run cli brain search --notes ~/brain-notes "wireguard killswitch mikrotik"
npm run cli brain deploy --to filesystem --notes ~/brain-notes --target /opt/BRAIN/data/vault/distilled
npm run cli brain deploy --to dashboard --url http://brain.example.local:7860 --reindex --token $env:BRAIN_TOKEN
```

Dashboard `:7860` wymaga `Authorization: Bearer <token>` (ten sam co w `~/.cursor/mcp.json` dla MCP `:7862`). Bez tokena reindex zwraca `auth required`.

## 5. Co dorobić po stronie BRAIN (żeby host w pełni odciążał VM)

Continuum produkuje notatki **i** wektory. Brain dziś re-embeduje przy `library/reindex`. Dwa małe endpointy domknęłyby pętlę:

1. **`POST /api/vault/save-note`** — przyjmij gotową, pre-destylowaną notatkę md (zamiast `save-chat`, które destyluje ponownie). Continuum wrzuca notatkę → brain tylko ją zapisuje + `index_file` (incremental embed).

   ```bash
   curl -sS -X POST "http://brain.example.local:7860/api/vault/save-note" \
     -H "Authorization: Bearer $BRAIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"markdown":"# test\n\nfrom continuum","filename":"2026-07-07_test_continuum.md","subdir":"distilled"}'
   ```

   Odpowiedź: `{"ok":true,"rel":"distilled/...","chunks_indexed":N,...}`. Wymaga Bearer (ten sam token co MCP/reindex).
2. **`POST /api/library/merge-index`** — przyjmij precomputed wektory `nomic-embed-text` (dim 768) + chunki + metadane; dopisz do `library.db` **bez** ponownego embeddingu. Wtedy deploy z hosta = zero pracy GPU na VM.

Format artefaktu Continuum (`.continuum-index.json`) jest pod to gotowy: `{embedModel, dim, entries:[{id,source,notePath,chunkIdx,text,vector}]}`.

## 6. Następne kroki (priorytet)

- [x] **Import eksportów** Claude.ai/ChatGPT/Grok/Gemini (ZIP/JSON/JSONL/MD) → `core/import/archives.ts`, CLI `import` + `brain pipeline --import`, UI „Import export…". Zwalidowane: claude.zip→3 rozmowy→distill→index→search.
- [ ] Batch całego inboxu na hoście (1668 sesji, te same ZIP-y) i jednorazowy deploy — odciąży VM z ~38 h.
- [ ] Map-reduce dla długich rozmów (dziś transcript przycinany head+tail do 14k znaków).
- [ ] Push przez MCP `save_conversation` jako trzeci backend deployu.
- [x] **Auto-deploy po distill** (Remote master) — `deployDistilledToBrain`, SMB lub `save-note` + `library/reindex`. Zob. `docs/BRAIN-KVM-ARCHITECTURE.md`.
- [x] Brain-side `save-note` (§5) — hub dashboard `POST /api/vault/save-note`, incremental `index_file`.
- [ ] Brain-side `merge-index` (§5).
- [ ] Wybór modelu per długość/temat (qwen2.5:14b vs 32b vs deepseek-r1).
