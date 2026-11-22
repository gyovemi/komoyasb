## Description of Changes
Briefly describe the rationale and changes implemented in this pull request.

Closes # (issue number if applicable)

---

## Subsystems Affected
- [ ] Window Manager (`komorebi` / `whkd`)
- [ ] Status Bar (`yasb`)
- [ ] Shell & Launchers (`Flow Launcher` / `FluentFlyout` / `EarTrumpet`)
- [ ] Shell Mods & Hooks (`Windhawk` / `StuckRects3`)
- [ ] Theme Engine & Performance Profiles (`themes/`, `performance.json`)
- [ ] Settings Desktop App (`ui/` React + Tauri v2)
- [ ] Provisioning & Installation Scripts (`install.ps1`, `uninstall.ps1`, `bootstrap.ps1`)
- [ ] CI/CD & Documentation (`.github/`, `docs/`)

---

## Pre-Merge Quality & Safety Verification Checklist

Please verify that all applicable quality gates pass locally before requesting review:

### 1. Static Analysis & AST Safety
- [ ] `tests/verify-host-safety.ps1` passes with zero violations (no unguarded mutating APIs).
- [ ] Scripts declare `Set-StrictMode -Version Latest` and `$ErrorActionPreference = 'Stop'`.

### 2. Security & Rootless Mode
- [ ] `scripts/Test-SecurityAndRootless.ps1` passes all 18 test assertions.
- [ ] Changes execute cleanly under unprivileged user accounts with `-NoAdmin`.
- [ ] Machine-level operations include automated userland fallbacks.

### 3. Dry-Run & Host Immutability
- [ ] `scripts/Test-FullDryRun.ps1` completes with 100% stage success and zero host residue.
- [ ] All filesystem and registry mutations are intercepted under `-DryRun`.

### 4. Polyglot Test Suites & Coverage
- [ ] `scripts/Invoke-AllTests.ps1` executed with >90% code coverage threshold maintained.
- [ ] If frontend modified: `pnpm run build` and `pnpm run test:coverage` pass in `ui/`.
- [ ] If Rust backend modified: `cargo clippy --all-targets --all-features -- -D warnings` and `cargo test` pass in `ui/src-tauri/`.

### 5. Documentation & Changelog
- [ ] `CHANGELOG.md` updated under `[Unreleased]` if introducing user-facing changes.
- [ ] `README.md` or relevant documentation in `docs/` updated if new configuration options are added.
