# Pomnia — clarity and beta-readiness roadmap

> **Audit:** 2026-07-09 · repo `pomnia` + the Brain / Cursor / landing ecosystem  
> **Context:** setting the Mac build aside — the owner does not feel the app and its ecosystem are legible, and has no confidence the features will work on anyone else's machine.

---

## Executive summary

Pomnia has a **working engine** (vault, backup, import, distill, embedded brain-core, MCP Connect), but the product is still **designed around the operator's homelab**: hardcoded IPs, two vaults without a single story, two pipelines (chats vs documents), embedded vs remote brain. All of that needs **one "START HERE" path** and **a health screen** before beta testers get an installer.

Priority: **clarity first (Phase A)**, then **reliability on other people's machines (Phase B)**, then **ecosystem consistency (Phase C)**.

---

## 1. The full user journey (what should be obvious)

### 1.1 The intended story (happy path)

```
Install → Vault (passphrase) → Chat backup → Import (optional)
    → Brain: Ollama + models → Distill backlog → Connect (MCP to Cursor)
    → Doc import (optional) → Homelab deploy (optional)
```

### 1.2 Step map vs where we are

| Step | Where in the UI | What the user should understand | Where the confusion is |
|------|------------|---------------------------|------------------------|
| **1. Install** | NSIS / DMG (unsigned) | "This is a local app, not a cloud service" | No code signing → SmartScreen / Gatekeeper; no link from the landing page to a build |
| **2. First run** | `Onboarding.tsx` | Vault → backup → memory → Connect | **Full mode** skips the backup step; **simple mode** has backup, on by default; full mode's steps are in English |
| **3. Vault** | Onboarding + VaultGate | One encrypted `.pomnia` folder | Users confuse the **Pomnia Vault** with the **Brain data dir** (`%AppData%/pomnia/brain-core-data/`) — two stores, one word "vault" |
| **4. Backup** | Dashboard / Onboarding (simple) | Scan → pick sources → snapshot | Cursor with a large `state.vscdb` — parse skipped with no clear instruction; Antigravity — the adapter has only a synthetic test |
| **5. Chat import** | Import | Claude/ChatGPT/Gemini ZIPs | Separate from live backup — users do not know when to use which |
| **6. Brain start** | Brain + onboarding engine step | Ollama locally **or** a remote homelab | Embedded needs Ollama plus `nomic-embed-text`; without it distill/index goes quiet or fails indirectly |
| **7. Distill** | Brain | Chats → `.md` notes → embeddings | **"Distill" means two things**: the Pomnia pipeline, and `save_conversation` in an MCP chat — explained only in `DOCUMENT-PIPELINE.md` |
| **8. Connect** | Connect | Paste an MCP snippet into Cursor | `REMOTE_URL` defaults to `192.168.x.x:7862`; minting a token needs the dashboard on `:7860` |
| **9. Doc import** | Import + Brain | PDF/DOCX → vault → index | Phase 1 partly done; EPUB v0.2; OCR 🔲 — the landing page promises more than the exe delivers |
| **10. Homelab deploy** | Brain (advanced) | SMB / HTTP to the Brain VM | Default paths come from homelab documentation; no wizard for "where do I paste the token" |

### 1.3 Diagram — two pipelines and two "brains"

```
                    ┌─────────────────────────────────────┐
                    │        POMNIA DESKTOP (.exe)         │
                    │  Vault (.pomnia) · adapters · UI     │
                    └───────────┬─────────────────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           ▼                    ▼                    ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
    │  PATH A     │    │  Ollama     │    │  PATH B         │
    │  CHATS      │    │  localhost  │    │  DOCUMENTS      │
    │  distill    │───►│  :11434     │◄───│  direct index   │
    │  (LLM)      │    │  nomic-embed│    │  (no LLM)       │
    └──────┬──────┘    └──────┬──────┘    └────────┬────────┘
           │                  │                     │
           └────────┬─────────┴─────────────────────┘
                    ▼
         ┌──────────────────────┐
         │  brain-core embedded │  127.0.0.1:7862 (MCP)
         │  library.db          │
         └──────────┬───────────┘
                    │ optional deploy
                    ▼
         ┌──────────────────────┐
         │  Remote Brain (LAN)  │  e.g. :7862 MCP + :7860 API
         │  homelab / KVM       │
         └──────────────────────┘
```

