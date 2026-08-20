> **Internal / historical note** — not user-facing docs. Continuum-era host-side pipeline analysis (2026-06); keep for operators, not onboarding.

# Continuum × Brain — analysis and the host-side pipeline

An analysis of the BRAIN install (via the dashboard API on :7860 plus the vault contents, 2026-06-11), and a design for making Continuum the **on-ramp**: it pulls in scattered knowledge, **distils and pre-indexes on the host**, and hands Brain a finished product.

## 1. How BRAIN works (reconstructed)

```
SOURCES               INGEST (VM, Ollama)                    RAG
ZIP exports  ─┐                                        ┌─ search_library
(claude.zip,  ├─► brain-raw/inbox ─► transcripts/run ──┤   (vector top-k)
 grok.zip)    │     (1668 sessions!)   distill qwen2.5  │
claude-code ──┘                       ↓                 │
                              vault/{distilled,sessions,│
                                notes,digests} 1682 md  │
                                      ↓                 │
                              library/reindex ──────────┘
                              embed nomic-embed-text → vectordb/library.db (307 MB)
```

Components (from `/api/status` + `/openapi.json`):
- **Dashboard** FastAPI :7860 — the full API: `transcripts/*` (ingest+distill), `vault/*` (save-chat, notes, read, redistill, quality, dedupe), `library/*` (upload, reindex, search, status), `skills/*`, `code/*`, `user-profile/*`, `agents/*`, `schedule/*`.
- **MCP** mcp-proxy :7862 (SSE) — exposes `pomnia` / `pomnia-vault` / `pomnia-library` to remote agents (the HTTP paths are still `/servers/brain-vault|library`).
- **Ollama** docker :11434 — **32 models** (qwen2.5:14b as the default chat model, nomic-embed-text for embeddings, up to deepseek-r1:32b / qwen3:30b). 2× RTX 3060 (24 GB).
- **Vault** `/opt/BRAIN/data/vault` — 1682 markdown notes (frontmatter + Summary/Decisions/Solutions/Facts/Open Questions).
- **vectordb** `library.db` 307 MB. **Library** 42 PDFs/EPUBs (sec/trading).

## 2. Where the gap is (and the opportunity)

- **The inbox is sitting on roughly 1668 sessions** (claude.zip 1188 + grok.zip 480), undistilled. That is literally "knowledge you already have and are not drawing on yet".
- Distilling on the VM runs at about **83 s per session** (qwen2.5:14b) → 1668 sessions ≈ **~38 h of VM GPU time**. VM disk is at **85%** (1930/2282 GB).
- The host box has an **RX 6800 16 GB** (ROCm/Vulkan) that is idle most of the time. The obvious move: **push distillation and indexing to the host**, and send Brain either finished notes (light embed) or finished vectors (no embedding at all).
- For *anyone* running Ollama locally this is the same pattern, which makes it an adoption feature for Brain as a product.

## 3. Continuum's role: Collect → Distill → Pre-index → Deploy

| Stage | What Continuum does (on the host) | Module |
|---|---|---|
| **Collect** | normalises conversations from live assistants | `core/adapters` |
| **Import** | pulls in Claude.ai/ChatGPT/Grok/Gemini exports (ZIP/JSON/JSONL/MD) | `core/import/archives.ts` |
| **Distill** | every conversation → a note in the **brain schema** via local Ollama (qwen2.5:14b), JSON mode, surrogate sanitisation | `core/brain/distill.ts` |
| **Pre-index** | embed with `nomic-embed-text` → a portable JSON index → **immediate local RAG** over that knowledge | `core/brain/localIndex.ts` |
| **Deploy** | (a) write notes into the vault dir + `library/reindex`, or (b) `vault/save-chat` (Brain distils) | `core/brain/deploy.ts` |

**Compatibility:** the generated note is drop-in for the vault (`distilled_via: continuum`, `quality: ok|stub`, the same sections). Brain only has to embed it — or not even that, see §5.

## 4. What is already validated (against the live VM Ollama, 2026-06-11)

- `brain status` → Ollama reachable over the LAN, 32 models.
- `brain pipeline --sources claude-code --limit 1` → a real session (329 messages) distilled by qwen2.5:14b into a valid note (0 stubs), indexed with nomic-embed-text → **dim 768**.
- `brain search "vault encryption and deduplication"` → cosine **0.611** on the right chunk.
- CLI + UI (the "Brain" page) + IPC — build green, typecheck clean.

CLI:
```bash
CONTINUUM_OLLAMA=http://localhost:11434 \
  npm run cli brain pipeline --out ~/brain-notes --sources all --model qwen2.5:14b
npm run cli brain search --notes ~/brain-notes "wireguard killswitch mikrotik"
npm run cli brain deploy --to filesystem --notes ~/brain-notes --target /opt/BRAIN/data/vault/distilled
npm run cli brain deploy --to dashboard --url http://brain.example.local:7860 --reindex --token $env:BRAIN_TOKEN
```

The dashboard on `:7860` requires `Authorization: Bearer <token>` — the same token as in `~/.cursor/mcp.json` for MCP on `:7862`. Without it, reindex returns `auth required`.

## 5. What BRAIN still needs, so the host can fully relieve the VM

Continuum produces notes **and** vectors. Brain currently re-embeds on `library/reindex`. Two small endpoints would close the loop:

1. **`POST /api/vault/save-note`** — accept a finished, pre-distilled markdown note (instead of `save-chat`, which distils again). Continuum pushes the note; Brain only writes it and runs `index_file` (incremental embed).

   ```bash
   curl -sS -X POST "http://brain.example.local:7860/api/vault/save-note" \
     -H "Authorization: Bearer $BRAIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"markdown":"# test\n\nfrom continuum","filename":"2026-07-07_test_continuum.md","subdir":"distilled"}'
   ```

   Response: `{"ok":true,"rel":"distilled/...","chunks_indexed":N,...}`. Needs the Bearer token (the same one as MCP/reindex).
2. **`POST /api/library/merge-index`** — accept precomputed `nomic-embed-text` vectors (dim 768) plus chunks and metadata, and append them to `library.db` **without** re-embedding. Then a deploy from the host costs the VM no GPU work at all.

Continuum's artifact format (`.continuum-index.json`) is already shaped for this: `{embedModel, dim, entries:[{id,source,notePath,chunkIdx,text,vector}]}`.

## 6. Next steps (in priority order)

- [x] **Import exports** from Claude.ai/ChatGPT/Grok/Gemini (ZIP/JSON/JSONL/MD) → `core/import/archives.ts`, CLI `import` + `brain pipeline --import`, UI "Import export…". Validated: claude.zip → 3 conversations → distill → index → search.
- [ ] Batch the whole inbox on the host (1668 sessions, the same ZIPs) and deploy once — saves the VM roughly 38 h.
- [ ] Map-reduce for long conversations (today the transcript is trimmed head+tail to 14k characters).
- [ ] Push over MCP `save_conversation` as a third deploy backend.
- [x] **Auto-deploy after distill** (Remote master) — `deployDistilledToBrain`, SMB or `save-note` + `library/reindex`. See `docs/BRAIN-KVM-ARCHITECTURE.md`.
- [x] Brain-side `save-note` (§5) — hub dashboard `POST /api/vault/save-note`, incremental `index_file`.
- [ ] Brain-side `merge-index` (§5).
- [ ] Model choice per length/topic (qwen2.5:14b vs 32b vs deepseek-r1).
