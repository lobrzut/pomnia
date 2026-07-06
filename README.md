# Reliqua

**Twoja pamięć AI: jedno zaszyfrowane, offline'owe archiwum wszystkich rozmów — przeszukiwalne i gotowe do zasilenia Brain.**
Reliqua zbiera czaty ze wszystkich Twoich asystentów (Claude Code, Cursor, Claude Desktop, Antigravity, VS Code, Continue) **i** importy z eksportów (Claude.ai, ChatGPT, Gemini, Grok) w jedno miejsce — z lokalnym wyszukiwaniem (zakładka **Chats**) i pipeline'em do **Brain** (distill + index).
Backup i przenośność Win↔Mac to **mechanizm** pod spodem (sejf = jeden przenośny folder, AES-256-GCM), nie główne hasło.

> Status: **silnik przetestowany i działa na żywych danych** (419 plików Claude Code + 148 czatów Cursora zbackupowane, zaszyfrowane, zweryfikowane i odtworzone w teście round-trip; 5/5 testów jednostkowych zielonych). UI Electron + React buduje się i odpala.

---

## Dlaczego

Każdy asystent trzyma rozmowy gdzie indziej i w innym formacie. Zmiana maszyny = utrata kontekstu. Reliqua:

- **wyciąga** rozmowy do jednego, znormalizowanego modelu (`Conversation`/`Message`),
- **zabezpiecza** całość (czaty + surowe configi) w content-addressed, szyfrowanym sejfie z deduplikacją,
- **przenosi** sejf na dowolną platformę — skopiuj folder `*.continuum`, otwórz tą samą frazą gdziekolwiek,
- **karmi Brain** — eksportuje rozmowy do formatu notatek vault (RAG inbox), żeby kontekst się nie marnował między sesjami.

## Co potrafi (zweryfikowane formaty)

| Źródło | Strategia | Skąd | Co |
|---|---|---|---|
| **Claude Code** | hybrid | `~/.claude` | parsowanie JSONL → rozmowy **+** snapshot `projects/`, `sessions/`, `settings.json` |
| **Cursor** | hybrid | `…/Cursor/User` | ekstrakcja czatów z `globalStorage/state.vscdb` (SQLite/sql.js) **+** snapshot configów |
| **Claude Desktop** | snapshot | `%APPDATA%/Claude` / `~/Library/Application Support/Claude` | `claude_desktop_config.json`, lokalne sesje agenta, Local Storage |
| **Antigravity** | snapshot | `%APPDATA%/Antigravity` | `app_storage.json`, `Preferences`, Local/SharedStorage (profil Cascade) |
| **VS Code** | snapshot | `…/Code/User` | `settings.json`, snippets, `globalStorage` (Copilot/Continue) |
| **Windsurf** | snapshot | `…/Windsurf/User` | jw. |

Cache (GPUCache, blob_storage, Crashpad, …) jest automatycznie pomijany — Cursor 1 GB → 16 MB realnego payloadu.

## Architektura

```
src/core/            Silnik — czysty TS, tylko Node + sql.js(WASM) + crypto. Zero natywnej kompilacji.
  model.ts           Znormalizowane typy (Conversation, Snapshot, Manifest…)
  crypto.ts          AES-256-GCM + scrypt
  vault.ts           Szyfrowany, content-addressed store z deduplikacją + GC + verify
  locations.ts       Per-OS lokalizacje i reguły każdego asystenta
  pathmap.ts         Tłumaczenie ścieżek Win↔Mac↔Linux (kodowanie projektów Claude Code)
  fsutil.ts          Walker z exclude/keepTop/maxFileBytes
  adapters/          claudeCode · cursor · profile(snapshot) + rejestr
  backup.ts          Orkiestracja backupu (plan → apply, dedup, incremental)
  brainExport.ts     Eksport rozmów do formatu notatek Brain vault
  brain/             Host-side pipeline: ollama · distill · localIndex · deploy
                     (Collect → Distill → Pre-index → Deploy do Brain)
src/cli/             Headless CLI (automatyzacja / tryb „bypass")
src/main/            Proces główny Electron + IPC (trzyma odszyfrowany Vault w RAM)
src/preload/         Bezpieczny most contextBridge → window.continuum
src/renderer/        UI: React 19 + Tailwind v4 + Framer Motion (aurora, glass, spring)
```

## Uruchomienie

```bash
npm install
npm run dev          # aplikacja desktopowa (Electron + hot reload)
npm test             # testy silnika (vitest)
npm run build        # bundle main+preload+renderer → out/
npm run pack:win     # instalator Windows (też :mac). Linux pominięty na teraz.
```

### CLI (działa bez GUI — tryb automatyczny)

