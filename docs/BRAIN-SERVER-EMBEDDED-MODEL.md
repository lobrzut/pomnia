# Brain Server — bundled embed model (~250–500 MB)

> Plan techniczny (2026-07-13). **Nie implementujemy tu pełnego obrazu** — tylko kontrakt, opcje i kolejność.
> Powiązane: `docs/BRAIN-KVM-ARCHITECTURE.md`, `BRAIN-INTEGRATION.md`, hub `Projects/brain` (Docker edge).

## Stan dziś (research)

| Warstwa | Embed dziś | Model | Wymaga Ollamy? |
|---------|------------|-------|----------------|
| **brain-core** (`packages/brain-core`, Node) | `POST {ollama}/api/embed` | `nomic-embed-text` → **dim 768** | **Tak** (MVP Ollama-only) |
| **Pomnia desktop embedded** | fork child → ten sam `EmbedClient` | j.w. | **Tak** — URL z Settings / `127.0.0.1:11434` |
| **Pomnia distill** | `qwen2.5:14b` (chat) | ~9 GB | Tak, na **PC klienta** (GPU) |
| **Brain hub Python** (`Projects/brain`) | `BRAIN_EMBED_BACKEND=fastembed` **lub** `ollama` | `nomic-ai/nomic-embed-text-v1.5` / Ollama `nomic-embed-text` | Edge Docker: **nie**; live KVM Alice: Ollama z wieloma modelami |
| **Docker edge** (`brain/docker-compose.yml` + `Dockerfile`) | fastembed ONNX, model **prefetch w build** | v1.5 | **Nie** — „No Ollama, no GPU” |

Klucz: wektory z Ollama `nomic-embed-text` i Python fastembed v1.5 są **zgodne kierunkowo** (dim 768) — istniejący `library.db` da się query’ować bez reindexu przy zmianie backendu (zweryfikowane Phase 0 / komentarze w `embed.ts` + `rag.py`).

---

## A. Co dokładnie bundlować

### Bundlować

- **Model:** `nomic-embed-text` / `nomic-ai/nomic-embed-text-v1.5` (137M, Apache 2.0).
- **Rozmiar:** ~**274 MB** (Ollama F16) albo cache ONNX fastembed (~**0,5 GB** przy pierwszym load / warstwie Docker — Dockerfile już to prefetchuje).
- **Rola:** wyłącznie embeddingi do `search_library` / reindex / doc index. **To wystarczy, by serwer „działał sam” po boot.**

### Nie bundlować

- **`qwen2.5:14b` (~9 GB) i inne chat/LLM** — distill zostaje na PC klienta (GPU). Serwer Brain = pamięć do pytań, nie fabryka notatek.
- Pełny katalog 32 modeli z live KVM Alice — to homelab power-user, nie produkt „Brain Server”.

### Footprint (oczekiwania)

| | Disk (image/warstwa) | RAM runtime (CPU embed) |
|--|----------------------|-------------------------|
| Tylko nomic (Ollama sidecar) | ~274 MB + runtime Ollama | ~0,5–1 GB przy warm model |
| fastembed ONNX (edge Docker) | ~0,5 GB w warstwie obrazu | ~0,5–1 GB po lazy load |
| + qwen 14b (NIE) | +~9 GB | +~10–16 GB VRAM/RAM |

Mały KVM (2–4 GB RAM, bez GPU) → **tylko embed**. Distill opcjonalny / offboard.

---

## B. Opcje realizacji — porównanie i rekomendacja

| # | Opcja | Pros | Cons | Homelab KVM | Produkt Brain Server |
|---|-------|------|------|-------------|----------------------|
| **1** | Ollama sidecar w compose + pre-pull `nomic-embed-text` | Ten sam kontrakt co desktop (`/api/embed`); łatwy swap modelu tagiem | Cięższy obraz (Ollama + model); kolejny proces; GPU niepotrzebne ale kusi „dokładanie LLM” | OK jako most do live 201 | OK, ale nadmiarowe |
| **2** | **ONNX / fastembed tylko pod embed** (bez Ollamy) | Już zrobione w hub Docker; `docker up` → search; mały RAM; zero ręcznego `ollama pull` | brain-core Node jeszcze tego nie ma; prefix `search_query:` trzeba trzymać w kodzie | Idealne dla lekkiego VM | **Najlepsze** |
| **3** | Bake modelu w binary/data brain-core | Jedna paczka Electron/daemon | Gigantyczny update Electron; trudniejszy bump modelu; miesza app z serwerem | Słabe | Słabe |

