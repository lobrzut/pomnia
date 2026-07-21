# Pomnia

**Local-first AI memory for developers** — jedno zaszyfrowane, offline'owe archiwum rozmów, z lokalnym distill i embedded **Brain MCP**.

Pomnia Desktop (Windows / macOS) zbiera czaty ze asystentów (Claude Code, Cursor, Claude Desktop, Antigravity, VS Code, Continue) **i** importy z eksportów (Claude.ai, ChatGPT, Gemini, Grok) oraz dokumenty (PDF, DOCX, EPUB) w jeden vault — z wyszukiwaniem (**Chats**), destylacją przez Ollamę i Brainem na `127.0.0.1:7862`.

> **Desktop app** — wersja w [`package.json`](package.json). Start: [docs/START-HERE.md](docs/START-HERE.md).

---

## Dlaczego

Każdy asystent trzyma rozmowy gdzie indziej. Zmiana maszyny = utrata kontekstu. Pomnia:

- **wyciąga** rozmowy do jednego modelu (`Conversation`/`Message`),
- **zabezpiecza** czaty + configi w content-addressed, szyfrowanym sejfie (`*.pomnia`),
- **przenosi** sejf — skopiuj folder, otwórz tą samą frazą gdziekolwiek,
- **karmi Brain** — distill → notatki + indeks, potem MCP dla Cursora / innych agentów.

## Prosty flow (Desktop)

