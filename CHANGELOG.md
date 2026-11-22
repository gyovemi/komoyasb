# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-11-22

### Added
- **Unified Desktop Orchestration:**
  - Automated deployment and lifecycle management for Komorebi (tiling window manager), whkd (hotkey daemon), YASB Reborn (customizable status bar), Flow Launcher, FluentFlyout (modern OSD), and EarTrumpet.
  - Optional Windhawk mod integration for taskbar auto-hide, DWM Mica styling, and notification styling.
- **Rootless / Non-Admin Architecture (`-NoAdmin`):**
  - First-class support for standard user accounts without administrative privileges or UAC elevation.
  - User-scoped package installation via Windows Package Manager (`winget --scope user`).
  - Native Windows taskbar auto-hide fallback utilizing `HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StuckRects3` binary mutation when machine-level hooks are unavailable.
  - NSIS installer configured for `currentUser` scope targeting `%LOCALAPPDATA%\Programs`.
- **Performance Engine & Profiles:**
  - Declarative performance configuration (`performance.json`) with four optimized presets: `ultra-low`, `balanced`, `visual-rich`, and `gaming`.
  - Granular control over UI animation speed, DWM Mica/Acrylic blur, telemetry polling intervals, and Windows EcoQoS / process priority states.
  - CLI profile switcher (`scripts/Set-PerformanceProfile.ps1`) and dynamic template token injection (`{{perf.*}}`).
- **Control Center Desktop Application (`ui/`):**
  - Native Windows 11 settings application built on Tauri v2 and React 19.
  - Visual Theme Studio with 14 color tokens, typography settings, window padding, and wallpaper styling.
  - Interactive tiling configuration, application floating rules management, and keyboard shortcut recorder.
  - Status bar widget manager, CSS customizer, and background process monitor.
- **Testing & Quality Assurance Gates:**
  - Unified polyglot test runner (`scripts/Invoke-AllTests.ps1`) enforcing strict 90%+ line coverage.
  - Static AST host safety gate (`tests/verify-host-safety.ps1`) preventing accidental host mutations.
  - End-to-End shadow execution sandbox (`scripts/Test-FullDryRun.ps1`) verifying complete install/uninstall idempotency.
  - Security and rootless privilege validation suite (`scripts/Test-SecurityAndRootless.ps1`).
- **Release & CI/CD Automation:**
  - Hardened GitHub Actions continuous integration matrix (`.github/workflows/ci.yml`).
  - Automated tag-based production packaging pipeline (`.github/workflows/release.yml`) producing signed NSIS installers and `SHA256SUMS.txt`.
  - Single-source version management utility (`scripts/Bump-Version.ps1`).
  - Automated repository provisioning tool (`scripts/Publish-GitHubRepo.ps1`).
  - Remote bootstrap installer (`bootstrap.ps1`) with SHA-256 integrity verification.
- **Transactional Rollback:**
  - Comprehensive uninstaller (`uninstall.ps1`) that stops background services, unloads mods, restores configuration backups, and reverts shell modifications.

[Unreleased]: https://github.com/gyovemi/komoyasb/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/gyovemi/komoyasb/releases/tag/v1.0.0