**The main source of chaos:** the user sees Dashboard · Chats · Import · Brain · Connect · Settings, with no "you are here" map, and no distinction between **collecting**, **remembering semantically**, and **connecting an agent**.

---

## 2. Beta-readiness gaps — what will break for other people

### 2.1 Hardcoded / homelab-specific

| Location | Problem | Risk |
|-------------|---------|--------|
| `Onboarding.tsx`, `Connect.tsx` | `REMOTE_URL = 'http://brain.example.local:7862'` | Remote brain "works" only on the author's network |
| `Settings.tsx` | `connectStatus('http://brain.example.local:7862')` | MCP client list ignores the user's own URL |
| `api.ts` (mock) | The same IP in preview | Fine in dev, misleading in a demo |
| `docs/BRAIN-INTEGRATION.md`, `COMFYUI-ASSETS.md` | IPs, `/opt/BRAIN` paths, tokens | A beta tester reads this and assumes it is required |
| `brain/deploy.test.ts` | An IP inside a test | Low — a test only |

### 2.2 Silent failures and weak messages

- **Ollama offline** — `ensureBrain.ts` returns an error, but a user who skipped onboarding may never learn why distillation will not start.
- **`nomic-embed-text` missing** — index and doc import fail; the UI offers a pull in Brain but does not block the path with a clear "required before indexing".
- **brain-core on a fresh Windows** — needs `electron-builder install-app-deps` at build time; in dev without `node` on PATH the forked child fails (`brainCore.ts`).
- **Cursor parse skipped** — a large vscdb means a backup with no chats and no prominent "use Import instead" call to action.
- **Deploy HTTP 404** — `deploy.ts` logs "use filesystem"; the user never sees it in the UI.
- **Reindex failure** — a `warn` toast in the store, easy to miss.

### 2.3 External dependencies

| Dependency | Required for | Documentation status |
|-----------|--------------|---------------------|
| **Ollama** | distill, embed, doc index | README yes; onboarding partly |
| **nomic-embed-text** | every embedding | mentioned in the onboarding engine step |
| **qwen2.5:14b** (or a VRAM profile) | distillation | profiles in Brain, hidden in simple mode |
| **Bearer token** | remote MCP | Connect mints one fine, but never says where to get one by hand |
| **Apple / MS code signing** | distribution | **none** — unsigned in CI (`release-mac.yml`) |

### 2.4 Adapters and platforms

| Area | State | On other machines |
|--------|------|----------|
| **Antigravity** | one synthetic test (`~/.gemini/antigravity/...`) | **Unverified** on real machines and Windows paths |
| **Claude Desktop** | snapshot, not full chats | Fine as a "config backup" |
| **Hermes** | in Connect, missing from the README table | Unclear |
| **Mac paths** | `locations.ts` is cross-platform | Mac build in progress; less testing on live macOS |
| **Linux** | engine fine, no installer | Deliberately out of scope |

### 2.5 Tests — coverage vs gaps

**Present (~20 test files):** vault/crypto, import archives, distill deploy, ollama settings, library index auto-start, the antigravity parser, doc-parser PDF/DOCX/EPUB.

**Missing:**
- E2E / smoke: "fresh install → vault → backup → brain status"
- Renderer: Onboarding, Connect, Brain (only `labels.test.ts`, `format.test.ts`)
- IPC integration tests
- `brainCore` fork against a packaged build (only the manual `scripts/_smoke-brain-core-fork.mjs`)
- Connect's `checkAllClients` against fixture Cursor/Antigravity configs

