# Pomnia rebrand — complete (2026-07-07)

Reliqua branding has been fully removed from user-facing copy, package metadata, installers, and internal identifiers. GitHub repo renamed to `lobrzut/pomnia` (2026-07-27); old URL redirects.

Domain: **pomnia.ai**  
Product: local-first AI memory, vault, Brain MCP

---

## What changed

| Area | Before | After |
|------|--------|-------|
| npm package | `reliqua` | `pomnia` |
| CLI binary | `reliqua` | `pomnia` |
| Workspace | `@reliqua/brain-core` | `@pomnia/brain-core` |
| appId | `dev.helluk.reliqua` | `ai.pomnia.app` |
| productName | Reliqua | Pomnia |
| Preload bridge | `window.reliqua` | `window.pomnia` |
| Env vars | `RELIQUA_*` | `POMNIA_*` (legacy `RELIQUA_*` still read) |
| Vault folder (UI default) | `*.reliqua` | `*.pomnia` |
| Brain index file | `.reliqua-index.json` | `.pomnia-index.json` |
| Brain data dir | `~/.reliqua/brain` | `~/.pomnia/brain` |
| localStorage keys | `reliqua.*` | `pomnia.*` (auto-migrated on first launch) |

## Backward compatibility

- Existing vault folders (any path / extension) still open — format is unchanged (`header.json`).
- `localStorage` keys migrated once via `migrateLegacyStorage()`.
- `%AppData%/Reliqua` or `reliqua` → merged into new Pomnia userData on first launch.
- `.reliqua-index.json` renamed to `.pomnia-index.json` when present.
- `~/.reliqua/brain` used until `~/.pomnia/brain` exists.
- CLI/env: `$RELIQUA_PASS`, `$RELIQUA_OLLAMA`, etc. still honored.

## Not changed (intentional)

- External `lobrzut/reliqua-brain-hub` repo link in brain-core docs (separate Python hub).
- Homelab Brain server at 192.168.x.x — doc references only.
- Legacy env/paths (`RELIQUA_*`, `~/.reliqua`, `%AppData%/Reliqua`) — migration only.

## Done later

- GitHub repo: `lobrzut/reliqua` → `lobrzut/pomnia` (2026-07-27).

## Verify after upgrade

```bash
npm test
npm run typecheck
npm run build
# grep — zero Reliqua in src/, docs/, landing/ (except this file / migration comments)
```

## Install artifacts

- Windows: `Pomnia-{version}-setup.exe`
- macOS: `Pomnia-{version}.dmg`, `Pomnia.app`
