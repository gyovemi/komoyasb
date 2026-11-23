# DEEP CODE AUDIT & REMEDIATION ARCHITECTURE SPECIFICATION
**Project:** `komoyasb` - Ultra-performance, zero-bloat Windows 11 Desktop Tiling Suite  
**Scope:** Full-Repository Line-by-Line Production Readiness Audit  
**Version:** 1.0.0-rc.audit  
**Date:** 2026-11-22  
**Status:** READ-ONLY AUDIT COMPLETE — READY FOR REMEDIATION SWARM

---

## 1. Executive Summary & Audit Scope

This document represents the definitive, line-by-line architectural and technical code audit of the entire `komoyasb` codebase across all five operational tiers:
1. **Host Automation & OS Interop:** Windows PowerShell 5.1 & PowerShell Core 7 (`*.ps1`, `*.psm1`)
2. **Native Backend & Security Sandbox:** Rust & Tauri v2 (`ui/src-tauri/`)
3. **Frontend Application Layer:** React 19, TypeScript 5.7, Tailwind CSS (`ui/src/`)
4. **Configuration Schemas & Templates:** Dynamic compilation templates, JSON Schemas, YAML rules (`configs/`, `themes/`, `performance.json`)
5. **CI/CD Quality Gates & Release Packaging:** GitHub Actions workflows (`.github/workflows/`)

### Audit Metrics & Baseline
- **Files Tracked & Inspected:** 100% of non-ignored repository source files.
- **Current Test Suite Baseline:**
  - Pester Unit/Integration Tests: 155/155 Passed (0 Failed)
  - Vitest Frontend Suite: 51 test files, 371 tests Passed (0 Failed)
  - Full Dry-Run & Sandbox Isolation Matrix: 23/23 Scenarios Passed
  - TypeScript Typecheck (`tsc --noEmit`): Clean (0 type errors)
- **Verified Findings Summary:**
  - **Critical Severity:** 2
  - **High Severity:** 10
  - **Medium Severity:** 6
  - **Low Severity:** 2
  - **Total Real Technical Findings:** 20 (Zero stylistic fluff or subjective opinions)

---

## 2. Master Findings Ledger

Every issue cataloged below has been verified against the physical source code. Findings are ranked strictly by architectural severity, failure impact, and risk of host instability or data mutation.

