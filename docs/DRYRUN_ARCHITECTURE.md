# Komoyasb Full Dry-Run (Shadow Execution) Architecture Contract

**Status:** Target Architecture & Contract Specification  
**Document Version:** 1.0.0  
**Authors:** Principal Windows Systems Reliability Engineer & Swarm Architect  
**Target:** 4-Worker Autonomous Swarm (`@dryrun-core`, `@dryrun-lifecycle`, `@dryrun-harness`, `@dryrun-ui`)

---

## 1. Executive Summary & Core Paradigm

The `komoyasb` environment orchestrates window management (`komorebi`), hotkeys (`whkd`), status bars (`yasb`), app launchers (`Flow Launcher`), shell modifications (`Windhawk`), and Windows desktop composition (wallpaper and DWM mica styling).

A true enterprise-grade **Dry-Run (Shadow Execution)** cannot rely on mere `-WhatIf` / `Write-Host "[DRYRUN] ..."` console logging. In a mission-critical Windows desktop environment, dry-run must guarantee:
1. **Host Zero-Mutation Invariant:** Not a single byte is modified in live `$env:USERPROFILE`, `$env:APPDATA`, `$env:LOCALAPPDATA`, or `$env:ProgramData`. Zero registry keys modified, zero processes killed or spawned, zero winget packages installed.
2. **Deterministic Virtualized Fidelity:** The entire rendering pipeline (template compilation, token expansion, backup manifest generation, file deployments) actually executes into an isolated shadow filesystem sandbox (`$ShadowRoot`), verifying that all output files are valid, parseable, and syntactically sound.
3. **Structured Ledger & Diff Audit:** Every simulated action (file write, directory creation, backup snapshot, registry edit, winget package check, process stop/start) is recorded into a strictly typed JSON Ledger with cryptographic hash diffs (`SHA256`) and structured metadata.

---

## 2. Baseline System Audit: Live Targets & External Mutations

### 2.1 Live Filesystem Targets

| Path Expression | Target Location | Responsible Component |
| :--- | :--- | :--- |
| `$env:USERPROFILE\.config\komorebi\komorebi.json` | Live user config | `install.ps1`, `sync-theme.ps1` |
| `$env:USERPROFILE\.config\komorebi\applications.yaml` | Live application rules | `install.ps1` |
| `$env:USERPROFILE\.config\whkdrc` | Live hotkey configuration | `install.ps1`, `sync-theme.ps1` |
| `$env:USERPROFILE\.config\yasb\config.yaml` | Live statusbar layout & widgets | `install.ps1`, `sync-theme.ps1` |
| `$env:USERPROFILE\.config\yasb\styles.css` | Live statusbar stylesheet | `install.ps1`, `sync-theme.ps1` |
| `$env:APPDATA\FlowLauncher\Settings\Settings.json` | Launcher settings | `install.ps1`, `sync-theme.ps1` |
| `$env:APPDATA\FlowLauncher\Themes\KomoyasbFluent.xaml` | Flow Launcher theme | `install.ps1`, `sync-theme.ps1` |
| `$workspaceRoot\configs\...\*.json\|yaml\|css\|xaml` | Workspace compiled targets | `sync-theme.ps1` |
| `$workspaceRoot\themes\.current_theme` | Active theme pointer marker | `sync-theme.ps1`, Rust `set_active_theme` |
| `$workspaceRoot\themes\.latest_backup.txt` | Pointer to latest backup dir | `install.ps1` |
| `$workspaceRoot\themes\.backups\<timestamp>\` | Backup archives & `manifest.json` | `install.ps1`, `uninstall.ps1` |
| `$env:ProgramData\Windhawk\Mods\*.wh.cpp` | Windhawk mod staging directory | `apply-windhawk-mods.ps1` |

### 2.2 External OS Mutations & Interception Points

| Mechanism | Target / Command | Live Invoker | Shadow Interception Strategy |
| :--- | :--- | :--- | :--- |
| **Package Management** | `winget install --exact --id <PackageId> ...` | `Environment.psm1` (`Install-WingetPackage`) | Intercept via `Invoke-SystemAction`. Check local shadow registry/manifest; record `PackageInstall` ledger event without invoking binary. |
| **Windhawk Injection** | `windhawk-cli.exe -load-mod ...`, `-unload-mod`, `-compile-mod` | `apply-windhawk-mods.ps1` (`Invoke-WindhawkCommand`) | Intercept via `Invoke-SystemAction`. Verify C++ mod source presence and syntax; log `ModLoad`/`ModUnload` action. Prevent invocation of live injector daemon. |
| **Process Control** | `Stop-Process`, `Start-Process`, `Get-Process` | `uninstall.ps1`, `watchdog.ps1` | Intercept via `Invoke-SystemAction`. Return virtual running state / PID table. Never kill real explorer/subsystem processes. |
| **Windows Registry** | `HKCU:\Control Panel\Desktop` (`WallpaperStyle`, `TileWallpaper`) | `sync-wallpaper.ps1` | Record intended registry mutation into JSON ledger with previous value vs new value; bypass `Set-ItemProperty`. |
| **Win32 Wallpaper API** | `SystemParametersInfoW(SPI_SETDESKWALLPAPER)` via `user32.dll` | `sync-wallpaper.ps1` | Intercept. Validate image file exists; bypass P/Invoke call; record `WallpaperChange` action. |
| **IPC / CLI Daemons** | `komorebic ping`, `komorebic state`, `nvidia-smi` | `watchdog.ps1`, `Get-KomorebiStatus.ps1`, `Get-GpuMetrics.ps1` | Route query through system action interceptor or mock stub when shadow context is active. |

### 2.3 Current Rust Backend & UI Handling

In `ui/src-tauri/src/utils/sandbox.rs` and `commands/system.rs`:
- A basic `UI_SANDBOX_DIR` environment check exists, but currently only returns hardcoded dummy strings for `run_install_provisioning` and mock service structs.
- `apply_sync_theme` passes `-DryRun` to `sync-theme.ps1`, but `sync-theme.ps1` still tries to write to `$workspaceRoot/configs/` when not intercepted!
- The UI currently lacks a structured telemetry ledger to display rich simulated diffs (e.g. before-and-after token comparison, modified files list, pending package operations).

---

## 3. Shadow Context & Path Resolver Contract (`@dryrun-core`)

All path resolution and OS mutation logic MUST be encapsulated in a single, robust PowerShell module: `scripts/lib/DryRunContext.psm1`.

### 3.1 Module Interface Specification

```powershell
# ==============================================================================
# scripts/lib/DryRunContext.psm1 - Interface Contract
# ==============================================================================

