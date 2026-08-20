# Pomnia audit — 2026-07-09

> **Historical snapshot (2026-07-09).** Not current product state. For live facts use [README](../README.md), [SECURITY.md](../SECURITY.md), and [docs/START-HERE.md](START-HERE.md). Remote is now `lobrzut/pomnia`; the marketing landing page is **outside** this repo; the release line is 0.1.35+.

> **Scope (as of then):** the local tree plus the ecosystem (Brain MCP, landing page, homelab)  
> **Product version then:** 0.1.2 · **Branch:** `master` · **Auditor:** agent (code, tests, docs, repo state)

---

## Executive summary (one page)

### Overall verdict: 🟡 **The engine is ready — the beta product needs its UX and distribution closed off**

Pomnia has a **working technical core**: an encrypted vault, chat backup, archive import, the distill→index→MCP pipeline, and embedded brain-core inside the Windows installer. This is not a prototype — **419 Claude Code files and 148 Cursor chats** made the round trip in tests against live data (README). The installer **`Pomnia-0.1.2-setup.exe`** (~94 MB) sits in `release/` and is ready for manual beta distribution.

**The main problem is not engineering but product:** two stores both called "vault", two pipelines (chats vs documents), and an onboarding/landing layer that **does not close the promise** for a stranger on Windows without Node or Ollama. ~~The default homelab IP~~ — **fixed** in `74db87d` (per-user `app-settings.json`, empty default remote URL).

### Signals

| Area | Status | Comment |
|--------|--------|-----------|
| Vault engine + crypto | 🟢 | 7/7 engine tests, incremental backup fine |
| Adapter backup | 🟢 | Claude Code, Cursor verified; Antigravity 🟡 |
| Distill + embedded brain | 🟢 | Needs Ollama and two models; works for the operator |
| Doc import (PDF/DOCX/EPUB) | 🟡 | Parser + vault + index — code and tests fine; OCR 🔲 |
| MCP Connect (Cursor) | 🟢 | Snippet + minted token; the client needs a restart |
| UX clarity | 🟢 | Map (75c15d4) + animated FlowDiagram (b85e410) ✅ |
| External distribution | 🔴 | Unsigned exe, no GitHub Release, landing 503 |
| Mac | 🟡 | CI workflow ready; no published DMG |
| CI tests | 🟡 | 73/74 pass; 1 native-module failure (Node ABI) |
| Branding | 🔴 | No final logo chosen; the old icon.ico |

### Three headline conclusions

1. **You could hand three to five beta testers the Windows exe today** — provided onboarding is done by hand (Ollama, START-HERE, the SmartScreen bypass) and they use the embedded brain rather than a remote homelab.
2. ~~**A stranger's remote Brain will fall over**~~ — ✅ **FIXED** (`74db87d`): no default homelab IP; embedded Brain recommended to start; a remote URL only when the user types one.
3. **Before a "public beta" what is missing:** a published release plus a download page, a logo decision, and a fix for the brain-core test on current Node.

### Two-week recommendation

**Week 1 — "five testers without embarrassment":** ~~hardcoded IP → empty default~~ ✅; `BETA-SMOKE.md`; GitHub Release 0.1.2; a landing page linking to the exe; an Ollama preflight before distillation in the UI.

**Week 2 — "not only on my machine":** Antigravity against a real dump; full onboarding with a backup step; the first `v0.1.3` tag; a brain-core smoke test against a packaged Windows build in CI; a logo decision → swap `resources/icon.ico`.

---

## 1. Repository state

### 1.1 Git

| Metric | Value |
|---------|---------|
| Branch | `master` |
| HEAD | `e14a438` — *fix(ui): FlowDiagram — document branch below* (+ `74db87d` fixing the hardcoded IP) |
| Working tree | **CLEAN** (apart from untracked: the audit doc, `_agent_out.txt`, `_icon.txt`, `_pack_full.txt`) |
| Remote | `origin` → `https://github.com/lobrzut/reliqua.git` (private) |
| Tags | **no** `v*` tags in the repo |
| GitHub Releases | **none** published (`gh release list` empty) |

**Last three commits:**

```
b85e410 feat(ui): animated Pomnia flow diagram (How it works)
75c15d4 feat(ui): Pomnia Map and status strip for beta testers
b0b7463 docs: beta clarity roadmap + health check in Settings
```

### 1.2 Key commits / features