```bash
# wykryj asystentów na tej maszynie
npm run cli scan

# backup do sejfu (passphrase z $CONTINUUM_PASS dla trybu nienadzorowanego)
CONTINUUM_PASS=… npm run cli backup --vault ~/Reliqua.continuum --create --sources all

npm run cli list    --vault ~/Reliqua.continuum
npm run cli verify  --vault ~/Reliqua.continuum

# eksport rozmów do Brain (RAG inbox) — prosto z żywych źródeł, bez sejfu
npm run cli brain-export --out /opt/BRAIN/data/vault/sessions --sources all
```

## Brain — handoff do serwera (+ opcjonalny host-side pipeline)

Podział ról: **aplikacja desktopowa = agregacja źródeł + backup**; **destylacja/embedding (GPU) = robota serwerowego [BRAIN](BRAIN-INTEGRATION.md)**. W GUI „Send to Brain" oddajesz surowe rozmowy serwerowi (on destyluje u siebie). Host-side distill (Ollama lokalnie) zostaje jako **opcja CLI / dla boxa z brain** — nie obciąża zwykłego desktopu.

```
Collect/Import → Distill (Ollama, qwen2.5) → Pre-index (nomic-embed-text) → Deploy (Brain)
```

- **Import** — wciąga wiedzę, którą *już masz*: eksporty **Claude.ai / ChatGPT / Grok / Gemini** (ZIP/JSON), generic JSON/JSONL/MD. Rozpakowanie ZIP w pamięci (fflate, pure JS).
- **Distill** — każda rozmowa → notatka w schemacie brain (Summary/Decisions/Solutions/Facts/Open Questions), drop-in do `vault/distilled`.
- **Pre-index** — embeddingi lokalnie → przenośny index → **natychmiastowy semantyczny search nad Twoją wiedzą**, zanim cokolwiek deployujesz.
- **Deploy** — zapis notatek do vault dir + `library/reindex` (brain tylko embeduje), albo `vault/save-chat` (brain destyluje).

Zwalidowane na żywym Ollama (qwen2.5:14b + nomic-embed-text, dim 768). CLI:

```bash
CONTINUUM_OLLAMA=http://localhost:11434 npm run cli brain status
npm run cli import         --in ~/Downloads/claude-export.zip        # podejrzyj co jest w eksporcie
npm run cli brain pipeline --import ~/Downloads/claude-export.zip --out ~/brain-notes   # distill eksportu
npm run cli brain pipeline --out ~/brain-notes --sources all --model qwen2.5:14b   # distill + index (live)
npm run cli brain search   --notes ~/brain-notes "wireguard killswitch mikrotik"
npm run cli brain deploy   --to filesystem --notes ~/brain-notes --target /opt/BRAIN/data/vault/distilled
npm run cli brain deploy   --to dashboard --url http://brain-host:7860 --reindex
```

W GUI: zakładka **Brain** (status Ollama, etapy, run z live progressem, lokalny RAG, deploy).

## Bezpieczeństwo

Zasady zaufania i model publikacji przy premierze: [SECURITY.md](SECURITY.md).

- AES-256-GCM (uwierzytelnione), losowe IV per blob, tag integralności.
- scrypt (N=2¹⁷) do wyprowadzenia klucza z frazy; fraza nigdzie nie zapisywana.
- Nagłówek sejfu nie zawiera sekretów — tylko salt + token-sprawdzający.
- `verify` przechodzi każdy blob i sprawdza hash.

## Roadmap

- [x] **Brain pipeline** — host-side Collect→Distill→Pre-index→Deploy (CLI + GUI). Patrz [BRAIN-INTEGRATION.md](BRAIN-INTEGRATION.md).
- [ ] Batch całego inboxu brain (~1668 sesji) na hoście + jednorazowy deploy (odciąży VM ~38 h GPU).
- [ ] Map-reduce dla bardzo długich rozmów (dziś transcript przycinany do 14k znaków).
- [ ] Brain-side `save-note` + `merge-index` — przyjęcie pre-destylowanych notatek i precomputed wektorów (zero re-embed na VM).
- [x] **Przeglądarka rozmów (Chats)** — agregacja + lokalny full-text search wszystkich czatów z sejfu (bez GPU).
- [ ] Backup inkrementalny po mtime (model już ma `mtime`).
- [ ] Sync sejfu: git-remote / S3 / WebDAV.
- [ ] Harmonogram backupów (Task Scheduler / launchd) wołający CLI.
- [ ] Migracja shella na **Tauri 2** (mniejszy binarz, mobile) — silnik UI-agnostyczny, port FS/keychain do Rusta.
- Linux jako target pakowania **pominięty na teraz** (silnik dalej cross-platform; dodanie to jeden blok w electron-builder.yml).

---
🤖 Wygenerowane przez Claude Code (Opus 4.8). Silnik zwalidowany na realnych danych tej maszyny.
