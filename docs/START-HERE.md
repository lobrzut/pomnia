# Pomnia — START HERE

> One page for a beta tester. Technical detail: [README](../README.md) · audit: [ROADMAP-CLARITY.md](./ROADMAP-CLARITY.md).

## What is Pomnia?

A **local application** that collects conversations from every AI assistant into **one encrypted vault**, and then — through **Brain** — lets agents such as Cursor **recall** that context over MCP.

Nothing leaves for the cloud unless you configure a deploy to your own server.

> **In the app:** the **How it works** tab (Pomnia Map) in the sidebar — a visual walkthrough of the flow, plus the "Where you are now" bar on the Dashboard. The "I don't know where to start →" link leads there too.

## Two stores — do not confuse them

| Name | Where | What it holds |
|-------|-------|-----------|
| **Pomnia Vault** | The vault folder you pick (e.g. `C:\Vault` — any name, `*.pomnia` works too) | Encrypted chats and documents; **plaintext** beside them: `skills/`, `USER.md`, `sessions/`, distilled notes |
| **Brain data** | `%AppData%/pomnia/brain-core-data/` | The RAG index (`library.db`) + distilled notes — **not encrypted** on disk |

The vault is the archive and the backup (AES for chat and document blobs). Knowledge sidecars and the Brain index are plaintext on disk — protect the folder. Brain data is the semantic search engine.

## Two Brain modes

```
┌─────────────────────────────────────────────────────────┐
│  EMBEDDED (recommended to start)                        │
│  Brain runs INSIDE Pomnia on 127.0.0.1:7862             │
│  Needs: Ollama on THIS machine                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  REMOTE (homelab)                                       │
│  Your Brain server on the LAN, e.g. http://your-host:7862│
│  Needs: a Bearer token + a working MCP proxy            │
└─────────────────────────────────────────────────────────┘
```

Choose the mode in **Connect** before you copy the MCP snippet.

## Five steps to "Cursor remembers me"

### 1. Ollama + models

Install [Ollama](https://ollama.com), start it, pull:

```bash
ollama pull nomic-embed-text    # embeddings — REQUIRED for search
ollama pull qwen2.5:14b         # chat distillation — REQUIRED for distill
```

### 2. Vault + backup

- The first-run wizard **or** Dashboard → create/open a vault.
- **Backup** — tick the detected sources (Claude Code, Cursor…) → Backup.

### 3. Distill (chats → notes)

The **Brain** tab → check the Ollama status → **Distill backlog**.

This turns raw conversation logs into condensed `.md` notes and builds the vector index.

### 4. Connect (MCP)

**Windows (Pomnia app):** the **Connect** tab → remote or embedded → copy the whole snippet → paste → Reload Window.

**Mac / no app:** see [docs/CURSOR-MCP.md](./CURSOR-MCP.md) → URL `:7862` + a token from the dashboard on `:7860` → **Copy mcp.json** → `~/.cursor/mcp.json` → Reload Window.

Remote always needs **three** servers: `pomnia`, `pomnia-vault`, `pomnia-library`. `pomnia` alone is an incomplete configuration (the legacy `brain-rag` key is still accepted by the status check).

### 5. Verify

**Settings → Diagnostics** — Ollama, models, vault, brain-core and MCP should all be green.

In Cursor, ask the agent about something from an earlier session; it should call `search_library` through Brain MCP.

## Two content pipelines

| Type | Path | LLM? |
|-----|---------|------|
| **Chats** (live backup, ZIP import) | Vault → **Distill** → index | Yes (qwen) |
| **Documents** (PDF, DOCX, EPUB) | Vault → **Direct index** (+ optional thin OCR) | No (embed only; OCR is tesseract) |

Do not distil PDFs — index them straight from the Import tab. A scanned PDF (little text) → **Run OCR**, then index. **Refresh index** skips unchanged files. Auto-checkpoint vs "save to Pomnia": [README](../README.md#kontynuacja-sesji-mcp).

## Import vs Backup

- **Backup** reads the assistants' live files from disk (Claude Code, Cursor…).
- **Import** loads ZIP/JSON exports (Claude.ai, ChatGPT, Gemini) or single files.

If the Cursor backup shows 0 chats, use Import.

## Where to look for help

| Problem | Where |
|---------|-------|
| I don't understand how this works | **How it works** (menu) or Dashboard → "I don't know where to start" |
| System status | Dashboard → the "Where you are now" bar · Settings → Diagnostics |
| Logs | `%AppData%/pomnia/logs/` |
| The full document pipeline | [DOCUMENT-PIPELINE.md](./DOCUMENT-PIPELINE.md) |
| Homelab Brain integration | [BRAIN-INTEGRATION.md](./BRAIN-INTEGRATION.md) (internal/historical) |

## What this beta still does not have

- A code-signed installer (SmartScreen / Gatekeeper)
- Full OCR of every page / Ollama vision (there is thin OCR: the first sparse pages)
- Cloud vault sync
- A guarantee that Antigravity works on every machine (the adapter is still in testing)

Linux Desktop (AppImage/deb): built on Linux/CI — [LINUX-BUILD.md](./LINUX-BUILD.md).

---

*Pomnia · local-first AI memory · [pomnia.ai](https://pomnia.ai)*