| Feature | Commit / state | In master? |
|---------|---------------|-----------|
| Pomnia Map + StatusStrip + HowItWorks | `75c15d4` | 🟢 YES |
| Health check (Settings) | `b0b7463` | 🟢 YES |
| START-HERE.md | `75c15d4` (update) | 🟢 YES |
| Animated FlowDiagram | `b85e410` (+358 lines in `FlowDiagram.tsx`) | 🟢 YES — commit `502eaece` does not exist in the repo; master has `b85e410` |
| Release 0.1.2 (tray, Antigravity, persistence) | `db6246b` (in history) | 🟢 YES |

### 1.3 Tests (`npm test`)

```
Test Files  1 failed | 20 passed (21)
Tests       1 failed | 73 passed (74)
```

| Result | Detail |
|-------|----------|
| 🟢 73 tests | vault, crypto, import, distill deploy, ollama, library index, doc-parser PDF/DOCX/EPUB, antigravity parser, activity, labels |
| 🔴 1 test | `packages/brain-core/tests/indexDocument.test.ts` — **better-sqlite3 ABI mismatch** (compiled for NODE_MODULE_VERSION 130, Node wants 137). Fix: `npm rebuild better-sqlite3` or `@electron/rebuild` |

**Note:** the packaged build in `release/win-unpacked/` carries its own copy of `better-sqlite3`, so the desktop app probably works; the failure is about dev/test on current Node 22+.

### 1.4 Installer / `release/`

| Artifact | State |
|----------|------|
| `release/Pomnia-0.1.2-setup.exe` | 🟢 **present** (~98,483,362 B) |
| `release/latest.yml` | 🟢 version 0.1.2, SHA512, dated 2026-07-08 |
| `release/win-unpacked/` | 🟢 unpacked app + bundled `brain-core` |
| Code signature | 🔴 **unsigned** — SmartScreen / Gatekeeper warning |

---

## 2. Feature matrix

Legend: 🟢 **WORKS** · 🟡 **PARTIAL** · ⚪ **UNTESTED** · 🔴 **BROKEN**

| Feature | Status | Evidence / notes |
|---------|--------|---------------|
| **Vault** (create, open, encrypt) | 🟢 WORKS | `engine.test.ts` 7/7; AES-256-GCM + scrypt; round trip on live data |
| **Backup** (live adapters) | 🟢 WORKS | `backup.ts` + adapters; README: 419+148 files |
| **Backup — Claude Code** | 🟢 WORKS | hybrid JSONL + snapshot; import tests |
| **Backup — Cursor** | 🟡 PARTIAL | Works; a large `state.vscdb` means parse skipped, 0 chats and no call to action |
| **Backup — Claude Desktop** | 🟢 WORKS | config snapshot (not full chats) — as promised |
| **Backup — Antigravity** | 🟡 PARTIAL | one synthetic test; ⚪ on real Windows machines |
| **Backup — VS Code / Windsurf / Continue** | 🟡 PARTIAL | profile snapshot; ⚪ full verification during beta |
| **Distill** (general pipeline) | 🟢 WORKS | `distill.ts` + Ollama qwen; quality gate ok/stub/garbage |
| **Distill per adapter** | 🟡 PARTIAL | Distillation operates on a `Conversation` after backup/import, not per adapter; quality follows the adapter's extraction quality |
| **Chat import** (ZIP/JSON) | 🟢 WORKS | `archives.ts`; Claude.ai, ChatGPT, Gemini, Grok |
| **Doc import — PDF** | 🟡 PARTIAL | `doc-parser` + `docImport.ts`; minimal PDF test passes; scans without OCR come out sparse |
| **Doc import — DOCX** | 🟡 PARTIAL | mammoth; one test; GUI drag-and-drop |
| **Doc import — EPUB** | 🟡 PARTIAL | v0.2; three epub tests |
| **Doc import — MD/TXT** | 🟢 WORKS | passthrough |
| **Encrypted library** (blobs in the vault) | 🟢 WORKS | the `stores library documents as encrypted blobs` test |
| **Embedded brain-core** | 🟢 WORKS | forked child, port 7862; bundled in the exe; Settings health check |
| **Remote brain** (homelab MCP) | 🟡 PARTIAL | Code fine; **default URL is a homelab IP**; needs a Bearer token |
| **MCP Connect** (Cursor) | 🟢 WORKS | `Connect.tsx`, snippet, minted token; ⚪ Hermes/Antigravity clients less tested |
| **Homelab deploy** | 🟡 PARTIAL | CLI `brain deploy`; SMB/HTTP; 404s barely visible in the UI |
| **Tray** | 🟢 WORKS | `tray.ts`; brain status + activity line; release 0.1.2 |
| **Activity status** | 🟢 WORKS | `activity.ts` + `StatusStrip` on the Dashboard |
| **Diagnostics** | 🟢 WORKS | Settings → HealthCheck: vault, Ollama, models, brain-core, MCP |
| **Onboarding** | 🟡 PARTIAL | Simple mode ✅; full mode: no backup step |
| **Landing** | 🔴 BROKEN | `pomnia.ai` → **503**; a waitlist with no link to the exe |

