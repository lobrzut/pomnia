# Code signing (Windows Authenticode + macOS)

**Product stance:** folder exclusions are **not** a product strategy. Pomnia must work out of the box on Windows with Defender / Symantec without asking users to whitelist paths.

## Ship blocker — public Windows release

Before marketing Windows as **“just works”** / shipping a public installer:

1. Sign with **Authenticode** — OV/EV code-signing certificate, **or** [Azure Trusted Signing](https://learn.microsoft.com/en-us/azure/trusted-signing/).
2. Prefer **EV** (or Trusted Signing) for faster SmartScreen reputation; OV still needs download volume to build trust.
3. Do **not** center onboarding, Settings, or support on antivirus exclusions.

Unsigned / private builds may still trip SmartScreen and enterprise AV. That is expected until signing exists — treat exclusions as a **temporary last resort** for unsigned developer builds or locked-down IT policy, never as the normal path.

Unsigned Electron installers trigger **SmartScreen** and more **Defender / Symantec** scrutiny. Pomnia does **not** fake signatures — when no certificate is configured, packs stay honestly unsigned.

## Windows (Authenticode)

### What you need

1. A code-signing certificate (OV/EV) from a trusted CA (DigiCert, Sectigo, SSL.com, …), **or** Azure Trusted Signing configured for CI.
2. Export as `.pfx` / `.p12` (private key + cert), or use a cloud HSM / token workflow supported by your CA.
3. Environment variables when running `npm run pack:win`:

```powershell
$env:CSC_LINK = "C:\path\to\pomnia-codesign.pfx"
$env:CSC_KEY_PASSWORD = "…"
# Optional aliases electron-builder also accepts:
# $env:WIN_CSC_LINK = $env:CSC_LINK
# $env:WIN_CSC_KEY_PASSWORD = $env:CSC_KEY_PASSWORD
npm run pack:win
```

`electron-builder` signs `Pomnia.exe` and the NSIS setup when these are set. `publisherName` in `electron-builder.yml` should match the certificate **Subject CN** (currently `Pomnia`).

### After you have a cert

- Prefer **EV** / Trusted Signing for faster SmartScreen reputation, or build reputation with steady signed downloads.
- Store `CSC_*` only in CI secrets / a locked machine — never commit the PFX.
- Optional later: set `forceCodeSigning: true` under `win:` so unsigned accidental packs fail loudly.

### Without a cert (today)

- Local/private builds: expected SmartScreen → **Więcej info → Uruchom mimo to**.
- **Symantec Endpoint / Norton** and Defender commonly warn on **unsigned** Electron NSIS + helper EXE — reputation is fixed by **signing**, not by documenting exclusions as onboarding.
- Optional last resort (unsigned / enterprise IT only): folder exceptions in the AV UI — Settings → Windows / antywirus. Never ask users to disable AV.

### Optional `certificateFile` in electron-builder.yml

Prefer env vars (`CSC_LINK`). If you keep a machine-local PFX path, you may also set under `win:`:

```yaml
# win:
#   certificateFile: C:\secure\pomnia-codesign.pfx
#   certificatePassword: ${env.CSC_KEY_PASSWORD}
```

Do not commit the PFX or password.

## macOS

See [MAC-BUILD.md](./MAC-BUILD.md) §6 (`CSC_LINK`, Apple Developer ID, notarization).

## Related reliability work (not a substitute for signing)

- Clean quit + `taskkill /T` of `Pomnia.exe` (Brain MCP is an Electron `utilityProcess` under the main tree; legacy `pomnia-brain.exe` kill kept only for upgrades from ≤0.1.35)
- NSIS `installer.nsh` closes Pomnia before upgrade
- Honest metadata (`appId`, `productName`, `copyright`, `publisherName`)
- Brain start: spawn/path/timeout/healthz — fix reliability in code, do not “tell user to whitelist”
