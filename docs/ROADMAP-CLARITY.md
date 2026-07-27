# Pomnia — Roadmap przejrzystości i gotowości beta

> **Audyt:** 2026-07-09 · repo `pomnia` + ekosystem Brain / Cursor / landing  
> **Kontekst:** poza buildem Mac — użytkownik nie czuje, że aplikacja i ekosystem są jasne; brak pewności, że funkcje zadziałają u innych.

---

## Executive summary

Pomnia ma **działający silnik** (vault, backup, import, distill, embedded brain-core, MCP Connect), ale produkt jest nadal **zaprojektowany wokół homelabu operatora**: hardcoded IP, dwa vaulty bez jednej narracji, dwa pipeline'y (czaty vs dokumenty), embedded vs remote brain — to wszystko wymaga **jednej ścieżki „START HERE"** i **ekranu zdrowia**, zanim beta testerzy dostaną installer.

Priorytet: **najpierw przejrzystość (Faza A)**, potem **niezawodność u obcych maszyn (Faza B)**, na końcu **spójność ekosystemu (Faza C)**.

---

## 1. Pełna ścieżka użytkownika (co powinno być jasne)

### 1.1 Docelowa narracja (happy path)

```
Instalacja → Vault (hasło) → Backup czatów → Import (opcjonalnie)
    → Brain: Ollama + modele → Distill backlog → Connect (MCP do Cursora)
    → Doc import (opcjonalnie) → Deploy homelab (opcjonalnie)
```

### 1.2 Mapa kroków vs stan dziś

| Krok | Gdzie w UI | Co user powinien zrozumieć | Gdzie jest zamieszanie |
|------|------------|---------------------------|------------------------|
| **1. Instalacja** | NSIS / DMG (unsigned) | „To lokalna aplikacja, nie chmura" | Brak podpisu kodu → SmartScreen / Gatekeeper; brak linku z landing do builda |
| **2. First-run** | `Onboarding.tsx` | Vault → backup → pamięć → Connect | **Full mode** pomija krok backup; **Simple mode** ma backup, ale domyślnie włączony; kroki po angielsku w full mode |
| **3. Vault** | Onboarding + VaultGate | Jeden zaszyfrowany folder `.pomnia` | User myli **Pomnia Vault** z **Brain data dir** (`%AppData%/Pomnia/brain-core-data/`) — dwa magazyny, jedna nazwa „vault" |
| **4. Backup** | Dashboard / Onboarding (simple) | Skan → wybór źródeł → snapshot | Cursor z dużym `state.vscdb` — parse skipped bez jasnej instrukcji; Antigravity — adapter tylko na syntetycznym teście |
| **5. Import czatów** | Import | ZIP Claude/ChatGPT/Gemini | Rozdzielone od backupu live — user nie wie, kiedy które |
| **6. Brain start** | Brain + Onboarding engine | Ollama lokalnie **lub** remote homelab | Embedded wymaga Ollama + `nomic-embed-text`; bez tego distill/index milczy lub failuje pośrednio |
| **7. Distill** | Brain | Czaty → notatki `.md` → embeddingi | **Dwa znaczenia „distill"**: Pomnia pipeline vs `save_conversation` w czacie MCP — opisane tylko w `DOCUMENT-PIPELINE.md` |
| **8. Connect** | Connect | Wklej snippet MCP do Cursora | `REMOTE_URL` domyślnie `192.168.x.x:7862`; token mint wymaga dashboardu `:7860` |
| **9. Doc import** | Import + Brain | PDF/DOCX → vault → index | Faza 1 częściowo; EPUB v0.2; OCR 🔲 — landing obiecuje więcej niż exe |
| **10. Deploy homelab** | Brain (advanced) | SMB / HTTP do Brain VM | Domyślne ścieżki z dokumentacji homelab; brak wizarda „gdzie wkleić token" |

### 1.3 Diagram — dwa pipeline'y i dwa „brainy"

