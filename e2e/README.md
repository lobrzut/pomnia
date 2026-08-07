# E2E (host smoke)

`npm run test:e2e:smoke` launches `release/win-unpacked/Pomnia.exe` via Playwright `_electron` with a disposable `--user-data-dir` under `%TEMP%\pomnia-e2e-*` (never `C:\Vault` / `%APPDATA%\pomnia`). Screenshots land in `e2e/artifacts/` (gitignored). Needs a prior `npm run pack:win` (or `POMNIA_EXE`). Phase 1 = first window only; onboarding + disk asserts = later.
