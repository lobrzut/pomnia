# Example helper: commit from a local disk checkout (not from UNC).
# Prefer local mirror for tests first: scripts/local-test-ui.ps1
# Set POMNIA_REPO_ROOT to your local clone before running.
$ErrorActionPreference = "Stop"
$root = $env:POMNIA_REPO_ROOT
if (-not $root) {
  Write-Error "Set POMNIA_REPO_ROOT to a local disk clone path."
  exit 1
}
Set-Location $root
git add -A
git status -sb
Write-Host "Review status above, then commit manually with your message. This script no longer auto-commits."
