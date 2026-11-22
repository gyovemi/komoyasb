---
name: Bug Report
about: Create a report to help improve komoyasb
title: '[BUG] '
labels: ['bug', 'triage']
assignees: ''
---

### Problem Description
A clear and concise description of the issue encountered.

### Environment & System Diagnostics
Please provide the following environment details:
- **Windows 11 Build:** (e.g., Windows 11 Pro 23H2 Build 22631.xxxx)
- **PowerShell Version:** (output of `$PSVersionTable.PSVersion`, e.g., 5.1 / 7.4)
- **Privilege Level:**
  - [ ] Standard User (Rootless / Non-Admin)
  - [ ] Elevated Administrator
- **Execution Mode:**
  - [ ] Live execution (`install.ps1`)
  - [ ] Rootless flag (`-NoAdmin`)
  - [ ] Dry-Run sandbox (`-DryRun`)
- **Active Performance Profile:**
  - [ ] `ultra-low`
  - [ ] `balanced`
  - [ ] `visual-rich`
  - [ ] `gaming`
  - [ ] `custom`
- **Installed Subsystems Affected:**
  - [ ] Komorebi (Window Manager)
  - [ ] whkd (Hotkey Daemon)
  - [ ] YASB Reborn (Status Bar)
  - [ ] Flow Launcher
  - [ ] Windhawk (C++ Mods)
  - [ ] FluentFlyout / EarTrumpet
  - [ ] Control Center Desktop App (Tauri v2)

### Steps to Reproduce
1. Execute command: `...`
2. Configure setting: `...`
3. Observe behavior: `...`

### Expected Behavior
A concise description of what you expected to happen.

### Actual Behavior & Error Output
Please paste error traces, PowerShell console output, or browser console errors from the Control Center.

```powershell
# Paste relevant command output here
```

### Dry-Run Verification
Does the problem reproduce when running with `-DryRun`?
- [ ] Yes
- [ ] No
- [ ] Not applicable

### Additional Context & Logs
Attach or paste any relevant logs from `%LOCALAPPDATA%\komoyasb\` or `%TEMP%\komoyasb-dryrun-*`.