---

## 3. Clarity audit

### 3.1 The "How it works" page

| Element | State | Assessment |
|---------|------|-------|
| Route `/how-it-works` | 🟢 | In the sidebar (Shell) |
| `GuideMap` — the steps | 🟢 | Nine steps linking to the tabs |
| `FlowDiagram` — animated flow | 🟢 | `b85e410` — SVG plus particle animation, full/mini variants, replay |
| "Replay animation" button | 🟢 | In `HowItWorks.tsx` |
| Link from the Dashboard | 🟢 | "I don't know where to start →" |
| `StatusStrip` "Where you are now" | 🟢 | On the Dashboard — vault, Ollama, brain, backlog |

**Verdict:** 🟢 **The page is complete** — a static map plus an animated diagram plus links to the tabs. A beta tester gets the whole story of the flow.

### 3.2 What still confuses a beta user

| # | Problem | Where | Priority |
|---|---------|-------|-----------|
| 1 | **Two "vaults"** — `.pomnia` vs `brain-core-data/` | Everywhere | 🔴 |
| 2 | **Two pipelines** — chats (distill + LLM) vs documents (direct index) | Import, Brain | 🟡 |
| 3 | ~~**Embedded vs remote** — the operator's remote URL by default~~ | Connect, Onboarding, store | ✅ FIXED `74db87d` |
| 4 | **Backup vs Import** — when to use which | Dashboard, Import | 🟡 |
| 5 | **Full onboarding skips backup** | `Onboarding.tsx` FULL_STEPS | 🟡 |
| 6 | **Ollama as a hidden dependency** | Distillation goes quiet with no preflight in the UI | 🟡 |
| 7 | **"Distill" vs `save_conversation` in MCP** | Only in DOCUMENT-PIPELINE.md | ⚪ |
| 8 | No **"Show the wizard again"** in Settings | Settings | 🟡 |
| 9 | The landing says "coming soon" — the exe already exists | pomnia.ai | 🔴 |

### 3.3 Documentation — what exists, what is missing

| Document | Status |
|----------|--------|
| `docs/START-HERE.md` | 🟢 One page for the beta |
| `docs/ROADMAP-CLARITY.md` | 🟢 Clarity audit plus phases A/B/C |
| `docs/DOCUMENT-PIPELINE.md` | 🟢 Master doc (490 lines — too dense for a beta) |
| `docs/BETA-SMOKE.md` | 🔴 **Missing** — a TODO in the roadmap |
| `README.md` beta section | 🟢 |

---

## 4. Risks for an external user

| Risk | Severity | Detail | Mitigation |
|--------|----------|----------|-----------|
| ~~**Hardcoded IP 192.168.x.x**~~ | ✅ FIXED | `74db87d` — per-user `app-settings.json`, empty default remote | Embedded recommended; remote only from the user's URL |
| **Ollama required** | 🟡 | distill, embed, doc index — without it the pipeline stops | Health check ✅; no preflight block before distillation |
| **Models need ~8 GB RAM** | 🟡 | `qwen2.5:14b` + `nomic-embed-text` | Documented in START-HERE; no "light" profile in the UI |
| **Unsigned installer** | 🔴 | SmartScreen blocks it; no Authenticode | The README has instructions; code signing is its own track |
| **better-sqlite3 / native modules** | 🟡 | Dev test fails; packaged may be fine | CI rebuild; smoke test on fresh Windows |
| **Cursor shows 0 chats** | 🟡 | Large vscdb | Import the ZIP export instead |
| **Antigravity paths** | 🟡 | `~/.gemini/antigravity` — unusual | ⚪ untested elsewhere |
| **Brain data is plaintext** | 🟡 | `%AppData%/pomnia/brain-core-data/` is unencrypted | Described in START-HERE; the user has to know |
| **No telemetry / crash reports** | ⚪ | Hard to diagnose during a beta | Log export ✅ (`api.openLogs`) |
| **Private repo, no public release** | 🔴 | A tester has nowhere official to download from | GitHub Release + landing page |
| **Remote MCP token** | 🟡 | Needs the dashboard on :7860, or minting in Connect | No instructions for getting a token by hand |
| **SMB deploy paths** | 🟡 | Examples like `\\192.168.x.x\brain\` in the docs | A deploy wizard |

### ~~Hardcoded IP map~~ — FIXED (`74db87d`, 2026-07-09)

The default homelab URL is gone from the UI, store, snippet and CLI. A remote Brain now requires the user to type it; embedded `127.0.0.1:7862` is the default path in onboarding.

---

## 5. Logo and branding

| Element | Status |
|---------|--------|
| **Final icon** | 🔴 **Not chosen** — `docs/BRAND-LOGO.md`: waiting on a decision between Moss Vault / Dew Sigil / the bold series |
| **`resources/icon.ico`** | 🔴 Still the old Reliqua style (violet plus an "R") |
| **Slavic green palette** | 🟡 Defined in the docs; the UI and landing are still violet/cyan |
| **Concept gallery** | 🟢 `assets/generated/` + preview.html |
| **Landing live** | 🔴 `https://pomnia.ai` → **503 Service Unavailable** (2026-07-09) |
| **Landing content** | 🟡 Formspree waitlist; the download section says "soon"; no link to GitHub Releases |
| **Domain** | 🟢 Registered 2026-07-07 (`LANDING-DEPLOY.md`) |
| **index-fable.html** | ⚪ A narrative variant, out of sync with `index.html` |

