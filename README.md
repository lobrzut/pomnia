# Pomnia

**Local-first AI memory for developers** — one encrypted, offline archive of conversations, with local distill and an embedded **Brain MCP**.

Pomnia Desktop (Windows / macOS) collects chats from assistants (Claude Code, Cursor, Claude Desktop, Antigravity, VS Code, Continue) **and** imports from exports (Claude.ai, ChatGPT, Gemini, Grok) plus documents (PDF, DOCX, EPUB) into one vault — with search (**Chats**), distill via Ollama, and Brain on `127.0.0.1:7862`.

> **Desktop app** — version in [`package.json`](package.json). Start: [docs/START-HERE.md](docs/START-HERE.md).  
> **Repo:** [github.com/lobrzut/pomnia](https://github.com/lobrzut/pomnia) · **Site:** [pomnia.ai](https://pomnia.ai)

---

## Why

Every assistant keeps conversations somewhere else. Switch machines and you lose context. Pomnia:

- **extracts** conversations into one model (`Conversation` / `Message`),
- **protects** chats + configs in a content-addressed, encrypted **vault folder** (e.g. `C:\Vault` — any name works, including `*.pomnia`),
- **moves** the safe — copy the whole vault folder to another PC → Open vault → password,
- **feeds Brain** — distill → notes + index, then MCP for Cursor / other agents.

## Simple flow (Desktop)

1. **Start Brain** — Brain tab → start embedded Brain (needs [Ollama](https://ollama.com): `nomic-embed-text` + a distill model, e.g. `qwen2.5:14b`).
2. **Backup and into Brain** — Dashboard: backup sources → distill into local Brain.
3. **Connect MCP** — Connect tab → snippet for `http://127.0.0.1:7862` → paste into Cursor (`Settings → MCP`) → Reload.

Optional: **Handshake** — personal start ritual in the UI; not required for the product to work.

**Advanced:** remote Brain / homelab KVM (other host `:7862`, Bearer, auto-deploy) — [docs/START-HERE.md](docs/START-HERE.md), [docs/BRAIN-KVM-ARCHITECTURE.md](docs/BRAIN-KVM-ARCHITECTURE.md), [BRAIN-INTEGRATION.md](BRAIN-INTEGRATION.md).

## Sources

| Source | Strategy | From | What |
|---|---|---|---|
| **Claude Code** | hybrid | `~/.claude` | JSONL → conversations **+** snapshot of `projects/`, `sessions/`, `settings.json` |
| **Cursor** | hybrid | `…/Cursor/User` | chats from `globalStorage/state.vscdb` **+** config snapshot |
| **Claude Desktop** | snapshot | `%APPDATA%/Claude` / `~/Library/Application Support/Claude` | config, local sessions, Local Storage |
| **Antigravity** | hybrid | `%APPDATA%/Antigravity` · chats in `~/.gemini/antigravity` | Cascade transcripts **+** profile snapshot |
| **VS Code** / **Windsurf** | snapshot | `…/Code/User` · `…/Windsurf/User` | settings, snippets, `globalStorage` |
| **Continue** | snapshot | `~/.continue` | config, sessions, assistants |

Caches (GPUCache, blob_storage, Crashpad, …) are skipped automatically.

## Architecture

```
src/core/            Engine — pure TS, Node + sql.js(WASM) + crypto
  vault.ts           Encrypted, content-addressed store (AES-256-GCM + scrypt)
  adapters/          claudeCode · cursor · profile(snapshot)
  backup.ts          Backup orchestration
  brain/             Distill · localIndex · deploy (Ollama)
packages/brain-core/ Embedded Brain (MCP :7862) bundled with Desktop
src/cli/             Headless CLI
src/main/            Electron + IPC
src/preload/         contextBridge → window.pomnia
src/renderer/        UI: React + Tailwind + Framer Motion
```

## Desktop user guide

> [docs/START-HERE.md](docs/START-HERE.md) · audit: [docs/AUDYT-POMNIA-2026-07-09.md](docs/AUDYT-POMNIA-2026-07-09.md)

**In the app:** encrypted vault, adapter backup, ZIP/JSON + PDF/DOCX/EPUB import, embedded brain-core (MCP `:7862`), distill via Ollama, **How it works** / **Connect** tabs, tray + diagnostics in Settings.

### Session continuation (MCP)

MCP client key is **`pomnia`**. Agent phrases: *check Pomnia* / *save to Pomnia* (PL: *sprawdź w Pomnia* / *zapisz do Pomnia*).

- **Auto-checkpoint** (Settings, default ON) — the agent can write a milestone via `checkpoint_session` without a user phrase (decision, fix+path, error+command, architecture) → `vault/sessions/checkpoints/`.
- **“Save to Pomnia” / “zapisz do Pomnia”** — conscious full commit → `save_conversation` → `vault/sessions/`.

Agent rules include **PRIORITY** session-start (`get_user_profile` + search) and Handshake proof that MCP `pomnia` is wired.

### Incremental index

**Refresh index** / `indexDir` skips unchanged files (mtime+size, then content-hash) — no re-embed. Distill indexes only new notes via `indexFiles` (source of truth: `library.db`).

### Thin OCR (scanned PDFs)

On Import: when the text layer is sparse → **Run OCR** (`tesseract.js`, eng+pol; max ~3 sparse pages). **No scribe.js** (AGPL). Tessdata in `resources/tessdata` (`npm run stage:tessdata`).

**Common issues:**

| Symptom | What to do |
|-------|-----------|
| Distill won’t start | Ollama offline or missing distill model — Brain → Pull model |
| No Brain results | Missing `nomic-embed-text` |
| Cursor “Not connected” | Snippet from Connect; restart Cursor |
| Cursor 0 chats after backup | Large `state.vscdb` — use **Import** instead of live backup |
| SmartScreen / Gatekeeper | Unsigned private build — “Run anyway” / Gatekeeper bypass |
| Symantec / Defender on unsigned build | **Do not turn off AV.** Reputation = Authenticode (ship blocker): [docs/CODE-SIGNING.md](docs/CODE-SIGNING.md). Folder exclusions only as last resort (Settings → Windows / antivirus) |
| Installer “cannot be closed” | Tray → **Quit**, close setup, try again (NSIS closes `Pomnia.exe` + `pomnia-brain.exe`) |

### Windows AV — we do not build the product on exclusions

**Goal:** Pomnia works out of the box with Defender / Symantec **without** asking users for exceptions. Exclusions ≠ product strategy.

**Public Windows release** needs Authenticode signing (OV/EV or Azure Trusted Signing) before we market “just works” — details: [docs/CODE-SIGNING.md](docs/CODE-SIGNING.md).

Unsigned developer builds can trip heuristics (Electron + `pomnia-brain.exe` + vault). In-app: **Settings → Windows / antivirus** — folder exceptions only as a temporary workaround / IT policy. Never disable AV.

**Installers** (Win `.exe` / Mac `.dmg`) are built locally (`npm run pack:win` / `pack:mac`). Releases: [GitHub Releases](https://github.com/lobrzut/pomnia/releases).

Logs: `%AppData%/Pomnia/logs/` (Windows).

---

## Run (dev)

```bash
npm install
npm run dev          # Electron + hot reload
npm test             # vitest
npm run build        # bundle → out/
npm run pack:win     # Windows installer
npm run pack:mac     # DMG / macOS app
```

### CLI (no GUI)

```bash
npm run cli scan
POMNIA_PASS=… npm run cli backup --vault ~/Pomnia.pomnia --create --sources all
npm run cli list    --vault ~/Pomnia.pomnia
npm run cli verify  --vault ~/Pomnia.pomnia
npm run cli brain-export --out ~/brain-notes --sources all
```

## Brain — embedded (default) and remote

**Default:** Brain runs *inside* Pomnia Desktop on `127.0.0.1:7862` (distill + embed + MCP on this machine).

```
Collect/Import → Distill (Ollama) → Index → MCP (:7862)
```

- **Import** — Claude.ai / ChatGPT / Grok / Gemini exports (ZIP/JSON), PDF/DOCX/EPUB documents.
- **Distill** — conversation → note (Summary / Decisions / …).
- **Index** — local embeddings → semantic search.
- **Connect** — MCP snippet for Cursor.

CLI (optional):

```bash
POMNIA_OLLAMA=http://localhost:11434 npm run cli brain status
npm run cli brain pipeline --out ~/brain-notes --sources all
npm run cli brain search   --notes ~/brain-notes "…"
```

Remote / KVM = advanced mode (your own Brain server on the LAN) — see docs above.

## Security

Rules: [SECURITY.md](SECURITY.md).

- AES-256-GCM, random IV per blob, integrity tag.
- scrypt (N=2¹⁷) from passphrase; passphrase never stored.
- Vault header: salt + check token — no secrets.
- `verify` walks every blob and checks hashes.

## Roadmap

- [x] Embedded Brain (MCP `:7862`) + local distill in Desktop
- [x] Conversation browser (**Chats**) — full-text without GPU
- [x] Brain pipeline Collect→Distill→Index (CLI + GUI)
- [ ] Map-reduce for very long conversations
- [ ] Incremental backup by mtime
- [ ] Vault sync (git-remote / S3 / WebDAV)
- [ ] Backup schedules (CLI + Task Scheduler / launchd)
- [ ] Signed installers
- Linux packing **skipped for now** (engine is cross-platform).

---

## License

**GNU AGPL-3.0-only** — full text in [LICENSE](LICENSE).

Copyright © 2026 Pomnia

You may use, study, modify, and redistribute. One condition matters: if you distribute a modified version **or make it available to others over a network as a service**, you must give recipients its source code under the same license (§13 — *Remote Network Interaction*).

AGPL does not forbid making money. It forbids making money on a closed fork of someone else’s work — that is a different thing.

**Commercial license.** Copyright in the whole work belongs to a single author, so if AGPL does not fit your model (e.g. you want to embed Pomnia in a closed product), we can negotiate separately: [hello@pomnia.ai](mailto:hello@pomnia.ai)

---

## Trademark

The name **Pomnia** and the logo are **not** covered by the AGPL. You may fork the code and do with it what the license allows — but the version you distribute must not be called “Pomnia” or suggest it comes from the original author. Name your fork something else.

The reason is simple: code can be audited; a name has to be trusted. This rule protects people who download something believing it is the original.

---

Pomnia · [pomnia.ai](https://pomnia.ai) · [github.com/lobrzut/pomnia](https://github.com/lobrzut/pomnia)
