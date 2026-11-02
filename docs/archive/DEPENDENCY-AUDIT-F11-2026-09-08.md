# Dependency audit follow-up (F11) — 2026-09-08

Codexa audit finding **F11**: stale vulnerable dependency tree, including Electron
as a shipped runtime (listed under `devDependencies` but delivered to users).

This note records what was done on `fix/integralnosc-zapisu`, what remains
deferred, and why. **Do not run `npm audit fix --force`.**

## Snapshot after this change

| Scope | Before (audit day) | After this session |
|-------|--------------------|--------------------|
| Full `npm audit` | 37 (2 critical, 28 high, 7 moderate) | ~25 (2 critical, 20 high, 3 moderate) — see live `npm audit` |
| `npm audit --omit=dev` | 11 (7 high, 4 moderate) | **5 high, 0 critical** |

Counts drift as the registry advisories update; re-run both commands after lockfile changes.

## Applied in this session (safe / non-force)

1. **`npm audit fix`** (no `--force`) — lockfile-only transitive bumps where semver allowed.
2. **`vite` → `^6.4.3`** — stays on major 6; addresses path-traversal / related advisories in `<=6.4.2`.
3. **`overrides["@hono/node-server"] >= 1.19.15`** — MCP SDK transitive; Windows `serve-static` path traversal (moderate). Lock already resolved to `1.19.17` after audit fix.

## Deferred with rationale (re-check by 2026-10-08)

| Package / group | Severity | Reachability in Pomnia | Why deferred | Planned action |
|-----------------|----------|------------------------|--------------|----------------|
| **electron** `33.4.x` | high (many CVEs) | **Shipped runtime** (desktop) | npm fix points at **44.x** (major). Native modules (`better-sqlite3`, `sqlite-vec`, sharp/canvas), utilityProcess Brain, tray, IPC/preload ESM, and packagers need a dedicated bump + smoke matrix. | Separate PR: Electron 35→39 LTS path or current stable; rebuild natives; e2e smoke win/mac/linux; then Mini. **Do not bump in a security docs-only session.** |
| **electron-builder** / **tar** / **@electron/rebuild** | critical/high | **Build/CI only** (not in user install) | Fix wants builder **26.15+** and rebuild **4.x** (breaking). `tar` is pulled by gyp during rebuild, not by brain-core HTTP. | Dedicated toolchain upgrade after Electron plan; verify `pack:win` / `pack:linux` / attach scripts. |
| **vitest** `2.1.x` (+ vite-node / mocker) | critical (UI server advisory) | **Dev/test only** — CI uses `vitest run`, not Vitest UI Browser Mode | Fix wants **3.2.6+ / 5.x**. Major test-runner migration. Exposure requires enabling Vitest UI and listening; not our default path. | Bump to Vitest 3.2.7 in a test-infra PR; keep UI server off in CI. |
| **pdfjs-dist** `5.6.205` | high (JS in PDF) | Document import via **unpdf** text extract + optional canvas OCR | Advisory fix **≥6.2.108**. Version is **pinned to match unpdf**; OCR injects `pdfjs-dist/legacy`. Scripting/viewer exploit path not used (no PDF viewer, no `enableScripting` UI). Malicious PDF → DoS/parse risk still real; XSS RCE chain not demonstrated. | When unpdf supports pdfjs 6.2+, bump both together + OCR regression. |
| **@huggingface/transformers** → **onnxruntime-node** → **adm-zip** / **sharp** | high | Embedded Brain local embedder | **No fixAvailable** from npm for the chain. `adm-zip` is inside ORT model fetch/unpack, not our chat ZIP import (we use fflate + F15 limits). sharp/libvips CVEs need upstream ORT/transformers releases. | Watch upstream; consider isolating model download; re-audit after transformers release. |

## Production high still open (omit=dev)

After this session these remain on the production audit surface:

- `@huggingface/transformers` / `onnxruntime-node` / `adm-zip` / `sharp` — no clean semver fix
- `pdfjs-dist` — deferred pending unpdf-aligned major

Electron and builder advisories appear under the full (incl. dev) audit; treat Electron as **runtime** for risk ranking even when npm classifies it as dev.

## Operator checklist (next dep PR)

1. `npm audit` + `npm audit --omit=dev` — paste counts into the PR.
2. Electron: pin candidate, `npm run build:brain-core`, pack one platform, open vault + MCP + import PDF.
3. Toolchain: electron-builder 26 + rebuild 4 on a branch; compare artifact names with `check:release`.
4. Vitest 3: `npm test` green; do not enable UI mode in CI.
5. pdfjs 6: only with unpdf compatibility note in `docs/PDF-LOCAL.md`.

## Commands used

```text
npm audit fix          # no --force
npm install            # vite ^6.4.3 + overrides
npm audit
npm audit --omit=dev
```

*Author: Cursor agent on Codexa F11 track. EN docs for GitHub.*