<#
.SYNOPSIS
    Initializes a thread-safe, isolated Shadow Execution Context for dry-run simulation.
.PARAMETER ShadowRoot
    Target root directory where virtualized files and manifests are written.
    Defaults to $env:TEMP\komoyasb_dryrun_<timestamp> or $env:UI_SANDBOX_DIR.
.PARAMETER PassthroughRead
    If $true, file read operations can inspect host files as baseline if not yet present in ShadowRoot.
    Defaults to $true.
.PARAMETER EnforceZeroMutation
    If $true, any unintercepted attempt to write outside $ShadowRoot throws a fatal terminating error.
#>
function Initialize-ShadowContext {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [string]$ShadowRoot = "",

        [Parameter(Mandatory = $false)]
        [switch]$PassthroughRead = $true,

        [Parameter(Mandatory = $false)]
        [switch]$EnforceZeroMutation = $true
    )
}

<#
.SYNOPSIS
    Translates any live path (UserProfile, AppData, LocalAppData, Workspace, ProgramData)
    into its deterministic shadow replica.
#>
function Resolve-TargetPath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $false)]
        [ValidateSet("Read", "Write", "Exists")]
        [string]$Mode = "Write"
    )
    # Mapping Rules:
    # 1. $env:USERPROFILE\<Sub>   -> $ShadowRoot\userprofile\<Sub>
    # 2. $env:APPDATA\<Sub>       -> $ShadowRoot\appdata\<Sub>
    # 3. $env:LOCALAPPDATA\<Sub>  -> $ShadowRoot\localappdata\<Sub>
    # 4. $env:ProgramData\<Sub>   -> $ShadowRoot\programdata\<Sub>
    # 5. $workspaceRoot\<Sub>     -> $ShadowRoot\workspace\<Sub>
    # 6. Any other drive/path     -> $ShadowRoot\fs\<Drive>\<Sub>
}

<#
.SYNOPSIS
    Safely executes an external system mutation or records it into the execution ledger.
#>
function Invoke-SystemAction {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("FileWrite", "FileDelete", "DirectoryCreate", "RegistryWrite", "PackageInstall", "ProcessControl", "WallpaperApply", "WindhawkMod")]
        [string]$ActionType,

        [Parameter(Mandatory = $true)]
        [string]$Target,

        [Parameter(Mandatory = $false)]
        [hashtable]$Metadata = @{},

        [Parameter(Mandatory = $false)]
        [scriptblock]$LiveAction = $null
    )
}