---

## 6. Mac — status (short)

| Aspect | State |
|--------|------|
| Local build | 🟡 macOS only (`docs/MAC-BUILD.md`) |
| CI | 🟢 `.github/workflows/release-mac.yml` — triggered by a `v*` tag or manually |
| Signature | 🔴 Unsigned (`CSC_IDENTITY_AUTO_DISCOVERY: false`) |
| Published DMG | 🔴 No tags, so the workflow has never run for a release |
| Cross-platform paths | 🟢 `locations.ts` — Win/Mac/Linux |
| Tests on macOS | ⚪ No regular CI beyond the release workflow |

**Conclusion:** Mac is **its own track** — documentation and CI are ready, but there is no artifact to distribute.

---

## 7. Top priorities — the next two weeks

### Week 1 (9–15 July 2026)

| # | Task | Effort | Phase | Why |
|---|---------|--------|------|----------|
| 1 | ~~Remove the `192.168.x.x` default from UI/store/snippet~~ ✅ **2026-07-09** | S | A | A remote blocker for strangers |
| 2 | `docs/BETA-SMOKE.md` plus a 15-minute checklist | S | B | Repeatable verification before every exe |
| 3 | GitHub Release 0.1.2 with `Pomnia-0.1.2-setup.exe` | S | C | An official link for testers |
| 4 | Landing: a download link, and fix the 503 | S | C | A waitlist is not a product |
| 5 | Ollama preflight before distillation (block plus a list of what is missing) | S | B | The number one silent failure |

### Week 2 (16–22 July 2026)

| # | Task | Effort | Phase | Why |
|---|---------|--------|------|----------|
| 7 | Choose a logo → swap `icon.ico` and the tray | M | C | First impression |
| 8 | Full onboarding: a backup step | S | A | A hole in the happy path |
| 9 | Antigravity: test against a real Windows dump | M | B | A promised adapter |
| 10 | `npm rebuild` / fix the `indexDocument` test in CI | S | B | 74/74 green |
| 11 | Settings → "Show the wizard again" | S | A | Beta support |
| 12 | Tag `v0.1.3` plus a Mac DMG artifact from CI | M | Mac | The first cross-platform release |

### "Ready for five beta testers" metrics (from ROADMAP-CLARITY)

- [ ] Every one of them gets through `BETA-SMOKE.md` on a clean Windows 11 **without Node**
- [ ] Health check green: Ollama + nomic-embed-text + vault + MCP
- [ ] Cursor Connect on two or more different machines
- [x] Zero `192.168.x.x` in any UI path *(fixed 2026-07-09 — per-user `app-settings.json`)*
- [ ] One START-HERE link plus an exe download

---

## 8. Appendix — quick architecture map

```
Assistants (Claude Code, Cursor, …)
        │ backup / ZIP import
        ▼
  Pomnia Vault (.pomnia) ── encrypted AES-256-GCM
        │
        ├──► Chats tab (full text, no GPU)
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
                               ▼ optionally
                    Remote Brain homelab (user URL + token)
                               │
                               ▼
                    Cursor / other MCP clients
```

---

## 9. History of this audit

| Date | Action |
|------|-------|
| 2026-07-09 | Full repo and ecosystem audit; tests 73/74; `release/` verified; HEAD b85e410 (map + animation) |
| 2026-07-09 | Related: `docs/ROADMAP-CLARITY.md`, `docs/START-HERE.md` |
| 2026-07-09 | Blocker #1, the hardcoded IP → **FIXED** (`74db87d`); FlowDiagram MCP: skills → search_library |

---

*Pomnia · local-first AI memory · internal audit for the operator*
