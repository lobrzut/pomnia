# Pomnia rebrand checklist (phased)

**Do not rename the entire codebase in one shot.** Reliqua remains the internal/package name until each phase is tested.

Domain: **pomnia.ai** (purchased 2026-07-07)  
Product direction: local-first AI memory, vault, Brain MCP  
Tagline: user has a secret marketing line — keep generic placeholder until revealed.

---

## Phase 0 — Domain ✅

- [x] Register pomnia.ai
- [x] Save milestone to Brain vault

## Phase 1 — Landing & external presence (current)

- [x] `landing/index.html` — waitlist, PL/EN
- [x] `docs/LANDING-DEPLOY.md`
- [ ] DNS → Cloudflare Pages or nginx (see LANDING-DEPLOY.md)
- [ ] Formspree form ID or waitlist@pomnia.ai mailbox
- [ ] Optional: GitHub org/repo rename `reliqua` → `pomnia` (when ready for public)

## Phase 2 — Package metadata (low risk)

- [ ] `package.json` → add `"homepage": "https://pomnia.ai"`
- [ ] `package.json` → `"description"` user-facing copy mentions Pomnia
- [ ] `electron-builder.yml` → `productName: Pomnia` (installer shows Pomnia, appId can stay `dev.helluk.reliqua` initially)
- [ ] `resources/icon.ico` / mac icon — Pomnia branding when assets ready
- [ ] GitHub release artifact name: `Pomnia-0.1.x-setup.exe`

## Phase 3 — UI strings (medium risk)

Search: `Reliqua`, `reliqua`, `continuum` in user-visible strings only.

| Area | Files | Notes |
|------|-------|-------|
| Window title / tray | `src/main/index.ts`, `src/main/tray.ts` | App name in OS shell |
| Onboarding / welcome | `src/renderer/src/pages/Onboarding.tsx` | First impression |
| Settings about | `src/renderer/src/pages/Settings.tsx` | Version + links |
| Shell header | `src/renderer/src/components/Shell.tsx` | Logo text |
| Labels | `src/renderer/src/lib/labels.ts` | Centralized copy |
| README | `README.md` | Dual name: "Pomnia (formerly Reliqua)" during transition |

Keep internal module paths (`@reliqua/brain-core`, vault extension `.continuum`) unchanged until Phase 4.

## Phase 4 — Internal identifiers (high risk, post-beta)

- [ ] npm package name `reliqua` → `pomnia` (breaking for any consumers)
- [ ] CLI binary `reliqua` → `pomnia`
- [ ] `appId` in electron-builder → `ai.pomnia.app`
- [ ] Workspace `@reliqua/brain-core` → `@pomnia/brain-core`
- [ ] Vault file extension `.continuum` — **keep or migrate** (migration script required if changed)
- [ ] Config paths under `~/.reliqua` — symlink or migration

## Phase 5 — Public launch

- [ ] Public GitHub repo or releases page linked from landing
- [ ] Replace "Reliqua 0.1.2" download block on landing with real release URL
- [ ] SECURITY.md, support email @pomnia.ai
- [ ] Beta cohort 10–50 users (Phase 3 of startup plan)

---

## Quick reference — files that will change

```
package.json              name, description, homepage, bin
electron-builder.yml      productName, appId (later)
README.md                 product name, links
landing/index.html        already Pomnia-branded
src/renderer/...          UI strings
src/main/tray.ts          tooltip / menu labels
resources/                icons, installer graphics
.github/workflows/        release names, artifact paths
```

---

## Rollback

If a phase breaks builds or installs:

1. Revert only the files from that phase (git revert commit).
2. `productName` and UI strings are safe to revert independently of package name.
3. Never change vault extension without a migration — users lose unlock paths.
