# Audyt Pomnia — 2026-07-09

> **Zakres:** repozytorium `C:\Users\Alice\Projects\pomnia` + ekosystem (Brain MCP, landing, homelab)  
> **Wersja produktu:** 0.1.2 · **Branch:** `master` · **Audytor:** agent (na podstawie kodu, testów, dokumentacji i stanu repo)

---

## Executive summary (1 strona)

### Werdykt ogólny: 🟡 **Silnik gotowy — produkt beta wymaga domknięcia UX i dystrybucji**

Pomnia ma **działający rdzeń techniczny**: szyfrowany vault, backup czatów, import archiwów, pipeline distill→index→MCP, embedded brain-core w instalatorze Windows. To nie jest prototyp — **419 plików Claude Code + 148 czatów Cursora** przeszły round-trip w testach na żywych danych (README). Instalator **`Pomnia-0.1.2-setup.exe`** (~94 MB) leży w `release/` i jest gotowy do ręcznej dystrybucji beta.

**Główny problem nie jest inżynieryjny, lecz produktowy:** aplikacja nadal „pachnie” homelabem Alice (domyślne IP `brain.example.local`, dwa magazyny o nazwie „vault”, dwa pipeline'y czaty vs dokumenty), a warstwa onboarding/landing **nie domyka obietnicy** dla obcego użytkownika Windows bez Node/Ollama.

### Sygnalizatory

| Obszar | Status | Komentarz |
|--------|--------|-----------|
| Silnik vault + crypto | 🟢 | 7/7 testów engine, incremental backup OK |
| Backup adapterów | 🟢 | Claude Code, Cursor — zweryfikowane; Antigravity — 🟡 |
| Distill + embedded brain | 🟢 | Wymaga Ollama + 2 modele; działa u Alice |
| Doc import (PDF/DOCX/EPUB) | 🟡 | Parser + vault + index — kod i testy OK; OCR 🔲 |
| MCP Connect (Cursor) | 🟢 | Snippet + mint token; wymaga restartu klienta |
| Przejrzystość UX | 🟢 | Mapa (75c15d4) + animowany FlowDiagram (b85e410) ✅ |
| Dystrybucja zewnętrzna | 🔴 | Unsigned exe, brak GitHub Release, landing 503 |
| Mac | 🟡 | CI workflow gotowy; brak opublikowanego DMG |
| Testy CI | 🟡 | 73/74 pass; 1 fail native module (Node ABI) |
| Branding | 🔴 | Brak wybranego finału logo; stary icon.ico |

### Trzy najważniejsze wnioski

1. **Możesz dać 3–5 beta testerom Windows exe już dziś** — pod warunkiem ręcznego onboarding (Ollama, START-HERE, SmartScreen bypass) i embedded brain, nie remote homelab.
2. **Obcy użytkownik remote Brain się wyłoży** — domyślne `brain.example.local:7862` w UI, store, CLI i snippet; bez zmiany URL Connect nie zadziała poza Twoją siecią.
3. **Przed „public beta” brakuje:** usunięcie hardcoded IP, opublikowany release + strona pobierania, wybór logo, naprawa testu brain-core na aktualnym Node.

### Rekomendacja na 2 tygodnie

**Tydzień 1 — „5 testerów bez wstydu”:** hardcoded IP → pusty default; `BETA-SMOKE.md`; GitHub Release 0.1.2; landing z linkiem do exe; preflight Ollama przed distill w UI.

**Tydzień 2 — „nie tylko u mnie”:** Antigravity na realnym dumpie; pełny onboarding PL + krok backup w full mode; pierwszy tag `v0.1.3`; smoke brain-core na packaged Windows w CI; decyzja logo → podmiana `resources/icon.ico`.

---

## 1. Weryfikacja stanu repozytorium

### 1.1 Git

| Metryka | Wartość |
|---------|---------|
| Branch | `master` |
| HEAD | `b85e410` — *feat(ui): animowany diagram przepływu Pomnia (Jak to działa)* |
| Stan working tree | **CLEAN** (poza untracked: audit doc, `_agent_out.txt`, `_icon.txt`, `_pack_full.txt`) |
| Remote | `origin` → `https://github.com/lobrzut/reliqua.git` (private) |
| Tagi | **brak** tagów `v*` w repo |
| GitHub Releases | **brak** opublikowanych release'ów (`gh release list` pusty) |

**Ostatnie 3 commity:**

```
b85e410 feat(ui): animowany diagram przepływu Pomnia (Jak to działa)
75c15d4 feat(ui): Mapa Pomnia i pasek statusu dla beta testerów
b0b7463 docs: roadmap przejrzystosci beta + health check w Settings
```

### 1.2 Kluczowe commity / features

| Feature | Commit / stan | W master? |
|---------|---------------|-----------|
| Mapa Pomnia + StatusStrip + HowItWorks | `75c15d4` | 🟢 TAK |
| Health check (Settings) | `b0b7463` | 🟢 TAK |
| START-HERE.md | `75c15d4` (update) | 🟢 TAK |
| Animowany FlowDiagram | `b85e410` (+358 linii `FlowDiagram.tsx`) | 🟢 TAK — commit `502eaece` nie istnieje w repo; w master jest `b85e410` |
| Release 0.1.2 (tray, Antigravity, persistence) | `db6246b` (w historii) | 🟢 TAK |

### 1.3 Testy (`npm test`)

```
Test Files  1 failed | 20 passed (21)
Tests       1 failed | 73 passed (74)
```

| Wynik | Szczegół |
|-------|----------|
| 🟢 73 testy | vault, crypto, import, distill deploy, ollama, library index, doc-parser PDF/DOCX/EPUB, antigravity parser, activity, labels |
| 🔴 1 test | `packages/brain-core/tests/indexDocument.test.ts` — **better-sqlite3 ABI mismatch** (skompilowane pod NODE_MODULE_VERSION 130, Node wymaga 137). Fix: `npm rebuild better-sqlite3` lub `@electron/rebuild` |

**Uwaga:** packaged build w `release/win-unpacked/` ma własną kopię `better-sqlite3` — aplikacja desktopowa prawdopodobnie działa; fail dotyczy dev/test na aktualnym Node 22+.

### 1.4 Instalator / `release/`

| Artefakt | Stan |
|----------|------|
| `release/Pomnia-0.1.2-setup.exe` | 🟢 **istnieje** (~98 483 362 B) |
| `release/latest.yml` | 🟢 wersja 0.1.2, SHA512, data 2026-07-08 |
| `release/win-unpacked/` | 🟢 rozpakowana aplikacja + bundled `brain-core` |
| Podpis kodu | 🔴 **unsigned** — SmartScreen / Gatekeeper warning |

---

## 2. Macierz funkcji

Legenda: 🟢 **DZIAŁA** · 🟡 **CZĘŚCIOWO** · ⚪ **NIE TESTOWANE** · 🔴 **BROKEN**

| Funkcja | Status | Dowód / uwagi |
|---------|--------|---------------|
| **Vault** (tworzenie, otwarcie, szyfrowanie) | 🟢 DZIAŁA | `engine.test.ts` 7/7; AES-256-GCM + scrypt; round-trip na żywych danych |
| **Backup** (live adapters) | 🟢 DZIAŁA | `backup.ts` + adapters; README: 419+148 plików |
| **Backup — Claude Code** | 🟢 DZIAŁA | hybrid JSONL + snapshot; testy import |
| **Backup — Cursor** | 🟡 CZĘŚCIOWO | Działa; duży `state.vscdb` → parse skipped, 0 czatów bez komunikatu CTA |
| **Backup — Claude Desktop** | 🟢 DZIAŁA | snapshot configów (nie pełne czaty) — zgodne z obietnicą |
| **Backup — Antigravity** | 🟡 CZĘŚCIOWO | 1 test syntetyczny; ⚪ na realnych maszynach Windows |
| **Backup — VS Code / Windsurf / Continue** | 🟡 CZĘŚCIOWO | profile snapshot; ⚪ pełna weryfikacja u beta |
| **Distill** (pipeline ogólny) | 🟢 DZIAŁA | `distill.ts` + Ollama qwen; quality gate ok/stub/garbage |
| **Distill per adapter** | 🟡 CZĘŚCIOWO | Distill operuje na `Conversation` po backup/import — nie per-adapter; jakość zależy od jakości ekstrakcji adaptera |
| **Import czatów** (ZIP/JSON) | 🟢 DZIAŁA | `archives.ts`; Claude.ai, ChatGPT, Gemini, Grok |
| **Doc import — PDF** | 🟡 CZĘŚCIOWO | `doc-parser` + `docImport.ts`; test PDF minimal OK; skany bez OCR → sparse |
| **Doc import — DOCX** | 🟡 CZĘŚCIOWO | mammoth; 1 test; GUI drag-drop |
| **Doc import — EPUB** | 🟡 CZĘŚCIOWO | v0.2; 3 testy epub |
| **Doc import — MD/TXT** | 🟢 DZIAŁA | passthrough |
| **Encrypted library** (bloby w vault) | 🟢 DZIAŁA | `stores library documents as encrypted blobs` test |
| **Embedded brain-core** | 🟢 DZIAŁA | fork child, port 7862; bundled w exe; Settings health check |
| **Remote brain** (homelab MCP) | 🟡 CZĘŚCIOWO | Kod OK; **default URL = alice IP**; wymaga token Bearer |
| **MCP Connect** (Cursor) | 🟢 DZIAŁA | `Connect.tsx`, snippet, mint token; ⚪ Hermes/Antigravity client — mniej testów |
| **Deploy homelab** | 🟡 CZĘŚCIOWO | CLI `brain deploy`; SMB/HTTP; błędy 404 słabo widoczne w UI |
| **Tray** (system tray) | 🟢 DZIAŁA | `tray.ts`; status brain + activity line; release 0.1.2 |
| **Activity status** | 🟢 DZIAŁA | `activity.ts` + `StatusStrip` na Dashboard |
| **Diagnostyka** | 🟢 DZIAŁA | Settings → HealthCheck: vault, Ollama, modele, brain-core, MCP |
| **Onboarding** | 🟡 CZĘŚCIOWO | Simple mode PL ✅; Full mode: brak kroku backup, etykiety EN |
| **Landing** | 🔴 BROKEN | `pomnia.ai` → **503**; waitlist bez linku do exe |

---

## 3. Audyt przejrzystości (clarity)

### 3.1 Strona „Jak to działa"

| Element | Stan | Ocena |
|---------|------|-------|
| Route `/how-it-works` | 🟢 | W menu bocznym (Shell) |
| `GuideMap` — kroki PL | 🟢 | 9 kroków z linkami do zakładek |
| `FlowDiagram` — animowany przepływ | 🟢 | `b85e410` — SVG + animacja cząsteczek, wariant full/mini, replay |
| Przycisk „Odtwórz animację" | 🟢 | W `HowItWorks.tsx` |
| Link z Dashboard | 🟢 | „Nie wiem od czego zacząć →" |
| `StatusStrip` „Gdzie jesteś teraz" | 🟢 | Na Dashboard — vault, Ollama, brain, backlog |

**Werdykt:** 🟢 **Strona kompletna** — mapa statyczna + animowany diagram + linki do zakładek. Beta tester ma pełną narrację przepływu.

### 3.2 Co nadal myli beta usera

| # | Problem | Gdzie | Priorytet |
|---|---------|-------|-----------|
| 1 | **Dwa „vaulty"** — `.pomnia` vs `brain-core-data/` | Cała appka | 🔴 |
| 2 | **Dwa pipeline'y** — czaty (distill+LLM) vs dokumenty (direct index) | Import, Brain | 🟡 |
| 3 | **Embedded vs remote** — domyślnie remote URL Alice | Connect, Onboarding, store | 🔴 |
| 4 | **Backup vs Import** — kiedy którego użyć | Dashboard, Import | 🟡 |
| 5 | **Full onboarding pomija backup** | `Onboarding.tsx` FULL_STEPS | 🟡 |
| 6 | **Ollama jako ukryta zależność** | Distill milczy bez preflight w UI | 🟡 |
| 7 | **„Distill" vs `save_conversation` w MCP** | Tylko w DOCUMENT-PIPELINE.md | ⚪ |
| 8 | Brak **„Pokaż kreator ponownie"** w Settings | Settings | 🟡 |
| 9 | Landing mówi „coming soon" — exe już jest | pomnia.ai | 🔴 |

### 3.3 Dokumentacja — co jest, czego brakuje

| Dokument | Status |
|----------|--------|
| `docs/START-HERE.md` | 🟢 Jedna strona dla bety |
| `docs/ROADMAP-CLARITY.md` | 🟢 Audyt przejrzystości + fazy A/B/C |
| `docs/DOCUMENT-PIPELINE.md` | 🟢 Master doc (490 linii — za gęsty dla bety) |
| `docs/BETA-SMOKE.md` | 🔴 **Brak** — checklista w roadmapie jako TODO |
| `README.md` sekcja beta | 🟢 |

---

## 4. Ryzyka dla użytkownika zewnętrznego

| Ryzyko | Severity | Szczegół | Mitigacja |
|--------|----------|----------|-----------|
| **Hardcoded IP brain.example.local** | 🔴 | `Onboarding.tsx`, `Connect.tsx`, `useStore.ts`, `snippet.ts`, `cli/index.ts`, `main/index.ts` | Pusty default + placeholder; URL ze store |
| **Ollama wymagane** | 🟡 | distill, embed, doc index — bez Ollama pipeline stoi | Health check ✅; brak preflight blokady przed distill |
| **Modele ~8 GB RAM** | 🟡 | `qwen2.5:14b` + `nomic-embed-text` | Dokumentacja START-HERE; brak profilu „light" w UI |
| **Unsigned installer** | 🔴 | SmartScreen blokuje; brak Authenticode | README ma instrukcję; code signing — track osobny |
| **better-sqlite3 / native modules** | 🟡 | Dev test fail; packaged może OK | CI rebuild; smoke na fresh Windows |
| **Cursor 0 czatów** | 🟡 | Duży vscdb | Import ZIP z eksportu |
| **Antigravity ścieżki** | 🟡 | `~/.gemini/antigravity` — nietypowa | ⚪ nie testowane u innych |
| **Brain data plaintext** | 🟡 | `%AppData%/Pomnia/brain-core-data/` nieszyfrowane | Opisane w START-HERE; user musi wiedzieć |
| **Brak telemetrii / crash report** | ⚪ | Trudna diagnoza u bety | Eksport logów ✅ (`api.openLogs`) |
| **Repo private + brak public release** | 🔴 | Tester nie ma skąd pobrać oficjalnie | GitHub Release + landing |
| **Token MCP remote** | 🟡 | Wymaga dashboard :7860 lub mint w Connect | Brak instrukcji „skąd token ręcznie" |
| **Ścieżki deploy SMB** | 🟡 | Przykłady `\\brain.example.local\brain\` w docs | Wizard deploy |

### Mapa hardcoded IP (UI path)

```
Onboarding.tsx:32     REMOTE_URL = 'http://brain.example.local:7862'
Connect.tsx:28        REMOTE_URL = 'http://brain.example.local:7862'
useStore.ts:118       localStorage fallback → brain.example.local:7862
snippet.ts:19         REMOTE_BRAIN_DEFAULT_URL
main/index.ts:762     fallback remote URL
labels.ts:387         przykład w copy PL
api.ts (mock)         demo data z alice IP
```

---

## 5. Logo i branding

| Element | Status |
|---------|--------|
| **Finalna ikona** | 🔴 **Nie wybrana** — `docs/BRAND-LOGO.md`: czeka na decyzję między Moss Vault / Dew Sigil / Bold series |
| **`resources/icon.ico`** | 🔴 Stary Reliqua-style (fiolet + litera R) — nie podmieniony |
| **Paleta Slavic green** | 🟡 Zdefiniowana w docs; UI nadal violet/cyan w landing |
| **Galeria koncepcji** | 🟢 `assets/generated/` + preview.html |
| **Landing live** | 🔴 `https://pomnia.ai` → **503 Service Unavailable** (2026-07-09) |
| **Landing content** | 🟡 Waitlist Formspree; sekcja download = „Wkrótce"; brak linku do GitHub Releases |
| **Domena** | 🟢 Zarejestrowana 2026-07-07 (`LANDING-DEPLOY.md`) |
| **index-fable.html** | ⚪ Wariant narracyjny — niezsynchronizowany z `index.html` |

---

## 6. Mac — status (skrót)

| Aspekt | Stan |
|--------|------|
| Build lokalny | 🟡 Tylko na macOS (`docs/MAC-BUILD.md`) |
| CI | 🟢 `.github/workflows/release-mac.yml` — trigger tag `v*` lub manual |
| Podpis | 🔴 Unsigned (`CSC_IDENTITY_AUTO_DISCOVERY: false`) |
| Opublikowany DMG | 🔴 Brak tagów → workflow nie odpalony na release |
| Cross-platform paths | 🟢 `locations.ts` — Win/Mac/Linux |
| Testy na macOS | ⚪ Brak regularnego CI poza release workflow |

**Wniosek:** Mac to **osobny track** — dokumentacja i CI gotowe, brak artefaktu do dystrybucji.

---

## 7. TOP priorytety — następne 2 tygodnie

### Tydzień 1 (9–15 lipca 2026)

| # | Zadanie | Effort | Faza | Dlaczego |
|---|---------|--------|------|----------|
| 1 | ~~Usunąć default `brain.example.local` z UI/store/snippet~~ ✅ **2026-07-09** | S | A | Bloker remote dla obcych |
| 2 | `docs/BETA-SMOKE.md` + checklist 15 min | S | B | Powtarzalna weryfikacja przed każdym exe |
| 3 | GitHub Release 0.1.2 z `Pomnia-0.1.2-setup.exe` | S | C | Oficjalny link dla testerów |
| 4 | Landing: link pobierania + naprawa 503 | S | C | Waitlist ≠ produkt |
| 5 | Preflight Ollama przed Distill (blokada + lista braków) | S | B | #1 silent fail |

### Tydzień 2 (16–22 lipca 2026)

| # | Zadanie | Effort | Faza | Dlaczego |
|---|---------|--------|------|----------|
| 7 | Wybór logo → podmiana `icon.ico` + tray | M | C | Pierwsze wrażenie |
| 8 | Full onboarding: krok backup + PL labels | S | A | Dziura w happy path |
| 9 | Antigravity: test na realnym Windows dumpie | M | B | Obiecany adapter |
| 10 | `npm rebuild` / fix test `indexDocument` w CI | S | B | 74/74 green |
| 11 | Settings → „Pokaż kreator ponownie" | S | A | Support beta |
| 12 | Tag `v0.1.3` + Mac DMG artifact z CI | M | Mac | Pierwszy cross-platform release |

### Metryki „gotowi na 5 beta testerów" (z ROADMAP-CLARITY)

- [ ] Każdy przechodzi `BETA-SMOKE.md` na czystym Windows 11 **bez Node**
- [ ] Health check zielony: Ollama + nomic-embed-text + vault + MCP
- [ ] Cursor Connect na ≥2 różnych maszynach
- [x] Zero `brain.example.local` w ścieżce UI *(naprawione 2026-07-09 — per-user `app-settings.json`)*
- [ ] Jeden link START-HERE + download exe

---

## 8. Załącznik — szybka mapa architektury

```
Asystenci (Claude Code, Cursor, …)
        │ backup / import ZIP
        ▼
  Pomnia Vault (.pomnia) ── encrypted AES-256-GCM
        │
        ├──► Chats tab (full-text, bez GPU)
        │
        ├──► DISTILL (Ollama qwen) ──► brain-notes/*.md
        │                                    │
        └──► DOC IMPORT (PDF/DOCX/EPUB)      │
             direct parse + embed            │
                    │                        │
                    └──────────┬─────────────┘
                               ▼
                    brain-core embedded (127.0.0.1:7862)
                    library.db + MCP search_library
                               │
                               ▼ opcjonalnie
                    Remote Brain homelab (user URL + token)
                               │
                               ▼
                    Cursor / inni klienci MCP
```

---

## 9. Historia tego audytu

| Data | Akcja |
|------|-------|
| 2026-07-09 | Pełny audyt repo + ekosystem; testy 73/74; weryfikacja release/; HEAD b85e410 (mapa + animacja) |
| 2026-07-09 | Powiązane: `docs/ROADMAP-CLARITY.md`, `docs/START-HERE.md` |

---

*Pomnia · local-first AI memory · audyt wewnętrzny dla Alice*