<#
.SYNOPSIS
    Exports the recorded execution events and file diffs as a structured JSON ledger.
#>
function Export-ShadowLedger {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [string]$OutputPath
    )
}

<#
.SYNOPSIS
    Cleans up the shadow directory or retains it for forensic assertion.
#>
function Reset-ShadowContext {
    [CmdletBinding()]
    param(
        [switch]$PurgeFiles
    )
}
```

### 3.2 Structured JSON Execution Ledger Schema (`ledger.json`)

The output produced by `Export-ShadowLedger` adheres to the following JSON schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "KomoyasbExecutionLedger",
  "type": "object",
  "required": ["sessionId", "timestamp", "isDryRun", "summary", "actions", "fileDiffs"],
  "properties": {
    "sessionId": { "type": "string" },
    "timestamp": { "type": "string", "format": "date-time" },
    "isDryRun": { "type": "boolean" },
    "shadowRoot": { "type": ["string", "null"] },
    "summary": {
      "type": "object",
      "required": ["totalActions", "filesWritten", "filesDeleted", "registryWrites", "packagesSimulated", "processesControlled"],
      "properties": {
        "totalActions": { "type": "integer" },
        "filesWritten": { "type": "integer" },
        "filesDeleted": { "type": "integer" },
        "registryWrites": { "type": "integer" },
        "packagesSimulated": { "type": "integer" },
        "processesControlled": { "type": "integer" }
      }
    },
    "actions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "timestamp", "actionType", "target", "status"],
        "properties": {
          "id": { "type": "string" },
          "timestamp": { "type": "string" },
          "actionType": {
            "type": "string",
            "enum": [
              "FileWrite",
              "FileDelete",
              "DirectoryCreate",
              "RegistryWrite",
              "PackageInstall",
              "ProcessControl",
              "WallpaperApply",
              "WindhawkMod"
            ]
          },
          "target": { "type": "string" },
          "status": { "type": "string", "enum": ["Simulated", "Executed", "Failed", "Skipped"] },
          "metadata": { "type": "object" }
        }
      }
    },
    "fileDiffs": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["targetVirtualPath", "targetLivePath", "changeType"],
        "properties": {
          "targetVirtualPath": { "type": "string" },
          "targetLivePath": { "type": "string" },
          "changeType": { "type": "string", "enum": ["Created", "Modified", "Deleted", "Unchanged"] },
          "originalSha256": { "type": ["string", "null"] },
          "shadowSha256": { "type": ["string", "null"] },
          "byteSize": { "type": "integer" }
        }
      }
    }
  }
}
```

---

## 4. Swarm Worker Ownership Map (Strict Zero File Overlap)

To guarantee conflict-free parallel execution across 4 swarm workers, repository ownership is strictly partitioned:

```
+-------------------------------------------------------------------------------------------------------------+
|                                        SWARM WORKER DIVISION OF RESPONSIBILITY                              |
+------------------------------------+------------------------------------------------------------------------+
| Worker                             | File Ownership (Exclusive)                                             |
+------------------------------------+------------------------------------------------------------------------+
| @dryrun-core                       | - scripts/lib/DryRunContext.psm1 (NEW)                                 |
|                                    | - scripts/lib/Environment.psm1 (Refactor path resolvers & winget)      |
|                                    | - scripts/lib/TemplateEngine.psm1 (Shadow destination output)          |
|                                    | - tests/unit/Test-DryRunContext.Tests.ps1 (NEW unit tests)             |
+------------------------------------+------------------------------------------------------------------------+
| @dryrun-lifecycle                  | - install.ps1                                                          |
|                                    | - uninstall.ps1                                                        |
|                                    | - scripts/sync-theme.ps1                                               |
|                                    | - scripts/sync-wallpaper.ps1                                           |
|                                    | - scripts/apply-windhawk-mods.ps1                                      |
|                                    | - scripts/watchdog.ps1                                                 |
+------------------------------------+------------------------------------------------------------------------+
| @dryrun-harness                    | - scripts/Test-FullDryRun.ps1 (NEW)                                    |
|                                    | - tests/verify-host-safety.ps1 (NEW)                                  |
|                                    | - .github/workflows/dryrun-verification.yml (OPTIONAL/CI)              |
+------------------------------------+------------------------------------------------------------------------+
| @dryrun-ui                         | - ui/src-tauri/src/utils/sandbox.rs                                    |
|                                    | - ui/src-tauri/src/commands/system.rs                                  |
|                                    | - ui/src-tauri/src/commands/theme.rs                                   |
|                                    | - ui/src-tauri/src/state.rs                                            |
|                                    | - ui/src/types/ipc.ts                                                  |
|                                    | - ui/src/lib/ipc.ts                                                    |
|                                    | - ui/src/components/views/system/DryRunLedgerModal.tsx (NEW)           |
+------------------------------------+------------------------------------------------------------------------+
```

