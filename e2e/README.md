# E2E (host smoke)

Launches `release/win-unpacked/Pomnia.exe` via Playwright `_electron` with a disposable `--user-data-dir` (+ vault) under `%TEMP%\pomnia-e2e-*` (never `C:\Vault` / `%APPDATA%\pomnia`). Screenshots land in `e2e/artifacts/` (gitignored). Needs a prior `npm run pack:win` (or `POMNIA_EXE`).

| Script | What |
|--------|------|
| `npm run test:e2e:smoke` | Phase 1 — first window only |
| `npm run test:e2e:walkthrough` | Phase 2 — onboarding (create vault + disk assert) → skip optional steps → main nav → PL↔EN |
