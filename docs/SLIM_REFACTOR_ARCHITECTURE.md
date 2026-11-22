# komoyasb Slim Refactor Architecture Blueprint

## Executive Summary & Mission

This architectural blueprint governs the codebase simplification initiative for `komoyasb`. The objective is to systematically eliminate boilerplate, repetitive structural patterns, dead code, and over-engineered abstractions across PowerShell, Rust (Tauri v2), React/TypeScript, and configuration templates—significantly decreasing total Lines of Code (LOC) while strictly improving readability, maintainability, type safety, and security.

The refactoring will be executed by 4 parallel Swarm workers with zero file overlap, verified by automated end-to-end dry-run and static analysis gates.

---

## 1. Baseline Codebase Metrics (Pre-Refactor)

All measurements exclude build artifacts and external vendor dependencies (`node_modules/`, `target/`, `dist/`, `.git/`, `.gemini/`).

| Domain | File Extensions / Paths | File Count | Baseline LOC | Code Lines | Comments & Doc | Blank Lines |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **PowerShell Core & Scripts** | `.ps1`, `.psm1` (`install.ps1`, `uninstall.ps1`, `bootstrap.ps1`, `build-release.ps1`, `scripts/`, `tests/`) | 16 | 5,447 | 4,499 | 330 | 618 |
| **Rust Tauri v2 Backend** | `.rs` (`ui/src-tauri/src/`) | 16 | 4,048 | 3,340 | 385 | 323 |
| **Frontend React / TypeScript** | `.ts`, `.tsx` (`ui/src/`) | 54 | 11,468 | 9,620 | 812 | 1,036 |
| **Configs, Modules & Templates** | `.json`, `.yaml`, `.yml`, `.template*` (`configs/`, `themes/`) | 16 | 2,752 | 2,490 | 85 | 177 |
| **TOTAL** | — | **102** | **23,715** | **19,949** | **1,612** | **2,154** |

### Top Files by Size (High Leverage Targets)
1. `ui/src/types/ipc.ts` (912 LOC) — Repetitive structural type declarations and redundant payload definitions.
2. `ui/src-tauri/src/commands/system.rs` (857 LOC) — Repetitive PowerShell CLI runner invocations and verbose parsing logic.
3. `ui/src/components/views/statusbar/YasbWidgetOrganizer.tsx` (697 LOC) — Monolithic inline widget definitions and deep state mutation trees.
4. `ui/src/components/views/tiling/ShortcutRecorder.tsx` (660 LOC) — Repetitive keybinding capture handlers and manual state dispatchers.
5. `scripts/lib/DryRunContext.psm1` (613 LOC) — Repetitive hash building, parameter validation, and filesystem projection checks.
6. `ui/src-tauri/src/commands/statusbar.rs` (630 LOC) — Repetitive config file path resolution and atomic file persistence routines.
7. `scripts/lib/Environment.psm1` (536 LOC) — Verbose path manipulation and repetitive winget package checks.
8. `scripts/Set-OsPerformance.ps1` (503 LOC) — Verbose P/Invoke definitions and duplicated error-handling guards.
9. `scripts/apply-windhawk-mods.ps1` (441 LOC) — Repetitive CLI argument assembly and process status polling loops.

---

## 2. Anti-Code-Golf Charter & Invariant Principles

Code reduction must never deteriorate code quality or violate architectural safety principles. All refactoring must strictly adhere to the following non-negotiable rules:

### A. Readability & Semantic Clarity
1. **Never sacrifice descriptive naming**: Variables and parameters must remain self-documenting (`$targetConfigPath`, not `$p`; `sandbox_root`, not `sb`).
2. **Concise Google-style Docstrings**: Keep or modernize structured function docstrings (`.SYNOPSIS`, `.DESCRIPTION`, `.PARAMETER` in PowerShell; Rustdoc `///` with `# Errors` in Rust; TSDoc in TypeScript). Do not strip comments solely to lower line counts.
3. **No Unreadable One-Liners**: Do not chain arbitrary pipelines into unreadable regex hacks. Prefer early returns and guard clauses over deep nesting.