### 4.1 Detailed Worker Mandates

#### `@dryrun-core`
- **Primary Goal:** Provide the foundational virtual context, interception primitives, and ledger generator.
- **Tasks:**
  1. Author `scripts/lib/DryRunContext.psm1`.
  2. Implement `Initialize-ShadowContext`, `Resolve-TargetPath`, `Invoke-SystemAction`, `Export-ShadowLedger`, and `Reset-ShadowContext`.
  3. Update `scripts/lib/Environment.psm1` so functions like `Get-UserConfigDir`, `Get-AppDataDir`, `New-DirectorySafely`, `Backup-FileWithTimestamp`, and `Install-WingetPackage` route transparently through `DryRunContext` when `-DryRun` or an active `$global:KomoyasbShadowContext` is enabled.
  4. Ensure `TemplateEngine.psm1` accepts shadow destination paths without modifying original workspace files when in shadow mode.
  5. Deliver unit tests in `tests/unit/Test-DryRunContext.Tests.ps1`.

#### `@dryrun-lifecycle`
- **Primary Goal:** Refactor all lifecycle scripts to eliminate any raw unshadowed file I/O or external command execution.
- **Tasks:**
  1. Refactor `install.ps1`:
     - Accept `-DryRun`, `-ShadowRoot <Path>`, and `-LedgerPath <Path>`.
     - When dry-run is specified, initialize shadow context and route all directory creations, backup snapshots, file copies (`applications.yaml`), and template renders into `$ShadowRoot`.
     - Ensure package provisioning checks report status without calling `winget install`.
  2. Refactor `uninstall.ps1`:
     - Under `-DryRun`, simulate process terminations without calling `Stop-Process`.
     - Restore backups inside `$ShadowRoot` (reading original backup manifest from shadow or live if present).
     - Remove generated files only from `$ShadowRoot`.
  3. Refactor `sync-theme.ps1`:
     - Direct template rendering outputs to `$ShadowRoot\workspace\...` and `$ShadowRoot\userprofile\...`.
     - Never overwrite `themes/.current_theme` on the live disk in dry-run mode.
  4. Refactor `sync-wallpaper.ps1`:
     - In dry-run mode, intercept `Set-ItemProperty` and `SystemParametersInfoW`, emitting `Invoke-SystemAction -ActionType WallpaperApply`.
  5. Refactor `apply-windhawk-mods.ps1`:
     - Validate mod syntax and route file staging to `$ShadowRoot\programdata\Windhawk\Mods`.
     - Intercept `Invoke-WindhawkCommand` to simulate mod loading without touching live `windhawk-cli.exe`.
  6. Refactor `watchdog.ps1`:
     - Provide mocked process table query and action recording under dry-run.

#### `@dryrun-harness`
- **Primary Goal:** Build the automated verification harness `scripts/Test-FullDryRun.ps1` that proves total host immutability.
- **Tasks:**
  1. Implement `scripts/Test-FullDryRun.ps1`:
     - **Phase 1: Host Snapshot:** Takes cryptographic hashes and directory trees of live target paths (`$env:USERPROFILE\.config\komorebi`, `yasb`, `$env:APPDATA\FlowLauncher`, `$workspaceRoot`).
     - **Phase 2: Full Dry-Run Install #1:** Runs `install.ps1 -DryRun -ShadowRoot $testShadow -LedgerPath $testLedger`.
     - **Phase 3: Host Zero-Mutation Assertion #1:** Verifies that zero bytes changed on the live host.
     - **Phase 4: Shadow Output Validation:** Verifies that all expected configs were generated in `$testShadow`, and validates their syntax (`ConvertFrom-Json` for komorebi/flow, Yaml parser check for yasb, CSS syntax verification).
     - **Phase 5: Idempotency Install #2:** Runs `install.ps1 -DryRun` again on the same shadow root. Verifies that second run succeeds cleanly with zero state drift.
     - **Phase 6: Full Dry-Run Uninstall Rollback:** Runs `uninstall.ps1 -DryRun -ShadowRoot $testShadow`. Asserts clean removal of simulated targets.
     - **Phase 7: Final Host Zero-Mutation Assertion:** Re-evaluates live host hashes against Phase 1 snapshot. Exits with non-zero code if even a single timestamp or file is touched.
  2. Implement PowerShell AST static analysis in `tests/verify-host-safety.ps1` to detect any direct calls to dangerous cmdlets (`Set-Content`, `Out-File`, `Copy-Item`, `Remove-Item`, `Set-ItemProperty`, `Stop-Process`, `Start-Process`) that are not guarded by `DryRunContext` or `-DryRun`.