```
                    ┌─────────────────────────────────────┐
                    │         POMNIA DESKTOP (.exe)        │
                    │  Vault (.pomnia) · adapters · UI     │
                    └───────────┬─────────────────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           ▼                    ▼                    ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
    │  ŚCIEŻKA A  │    │  Ollama     │    │  ŚCIEŻKA B      │
    │  CZATY      │    │  localhost  │    │  DOKUMENTY      │
    │  distill    │───►│  :11434     │◄───│  direct index   │
    │  (LLM)      │    │  nomic-embed│    │  (bez LLM)      │
    └──────┬──────┘    └──────┬──────┘    └────────┬────────┘
           │                  │                     │
           └────────┬─────────┴─────────────────────┘
                    ▼
         ┌──────────────────────┐
         │  brain-core embedded │  127.0.0.1:7862 (MCP)
         │  library.db          │
         └──────────┬───────────┘
                    │ opcjonalnie deploy
                    ▼
         ┌──────────────────────┐
         │  Remote Brain (LAN)  │  np. :7862 MCP + :7860 API
         │  homelab / KVM       │
         └──────────────────────┘
```

**Główne źródło chaosu:** user widzi zakładki Dashboard · Chats · Import · Brain · Connect · Settings — bez mapy „jesteś tutaj" i bez rozróżnienia **zbieram** vs **pamiętam semantycznie** vs **podłączam agenta**.

---

## 2. Luki gotowości beta — co się wywali u INNYCH

### 2.1 Hardcoded / homelab-specific

| Lokalizacja | Problem | Ryzyko |
|-------------|---------|--------|
| `Onboarding.tsx`, `Connect.tsx` | `REMOTE_URL = 'http://brain.example.local:7862'` | Remote brain „działa" tylko u Ciebie |
| `Settings.tsx` | `connectStatus('http://brain.example.local:7862')` | Lista klientów MCP bez user URL |
| `api.ts` (mock) | Ten sam IP w preview | OK w dev, mylące w demo |
| `BRAIN-INTEGRATION.md`, `COMFYUI-ASSETS.md` | IP, ścieżki `/opt/BRAIN`, tokeny | Beta tester czyta i myśli, że to wymagane |
| `brain/deploy.test.ts` | IP w teście | Niskie — tylko test |

### 2.2 Ciche błędy / słabe komunikaty

- **Ollama offline** — `ensureBrain.ts` zwraca błąd, ale user po skip onboarding może nie wiedzieć, dlaczego distill nie startuje.
- **Brak `nomic-embed-text`** — index/doc-import pada; UI pokazuje pull w Brain, ale nie blokuje ścieżki z jasnym „wymagane przed indeksem".
- **brain-core na świeżym Windows** — wymaga `electron-builder install-app-deps` przy buildzie; dev bez `node` w PATH → fork child fail (`brainCore.ts`).
- **Cursor parse skipped** — duży vscdb: backup bez czatów, bez prominentnego CTA „użyj Import".
- **Deploy HTTP 404** — `deploy.ts` loguje „use filesystem" — user nie widzi w UI.
- **Reindex fail** — toast `warn` w store, łatwo przeoczyć.

### 2.3 Zależności zewnętrzne

| Zależność | Wymagana gdy | Status dokumentacji |
|-----------|--------------|---------------------|
| **Ollama** | distill, embed, doc index | README tak; onboarding częściowo |
| **nomic-embed-text** | każdy embed | wzmianka w onboarding engine |
| **qwen2.5:14b** (lub profil VRAM) | distill | profile w Brain, ukryte w simple mode |
| **Bearer token** | remote MCP | Connect — mint OK, brak „skąd wziąć token ręcznie" |
| **Apple / MS code signing** | dystrybucja | **brak** — unsigned w CI (`release-mac.yml`) |

### 2.4 Adaptery i platformy

| Obszar | Stan | U innych |
|--------|------|----------|
| **Antigravity** | 1 test syntetyczny (`~/.gemini/antigravity/...`) | **Niezweryfikowane** na realnych maszynach / ścieżkach Windows |
| **Claude Desktop** | snapshot, nie pełne czaty | OK jako „config backup" |
| **Hermes** | w Connect, brak w README tabeli | Niejasne |
| **Mac paths** | `locations.ts` cross-platform | Build Mac w toku; mniej testów na żywym macOS |
| **Linux** | silnik OK, brak instalatora | Świadomie pominięty |

### 2.5 Testy — pokrycie vs luki

**Jest (~20 plików testowych):** vault/crypto, import archives, distill deploy, ollama settings, library index auto-start, antigravity parser, doc-parser PDF/DOCX/EPUB.

**Brakuje:**
- E2E / smoke: „fresh install → vault → backup → brain status"
- Renderer: Onboarding, Connect, Brain (tylko `labels.test.ts`, `format.test.ts`)
- IPC integration tests
- `brainCore` fork na packaged build (tylko `scripts/_smoke-brain-core-fork.mjs` ręczny)
- Connect `checkAllClients` na fixture configów Cursor/Antigravity

