# Pomnia Linux — Self-Hosted Completeness

Product checklist for shipping Pomnia as a **real AGPL local-first self-hosted
product** on Linux — Desktop (AppImage/deb) **and** headless `brain-core`.

Not Konshus. Not cloud. Unsigned OK with honesty (SHA-256). This doc is the
contract; [LINUX-BUILD.md](./LINUX-BUILD.md) is how to pack.

**Status legend:** `[x]` done · `[~]` partial · `[ ]` open · **P0/P1/P2** priority

---

## Mental model (must stay sharp)

| Piece | What it is | What it is not |
|-------|------------|----------------|
| **Vault folder** | You pick it (`~/Vault`, USB, etc.). Encrypted blobs + plaintext knowledge sidecars (`USER.md`, `distilled/`, `skills/`, `sessions/`). Portable ownership unit. | App config. Search index. |
| **App data** | `~/.config/Pomnia` (XDG; Electron `userData`). Settings, logs, `brain-core-data/vectordb/library.db`. | The vault. Encrypted by vault passphrase. |
| **Desktop** | Electron UI + embedded brain on `127.0.0.1:7862`. Ops console. | The only way to run Brain. |
| **brain-core server** | Same engine, `daemon.js`, often systemd (`:7865` or chosen port). Headless MCP for LAN. | “Cloud Pomnia.” A second product. |

**Single-user honesty:** one human owns one vault writer. Multi-user auth /
tenancy is **out of scope** for premiere — replica/read-only + deliberate
`--claim-vault` are the conflict tools, not accounts.

---

## 1. Install paths (AppImage vs deb)

| Item | Status | Notes |
|------|--------|-------|
| AppImage primary desktop download | [x] P0 | `release/Pomnia-*.AppImage` via CI `pack:linux` |
| deb for Debian/Ubuntu | [x] P0 | Same CI artifact |
| SHA-256 beside assets | [x] P0 | Honesty instead of signatures |
| Document binary vs data locations | [x] P0 | This doc + Settings → Where data lives |
| AppImage: `chmod +x` + run | [x] | No system install; data still under XDG |
| deb: files under `/usr` / `/opt`, data under XDG | [~] | electron-builder defaults; smoke on real distro still needed |
| Flatpak / Snap | [ ] P2 | Not this premiere |
| Desktop entry / MIME / icons | [~] P1 | `.desktop` from electron-builder; Wayland/WMClass set |

**Where things live after install**

| Form | Binary | User data | Vault (default example) |
|------|--------|-----------|-------------------------|
| AppImage | Wherever you put the `.AppImage` (`$APPIMAGE`) | `~/.config/Pomnia` | `~/Vault` (you choose) |
| deb | `/usr` / `/opt` (packager) | `~/.config/Pomnia` | `~/Vault` (you choose) |
| Dev | repo / electron | same XDG | same |

Env overrides: `POMNIA_USER_DATA`, `POMNIA_VAULT` (doctor/CLI).

---

## 2. Vault — path, ownership, takeover, backup

| Item | Status | Notes |
|------|--------|-------|
| Default path example Linux `~/Vault` (not `C:\Vault`) | [x] P0 | UI placeholders + `dataLocations` IPC |
| Pick folder on create/open | [x] | Existing picker |
| Portable move = copy whole folder → Open → passphrase | [x] | Docs + Settings portability copy |
| Who owns the vault (writer marker) | [x] | `state/vault-writer.json`; Desktop badge “this machine owns it”; server `--claim-vault` |
| Takeover Desktop ↔ brain-core | [x] docs / [~] UX | Server: `packages/brain-core/deploy/README.md` `--claim-vault`. Desktop: lock + open on the machine that should write; replica push does **not** seize write |
| Read-only replica honesty | [x] | Replica lists missing files, never deletes |
| Backup / export notes | [x] | Settings export + vault folder copy |
| Encrypted blob backup ≠ index | [x] honesty | Index rebuildable via reindex |
| Network/exFAT vault as default | [ ] warn P1 | Past footgun — prefer local disk; document |

**Takeover (operator procedure)**

1. **Desktop owns → server owns:** stop Desktop writes; copy/sync vault to server; on server run `--claim-vault` (or install with ownership); Desktop either locks or points agents at replica URL read-only.
2. **Server owns → Desktop owns:** stop server writes / set `--read-only` on unit; copy vault folder to Desktop; open vault on Desktop (becomes writer); reindex local `library.db`.
3. Never two writers on one corpus. Agents must not get a “claim” MCP tool.

---

## 3. Brain data / AppData equivalent (XDG honesty)

| Item | Status | Notes |
|------|--------|-------|
| `~/.config/Pomnia` named in UI | [x] P0 | Settings → Where data lives |
| `library.db` path shown | [x] P0 | Plaintext index honesty |
| Logs path + Open logs | [x] | Existing + listed in data locations |
| Lock does **not** wipe index | [x] honesty | Documented; optional wipe-on-lock = later product |
| Migrate legacy Reliqua dirs | [x] Win | Linux first-install has nothing to migrate |

Plaintext boundary (premiere messaging): passphrase protects vault blobs; RAG
chunks/embeddings in `library.db` are **not** encrypted by that password.

---

## 4. Ollama

