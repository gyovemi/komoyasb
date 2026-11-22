# komoyasb Release Runbook & Deployment Checklist

This document details the operational procedure for building, verifying, and publishing production releases of **komoyasb** to GitHub (`gyovemi/komoyasb`).

---

## 1. Pre-Flight Quality Gates

Before initiating any release cycle, ensure that all automated quality gates pass cleanly on the local Windows workstation.

### 1.1 Working Directory Sanitation
- [ ] Working tree is clean: `git status --porcelain` returns no uncommitted modifications.
- [ ] Active branch is `main` and synced with upstream remote.

### 1.2 Automated Static & Security Gates
Execute the static AST and rootless security suites:

```powershell
# 1. Verify AST static host safety and dry-run guardrails across all scripts
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\verify-host-safety.ps1

# 2. Verify Rootless (-NoAdmin) capability and least-privilege contracts (18/18 checks)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-SecurityAndRootless.ps1

# 3. Verify Full Dry-Run host immutability matrix (13/13 stages)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-FullDryRun.ps1
```

### 1.3 Polyglot Test Suites & Build Verification
Execute frontend and unified test runners:

```powershell
# 4. Frontend TypeScript build and Vitest unit coverage
Push-Location ui
pnpm run build
pnpm run test:coverage
Pop-Location

# 5. Unified test runner across all active domains (> 90% coverage threshold)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Invoke-AllTests.ps1 -SkipRust
```

---

## 2. Version Synchronization (`Bump-Version.ps1`)

Ensure atomic version propagation across `ui/package.json`, `ui/src-tauri/Cargo.toml`, `ui/src-tauri/tauri.conf.json`, and `CHANGELOG.md`.

### 2.1 Dry-Run Simulation
Preview the version bump to ensure targeted files and regex matchers resolve correctly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Bump-Version.ps1 -Version 1.0.0 -DryRun
```

### 2.2 Version Application & Tagging
Apply the version change and create the release commit and signed Git tag:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Bump-Version.ps1 -Version 1.0.0 -Commit -Tag
```

Verify the generated commit and tag:
```powershell
git show HEAD
git tag -n1 -l "v1.0.0"
```

---

## 3. GitHub Repository Publishing & Remote Push (`Publish-GitHubRepo.ps1`)

Use `scripts/Publish-GitHubRepo.ps1` to publish the repository to GitHub via the GitHub CLI (`gh.exe`) or push tags.

### 3.1 Provisioning Dry-Run
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Publish-GitHubRepo.ps1 -DryRun
```

### 3.2 Live Push & Origin Synchronization
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Publish-GitHubRepo.ps1 -Push
```

Alternatively, if the remote origin is already established:
```powershell
git push origin main
git push origin v1.0.0
```

---

## 4. CI/CD Pipeline Monitoring

Once the release tag (`v1.0.0`) is pushed to GitHub, automated GitHub Actions workflows trigger:

### 4.1 CI Quality Gates (`.github/workflows/ci.yml`)
- [ ] `powershell-quality-and-safety`: AST safety, rootless tests, Pester 5+ test suites.
- [ ] `frontend-quality`: TypeScript `tsc` check, Vitest v8 coverage runner.
- [ ] `rust-tauri-quality`: `cargo fmt`, `cargo clippy`, and `cargo test`.
- [ ] `dry-run-matrix`: Execution matrix for `standard` and `no-admin` modes.

### 4.2 Production Release Workflow (`.github/workflows/release.yml`)
- [ ] Runner compiles NSIS Windows installer via `build-release.ps1 -Strict`.
- [ ] Artifacts generated: `dist/Komoyasb-Control-Center-Setup.exe`.
- [ ] Unified SHA-256 ledger computed: `dist/SHA256SUMS.txt`.
- [ ] GitHub Release entry published with attached binaries and release notes.

---

## 5. Post-Release Verification & Sanity Checks

### 5.1 Checksum Integrity
Verify local checksum of release binaries against published `SHA256SUMS.txt`:

```powershell
Get-FileHash -Algorithm SHA256 .\dist\*.exe
```

### 5.2 Bootstrap Remote Installation Test
Test the remote installation one-liner from an isolated test virtual machine or sandbox:

```powershell
# Remote Dry-Run test
& (irm https://raw.githubusercontent.com/gyovemi/komoyasb/main/bootstrap.ps1) -DryRun

# Remote Rootless test
& (irm https://raw.githubusercontent.com/gyovemi/komoyasb/main/bootstrap.ps1) -NoAdmin -DryRun
```

---

## 6. Rollback / Emergency Procedures

In the event a critical flaw or zero-day regression is identified in a published release:
1. **GitHub Release Revocation:** Navigate to GitHub Releases, mark the release as a Pre-release or Draft, or delete the faulty release asset.
2. **Tag Retraction:** Remove tag locally and remotely if not yet mirrored:
   ```powershell
   git tag -d v1.0.0
   git push origin :refs/tags/v1.0.0
   ```
3. **Hotfix Protocol:** Create a hotfix branch, patch the vulnerability, increment patch version (e.g., `1.0.1`), run pre-flight gates, and follow this checklist again.
