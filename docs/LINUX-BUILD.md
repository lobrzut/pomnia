# Pomnia — build Linux (AppImage + deb)

Build **must** run on Linux. On Windows `npm run pack:linux` will not produce a
usable AppImage (FUSE / appimagetool / native ABI). Prefer **GitHub Actions**
(`release-linux.yml` on `ubuntu-latest`) from this Windows machine.

Unsigned builds are intentional for early public releases — same honesty as
Windows SmartScreen ([CODE-SIGNING.md](./CODE-SIGNING.md)).

Current version: see `package.json`. Artifacts:

| File | Role |
|------|------|
| `release/Pomnia-${version}.AppImage` | Primary desktop download (chmod +x, run) |
| `release/Pomnia-${version}.deb` | Debian/Ubuntu package |
| `release/*.sha256` | SHA-256 for verify |
| `release/latest-linux.yml` | electron-builder metadata (when emitted) |
| `release/pomnia-brain-core-${version}-linux-x64.tar.gz` | curl\|sh / bootstrap server |

---

## Release process (draft → complete → promote)

`releases/latest` serves Windows CTA, Linux desktop, macOS DMGs, and
`curl | sh` (brain-core tarball). An incomplete tag must **not** become latest.

1. Create a **draft** (`npm run publish:release` or CI on tag — always `--draft`).
2. Attach every platform (Windows / Linux desktop / macOS / brain-core) to that tag.
3. `npm run check:release -- --tag vX.Y.Z` — version-bound asset names; old leftovers fail.
4. `npm run promote:release -- --tag vX.Y.Z` — undrafts only when the check passes.

Never upload an older tarball or AppImage just to turn a regex green.

Shared rules live in `scripts/lib/release-assets.ts` (used by check / publish /
attach / CI).

### Backfill a broken public latest (e.g. v0.1.82)

Public `v0.1.82` was missing `latest-linux.yml`, `pomnia-brain-core-*-linux-x64.tar.gz`,
and its `.sha256`. Fixing that is **release ops**, not a repo commit:

1. Check out the **tag** (or the commit the tag points at) — do not invent assets from a newer tree.
2. Build/pack on Linux: brain-core tarball + AppImage/deb + `latest-linux.yml` (CI artifact `pomnia-linux` / `pomnia-brain-core-linux` is fine).
3. Verify unpack + native modules locally (same checks as `release-linux.yml`).
4. Dry-run attach: `npm run attach:linux-release -- --tag v0.1.82 --dry-run`
5. With explicit operator approval: upload, then `npm run check:release -- --tag v0.1.82` and `npm run check:release` (latest).
6. Do **not** `gh release upload` / promote without that approval.

---

## Fastest path (premiere from Windows)

1. Push this branch (or merge) so `.github/workflows/release-linux.yml` is on the remote.
2. A push to `fix/machine-move-honesty` / `master` / `main` starts the job automatically.
   After the file exists on the **default** branch, you can also dispatch:

```bash
gh workflow run "Release Linux (AppImage + deb)" --ref master
```

   (`workflow_dispatch` 404s until the workflow file is on the repo default branch.)

3. Wait for the run (~8–15 min typical), download the `pomnia-linux` artifact:

```bash
gh run list --workflow=release-linux.yml --limit 3
gh run download <run-id> -n pomnia-linux -D release/
```

4. Attach to the GitHub Release draft that already has the Windows installer
   (do **not** re-run `publish:release` just for Linux):

```bash
npm run attach:linux-release -- --dry-run   # shows the exact set
npm run attach:linux-release
# then, when Windows+macOS+brain-core are all present:
npm run promote:release -- --tag vX.Y.Z
```

Tag pushes (`v*`) build Linux, attach to a **draft**, run `check:release`, and
promote only when every platform is present.

---

## Local build (on Linux)

```bash
git clone https://github.com/lobrzut/pomnia.git && cd pomnia
npm ci
# Optional on a machine without the operator vault:
# export GOLDEN_PATH_SKIP=1
npm run pack:linux
```

Requirements: Node 20/22, build tools for `better-sqlite3` (`build-essential`,
`python3`), and packages electron-builder expects for AppImage/deb
(`fakeroot`, `dpkg`, `libfuse2` on older Ubuntu; AppImage tooling is fetched
by electron-builder).

Install / run AppImage:

```bash
chmod +x release/Pomnia-*.AppImage
./release/Pomnia-*.AppImage
```

Verify:

```bash
sha256sum -c release/Pomnia-*.AppImage.sha256
```

---

## What does **not** work on Windows alone

| Approach | Reality |
|----------|---------|
| `npm run pack:linux` on Win11 | Fails or lies — AppImage needs a Linux environment |
| Cross-compile only | electron-builder can download Linux Electron binaries, but packaging AppImage still needs Linux tools |
| Docker Desktop | Possible with an electronuserland Linux image, but slower and flaky vs Actions; not the premiere default |
| WSL2 | Can work if Node + deps are installed **inside** WSL and you pack there — still a Linux build, not a Win build |

---

## Product notes

- Desktop Linux = Electron AppImage/deb (this doc). Separate from
  `packages/brain-core/deploy` (headless MCP server on Linux).
- **Self-hosted completeness** (vault ownership, XDG paths, updates honesty,
  Desktop vs server): [LINUX-SELF-HOSTED.md](./LINUX-SELF-HOSTED.md).
- Hero CTA on pomnia.ai stays **Download for Windows** until a Release
  actually lists an AppImage — do not advertise a missing asset.
- No code signing for Linux at premiere; users verify SHA-256 from the Release.
