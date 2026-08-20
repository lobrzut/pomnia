# Pomnia — macOS build (DMG)

> **Since 2026-08-20 you do not need to do this by hand.**
> `.github/workflows/release-mac.yml` builds both DMGs on every `v*` tag and
> attaches them to the release — one runner per architecture (`macos-15-intel`
> for x64, `macos-latest` for arm64), because cross-compiling put arm64 native
> modules inside the "Intel" app and it died on the first SQLite query.
> This document covers the local build: useful for debugging, unnecessary for
> releasing. History: the workflow failed silently on v0.1.61–v0.1.63 because it
> was written from a sketch of the Linux job without its four fixes (build the
> workspace packages, GOLDEN_PATH_SKIP, USE_HARD_LINKS, `--publish never`).

The build **must** run on macOS. On Windows `npm run pack:mac` will not work — the Apple tooling is missing and the native modules are built for Darwin.

The version comes from `package.json`. Do not write it here; it goes stale within a week (this line said 0.1.2 while the project was on 0.1.63). The packing script:

```json
"pack:mac": "npm run build:brain-core && npm run stage:brain-core && electron-vite build && electron-builder --mac"
```

`electron-builder.yml` configuration:

- output: `release/`
- target: `dmg`
- artifact: `Pomnia-${version}-${arch}.dmg`
- also: `release/mac/` (the unpacked `.app`)

---

## 1. Requirements

| Tool | Version / notes |
|-----------|----------------|
| **macOS** | 12+ (Monterey or newer) |
| **Node.js** | 20 LTS or 22 (LTS recommended) |
| **npm** | 10+ (ships with Node) |
| **Xcode Command Line Tools** | required by `electron-builder` and to compile `better-sqlite3` |

Installing CLT (once):

```bash
xcode-select --install
```

Checking:

```bash
node -v
npm -v
xcode-select -p   # should print a path, e.g. /Library/Developer/CommandLineTools
```

---

## 2. Preparing the repo

```bash
git clone <repository-url> pomnia
cd pomnia
git checkout master
git pull
```

A clean dependency install (recommended before the first build):

```bash
npm ci
```

Optionally, tests before packing:

```bash
npm test
npm run typecheck
```

---

## 3. Icon (optional)

`resources/` holds `icon.png` and `icon.ico`. For macOS electron-builder prefers **`resources/icon.icns`**.

If the build complains about a missing icon, generate `.icns` from a PNG (512×512 or larger):

```bash
mkdir -p resources/icon.iconset
sips -z 512 512 resources/icon.png --out resources/icon.iconset/icon_512x512.png
# … the remaining iconset sizes (1024, 256, 128, …) or use something like png2icns
iconutil -c icns resources/icon.iconset -o resources/icon.icns
```

Without `icon.icns` the builder will usually still produce a DMG carrying Electron's default icon — the app runs, but Dock and Finder look generic.

---

## 4. Building the DMG

```bash
npm run pack:mac
```

What the script does, in order:

1. `build:brain-core` — compile `@pomnia/brain-core`
2. `stage:brain-core` — stage the runtime and run `electron-rebuild` for `better-sqlite3` (Electron's ABI)
3. `electron-vite build` — bundle main/preload/renderer → `out/`
4. `electron-builder --mac` — DMG in `release/`

Expected result:

```
release/Pomnia-<version>-<arch>.dmg
release/mac/Pomnia.app
```

To install locally: open the DMG and drag `Pomnia.app` into Applications.

---

## 5. Apple Silicon vs Intel

By default you get **the architecture of the machine you build on**:

| Build machine | The DMG contains |
|----------------|-------------|
| Mac M1/M2/M3/M4 (arm64) | an **arm64** app |
| Intel Mac (x64) | an **x64** app |

A universal binary (arm64 + x64 in one DMG) is **not configured**.

Do not try to produce both architectures from one machine by listing them in `electron-builder.yml`. `sqlite-vec` and `@napi-rs/canvas` ship per-platform optional dependencies, so `npm ci` on an Apple Silicon machine installs `darwin-arm64` and nothing else — there is no x64 binary present to package, and the resulting "Intel" app launches and then dies on its first SQLite call. Build on both kinds of Mac, or let CI do it: one runner per architecture, which is what `release-mac.yml` does.

---

## 6. Code signing and notarisation (optional)

For **dev / local use** a signature is not required. After installing, macOS may say:

> "Pomnia" cannot be opened because the developer cannot be verified.

Ways round it (for builds you trust only):

- System Settings → Privacy & Security → **Open Anyway**, or
- on older macOS, right-click the app → **Open** (first launch only; Sequoia removed this path for unsigned apps)

For **public distribution** you need:

- an **Apple Developer** account (paid)
- a **Developer ID Application** certificate
- environment variables for `electron-builder`, e.g.:

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD='…'
export APPLE_ID='…'
export APPLE_APP_SPECIFIC_PASSWORD='…'
export APPLE_TEAM_ID='…'
npm run pack:mac
```

Notarisation (`@electron/notarize`) is a separate step after signing; without it Gatekeeper still blocks anything downloaded from the internet.

**This repo has no signing secrets configured** — a local or CI build without certificates produces an unsigned DMG, which is fine for testing.

---

## 7. Common problems

| Problem | Fix |
|---------|-------------|
| `xcode-select: error: tool 'xcodebuild' requires Xcode` | `xcode-select --install` |
| `better-sqlite3` fails to compile | make sure CLT is installed; delete `build/brain-core-runtime` and run `pack:mac` again |
| out of disk space | brain-core staging plus `node_modules` is roughly 1–2 GB |
| Gatekeeper blocks the app | see §6 — unsigned build |
| you are building on Windows | **don't** — use a Mac or GitHub Actions (`release-mac.yml`) |

---

## 8. Building in CI (GitHub Actions)

Workflow `.github/workflows/release-mac.yml`:

- trigger: manual (`workflow_dispatch`) or a `v*` tag
- runners: `macos-15-intel` (x64) and `macos-latest` (arm64), as a matrix
- verification: every `.node` and `.dylib` in the packed app is checked with `file`, and the job fails rather than uploads if the architecture does not match the label on the DMG
- artifacts: `Pomnia-*.dmg` from `release/`, attached to the release on tag pushes

Without Apple secrets this produces unsigned DMGs.

---

## 9. Quick copy-paste

```bash
git clone <url> pomnia && cd pomnia
xcode-select --install    # if you have not already
npm ci
npm run pack:mac
open release/Pomnia-*.dmg
```
