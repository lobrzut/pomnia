# Run from PowerShell. Syncs a UNC/share repo to a local mirror, then typecheck + focused tests.
# Set POMNIA_UNC_SRC / POMNIA_LOCAL_MIRROR before running — do not hardcode home NAS paths.
$ErrorActionPreference = "Stop"
$src = $env:POMNIA_UNC_SRC
$dst = $env:POMNIA_LOCAL_MIRROR
if (-not $src -or -not $dst) {
  Write-Error "Set POMNIA_UNC_SRC and POMNIA_LOCAL_MIRROR (local disk mirror). Never run vitest from a UNC path."
  exit 1
}
New-Item -ItemType Directory -Force -Path $dst | Out-Null
robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /nc /ns /np /XD node_modules out dist .git release
Set-Location $dst
if (-not (Test-Path "node_modules")) { npm install }
npm run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx tsc --noEmit -p tsconfig.json
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx vitest run src/renderer/src/lib/labels.test.ts src/core/__tests__/import.test.ts packages/brain-core/tests/indexDocument.test.ts
exit $LASTEXITCODE