| ID | Severity | File & Exact Line | Component / Domain | Summary Description |
| :--- | :--- | :--- | :--- | :--- |
| **CRIT-01** | **Critical** | `ui/src-tauri/tauri.conf.json:45-51` | Packaging / Bundling | Production NSIS bundle omits root `performance.json` from `bundle.resources`, causing crash or permission violation on live installs |
| **CRIT-02** | **Critical** | `ui/src-tauri/src/commands/system.rs:658, 687, 697` | Rust / Tauri Backend | `ServiceInfo` struct initialization uses Serde camelCase renames instead of Rust snake_case field identifiers, causing `cargo check`/`clippy` compilation failure |
| **HIGH-01** | **High** | `ui/src-tauri/src/commands/performance.rs:500-516` | Sandbox / Safety | `set_performance_profile` mutates live `performance.json` and `.current_perf` on disk *before* checking `dry_run` or sandbox mode |
| **HIGH-02** | **High** | `scripts/Set-PerformanceProfile.ps1:165-167` | PowerShell / IPC | Checks for nonexistent binary `komorebi-cli` instead of `komorebic`, silently preventing Komorebi configuration reloads |
| **HIGH-03** | **High** | `scripts/apply-windhawk-mods.ps1:162` | PowerShell / StrictMode | Accesses `$perfObj.profiles.$PerformanceProfile` without property existence guard, throwing terminating StrictMode exception on custom/unrecognized profiles |
| **HIGH-04** | **High** | `scripts/Set-OsPerformance.ps1:288` | PowerShell / StrictMode | Accesses `$perfConfig.profiles.$Profile` without `.PSObject.Properties[...]` guard, throwing terminating StrictMode exception |
| **HIGH-05** | **High** | `scripts/watchdog.ps1:71` | PowerShell / Windows Named Pipe | `[System.IO.File]::Exists('\\.\pipe\komorebi')` fails on Windows named pipes, rendering pipe readiness check ineffective |
| **HIGH-06** | **High** | `bootstrap.ps1:265, 268` | PowerShell / Path & Process | `powershell.exe -File $installerScript` lacks double quotes around `$installerScript` and argument array forwarding, breaking on paths with spaces |
| **HIGH-07** | **High** | `scripts/Bump-Version.ps1:179-198` | PowerShell / CI Automation | Native git commands (`git commit`, `git tag`) do not check `$LASTEXITCODE`, reporting false success when commits or tags fail |
| **HIGH-08** | **High** | `ui/src-tauri/src/commands/system.rs:518` | Rust / Concurrency | `run_install_provisioning` performs a synchronous blocking `child_process.wait()` on the Tokio runtime thread without timeout or abort handler |
| **HIGH-09** | **High** | `ui/src/components/views/services/ServicesView.tsx:112`, `ServiceCard.tsx:48`, `BackupRestoreModal.tsx:86` | Frontend React / Lifecycle | Uncancelled `setTimeout` calls update component state after unmounting, generating React memory leak warnings |
| **HIGH-10** | **High** | `.github/workflows/ci.yml:134` | CI/CD Workflows | CI `dry-run-matrix` declares matrix `[ standard, no-admin ]` but invokes `Test-FullDryRun.ps1` without passing `-NoAdmin`, skipping rootless mode verification |
| **MED-01** | **Medium** | `scripts/lib/TemplateEngine.psm1:288-296`, `configs/yasb/styles.css.template:43` | Configs / Template Engine | Fallback dictionary uses `colors.background` instead of `colors.bg_primary`; `transition_duration` fallback emits unitless `"0"` which violates CSS syntax |
| **MED-02** | **Medium** | `build-release.ps1:133`, `ui/package.json` | Build / Packaging | `build-release.ps1` invokes `npx tauri build`, but `@tauri-apps/cli` is omitted from `ui/package.json` devDependencies, causing nondeterministic downloads |
| **MED-03** | **Medium** | `build-release.ps1:169, 185`, `.github/workflows/release.yml:52` | CI/CD / Release Artifacts | `Set-Content -Encoding utf8` in PowerShell 5.1 writes a UTF-8 BOM, corrupting `SHA256SUMS.txt` for standard Unix checksum utilities (`sha256sum -c`) |
| **MED-04** | **Medium** | `scripts/sync-wallpaper.ps1:113-118` | PowerShell / Path Resolution | Resolves relative wallpaper paths against `(Get-Location).Path` and `$scriptDir` but fails to check `$repoRoot`, failing when CWD is not the workspace root |
| **MED-05** | **Medium** | `ui/src/components/views/services/BackupRestoreModal.tsx:66` | Frontend React / Performance | `fetchBackups` includes `selectedSnapshot` in `useCallback` dependency array, triggering a redundant re-fetch immediately upon opening |
| **MED-06** | **Medium** | `configs/yasb/widgets/Get-GpuMetrics.ps1:34`, `Get-KomorebiStatus.ps1:16` | PowerShell / Widgets | YASB widgets suppress all errors with `$ErrorActionPreference = 'SilentlyContinue'` and omit `Set-StrictMode -Version Latest`, risking silent payload corruption |
| **LOW-01** | **Low** | `ui/src/lib/ipc.ts:205` | Frontend IPC / Validation | `restoreBackup` calls `assertValidThemeName(snapshotTimestamp)` instead of dedicated timestamp validation, returning misleading error messages |
| **LOW-02** | **Low** | `.github/workflows/release.yml:50` | CI/CD / Workflows | `Get-ChildItem -Path dist/*.exe` uses forward slashes in Windows PowerShell runner, which can behave inconsistently in older Windows PowerShell engines |

---

### In-Depth Breakdown of Findings

#### CRIT-01: Production NSIS Bundle Omits Root `performance.json`
- **Location:** `ui/src-tauri/tauri.conf.json:45-51`
- **Root Cause:** The `tauri.conf.json` resource manifest includes:
  ```json
  "resources": [
    "../../configs/**/*",
    "../../themes/**/*",
    "../../scripts/**/*",
    "../../install.ps1",
    "../../uninstall.ps1"
  ]
  ```
  `performance.json` is located at the workspace root (`../../performance.json`). Because it is not explicitly listed or captured by wildcard, it is not packed into the NSIS installer bundle.
