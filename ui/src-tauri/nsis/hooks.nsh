; NSIS uninstaller hook for Komoyasb Control Center
; Executes uninstall.ps1 prior to file removal

!macro NSIS_UNHOOK
Function un.komoyasbCleanUninstall
  DetailPrint "Stopping Komoyasb services and restoring configurations..."
  IfFileExists "$INSTDIR\uninstall.ps1" 0 +3
    ExecWait 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\uninstall.ps1"'
    Goto done
  IfFileExists "$INSTDIR\resources\uninstall.ps1" 0 +3
    ExecWait 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\uninstall.ps1"'
    Goto done
  done:
FunctionEnd
!macroend
