# Run from PowerShell. Syncs UNC repo to local mirror, then typecheck + focused tests.
$ErrorActionPreference = "Stop"
$src = "\\192.168.1.150\Projekty\z dysk C\Projects\pomnia"
$dst = "C:\Users\helluk\pomnia-build-ui"
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