- **Failure Scenario:** Upon installing the application on a target user machine, `get_performance_config_path` resolves `root_path = base_path.join("performance.json")`. Because the bundled resource does not exist, `get_performance_config` attempts to fallback-write a default file into `C:\Program Files\komoyasb\` (which is write-protected for standard users), throwing `AppError::IoError` and breaking the Performance Tuning view.
- **Required Fix:** Add `"../../performance.json"` to `bundle.resources` in `ui/src-tauri/tauri.conf.json`.

#### CRIT-02: Rust `ServiceInfo` Struct Field Name Mismatch Breaks Compilation
- **Location:** `ui/src-tauri/src/commands/system.rs:658, 687, 697`
- **Root Cause:** In `system.rs:142-163`, `ServiceInfo` is defined with Rust snake_case field names and Serde renames:
  ```rust
  pub struct ServiceInfo {
      pub name: String,
      #[serde(rename = "displayName")]
      pub display_name: String,
      #[serde(rename = "isRunning")]
      pub is_running: bool,
      pub pid: Option<u32>,
      #[serde(rename = "memoryBytes")]
      pub memory_bytes: u64,
      #[serde(rename = "cpuPercent")]
      pub cpu_percent: f32,
      #[serde(rename = "uptimeSeconds")]
      pub uptime_seconds: u64,
  }
  ```
  However, in `get_services_status` (lines 656-704), instances are instantiated using camelCase identifiers:
  ```rust
  ServiceInfo {
      name: service_name.to_string(),
      displayName: display_label.to_string(),
      isRunning: true,
      pid: Some(1234),
      memoryBytes: 42_000_000,
      cpuPercent: 0.5,
      uptimeSeconds: 3600,
  }
  ```
- **Failure Scenario:** Rust struct initialization requires actual struct field names (`display_name`, `is_running`, `memory_bytes`, `cpu_percent`, `uptime_seconds`). When Cargo compiles `system.rs`, `rustc` throws error `E0560: struct ServiceInfo has no field named displayName`.
- **Required Fix:** Replace camelCase field initialization in lines 656-704 with canonical snake_case identifiers (`display_name`, `is_running`, `memory_bytes`, `cpu_percent`, `uptime_seconds`).

#### HIGH-01: Dry-Run Mutates Live Disk Files in `set_performance_profile`
- **Location:** `ui/src-tauri/src/commands/performance.rs:500-516`
- **Root Cause:** In `set_performance_profile`, step 1 mutates `performance.json` and step 2 writes `themes/.current_perf` on the physical filesystem before checking whether `is_dry_run` is true:
  ```rust
  // Step 1: writes to config_path
  let _ = atomic_write_file(&config_path, &serialized_content, Some(ConfigFormat::Json));
  // Step 2: writes to current_perf_path
  let _ = atomic_write_file(&current_perf_path, &profile, None);
  // Step 3: checks is_dry_run only for child process invocation
  let is_dry_run = dry_run || state.sandbox.is_sandboxed;
  ```
- **Failure Scenario:** When a user triggers a Dry-Run simulation from the UI or runs within a Sandbox evaluation, their live `performance.json` and active profile marker are overwritten on disk, violating dry-run immutability and host isolation guarantees.
- **Required Fix:** Wrap step 1 and step 2 in `if !is_dry_run { ... }` so disk files are only updated during live, non-simulated execution.

#### HIGH-02: Nonexistent CLI Binary `komorebi-cli` in `Set-PerformanceProfile.ps1`
- **Location:** `scripts/Set-PerformanceProfile.ps1:165-167`
- **Root Cause:** Lines 165-167 check:
  ```powershell
  if (Get-Command "komorebi-cli" -ErrorAction SilentlyContinue) {
      komorebi-cli reload-configuration
  }
  ```
- **Failure Scenario:** The official Komorebi CLI executable is named `komorebic` (as used correctly in `watchdog.ps1` and `install.ps1`). `komorebi-cli` does not exist. As a result, the `if` check evaluates to false, and Komorebi never reloads its active profile configuration during performance changes.
- **Required Fix:** Change `komorebi-cli` to `komorebic` and invoke `komorebic reload-configuration`.

#### HIGH-03 & HIGH-04: StrictMode Terminating Exceptions on Dynamic Property Access
- **Locations:** `scripts/apply-windhawk-mods.ps1:162`, `scripts/Set-OsPerformance.ps1:288`
- **Root Cause:** Both scripts enable `Set-StrictMode -Version Latest`. In PowerShell StrictMode, accessing an undefined property on a `PSCustomObject` throws a terminating runtime exception:
  ```powershell
  # apply-windhawk-mods.ps1:162
  if ($perfObj.profiles -and $perfObj.profiles.$PerformanceProfile -and $perfObj.profiles.$PerformanceProfile.dwm)
  # Set-OsPerformance.ps1:288
  if ($perfConfig.profiles -and $perfConfig.profiles.$Profile -and $perfConfig.profiles.$Profile.os)
  ```
  If `$PerformanceProfile` or `$Profile` is `"custom"` or any profile name not present in `performance.json`, the property dereference `$perfObj.profiles.$Profile` throws terminating error: `The property '<name>' cannot be found on this object`.
- **Failure Scenario:** Running `apply-windhawk-mods.ps1` or `Set-OsPerformance.ps1` with a custom or non-standard profile immediately crashes the execution script.
- **Required Fix:** Protect dynamic property lookup using `.PSObject.Properties`:
  ```powershell
  if ($perfConfig.profiles -and $perfConfig.profiles.PSObject.Properties[$Profile] -and $perfConfig.profiles.$Profile.os)
  ```

#### HIGH-05: Windows Named Pipe Inspection via `[System.IO.File]::Exists` Fails
- **Location:** `scripts/watchdog.ps1:71`
- **Root Cause:** `[System.IO.File]::Exists('\\.\pipe\komorebi')` uses standard Win32 file path inspection APIs that do not support named pipe device namespaces, consistently returning `$false`.
- **Failure Scenario:** Watchdog daemon readiness polling falls back to CLI ping or times out even when the Komorebi named pipe is active and responsive.
- **Required Fix:** Test for pipe presence using pipe device enumeration or standard client connection:
  ```powershell
  if ([System.IO.Directory]::GetFiles('\\.\pipe\', 'komorebi').Length -gt 0) { return $true }
  ```

#### HIGH-06: Unquoted Path / Space Splitting in CLI Script Invocation
- **Location:** `bootstrap.ps1:265, 268`
- **Root Cause:** Script invocation executes:
  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installerScript $forwardList
  ```
  If `$installerScript` contains spaces (e.g. `C:\Users\John Doe\AppData\...`), `-File` truncates the path at the first whitespace character.
- **Failure Scenario:** Bootstrap crashes on Windows installations where the user profile path or workspace contains whitespace.
- **Required Fix:** Wrap `$installerScript` in explicit quotation marks:
  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$installerScript" @forwardList
  ```

#### HIGH-07: Unchecked Native Process Exit Codes on Git Operations
- **Location:** `scripts/Bump-Version.ps1:179-198`
- **Root Cause:** `git commit` and `git tag` invocations do not check `$LASTEXITCODE`.
- **Failure Scenario:** If a commit fails (e.g. unconfigured git identity, no staged changes) or a tag already exists, the script continues and prints `[+] Committed version bump` and `[+] Created git tag`, reporting false success to CI/CD pipelines.
- **Required Fix:** Verify `$LASTEXITCODE -eq 0` after every `git` command and throw a descriptive error on failure.

#### HIGH-08: Synchronous Blocking Wait and Zombie Risk in Provisioning IPC
- **Location:** `ui/src-tauri/src/commands/system.rs:518`
- **Root Cause:** In `run_install_provisioning`, `let process_status = child_process.wait()` performs a blocking wait directly on the Tokio worker thread without a timeout or cancellation token.
- **Failure Scenario:** If PowerShell halts on an interactive prompt, winget network hang, or background service lock, the Tauri worker thread is permanently locked. Closing or navigating the UI leaves the child PowerShell process orphan/zombie in the background.
- **Required Fix:** Execute the process monitor asynchronously or within `tokio::task::spawn_blocking`, with a configurable timeout and process kill cleanup on abort.

#### HIGH-09: Unmounted React Component State Updates
- **Locations:** `ui/src/components/views/services/ServicesView.tsx:112`, `ServiceCard.tsx:48`, `BackupRestoreModal.tsx:86`
- **Root Cause:** `setTimeout` handlers execute state updates (`fetchServices()`, `onRefresh()`, `setIsRestoreSuccess(false)`) without tracking component unmount state or storing timer handles in refs for unmount cleanup.
- **Failure Scenario:** Navigating away from Services view or closing modals triggers React `act(...)` state update warnings on unmounted components and memory leaks.
- **Required Fix:** Track mounted state with `isMounted` refs or store timer IDs in `useRef` and clear them in the component's `useEffect` cleanup return.

#### HIGH-10: CI Dry-Run Matrix Ignores Matrix Parameter
- **Location:** `.github/workflows/ci.yml:134`
- **Root Cause:** The `dry-run-matrix` job defines:
  ```yaml
  matrix:
    mode: [ standard, no-admin ]
  ```
  However, line 134 runs:
  ```yaml
  run: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-FullDryRun.ps1
  ```
  Neither `${{ matrix.mode }}` nor the `-NoAdmin` switch is passed to the script.
- **Failure Scenario:** The CI pipeline runs the identical standard dry-run test twice, completely bypassing automated verification of the `-NoAdmin` rootless provisioning workflow.
- **Required Fix:** Pass the parameter conditionally based on `${{ matrix.mode }}`:
  ```yaml
  run: |
    $args = if ("${{ matrix.mode }}" -eq "no-admin") { "-NoAdmin" } else { "" }
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-FullDryRun.ps1 $args
  ```

---

## 3. Cross-Layer Contract Verification Matrix

The table below confirms complete schema and property alignment across all three application layers:
1. **PowerShell Layer:** JSON output payloads and parameter names
2. **Rust Backend Layer:** Tauri `#[tauri::command]` arguments and Serde struct models
3. **Frontend Layer:** TypeScript interfaces in `ui/src/types/ipc.ts` and `ui/src/lib/ipc.ts`

| Contract Model | PowerShell CLI / Script Source | Rust Backend Struct (`src-tauri`) | TypeScript Interface (`types/ipc.ts`) | Serde Field Mapping (`#[serde(rename)]`) | Contract Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ApplyResult** | `sync-theme.ps1`, `Set-PerformanceProfile.ps1` | `pub struct ApplyResult` (`system.rs:124`) | `export interface ApplyResult` | `themeName`, `renderedFiles`, `reloadedServices`, `outputLog` | **ALIGNED** |
| **SandboxInfo** | `DryRunContext.psm1` | `pub struct SandboxInfo` (`system.rs:23`) | `export interface SandboxInfo` | `isSandboxed`, `sandboxPath`, `liveWorkingDir` | **ALIGNED** |
| **PrivilegeStatus** | `Environment.psm1` (`Test-IsAdmin`) | `pub struct PrivilegeStatus` (`system.rs:37`) | `export interface PrivilegeStatus` | `isElevated`, `isRootless` | **ALIGNED** |
| **ServiceInfo** | `watchdog.ps1 -Action Status` | `pub struct ServiceInfo` (`system.rs:143`) | `export interface ServiceInfo` | `displayName`, `isRunning`, `memoryBytes`, `cpuPercent`, `uptimeSeconds` | **FIX REQUIRED (CRIT-02)** |
| **BackupSnapshot** | `Environment.psm1` (`.backups/`) | `pub struct BackupSnapshot` (`system.rs:188`) | `export interface BackupSnapshot` | `createdAt`, `directoryPath`, `files` | **ALIGNED** |
| **DeploymentStatus**| `install.ps1` | `pub struct DeploymentStatus` (`system.rs:203`)| `export interface DeploymentStatus` | `isDeployed`, `komorebiConfigExists`, `yasbConfigExists`, `whkdrcExists`, `activeServicesRunning`, `missingTools` | **ALIGNED** |
| **ExecutionLedger** | `DryRunContext.psm1` (`ledger.json`) | `pub struct ExecutionLedger` (`system.rs:319`)| `export interface ExecutionLedger` | `sessionId`, `isDryRun`, `shadowRoot`, `fileDiffs`, `actions`, `summary` | **ALIGNED** |
| **UnifiedTheme** | `themes/*.json`, `theme.schema.json` | `pub struct UnifiedTheme` (`theme.rs:101`) | `export interface UnifiedTheme` | Direct 1:1 match across `colors`, `typography`, `geometry`, `opacity`, `wallpaper` | **ALIGNED** |
| **PerformanceConfig**| `performance.json` | `pub struct PerformanceConfig` (`performance.rs:149`) | `export interface PerformanceConfig` | Direct 1:1 match across `profiles`, `active_profile`, `version` | **ALIGNED** |
| **KomorebiConfig** | `configs/komorebi/komorebi.json` | Dynamic JSON value parsing | `export interface KomorebiConfig` | Matches Komorebi schema specs | **ALIGNED** |
| **FlowSettings** | `configs/shell/flow_settings.json` | `pub struct FlowSettings` (`mods.rs:18`) | `export interface FlowSettings` | `Hotkey`, `Theme`, `Font`, `CustomAccentColor`, `UseWindowsAccentColor`, `SearchWindowEffect`, `BorderRadius`, `Opacity`, `MaxResultsToShow` | **ALIGNED** |
| **WindhawkModStatus**| `scripts/apply-windhawk-mods.ps1` | `pub struct WindhawkModStatus` (`mods.rs:53`) | `export interface WindhawkModStatus` | `sourceFile`, `isLoaded` | **ALIGNED** |
| **HotkeyConflict** | `tiling.rs:399` | `pub struct HotkeyConflict` (`tiling.rs:140`) | `export interface HotkeyConflict` | `keyCombination`, `bindingA`, `bindingB`, `reason` | **ALIGNED** |

---

## 4. Swarm Worker Ownership Map (Zero File Overlap)

To guarantee thread safety, zero merge conflicts, and distinct domain ownership, the 20 findings are partitioned across 4 specialized Swarm workers with **strictly disjoint file ownership boundaries**:

```
+---------------------------------------------------------------------------------+
|                                 SWARM COORDINATOR                               |
+---------------------------------------------------------------------------------+
        |                        |                        |                       |
        v                        v                        v                       v
+------------------+     +------------------+     +------------------+    +-------------------+
| @audit-powershell|     |   @audit-rust    |     | @audit-frontend  |    |  @audit-configs-ci|
| (Scripts & Tests)|     |  (Tauri Backend) |     | (React / TS UI)  |    | (Templates & CI)  |
+------------------+     +------------------+     +------------------+    +-------------------+
```

### Worker 1: `@audit-powershell`
- **File Ownership Scope:**
  - `bootstrap.ps1`, `install.ps1`, `uninstall.ps1`, `build-release.ps1`
  - `scripts/**` (All `.ps1`, `.psm1` helper scripts and libraries)
  - `configs/yasb/widgets/**` (`Get-GpuMetrics.ps1`, `Get-KomorebiStatus.ps1`)
  - `tests/powershell/**`, `tests/verify-host-safety.ps1`
- **Assigned Findings:**
  - `HIGH-02`: Replace `komorebi-cli` with `komorebic` in `scripts/Set-PerformanceProfile.ps1:165-167`.
  - `HIGH-03`: Add StrictMode property existence guard in `scripts/apply-windhawk-mods.ps1:162`.
  - `HIGH-04`: Add StrictMode property existence guard in `scripts/Set-OsPerformance.ps1:288`.
  - `HIGH-05`: Replace `[System.IO.File]::Exists` on named pipe with `Directory::GetFiles` in `scripts/watchdog.ps1:71`.
  - `HIGH-06`: Quote `$installerScript` and forward parameters safely in `bootstrap.ps1:265, 268`.
  - `HIGH-07`: Enforce `$LASTEXITCODE` checking on `git commit` and `git tag` in `scripts/Bump-Version.ps1:179-198`.
  - `MED-01` *(PowerShell portion)*: Align fallback dictionary in `scripts/lib/TemplateEngine.psm1:288-296`.
  - `MED-03` *(PowerShell portion)*: Write UTF-8 BOM-less checksums in `build-release.ps1:169, 185`.
  - `MED-04`: Fix wallpaper path resolution against `$repoRoot` in `scripts/sync-wallpaper.ps1:113-118`.
  - `MED-06`: Add `Set-StrictMode -Version Latest` and structured error handling to `configs/yasb/widgets/*.ps1`.
- **Target Verification Tests:**
  - `tests/verify-host-safety.ps1`
  - `scripts/Test-SecurityAndRootless.ps1`
  - `Invoke-Pester ./tests/powershell`

### Worker 2: `@audit-rust`
- **File Ownership Scope:**
  - `ui/src-tauri/src/**` (`main.rs`, `lib.rs`, `error.rs`, `state.rs`, `commands/**`, `utils/**`)
  - `ui/src-tauri/tests/**`
  - `ui/src-tauri/tauri.conf.json`
- **Assigned Findings:**
  - `CRIT-01`: Add `"../../performance.json"` to `bundle.resources` in `ui/src-tauri/tauri.conf.json:45-51`.
  - `CRIT-02`: Fix `ServiceInfo` struct field initialization syntax in `ui/src-tauri/src/commands/system.rs:658, 687, 697`.
  - `HIGH-01`: Protect disk mutations in `set_performance_profile` with `if !is_dry_run` in `ui/src-tauri/src/commands/performance.rs:500-516`.
  - `HIGH-08`: Implement timeout and child termination safety for `run_install_provisioning` in `ui/src-tauri/src/commands/system.rs:518`.
- **Target Verification Tests:**
  - Rust compilation & syntax verification
  - Dry-run immutability verification

### Worker 3: `@audit-frontend`
- **File Ownership Scope:**
  - `ui/src/**/*.{ts,tsx,css}`
  - `ui/package.json`
  - `ui/tests/**`
- **Assigned Findings:**
  - `HIGH-09`: Fix unmounted component state updates by adding cleanup refs in `ServicesView.tsx:112`, `ServiceCard.tsx:48`, and `BackupRestoreModal.tsx:86`.
  - `MED-02`: Add `"@tauri-apps/cli": "^2.0.0"` to `devDependencies` in `ui/package.json`.
  - `MED-05`: Eliminate redundant re-fetch trigger in `ui/src/components/views/services/BackupRestoreModal.tsx:66`.
  - `LOW-01`: Create dedicated snapshot timestamp validator in `ui/src/lib/validation.ts` and update `ui/src/lib/ipc.ts:205`.
- **Target Verification Tests:**
  - `npm run --prefix ui build` (`tsc && vite build`)
  - `npm test --prefix ui` (`vitest run`)

### Worker 4: `@audit-configs-ci`
- **File Ownership Scope:**
  - `configs/**` (excluding `configs/yasb/widgets/**`)
  - `themes/**`
  - `performance.json`
  - `.github/workflows/**` (`ci.yml`, `release.yml`)
- **Assigned Findings:**
  - `HIGH-10`: Propagate matrix parameter (`-NoAdmin`) to `Test-FullDryRun.ps1` in `.github/workflows/ci.yml:134`.
  - `MED-01` *(Template portion)*: Verify `perf.yasb.transition_duration` syntax compliance in `configs/yasb/styles.css.template:43`.
  - `MED-03` *(CI portion)*: Enforce BOM-less UTF-8 in `.github/workflows/release.yml:52`.
  - `LOW-02`: Normalize file glob syntax in `.github/workflows/release.yml:50`.
- **Target Verification Tests:**
  - Schema validation across `themes/*.json` and `performance.json`
  - Workflow YAML linting & AST validation

---

## 5. Final Verification Gate Suite

Upon completion of work by all 4 Swarm workers, the coordinator will execute the following rigorous verification gate commands in strict sequential order. Every gate must exit with code `0`.

```powershell
# 1. PowerShell AST Host-Safety & Anti-Destructive Static Analysis Gate
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\verify-host-safety.ps1

# 2. PowerShell Security & Rootless Mode Enforcement Gate
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-SecurityAndRootless.ps1

# 3. Pester 5.5+ Comprehensive Unit & Integration Test Suite
pwsh.exe -NoProfile -Command "
    `$config = [PesterConfiguration]::Default;
    `$config.Run.Path = './tests/powershell';
    `$config.Run.PassThru = `$true;
    `$config.Output.Verbosity = 'Detailed';
    `$result = Invoke-Pester -Configuration `$config;
    if (`$result.FailedCount -gt 0) { exit 1 } else { exit 0 }
"

# 4. Frontend TypeScript Strict Compilation & Vite Production Bundling
npm run --prefix ui build

# 5. Frontend Vitest Unit Tests & V8 Coverage
npm test --prefix ui

# 6. Full Dry-Run Matrix Verification (Standard & NoAdmin Rootless Modes)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-FullDryRun.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-FullDryRun.ps1 -NoAdmin

# 7. Sandbox Isolation & Zero-Host-Mutation Verification Gate
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-SandboxIsolation.ps1

# 8. Master Consolidated QA Gate (All Domains)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Invoke-AllTests.ps1
```