1. **Start Brain** — zakładka Brain → uruchom embedded Brain (potrzebuje [Ollama](https://ollama.com): `nomic-embed-text` + model distill, np. `qwen2.5:14b`).
2. **Backup i do Brain** — Dashboard: backup źródeł → destylacja do lokalnego Brain.
3. **Connect MCP** — zakładka Connect → snippet na `http://127.0.0.1:7862` → wklej w Cursor (`Settings → MCP`) → Reload.

Opcjonalnie: **Handshake** — osobisty rytuał startowy w UI; nie jest wymagany do działania.

**Zaawansowane:** remote Brain / homelab KVM (inny host `:7862`, Bearer, auto-deploy) — [docs/START-HERE.md](docs/START-HERE.md), [docs/BRAIN-KVM-ARCHITECTURE.md](docs/BRAIN-KVM-ARCHITECTURE.md), [BRAIN-INTEGRATION.md](BRAIN-INTEGRATION.md).

## Co potrafi (źródła)

| Źródło | Strategia | Skąd | Co |
|---|---|---|---|
| **Claude Code** | hybrid | `~/.claude` | JSONL → rozmowy **+** snapshot `projects/`, `sessions/`, `settings.json` |
| **Cursor** | hybrid | `…/Cursor/User` | czaty z `globalStorage/state.vscdb` **+** snapshot configów |
| **Claude Desktop** | snapshot | `%APPDATA%/Claude` / `~/Library/Application Support/Claude` | config, lokalne sesje, Local Storage |
| **Antigravity** | snapshot | `%APPDATA%/Antigravity` | profil Cascade / storage |
| **VS Code** / **Windsurf** | snapshot | `…/Code/User` · `…/Windsurf/User` | settings, snippets, `globalStorage` |

Cache (GPUCache, blob_storage, Crashpad, …) jest pomijany automatycznie.

## Architektura

```
src/core/            Silnik — czysty TS, Node + sql.js(WASM) + crypto
  vault.ts           Szyfrowany, content-addressed store (AES-256-GCM + scrypt)
  adapters/          claudeCode · cursor · profile(snapshot)
  backup.ts          Orkiestracja backupu
  brain/             Distill · localIndex · deploy (Ollama)
packages/brain-core/ Embedded Brain (MCP :7862) bundlowany z Desktop
src/cli/             Headless CLI
src/main/            Electron + IPC
src/preload/         contextBridge → window.pomnia
src/renderer/        UI: React + Tailwind + Framer Motion
```

## Dla użytkownika Desktop

> [docs/START-HERE.md](docs/START-HERE.md) · audyt: [docs/AUDYT-POMNIA-2026-07-09.md](docs/AUDYT-POMNIA-2026-07-09.md)

**W aplikacji:** zaszyfrowany vault, backup adapterów, import ZIP/JSON + PDF/DOCX/EPUB, embedded brain-core (MCP `:7862`), distill przez Ollamę, zakładki **Jak to działa** / **Connect**, tray + diagnostyka w Settings.

**Częste problemy:**

| Objaw | Co zrobić |
|-------|-----------|
| Distill nie startuje | Ollama offline lub brak modelu distill — Brain → Pull model |
| Brak wyników w Brain | Brak `nomic-embed-text` |
| Cursor „Not connected" | Snippet z Connect; zrestartuj Cursor |
| Cursor 0 czatów po backupie | Duży `state.vscdb` — użyj **Import** zamiast live backup |
| SmartScreen / Gatekeeper | Unsigned build prywatny — „Uruchom mimo to" / obejście Gatekeeper |

**Instalatory** (Win `.exe` / Mac `.dmg`) budowane lokalnie (`npm run pack:win` / `pack:mac`) — nie publikujemy tu publicznych GitHub Releases.

Logi: `%AppData%/Pomnia/logs/` (Windows).

---

## Uruchomienie (dev)

```bash
npm install
npm run dev          # Electron + hot reload
npm test             # vitest
npm run build        # bundle → out/
npm run pack:win     # instalator Windows
npm run pack:mac     # DMG / app macOS
```

### CLI (bez GUI)

```bash
npm run cli scan
POMNIA_PASS=… npm run cli backup --vault ~/Pomnia.pomnia --create --sources all
npm run cli list    --vault ~/Pomnia.pomnia
npm run cli verify  --vault ~/Pomnia.pomnia
npm run cli brain-export --out ~/brain-notes --sources all
```

## Brain — embedded (domyślnie) i remote

**Domyślnie:** Brain działa *wewnątrz* Pomnia Desktop na `127.0.0.1:7862` (distill + embed + MCP na tej maszynie).

```
Collect/Import → Distill (Ollama) → Index → MCP (:7862)
```

- **Import** — eksporty Claude.ai / ChatGPT / Grok / Gemini (ZIP/JSON), dokumenty PDF/DOCX/EPUB.
- **Distill** — rozmowa → notatka (Summary / Decisions / …).
- **Index** — embeddingi lokalnie → semantyczny search.
- **Connect** — snippet MCP do Cursora.

CLI (opcjonalnie):

```bash
POMNIA_OLLAMA=http://localhost:11434 npm run cli brain status
npm run cli brain pipeline --out ~/brain-notes --sources all
npm run cli brain search   --notes ~/brain-notes "…"
```

Remote / KVM = tryb zaawansowany (własny serwer Brain na LAN) — szczegóły w docs powyżej.

## Bezpieczeństwo

Zasady: [SECURITY.md](SECURITY.md).

- AES-256-GCM, losowe IV per blob, tag integralności.
- scrypt (N=2¹⁷) z frazy; fraza nigdzie nie zapisywana.
- Nagłówek sejfu: salt + token sprawdzający — bez sekretów.
- `verify` przechodzi każdy blob i sprawdza hash.

## Roadmap

- [x] Embedded Brain (MCP `:7862`) + distill lokalnie w Desktop
- [x] Przeglądarka rozmów (**Chats**) — full-text bez GPU
- [x] Brain pipeline Collect→Distill→Index (CLI + GUI)
- [ ] Map-reduce dla bardzo długich rozmów
- [ ] Backup inkrementalny po mtime
- [ ] Sync sejfu (git-remote / S3 / WebDAV)
- [ ] Harmonogram backupów (CLI + Task Scheduler / launchd)
- [ ] Podpisane instalatory
- Linux packing **pominięty na teraz** (silnik cross-platform).

---

Pomnia · [pomnia.ai](https://pomnia.ai)