### 2.6 First-run wizard — completeness

| Element | Full mode | Simple mode |
|---------|-----------|-------------|
| Vault | ✅ | ✅ |
| Backup | ❌ (skipped) | ✅ |
| Ollama check | ✅ engine step | ✅ SimpleBrainStep |
| Embedded brain start | partly | ✅ |
| Connect snippet | ✅ skippable | ✅ |
| Doc import | ❌ | ❌ |
| Health summary | ✅ Ready step (outcomes) | ✅ |
| **Reset the wizard** | ❌ not in Settings | ❌ |

---

## 3. Ecosystem — what is documented

### 3.1 Document map

| Document | Audience | Problem |
|----------|----------|---------|
| `README.md` | dev / power user | Technically strong, no "START HERE" for a beta |
| `docs/DOCUMENT-PIPELINE.md` | architect | **The best one** — but 490 lines, not for a beta tester |
| `docs/BRAIN-INTEGRATION.md` | homelab operator | Old Continuum naming, 192.168.x.x IPs |
| `docs/BRAIN-KVM-ARCHITECTURE.md` | infra | Too niche for a starting point |
| `docs/MAC-BUILD.md` | release | Fine |
| Landing deploy docs | ops | **removed from the product repo** — the site lives outside the AGPL tree |
| Marketing site | public | outside this repo (Cloudflare / pomnia.ai) |
| Brain vault / chat | operator only | Product decisions invisible from the repo |

### 3.2 The missing artifact

**`docs/START-HERE.md`** (or a README section) — one page:

1. What Pomnia is (one sentence)
2. What Brain is (embedded vs remote) — one diagram
3. The minimum setup (Ollama + two models)
4. Five steps to "Cursor remembers"
5. Where to get help / find logs
6. What NOT to promise (a signed installer, full OCR, cloud sync) — and the Linux AppImage only once the asset is actually on Releases

### 3.3 Landing page vs product

| The landing says | The product today |
|--------------|--------------|
| "memory layer for your AI" | ✅ accurate |
| "distilled on your GPU" | ✅ with Ollama |
| "every assistant" | ⚠️ with caveats (large Cursor DB, Antigravity) |
| waitlist | The installer exists — **there is no beta download path** |
| `index-fable.html` | A narrative variant, out of sync with `index.html` |

---

## 4. Phases

### Phase A — Clarity (UX, onboarding, copy)

**Goal:** after ten minutes a user knows what they have done and what is still needed.

| # | Task | Effort |
|---|---------|--------|
| A1 | **`docs/START-HERE.md`** plus links from the README and the onboarding Ready step | S |
| A2 | **A diagram inside the app** — Dashboard or Brain: "Collect → Vault → Distill → MCP" (collapsible) | M |
| A3 | **One consistent language** — full onboarding matching simple mode; "Vault" vs "Brain folder" in the copy | M |
| A4 | **Remove the hardcoded IP** — use `remoteBrainUrl` from the store everywhere; empty default plus a placeholder | S |
| A5 | **Full onboarding: a backup step** (skippable), as in simple mode | S |
| A6 | **Brain tab: simple mode by default** — one "Start memory" button instead of four stages | M |
| A7 | **Tooltip / note: two pipelines** — "Chats = distill · Files = index" | S |
| A8 | **Settings → "Show the wizard again"** | S |

### Phase B — Beta reliability

**Goal:** on someone else's machine it is visible what is broken and how to fix it.

| # | Task | Effort |
|---|---------|--------|
| B1 | **Health check screen** (Settings) — Ollama, models, embedded brain, vault, MCP ping | S ✅ (v0) |
| B2 | **Smoke test checklist** — `docs/BETA-SMOKE.md` plus an `npm run smoke` script | M |
| B3 | **Preflight before distillation** — block with a list of what is missing (Ollama, chat model, embedder) | S |
| B4 | **Log export** — an "Open logs folder" button (`userData/logs`) | S |
| B5 | **Antigravity: test against a real dump** plus documentation of the Windows path | M |
| B6 | **Packaged brain-core smoke** in CI (Windows artifact) | L |
| B7 | **Better deploy errors** — UI for HTTP 404 / SMB unreachable | M |
| B8 | **Opt-in telemetry** — crash plus the last health snapshot (local / email) — **optional, later** | L |

