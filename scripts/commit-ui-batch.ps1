# Commit + push UI batch 1–11 (run when PowerShell works).
# Prefer local mirror for tests first: scripts/local-test-ui.ps1
Set-Location "\\192.168.1.150\Projekty\z dysk C\Projects\pomnia"
git add -A
git status -sb
git commit -m @"
UI polish 0.1.40: docs tile, import confirm, onboarding i18n, quarantine notes.

Bump package to 0.1.40 (0.1.39 skipped). Dashboard DOKUMENTY, FlowDiagram spacing,
compact Import rows, chat seal preview, Brain labels + _review/_weak promote,
onboarding distill-model warn, README UNC vitest note.
"@
git push -u origin HEAD
git log -1 --format="%H %s"
git status -sb