### B. Strict Invariants & Security
1. **PowerShell `Set-StrictMode -Version Latest` & `$ErrorActionPreference = 'Stop'`**: Every `.ps1` and `.psm1` must maintain strict mode and terminate on errors.
2. **Rootless & Elevation Safety**: Never introduce ambient administrative assumptions. Code must gracefully check `Test-IsAdmin` and operate safely in non-elevated (Rootless) user context.
3. **Full Dry-Run Immutability**: All filesystem and OS state changes must strictly route through `Invoke-SystemAction` or `DryRunContext.psm1` when `-DryRun` or `-SandboxRoot` is active. Zero host mutation when running in DryRun.
4. **Rust Safety & Validation**: Keep atomic file writing (`atomic_write_file`), strict path normalization preventing directory traversal, and strong typed deserialization via `serde`.
5. **No Breaking Public Contracts**:
   - Public CLI parameters in `install.ps1`, `uninstall.ps1`, `watchdog.ps1`, `sync-theme.ps1`, `Set-PerformanceProfile.ps1`, and `Set-OsPerformance.ps1` must remain 100% backward-compatible.
   - Tauri IPC command function names in `ui/src-tauri/src/commands/*.rs` registered in `lib.rs` must not change unless synchronized with `ui/src/lib/ipc.ts`.
   - Keys in `themes/*.json`, `configs/**/*.json`, and `performance.json` must remain intact.

---

## 3. Worker Ownership Map (Zero File Overlap)

To prevent git merge conflicts and ensure clear accountability, four distinct Swarm workers own isolated, strictly partitioned segments of the repository.

```
                    ┌────────────────────────┐
                    │      COORDINATOR       │
                    │  (Orchestration & QA)  │
                    └───────────┬────────────┘
         ┌──────────────┬───────┴────────┬──────────────┐
         ▼              ▼                ▼              ▼
┌────────────────┐┌───────────┐ ┌────────────────┐┌──────────────┐
│@slim-powershell││@slim-rust │ │ @slim-frontend ││@slim-configs │
│ Scripts & Pester││ Tauri v2  │ │ React / TSX    ││Templates/YAML│
└────────────────┘└───────────┘ └────────────────┘└──────────────┘
```

### Worker 1: `@slim-powershell`
- **Ownership Scope**:
  - `install.ps1`
  - `uninstall.ps1`
  - `bootstrap.ps1`
  - `build-release.ps1`
  - `scripts/**/*.ps1`
  - `scripts/**/*.psm1`
  - `tests/**/*.ps1`
- **Refactoring Mandate**:
  - **Deduplicate Environment & DryRun Operations**: Extract common path resolving and command execution routines in `scripts/lib/Environment.psm1` and `scripts/lib/DryRunContext.psm1`.
  - **Replace Repetitive `if (-not (Test-Path ...))`**: Use concise guard clauses with early exits.
  - **Data-Driven Tables**: Convert repeated winget package validation loops, service state lookups in `watchdog.ps1`, and Windhawk mod CLI parameter chains into concise hashtable/array descriptors.
  - **Eliminate Verbose Boilerplate**: Replace verbose switch statement branches with hashtable lookup dispatchers where idiomatic.
  - **Splatting & Pipelines**: Consolidate repetitive cmdlet parameter blocks using clean PowerShell splatting (`$params = @{ ... }; Invoke-Command @params`).

### Worker 2: `@slim-rust`
- **Ownership Scope**:
  - `ui/src-tauri/src/**/*.rs` (`commands/`, `utils/`, `state.rs`, `error.rs`, `lib.rs`, `main.rs`)
- **Refactoring Mandate**:
  - **Consolidate Tauri Command Wrappers**: In `commands/system.rs`, `commands/statusbar.rs`, `commands/performance.rs`, and `commands/tiling.rs`, deduplicate process invocation (`run_powershell_script`), config reading, and error conversion.
  - **Idiomatic Error Propagation**: Replace manual `match` / nested error formatting blocks with idiomatic `?`, `map_err`, and standard `AppError` constructors.
  - **Shared Atomic Utilities**: Consolidate atomic file reading/writing and validation pipelines in `utils/atomic_write.rs` and `utils/validator.rs`.
  - **Eliminate Unused Trait Implements & Dead Structs**: Remove unused struct fields, redundant getters, and boilerplate deserialization layers.

### Worker 3: `@slim-frontend`
- **Ownership Scope**:
  - `ui/src/**/*.{ts,tsx}` (`components/`, `lib/`, `types/`, `hooks/`, `App.tsx`, `main.tsx`)
- **Refactoring Mandate**:
  - **Streamline `ui/src/types/ipc.ts`**: Deduplicate overlapping interfaces, extract shared base types (e.g., standard dimension, position, and status contracts), and eliminate redundant type definitions.
  - **Extract Declarative Form & Layout Schemas**:
    - In `YasbWidgetOrganizer.tsx` and `WidgetConfigForm.tsx`, replace massive repetitive JSX control blocks with declarative configuration arrays rendered through compact field generator components.
    - In `GranularControls.tsx`, `FloatRulesTable.tsx`, and `ShortcutRecorder.tsx`, simplify nested handler closures and deep state trees using reusable reducer/table primitives.
  - **Shared IPC Helper**: Ensure all Tauri IPC calls in `ui/src/lib/ipc.ts` utilize a DRY typed invoker with standardized error mapping.