#### `@dryrun-ui`
- **Primary Goal:** Integrate shadow execution into the Tauri Rust backend and present the JSON ledger in the frontend.
- **Tasks:**
  1. In `ui/src-tauri/src/utils/sandbox.rs`:
     - Expand `SandboxContext` to support programmatic shadow root creation and execution ledger consumption.
  2. In `ui/src-tauri/src/commands/system.rs`:
     - Implement `execute_full_dryrun(theme: Option<String>) -> Result<ExecutionLedger, AppError>` invoking `install.ps1 -DryRun -LedgerPath ...` and returning the deserialized typed `ledger.json`.
     - Update `run_install_provisioning` and `apply_sync_theme` to return actual structured results rather than fake dummy strings.
  3. In `ui/src/types/ipc.ts` & `ui/src/lib/ipc.ts`:
     - Add TypeScript interfaces for `ExecutionLedger`, `LedgerAction`, `FileDiff`.
     - Expose `executeFullDryRun` IPC helper.
  4. In `ui/src/components/views/system/DryRunLedgerModal.tsx`:
     - Create a clean modal / view tab showing simulated file diffs, package statuses, and a 1-click "Approve & Execute Live" workflow.

---

## 5. Host Safety Invariants & Guardrails

To ensure that accidental developer oversight can NEVER result in live host corruption, the following invariants are enforced:

### Invariant 1: Structural FileSystem Jail
When `$global:KomoyasbShadowContext.Active` is `$true`, all writing cmdlets defined in `DryRunContext` verify:
$$\text{ResolvedPath.StartsWith}(\$global:KomoyasbShadowContext.ShadowRoot)$$
If a path attempts to resolve outside `$ShadowRoot`, an explicit `[System.Security.SecurityException]` is thrown immediately.

### Invariant 2: AST Static Analysis Guardrail
The verification test `tests/verify-host-safety.ps1` parses all repository `.ps1` and `.psm1` files using `[System.Management.Automation.Language.Parser]`.
Any invocation of:
- `[System.IO.File]::Write*`
- `Set-ItemProperty` / `New-ItemProperty`
- `Stop-Process` / `Start-Process`
- `NativeWallpaper::SystemParametersInfo`
outside `DryRunContext.psm1` or not protected by `Test-IsDryRun` condition will fail the build gate immediately.

### Invariant 3: P/Invoke and Binary Blacklist
During dry-run initialization:
- `windhawk-cli.exe` is replaced in execution context by a mock shim or no-op interceptor.
- `winget.exe` install commands are intercepted and short-circuited.
- Native wallpaper DLL calls are bypassed with structured parameter logging.

---

## 6. Verification Gate & Quality Assurance Commands

Before any PR or branch is merged, the implementation must pass the following multi-stage verification suite:

```powershell
# 1. PowerShell Unit Tests (DryRun Context & Template Engine)
pwsh -NoProfile -Command "Invoke-Pester -Path tests/unit/ -Output Detailed"

# 2. PowerShell AST Host-Safety Static Analysis
pwsh -NoProfile -File "tests/verify-host-safety.ps1"

# 3. End-to-End Full Dry-Run Harness (Host Snapshot -> 2x Install -> Validate -> Uninstall -> Host Diff)
pwsh -NoProfile -File "scripts/Test-FullDryRun.ps1" -Verbose

# 4. Frontend Typecheck & Build
cd ui
npx tsc --noEmit
npm run build

# 5. Rust Tauri Test & Lint
cd src-tauri
cargo check
cargo test
```

---

## 7. Swarm Execution Plan & Synchronization Points

1. **Step 1:** `@dryrun-core` builds `DryRunContext.psm1`, tests it with `Test-DryRunContext.Tests.ps1`, and establishes the exported contract.
2. **Step 2:**
   - `@dryrun-lifecycle` imports `DryRunContext.psm1` and adapts `install.ps1`, `uninstall.ps1`, `sync-theme.ps1`, `sync-wallpaper.ps1`, `apply-windhawk-mods.ps1`, `watchdog.ps1`.
   - `@dryrun-ui` implements Rust types matching `ledger.json` and connects the Tauri command.
3. **Step 3:** `@dryrun-harness` delivers `scripts/Test-FullDryRun.ps1` and runs the complete round-trip against the live workspace.
4. **Step 4:** Final verification gate executed; report presented to user.