| Item | Status | Notes |
|------|--------|-------|
| Detect Ollama on machine | [x] | Onboarding + Brain health |
| In-app `ollama pull` (embed) on first-run | [x] P0 | Recent onboarding/Brain fix — verify on Linux smoke |
| Failure UX (unreachable / still missing after pull) | [x] | No green lie |
| Distill model optional; embed required for useful search | [x] | Documented in onboarding |
| GPU / ROCm / CUDA docs for Linux | [ ] P1 | Point to Ollama docs; do not pretend Pomnia installs drivers |

---

## 5. Updates

| Item | Status | Notes |
|------|--------|-------|
| Check GitHub Releases API | [x] | Same as Windows — notify only |
| Settings “Check for updates” | [x] | Visible current / available / unreachable |
| Linux hint: no auto-install; download AppImage/deb | [x] P0 | `updateLinuxHint` |
| electron-updater / AppImageUpdate auto-install | [ ] **won't fake** | Unsigned + open vault → manual replace is the product |
| `latest-linux.yml` if emitted | [~] | Metadata only — not silent install |
| Landing updates page Linux section | [x] P0 | `/docs/linux-self-hosted.html` + updates-install link |

**Operator update (AppImage):** Quit tray → replace `.AppImage` → `chmod +x` → run.  
**Operator update (deb):** Quit → `sudo dpkg -i Pomnia-*.deb` (or apt).  
Vault + `~/.config/Pomnia` survive both.

---

## 6. MCP Connect / first-run / lock / multi-user

| Item | Status | Notes |
|------|--------|-------|
| First-run onboarding (vault → engine → connect) | [x] | |
| Embedded MCP `127.0.0.1:7862` snippets | [x] | |
| Remote brain URL + Bearer | [x] | |
| Lock / unlock vault | [x] | |
| Handshake phrase | [x] | |
| Single-user honesty in docs | [x] P0 | This section |
| Multi-seat / multi-login Desktop | [ ] P2 | Not product yet — one OS user assumed |
| chmod 600 on token-bearing configs | [~] | Snippet hint exists; Linux Connect should stress it |

---

## 7. Uninstall / wipe data

| Item | Status | Notes |
|------|--------|-------|
| Uninstall ≠ delete vault | [x] honesty | Settings wipe copy |
| Wipe app data = delete `~/.config/Pomnia` | [x] P0 docs/UI | No destructive one-click yet (good) |
| Wipe vault = delete vault folder (operator) | [x] | |
| deb uninstall leaves XDG | [~] | Expected; document |
| AppImage “uninstall” = delete binary | [x] | Data remains until wiped |

---

## 8. systemd / headless vs Desktop

| Item | Status | Notes |
|------|--------|-------|
| `packages/brain-core/deploy` install + unit | [x] | `pomnia-brain-core.service` |
| Desktop ≠ server clarified | [x] P0 | This doc + landing |
| Ports: Desktop embedded `:7862` vs typical server `:7865` | [x] | Homelab used 7865 when 7862/7863 busy — document “choose a free port” |
| curl\|sh reserved for brain-core, not Electron | [x] decision | |
| Docker image path | [~] | Exists for brain-core; not Desktop AppImage substitute |

**Self-hosted is not confusing if we say:**

- Want a GUI on this machine → **Desktop AppImage/deb**.
- Want agents on the LAN against one always-on memory → **brain-core systemd** (optionally with Desktop as the writer that replicates).

---

## 9. What else serious OSS self-host needs

| Item | Status | Pri | Notes |
|------|--------|-----|-------|
| Permissions: vault dir user-owned; no world-writable tokens | [~] | P1 | Document `chmod 700` vault; token files 600 |
| Wayland / tray | [~] | P1 | Electron tray flaky on some Wayland; close-to-tray still default — smoke |
| Autostart (`openAtLogin` / XDG autostart) | [~] | P1 | Labels OS-neutral; verify Electron login item on Linux |
| CLI (`pomnia` / doctor) on Linux PATH | [~] | P1 | Exists in repo; packaging into deb/AppImage extras TBD |
| SELinux / AppArmor notes | [ ] | P2 | Only if CI/users hit denials |
| Firewall: document MCP port exposure | [ ] | P1 | Never expose `/mcp` without Bearer to WAN |
| Reproducible / SBOM | [ ] | P2 | Nice for AGPL trust |
| Code signing (Linux) | [ ] | P2 | Optional later; SHA-256 sufficient for premiere honesty |
| Real Linux smoke (AppImage boot, vault, pull, MCP) | [ ] | **P0 gate** | Announceable only after this |
| Landing hero Linux CTA | [ ] | P1 | Only after Release asset exists + smoke |

---

## P0 shipped this pass (code/docs)

- `docs/LINUX-SELF-HOSTED.md` (this file)
- `src/core/dataLocations.ts` + tests + IPC `app:dataLocations`
- Settings: data locations card, Linux update hint, Linux unsigned card
- Vault/onboarding path placeholders from XDG-aware examples
- Landing: `linux-self-hosted.html` (+ nav)

## Still open before “announceable”

1. Smoke AppImage on a real Linux (boot, create vault, Ollama pull, MCP handshake).
2. Attach/publish Linux assets on a Release tag users can download.
3. Wayland tray + autostart smoke.
4. Optional: stronger Connect chmod hints; vault-on-network-share warning.

**Verdict:** Linux is **buildable and documentable**, not yet **announceable** until (1)+(2).