### Rekomendacja

1. **Brain Server / KVM image (produkt + lekki homelab):** **opcja 2** — utrzymać i utwardzić istniejący edge path w `Projects/brain` (`BRAIN_EMBED_BACKEND=fastembed`, model w warstwie Docker). Kryterium akceptacji: `docker compose … up` → `search_library` **bez** ręcznego `ollama pull`.
2. **Live KVM Alice (201):** zostaw Ollamę z GPU do distill/eksperymentów; search może iść fastembed **lub** Ollama — nie mieszaj backendów w jednym `library.db` bez świadomej decyzji (oba nomic 768 są OK, ale trzymaj jeden backend na deploy).
3. **brain-core Node (przyszłość):** po desktop parity dodać backend `onnx`/`fastembed`-equivalent **albo** opcjonalny Ollama sidecar tylko w compose serwerowym — nie piecz modelu w Electron.

---

## C. Kontrakt produktu / nazewnictwo UI

| Rola | Znaczenie dla usera |
|------|---------------------|
| **Serwer Brain** | Pamięć do pytań (MCP `search_library`, vault notes, index) |
| **Aplikacja Pomnia** | Zbieranie (backup/import) + vault `.pomnia` + distill na lokalnym GPU |

### Etykiety Settings / nawigacja (kierunek)

| Termin | Znaczenie |
|--------|-----------|
| **Archiwum** | Vault `.pomnia` — zaszyfrowane snapshoty (nie wyszukiwarka) |
| **Pamięć** | Indeks / Brain — to, po czym agent pyta |
| **Podłącz Cursor** | Connect MCP (`:7862`) |

### „Działa sam” po boot = minimum

- ✅ `search_library` / health MCP bez ręcznej instalacji modeli
- ✅ Reindex notatek już w vault
- ❌ Distill LLM **nie** jest wymagany na serwerze (opcjonalny, zwykle na desktopie)

---

## D. Kolejność wdrożenia

### Milestone 0 — Desktop first (uzgodnione)

- Embedded brain-core + **user Ollama** z `nomic-embed-text` (pull w UI jeśli brak).
- Distill = lokalny `qwen2.5:14b` (lub inny chat) — poza zakresem bundla serwera.
- UI: jasny health „Ollama + nomic” vs „wyszukiwarka działa”.

### Milestone 1 — KVM / Brain Server image z bundled embed

- Bazować na `brain/Dockerfile` + compose edge (fastembed prefetch).
- Smoke: `docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build` → Bearer token → MCP search na sample note.
- **Acceptance:** świeży host **bez** Ollamy → search OK w &lt; N minut po `up`.

### Milestone 2 — brain-core Node na serwerze (gdy rewrite dojrzeje)

- Albo: compose z Ollama sidecar (tylko nomic) pod `BRAIN_OLLAMA_URL`.
- Albo: natywny ONNX w Node (parity z Python edge).
- Nie: bundlować qwen w obrazie serwera.

### Milestone 3 — Produkt „działa sam” w copy

- Landing / START-HERE: serwer = pamięć; app = archiwum + zbieranie.
- Usunąć wrażenie, że KVM musi mieć 32 modele.

---

## E. Ryzyka

| Ryzyko | Mitygacja |
|--------|-----------|
| **GPU vs CPU embed** | Produkt = CPU ONNX; GPU Ollama tylko gdy user już ma stack |
| **Aktualizacje modelu** | Pin tagu (`v1.5`); bump = nowa warstwa obrazu + opcjonalny reindex; nie mieszać dim |
| **Licencja** | Nomic Embed **Apache 2.0** — OK komercyjnie; cytować w NOTICE obrazu |
| **Dual path desktop** | Embedded nadal używa **Ollamy usera** — nie obiecywać „zero Ollama” w Electron, dopóki Node nie ma ONNX |
| **English-centric nomic** | Hybrid search / PL queries — już zauważone w `brain-core` search; nie mylić z „brak modelu” |
| **Prefix query/document** | Ollama template vs explicit prefix w fastembed — nie psuć przy porcie do Node |

---

## Decyzja (skrót)

- **Bundlować:** tylko nomic-embed (~274 MB Ollama / ~0,5 GB ONNX), nie qwen.
- **Ścieżka serwera:** fastembed w obrazie Docker (już w hub) = „działa sam”.
- **Desktop:** nadal Ollama usera na MVP; serwer osobno.
- **Następny konkretny krok implementacyjny:** smoke test + dokumentacja acceptance Milestone 1 na obrazie edge — bez przebudowy Electron.
