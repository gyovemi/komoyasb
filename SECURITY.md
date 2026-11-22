# Security Policy & Architecture Guarantees

The **komoyasb** project takes the security, privacy, and system integrity of your Windows 11 workstation seriously. This document outlines our vulnerability reporting policy, zero-elevation/rootless security architecture, and shadow execution guarantees.

---

## 1. Supported Versions

Security updates and patches are maintained for the following versions:

| Version | Supported | Status |
| :--- | :--- | :--- |
| `1.0.x` | :white_check_mark: | Current Stable Release |
| `< 1.0.0` | :x: | Deprecated Baseline Versions |

---

## 2. Reporting a Vulnerability

If you discover a security vulnerability or privilege escalation risk in `komoyasb`, please report it responsibly:

1. **GitHub Security Advisory (Preferred):**  
   Submit a confidential report through [GitHub Private Vulnerability Reporting](https://github.com/gyovemi/komoyasb/security/advisories/new).
2. **Direct Contact:**  
   Alternatively, email the maintainers directly at security@komoyasb.local (or reach out via GitHub issue requesting private disclosure).
3. **Disclosure Policy:**  
   - Please include detailed steps to reproduce, affected script or component, and the observed impact.
   - Maintainers will acknowledge receipt within **48 hours**.
   - A triage update, remediation plan, or patch advisory will be communicated within **7 days**.
   - Public disclosure will be coordinated following the release of a security patch.

---

## 3. Zero-Elevation & Rootless Security Guarantees

A core architectural principle of `komoyasb` is **First-Class Rootless Operation**. Desktop enhancement tools for Windows often request administrative privileges (`RunAs Administrator`), posing supply chain risks, corporate policy violations, and unconstrained host access.

`komoyasb` enforces strict least-privilege security guarantees:

### 3.1 Non-Admin / Standard User Execution
- **Zero-UAC Requirement:** The entire core environment (tiling window management via Komorebi, hotkeys via whkd, status bar via YASB Reborn, and launcher via Flow) runs fully in standard user space without administrative elevation.
- **Filesystem Boundaries:** All filesystem modifications are strictly jailed to user-owned paths:
  - `$HOME\.config` (or `%USERPROFILE%\.config`)
  - `%LOCALAPPDATA%\komoyasb`
  - `%APPDATA%` (for user application configurations)
  No writes to `C:\Program Files`, `C:\Windows`, or `C:\ProgramData` are performed under rootless operation.
- **Registry Confinement:** All registry configurations (e.g., FluentFlyout, EarTrumpet, taskbar states) write exclusively to `HKEY_CURRENT_USER` (`HKCU`). No modifications to `HKEY_LOCAL_MACHINE` (`HKLM`) are required or attempted.
- **User-Scoped Package Management:** Package installations via Windows Package Manager enforce `winget install --scope user`.
- **Desktop Application Packaging:** The Tauri v2 Control Center desktop executable is packaged using NSIS with `installMode = "currentUser"`, installing directly into `%LOCALAPPDATA%\Programs\Komoyasb Control Center` with zero UAC prompts.

### 3.2 Safe Fallbacks for Machine-Level Hooks
Subsystems requiring machine-level services or kernel/DWM injection (such as Windhawk C++ mods) are treated as optional:
- In unprivileged contexts (`-NoAdmin`), machine hooks are automatically bypassed.
- An unprivileged Win32 fallback is engaged: taskbar auto-hide is applied cleanly via byte manipulation in `HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StuckRects3`.

---

## 4. Shadow Dry-Run Sandboxing & Immutability

To allow users to safely test installations, theme synchronizations, and updates, `komoyasb` includes an integrated shadow execution engine (`scripts/lib/DryRunContext.psm1`).

### 4.1 Ephemeral Virtual Filesystem
- When invoked with `-DryRun`, scripts do not touch actual user configuration directories or live registry keys.
- All operations are redirected into an isolated temporary directory:
  `$env:TEMP\komoyasb-dryrun-<timestamp>`
- The sandbox is cleaned up upon execution completion (unless `-KeepSandbox` is passed for inspection).

### 4.2 AST Static Safety Gate
Before any code merges or publishes, static analysis parses all PowerShell scripts with `[System.Management.Automation.Language.Parser]` (`tests/verify-host-safety.ps1`):
- Dangerous mutating cmdlets (`Set-ItemProperty`, `New-ItemProperty`, `Stop-Process`, `Start-Process`, and `[System.IO.File]::Write*`) must be guarded by `Invoke-SystemAction` or explicit dry-run conditionals.
- Unsanitized dynamic commands (`Invoke-Expression` / `iex`) on untrusted input are strictly disallowed.

---

## 5. Security Testing Gates in CI

Every pull request and release build undergoes automated security validation:
- **`Test-SecurityAndRootless.ps1`:** 18 distinct security and rootless isolation checks verifying privilege auto-detection, fallback engagement, path jailing, and user-scope enforcement.
- **`verify-host-safety.ps1`:** Static AST check for unguarded mutations.
- **`Test-FullDryRun.ps1`:** Pre- and post-installation host fingerprinting to assert zero host configuration leakage.
