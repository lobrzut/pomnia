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

4. Attach to the GitHub Release that already has the Windows installer
   (do **not** re-run `publish:release` just for Linux):

```bash
npm run attach:linux-release
# or: gh release upload v0.1.58 release/*.AppImage release/*.deb release/*.sha256 --clobber
```

Tag pushes (`v*`) also build Linux and try to attach files to a **draft**
release for that tag (Windows `publish:release` still owns publish vs draft).

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
- Hero CTA on pomnia.ai stays **Download for Windows** until a Release
  actually lists an AppImage — do not advertise a missing asset.
- No code signing for Linux at premiere; users verify SHA-256 from the Release.
