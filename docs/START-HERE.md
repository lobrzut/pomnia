# Pomnia — START HERE

> One page for a beta tester. Technical detail: [README](../README.md) · audit: [ROADMAP-CLARITY.md](./ROADMAP-CLARITY.md).

## What is Pomnia?

A **local application** that collects conversations from every AI assistant into **one encrypted vault**, and then — through **Brain** — lets agents such as Cursor **recall** that context over MCP.

Nothing leaves for the cloud unless you configure a deploy to your own server.

## Two downloads

Both files belong on the same [GitHub Release](https://github.com/lobrzut/pomnia/releases/latest). The `<version>` in the name is the product version. Mini's download is the zip in the table — if a portable exe is listed beside it, that is not the file to take.

| You want | Download | Then |
|---|---|---|
| The full app — vault, distill, embedded Brain on this machine | `Pomnia-<version>-setup.exe` | Run the installer |
| **Pomnia Mini** — this machine only connects to a Brain server you already run | **`PomniaMini-<version>.zip`** | Unpack the zip **once**, then run `PomniaMini.exe` |

Mini is that zip. Unpack it once; every start after that is a normal program start. Do not use a portable unpacker for Mini — a portable `.exe`, if you see one, extracts into `%TEMP%` on every launch and is not the download.

Mini's screens are Connect, Settings, Skills, Prompts and Import. It does not start Ollama or a local Brain, and it does not hold a vault. The rest of this page is the full app.

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
│  Your Brain server on the LAN, e.g. http://your-host:7865│
│  Needs: a Bearer token (server admin panel → Tokens)    │
└─────────────────────────────────────────────────────────┘
```

Choose the mode in **Connect** before you copy the MCP snippet.

## Five steps to "Cursor remembers me"

### 1. Ollama + models

Install [Ollama](https://ollama.com), start it, pull:

```bash
ollama pull nomic-embed-text    # embeddings — REQUIRED for search
ollama pull llama3.1:8b         # chat distillation — REQUIRED for distill (the default model)
```

### 2. Vault + backup

- The first-run wizard **or** Dashboard → create/open a vault.
- **Backup** — tick the detected sources (Claude Code, Cursor…) → Backup.

### 3. Distill (chats → notes)

The **Brain** tab → check the Ollama status → **Distill backlog**.

This turns raw conversation logs into condensed `.md` notes and builds the vector index.

### 4. Connect (MCP)

**Windows (Pomnia app):** the **Connect** tab → remote or embedded → copy the whole snippet → paste → Reload Window.

**Mac / no app:** see [docs/CURSOR-MCP.md](./CURSOR-MCP.md) — embedded brain: `http://127.0.0.1:7862/mcp`, no token; remote brain-core: `http://<host>:7865/mcp` + a token minted in the server's admin panel (`http://<host>:7865/admin` → Tokens). Paste into `~/.cursor/mcp.json` → Reload Window.

There is **one** MCP server: `pomnia` (the legacy `brain-rag` key is still accepted). A leftover three-server config is the retired Python hub — see the footnote, and delete those extra entries.

### 5. Verify

**Settings → Diagnostics** — Ollama, models, vault, brain-core and MCP should all be green.

In Cursor, ask the agent about something from an earlier session; it should call `search_library` through the `pomnia` MCP server.

## Two content pipelines

| Type | Path | LLM? |
|-----|---------|------|
| **Chats** (live backup, ZIP import) | Vault → **Distill** → index | Yes (`llama3.1:8b` by default) |
| **Documents** (PDF, DOCX, EPUB) | Vault → **Direct index** (+ optional thin OCR) | No (embed only; OCR is tesseract) |

Do not distil PDFs — index them straight from the Import tab. A scanned PDF (little text) → **Run OCR**, then index. **Refresh index** skips unchanged files. Auto-checkpoint vs "save to Pomnia": [README](../README.md#kontynuacja-sesji-mcp).

## Import vs Backup

- **Backup** reads the assistants' live files from disk (Claude Code, Cursor…).
- **Import** loads ZIP/JSON exports (Claude.ai, ChatGPT, Gemini) or single files.

If the Cursor backup shows 0 chats, use Import.

## Where to look for help

| Problem | Where |
|---------|-------|
| Distill sits idle | Ollama down, or `nomic-embed-text` / `llama3.1:8b` not pulled. The app shows a checklist and does not mark chats as distilled |
| I don't understand how this works | **How it works** (menu) or Dashboard → "I don't know where to start" |
| System status | Dashboard → the "Where you are now" bar · Settings → Diagnostics |
| Logs | `%AppData%/pomnia/logs/` |
| The full document pipeline | [DOCUMENT-PIPELINE.md](./DOCUMENT-PIPELINE.md) |
| Self-hosted Brain (your own machine or server) | [LINUX-SELF-HOSTED.md](./LINUX-SELF-HOSTED.md) — brain-core, not the old Python hub |
| Archived Python hub (`:7860` / Continuum) | [BRAIN-INTEGRATION.md](./BRAIN-INTEGRATION.md) — superseded, not a setup guide |

## What this beta still does not have

- A code-signed installer (SmartScreen / Gatekeeper)
- Full OCR of every page / Ollama vision (there is thin OCR: the first sparse pages)
- Cloud vault sync
- A guarantee that Antigravity works on every machine (the adapter is still in testing)

Linux Desktop (AppImage/deb): built on Linux/CI — [LINUX-BUILD.md](./LINUX-BUILD.md).

> Footnote: a config that lists three SSE servers (`pomnia` + `pomnia-vault` + `pomnia-library`, or `brain-vault` / `brain-library`) is the retired Python hub. It is not a setup path. There is one server, `pomnia`.

---

*Pomnia · local-first AI memory · [pomnia.ai](https://pomnia.ai)*
