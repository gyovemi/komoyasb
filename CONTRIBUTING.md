# Contributing to komoyasb

Thank you for your interest in contributing to **komoyasb**! This project provides a production-grade, modular, and dynamic Windows 11 desktop environment designed to outperform Seelen UI in performance, modularity, and rootless safety.

Please review this guide before submitting issues or pull requests.

---

## 1. Development Environment Setup

### Prerequisites
- **Operating System:** Windows 11 (Build 22621+ recommended)
- **PowerShell:** Windows PowerShell 5.1 or PowerShell 7+ (`pwsh`)
- **Node.js & Package Manager:** Node.js 20+ and `pnpm` 9+
- **Rust Toolchain:** Rust Stable (`rustc`, `cargo`, `clippy`, `rustfmt`)
- **GitHub CLI (Optional):** `gh` CLI for automated publishing and PR workflows

### Initial Repository Setup
```powershell
# Clone the repository
git clone https://github.com/gyovemi/komoyasb.git
cd komoyasb

# Install frontend UI dependencies
cd ui
pnpm install
cd ..
```

---

## 2. Quality Assurance & Testing

All contributions must pass local quality gates before opening a pull request. komoyasb maintains polyglot test suites spanning PowerShell, Frontend (React/TypeScript), Rust (Tauri backend), and End-to-End shadow execution.

### 2.1 Unified Test Runner
To execute all domain test suites and enforce the 90%+ code coverage threshold:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Invoke-AllTests.ps1
```

If the Rust toolchain is not locally available during frontend/script work:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Invoke-AllTests.ps1 -SkipRust
```

### 2.2 PowerShell Quality & AST Safety Gates
PowerShell scripts adhere to strict host-safety and static AST requirements:

```powershell
# 1. Run static AST safety verification
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\verify-host-safety.ps1

# 2. Run Rootless and Security compliance checks
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-SecurityAndRootless.ps1

# 3. Run Pester unit tests
pwsh -NoProfile -Command "Invoke-Pester -Path ./tests/powershell -Output Detailed"
```

### 2.3 Full Dry-Run Host Immutability Suite
Validate that installation, configuration synchronization, and uninstallation do not leave side effects when run in dry-run mode:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-FullDryRun.ps1
```

### 2.4 Frontend Quality (React & TypeScript)
Inside the `ui/` directory:

```bash
# TypeScript typechecking & bundle build
pnpm run build

# Vitest unit tests with v8 code coverage
pnpm run test:coverage
```

### 2.5 Rust Backend Quality (Tauri v2)
Inside the `ui/src-tauri/` directory:

```bash
# Format check
cargo fmt --all -- --check

# Clippy linter with all warnings treated as errors
cargo clippy --all-targets --all-features -- -D warnings

# Unit & integration tests
cargo test --all-features
```

---

## 3. AST Static Safety Rules

To guarantee host safety and dry-run predictability, `tests/verify-host-safety.ps1` parses all `.ps1` and `.psm1` files using `[System.Management.Automation.Language.Parser]`.

Any script that performs mutations must follow these rules:

1. **Strict Mode:** Every script and module must declare:
   ```powershell
   Set-StrictMode -Version Latest
   $ErrorActionPreference = 'Stop'
   ```
2. **Guarded System Actions:** Direct mutating calls (such as writing to the filesystem, modifying registry keys, or terminating processes) must not run unconditionally.
   - Use `Invoke-SystemAction` from `DryRunContext.psm1` or evaluate `$DryRun` / `$WhatIf` guards.
   - Prohibited direct calls without interception include:
     - `[System.IO.File]::Write*`
     - `Set-ItemProperty` / `New-ItemProperty`
     - `Stop-Process` / `Start-Process`
     - Direct P/Invoke desktop modifications (e.g., `SystemParametersInfo`)
3. **Transactional Backups:** Any configuration overwrite must back up existing user files into `themes/.backups/<timestamp>/`.

---

## 4. Rootless & Least-Privilege Architecture

`komoyasb` is built to run cleanly without administrative privileges:

- **Never assume Administrator elevation:** Any feature requiring elevated privileges must test `Test-IsAdministrator` and provide a non-admin fallback.
- **User Scopes:** Registry operations must target `HKCU`. Machine-level paths (`C:\Program Files`, `C:\ProgramData`) must not be written to when running in rootless mode.
- **Fallback Verification:** When Windhawk machine hooks are unavailable, verify that userland fallbacks (e.g., `StuckRects3` taskbar auto-hide) activate gracefully.

---

## 5. Git & Commit Conventions

We follow Conventional Commits for structured changelogs and release automation:

- `feat:` A new feature or subsystem capability
- `fix:` A bug fix or patch
- `perf:` A code change that improves performance or reduces telemetry overhead
- `refactor:` Code restructuring without behavior change
- `test:` Adding or updating test suites
- `docs:` Documentation updates or checklist additions
- `chore:` Maintenance tasks, dependency bumps, or CI configuration

Example:
```git
feat(ui): add visual keybinding conflict indicator
fix(scripts): escape user profile path in watchdog process launcher
chore(release): bump version to 1.0.0
```

---

## 6. Pull Request Lifecycle

1. Fork the repository and create your feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Implement your changes following AST safety and least-privilege standards.
3. Run the complete test suite:
   ```powershell
   powershell -File .\scripts\Invoke-AllTests.ps1 -SkipRust
   powershell -File .\scripts\Test-FullDryRun.ps1
   ```
4. Commit your changes using semantic commit messages.
5. Push your branch to GitHub and open a Pull Request using the provided PR template.
6. Ensure all CI jobs (`powershell-quality-and-safety`, `frontend-quality`, `rust-tauri-quality`, `dry-run-matrix`) pass.