### Worker 4: `@slim-configs`
- **Ownership Scope**:
  - `configs/**/*.template*`
  - `configs/**/*.yaml`, `configs/**/*.json` (excluding source files owned by other tools)
  - `themes/*.json`, `themes/*.schema.json`
- **Refactoring Mandate**:
  - **Template Normalization**: Ensure placeholders (`{{colors.bg_primary}}`, `{{perf.komorebi.*}}`) are clean and formatted consistently across `komorebi.json.template`, `whkdrc.template`, `config.yaml.template`, and `fluentflyout_config.json.template`.
  - **Remove Dead Config Entries & Redundancies**: Eliminate unused placeholder keys, orphaned comments in template files, and redundant white space or duplicate style entries while maintaining exact JSON/YAML schema compliance.
  - **Preserve Full Schema Compatibility**: Never remove or rename active configuration keys consumed by `TemplateEngine.psm1`, Komorebi, YASB, or Flow Launcher.

---

## 4. Verification Gates (Strict Quality & Safety Checks)

Before any worker's refactored code can be merged into the main workspace, it must pass the unified verification pipeline:

```
┌────────────────────────────────────────────────────────┐
│               UNIFIED VERIFICATION GATE                │
├────────────────────────────────────────────────────────┤
│ 1. PowerShell AST Static Safety Check                  │
│    powershell -File .\tests\verify-host-safety.ps1     │
│                                                        │
│ 2. Full Dry-Run Sandbox & Host Zero-Mutation Harness   │
│    powershell -File .\scripts\Test-FullDryRun.ps1      │
│                                                        │
│ 3. TypeScript Type-Checking & Vite Production Build    │
│    npm --prefix ui run build (tsc + vite build)        │
│                                                        │
│ 4. Rust Compilation & Unit Tests                       │
│    cargo test --manifest-path ui/src-tauri/Cargo.toml  │
│    cargo clippy --manifest-path ui/src-tauri/Cargo.toml│
│                                                        │
│ 5. Automated LOC Delta & Invariant Audit Report        │
└────────────────────────────────────────────────────────┘
```

### Detailed Verification Commands:
1. **PowerShell AST Host-Safety Verification**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tests\verify-host-safety.ps1
   ```
   *Requirement*: Exit code `0`. Confirms zero ungoverned file mutations, registry edits, or raw process launches outside `DryRunContext.psm1`.

2. **Full Dry-Run & Sandbox Rollback Harness**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\Test-FullDryRun.ps1
   ```
   *Requirement*: Exit code `0`. Tests snapshot baseline, sandbox installation #1, schema validation of rendered configs, idempotency installation #2, rollback uninstallation, and 100% cryptographic immutability of the live host.

3. **Frontend TypeScript & Bundle Compilation**:
   ```powershell
   npm --prefix ui run build
   ```
   *Requirement*: Exit code `0`. Zero type errors (`tsc --noEmit`), successful Vite compilation and asset bundling.

4. **Rust Compilation & Linter** (When Cargo is available in host environment):
   ```powershell
   cargo test --manifest-path ui/src-tauri/Cargo.toml
   cargo clippy --manifest-path ui/src-tauri/Cargo.toml -- -D warnings
   ```
   *Requirement*: Zero compilation warnings, zero test failures.

---

## 5. Expected LOC Reduction Targets

| Domain | Baseline LOC | Target Refactored LOC | Estimated LOC Reduction | Primary Reduction Mechanism |
| :--- | :---: | :---: | :---: | :--- |
| **PowerShell** | 5,447 | ~3,900 | **~1,540 (-28%)** | Table-driven package/service execution, guard clauses, unified P/Invoke helpers |
| **Rust** | 4,048 | ~2,900 | **~1,140 (-28%)** | Unified script execution wrappers, `?` operator chaining, DRY file IO |
| **Frontend** | 11,468 | ~7,800 | **~3,660 (-32%)** | Schema-driven form renderers, deduplicated IPC types, shared UI primitives |
| **Configs & Templates** | 2,752 | ~2,300 | **~450 (-16%)** | Dead placeholder cleanup, template normalization, compact formatting |
| **TOTAL** | **23,715** | **~16,900** | **~6,790 (-29%)** | **DRY architecture across entire project stack** |

---
*Document produced as pre-refactoring architectural blueprint. All changes subject to automated gate approval.*