### 2.6 First-run wizard — kompletność

| Element | Full mode | Simple mode |
|---------|-----------|-------------|
| Vault | ✅ | ✅ |
| Backup | ❌ (pominięty) | ✅ |
| Ollama check | ✅ engine step | ✅ SimpleBrainStep |
| Embedded brain start | częściowo | ✅ |
| Connect snippet | ✅ skippable | ✅ |
| Doc import | ❌ | ❌ |
| Health summary | ✅ Ready step (outcomes) | ✅ |
| **Reset wizard** | ❌ brak w Settings | ❌ |

---

## 3. Ekosystem — co jest udokumentowane

### 3.1 Mapa dokumentów

| Dokument | Dla kogo | Problem |
|----------|----------|---------|
| `README.md` | dev / power user | Silny technicznie, brak „START HERE" dla bety |
| `docs/DOCUMENT-PIPELINE.md` | architekt | **Najlepszy** — ale 490 linii, nie dla bety |
| `BRAIN-INTEGRATION.md` | operator homelab | Stare nazwy Continuum, IP 192.168.x.x |
| `docs/BRAIN-KVM-ARCHITECTURE.md` | infra | Zbyt niszowy na start |
| `docs/MAC-BUILD.md` | release | OK |
| `docs/LANDING-DEPLOY.md` | ops | OK |
| `landing/index.html` | public | Waitlist + „coming soon" — **luka vs działający beta exe** |
| Brain vault / chat | tylko u operatora | Decyzje produktowe niewidoczne w repo |

### 3.2 Brakujący artefakt

**`docs/START-HERE.md`** (lub sekcja w README) — jedna strona:

1. Czym jest Pomnia (1 zdanie)
2. Czym jest Brain (embedded vs remote) — 1 diagram
3. Minimalna konfiguracja (Ollama + 2 modele)
4. 5 kroków do „Cursor pamięta"
5. Gdzie szukać pomocy / logi
6. Czego NIE obiecywać (Linux installer, OCR, cloud sync)

### 3.3 Landing vs produkt

| Landing mówi | Produkt dziś |
|--------------|--------------|
| „memory layer for your AI" | ✅ zgodne |
| „distilled on your GPU" | ✅ jeśli Ollama |
| „every assistant" | ⚠️ z zastrzeżeniami (Cursor large DB, Antigravity) |
| waitlist | Installer jest — **brak ścieżki beta download** |
| `index-fable.html` | Wariant narracyjny — niezsynchronizowany z `index.html` |

---

## 4. Fazy prac

### Faza A — Przejrzystość (UX, onboarding, copy)

**Cel:** User po 10 minutach wie, co zrobił i co jeszcze musi.

| # | Zadanie | Effort |
|---|---------|--------|
| A1 | **`docs/START-HERE.md`** + link z README i z onboarding Ready | S |
| A2 | **Diagram w aplikacji** — Dashboard lub Brain: „Zbiór → Vault → Distill → MCP" (collapsible) | M |
| A3 | **Ujednolicenie języka** — full onboarding PL jak simple mode; „Vault" vs „Brain folder" w copy | M |
| A4 | **Usunąć hardcoded IP** — `remoteBrainUrl` ze store wszędzie; pusty default + placeholder | S |
| A5 | **Full onboarding: krok backup** (opcjonalny skip) jak w simple | S |
| A6 | **Brain tab: tryb prosty domyślnie** — jeden przycisk „Uruchom pamięć" zamiast 4 etapów | M |
| A7 | **Tooltip / info: dwa pipeline'y** — „Czaty = distill · Pliki = indeks" | S |
| A8 | **Settings → „Pokaż kreator ponownie"** | S |

### Faza B — Niezawodność beta

**Cel:** Na obcej maszynie widać, co nie działa, i jak to naprawić.

| # | Zadanie | Effort |
|---|---------|--------|
| B1 | **Health check screen** (Settings) — Ollama, modele, embedded brain, vault, MCP ping | S ✅ (v0) |
| B2 | **Smoke test checklist** — `docs/BETA-SMOKE.md` + skrypt `npm run smoke` | M |
| B3 | **Preflight przed distill** — blokada z listą braków (Ollama, model chat, embed) | S |
| B4 | **Eksport logów** — przycisk „Otwórz folder logów" (`userData/logs`) | S |
| B5 | **Antigravity: test na realnym dumpie** + dokumentacja ścieżki Windows | M |
| B6 | **Packaged brain-core smoke** w CI (Windows artifact) | L |
| B7 | **Lepsze błędy deploy** — UI gdy HTTP 404 / SMB niedostępny | M |
| B8 | **Telemetry opt-in** — crash + ostatni health snapshot (lokalnie / email) — **opcjonalnie później** | L |