### Phase C — Ecosystem

**Goal:** Pomnia, Brain, Cursor and the landing page all speak the same language.

| # | Task | Effort |
|---|---------|--------|
| C1 | **A one-page architecture** for users, not infra — PDF/Mermaid in `docs/` | S |
| C2 | **Support playbook** — "the user cannot see Cursor chats" → steps | M |
| C3 | **Landing: a beta page** — link to GitHub Releases / Formspree with a token | S |
| C4 | **Refresh docs/BRAIN-INTEGRATION.md** — Pomnia, not Continuum; no IPs | S |
| C5 | **MCP docs consistent** with `snippet.ts` (transport versions) | M |
| C6 | **Code signing** (Windows Authenticode + Apple) — its own track | L |

---

## 5. TOP 10 — priority order

| # | Task | Phase | Effort | Why now |
|---|---------|------|--------|----------------|
| 1 | `START-HERE.md` + a README "for beta testers" section | A | S | Immediate clarity about the path |
| 2 | Health check in Settings | B | S | Answers "will this work on my machine" |
| 3 | Remove hardcoded 192.168.x.x from the UI | A | S | Blocks every remote user who is not the author |
| 4 | Preflight for Ollama and models before distillation | B | S | The most common silent failure |
| 5 | Diagram / map on the Dashboard | A | M | "I don't feel it's clear" — core UX |
| 6 | `BETA-SMOKE.md` plus a manual checklist | B | M | Repeatable verification before every release |
| 7 | Antigravity tested against real data | B | M | A promised adapter |
| 8 | Backup step in full onboarding | A | S | A hole in the happy path |
| 9 | A landing beta download path | C | S | A waitlist is not a product |
| 10 | CI smoke of brain-core on a Windows artifact | B | L | Fresh Windows with no dev tools |

---

## 6. What not to do yet

| Not now | Reason |
|-----------|--------|
| **Mac build** | Its own track (already under way) |
| **Tier 2 OCR / vision PDF** | The docs already say 🔲 — do not promise it on the landing page |
| **Vault sync (git/S3/WebDAV)** | README roadmap — a distraction before a beta |
| **Tauri migration** | The architecture is fine on Electron |
| **Batch of 1668 inbox sessions** | An operator's problem, not a beta tester's |
| **Brain-side merge-index API** | Needs changes in the Python hub — after the desktop stabilises |
| **Public repo for vault crypto** | SECURITY.md — closed installer |
| **Full SaaS telemetry** | Contradicts "local-first"; possibly opt-in later |
| **Map-reduce for long conversations** | Quality, not a beta blocker |

---

## 7. Quick wins (done / to do in this session)

- [x] `docs/ROADMAP-CLARITY.md` (this document)
- [x] README — a **"for beta testers"** section
- [x] Settings — **health check** (Ollama, brain-core, vault, MCP)
- [x] `docs/START-HERE.md` — next commit
- [ ] PR: drop the `REMOTE_URL` default carrying a homelab IP

---

## 8. "Ready for five beta testers" metrics

- [ ] Every one of them gets through `BETA-SMOKE.md` on a clean Windows 11 with no Node
- [ ] Health check green: Ollama + nomic-embed-text + vault open + MCP reachable
- [ ] Cursor Connect — the snippet works on at least two different machines
- [ ] Zero occurrences of `192.168.x.x` anywhere in a UI path (docs and examples only)
- [ ] One START-HERE document — every beta tester gets the same link

---

*Produced during the Pomnia repo audit · 2026-07-09*
