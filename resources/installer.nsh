; Pomnia NSIS hooks — close app before install/upgrade/uninstall.
; Goal: fewer false "cannot be closed" / locked %LOCALAPPDATA%\Programs\Pomnia.
; Does NOT disable antivirus. Legitimate process close only (no AV evasion).
; Brain MCP (0.1.36+) runs as Electron utilityProcess under Pomnia.exe — no
; pomnia-brain.exe. Legacy taskkill kept so upgrades from ≤0.1.35 release helpers.

!macro pomniaKillRunning
  DetailPrint "Closing Pomnia process tree (if running)…"
  nsExec::ExecToLog 'taskkill /IM Pomnia.exe /F /T'
  Pop $0
  ; Legacy ≤0.1.35 helper — harmless if absent; clears upgrade locks.
  nsExec::ExecToLog 'taskkill /IM pomnia-brain.exe /F /T'
  Pop $0
  ; Brief pause so Windows releases file locks before NSIS replaces files.
  Sleep 1200
!macroend

!macro customCheckAppRunning
  !insertmacro pomniaKillRunning
!macroend

; Also kill right before files are written (upgrade path / stubborn locks).
!macro customInstall
  !insertmacro pomniaKillRunning
!macroend

!macro customUnInstall
  !insertmacro pomniaKillRunning
!macroend