### Faza C — Ekosystem

**Cel:** Pomnia + Brain + Cursor + landing mówią tym samym językiem.

| # | Zadanie | Effort |
|---|---------|--------|
| C1 | **One-page architecture** dla userów (nie infra) — PDF/Mermaid w `docs/` | S |
| C2 | **Support playbook** — „user nie widzi czatów Cursor" → kroki | M |
| C3 | **Landing: strona beta** — link do GitHub Releases / Formspree z tokenem | S |
| C4 | **Odświeżyć BRAIN-INTEGRATION.md** — Pomnia nie Continuum, bez IP | S |
| C5 | **Spójność MCP docs** z `snippet.ts` (wersje transportów) | M |
| C6 | **Code signing** (Windows Authenticode + Apple) — osobny track | L |

---

## 5. TOP 10 — priorytetyzacja

| # | Zadanie | Faza | Effort | Dlaczego teraz |
|---|---------|------|--------|----------------|
| 1 | `START-HERE.md` + README „Dla beta testera" | A | S | Natychmiastowa jasność ścieżki |
| 2 | Health check w Settings | B | S | Odpowiedź na „czy u mnie zadziała" |
| 3 | Usunąć hardcoded 192.168.x.x z UI | A | S | Blokuje obcych userów remote |
| 4 | Preflight Ollama + modele przed distill | B | S | Najczęstszy silent fail |
| 5 | Diagram / mapa w Dashboard | A | M | „Nie czuję przejrzystości" — core UX |
| 6 | `BETA-SMOKE.md` + checklist ręczna | B | M | Powtarzalna weryfikacja przed każdym release |
| 7 | Antigravity test na realnych danych | B | M | Obiecany adapter |
| 8 | Backup step w full onboarding | A | S | Dziura w happy path |
| 9 | Landing beta download path | C | S | Waitlist ≠ produkt |
| 10 | CI smoke brain-core na Windows artifact | B | L | Fresh Windows bez dev tools |

---

## 6. Czego NIE robić jeszcze

| Nie teraz | Powód |
|-----------|-------|
| **Mac build** | Osobny track (już w toku) |
| **Linux installer** | Świadomie odłożony w `electron-builder.yml` |
| **Tier 2 OCR / vision PDF** | Dokumentacja już mówi 🔲 — nie obiecywać w landing |
| **Sync sejfu (git/S3/WebDAV)** | README roadmap — rozprasza przed betą |
| **Tauri migracja** | Architektura OK na Electronie |
| **Batch 1668 sesji inbox** | Problem operatora, nie beta testera |
| **Brain-side merge-index API** | Wymaga zmian w Python hub — po stabilizacji desktop |
| **Publiczne repo vault crypto** | SECURITY.md — zamknięty instalator |
| **Pełna telemetria SaaS** | Sprzeczna z „local-first"; ewentualnie opt-in później |
| **Map-reduce długich rozmów** | Jakość, nie blocker beta |

---

## 7. Szybkie wygrane (zrobione / do zrobienia w sesji)

- [x] `docs/ROADMAP-CLARITY.md` (ten dokument)
- [x] README — sekcja **„Dla beta testera"**
- [x] Settings — **Health check** (Ollama, brain-core, vault, MCP)
- [x] `docs/START-HERE.md` — następny commit
- [ ] PR: usunięcie `REMOTE_URL` default z IP homelabu

---

## 8. Metryki „jesteśmy gotowi na 5 beta testerów"

- [ ] Każdy przechodzi `BETA-SMOKE.md` na czystym Windows 11 bez Node
- [ ] Health check zielony: Ollama + nomic-embed-text + vault open + MCP reachable
- [ ] Cursor Connect — snippet działa na co najmniej 2 różnych maszynach
- [ ] Zero wystąpień `192.168.x.x` w ścieżce UI (tylko docs/examples)
- [ ] Jeden dokument START-HERE — wszyscy beta testerzy dostają ten sam link

---

*Wygenerowano w audycie repo Pomnia · 2026-07-09*
