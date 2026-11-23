# Standalone Single-Binary Runner Architecture (`komoyasb-run.exe`)

This specification defines the architecture, compilation strategy, embedded asset bundling, process lifecycle orchestration, and worker ownership division for `komoyasb-run.exe` — a high-performance, zero-dependency, standalone Windows 11 desktop runner for `komoyasb`.

---

## 1. Executive Summary & Architectural Goals

The primary goal of `komoyasb-run.exe` is to eliminate all runtime dependencies on Git repositories, PowerShell runtimes, Node.js/npm environments, or external script folders. It packages the entire `komoyasb` desktop environment engine into a single, portable, statically compiled Windows 11 binary (target: `x86_64-pc-windows-msvc`).

```
+---------------------------------------------------------------------------------------------------+
|                                        komoyasb-run.exe                                           |
|                                                                                                   |
|  +------------------------------+  +-------------------------------+  +------------------------+  |
|  |     Embedded Assets          |  |       Configuration &         |  |    Win32 Lifecycle &   |  |
|  |    (include_dir macro)       |  |       Template Engine         |  |    Process Manager     |  |
|  |                              |  |                               |  |                        |  |
|  | * configs/ templates         |  | * %APPDATA%\komoyasb\ state   |  | * Silent GUI Subsystem |  |
|  | * themes/ (dark/light)       |  | * Token flattening & compute  |  | * Komorebi Pipe Poll   |  |
|  | * performance.json           |  | * Atomic write (MoveFileExW)  |  | * YASB & WHKD Superv.  |  |
|  | * Wallpapers & C++ mods      |  | * SHA-256 skip-unchanged      |  | * Rootless Degradation |  |
|  +------------------------------+  +-------------------------------+  +------------------------+  |
+---------------------------------------------------------------------------------------------------+
                                            |
                         +------------------+------------------+
                         |                                     |
                         v                                     v
           Double-Click from Explorer                 CLI from Terminal
           * Silent background execution              * Console attached dynamically
           * Zero flashing console window             * Formatted ANSI status tables
           * Materializes %APPDATA% if missing        * Full flag support (--stop, etc.)
           * Syncs configs & starts full stack        * Dry-run simulation & ledger
```

### Core Architectural Invariants:
1. **Zero Repo Dependency:** The binary functions identically whether executed inside the Git repository root, from `C:\Program Files\komoyasb\`, from a USB flash drive, or from a temporary sandbox folder. All baseline templates, schemas, and default profiles are compiled directly into the binary's read-only data segment (`.rdata`).
2. **First-Run Self-Materialization:** On first launch, if `%APPDATA%\komoyasb\` does not exist, the binary automatically bootstraps user state from embedded assets without overwriting any existing user modifications.
3. **Dual Execution UX (GUI & CLI):** Uses the Windows subsystem (`#![windows_subsystem = "windows"]`) to prevent console window flashing on double-click. If launched from a terminal (PowerShell, Cmd, Windows Terminal), it dynamically attaches to the parent console via Win32 `AttachConsole(ATTACH_PARENT_PROCESS)` and formats colored output.
4. **Native High-Fidelity Rendering:** Replaces `TemplateEngine.psm1` with a native Rust renderer that achieves 100% token compatibility (all `{{colors.*}}`, computed alpha/rgb/argb variants, `{{perf.*}}` profiles, and fallback defaults) with SHA-256 skip-unchanged atomic writes.
5. **Sub-Millisecond Readiness Checks:** Replaces PowerShell process checks with native Win32 named pipe verification (`\\.\pipe\komorebi`) and process polling at 100 ms intervals, achieving sub-second full stack initialization.
6. **Strict Host Safety & Dry-Run Parity:** Supports `--dry-run` and `UI_SANDBOX_DIR` remapping with 100% isolation, emitting a structured `ledger.json` and generating zero live host side-effects.

---

## 2. Standalone Binary Design (`komoyasb-run.exe`)

### 2.1 Workspace & Crate Structure

To maintain separation of concerns and avoid coupling the lightweight runner with the heavier Tauri v2 WebView2 dependencies, the runner is housed in a dedicated crate `runner/`:

```
komoyasb/
├── Cargo.toml                  <-- Root workspace Cargo.toml
├── runner/                     <-- Dedicated standalone runner crate
│   ├── Cargo.toml              <-- Runner crate manifest
│   ├── build.rs                <-- Windows resource compiler (icon, version info)
│   ├── src/
│   │   ├── main.rs             <-- Entry point & Win32 console attach
│   │   ├── cli.rs              <-- CLI argument parsing & dispatch
│   │   ├── assets.rs           <-- include_dir bundling & %APPDATA% materialization
│   │   ├── config.rs           <-- State resolution, theme/perf loader, sandbox mapping
│   │   ├── render.rs           <-- Template token substitution & atomic writer
│   │   ├── services.rs         <-- Komorebi, WHKD, YASB process manager & pipe readiness
│   │   └── privilege.rs        <-- Elevation check, rootless mode, HKCU startup
│   └── tests/
│       ├── test_assets.rs      <-- Embedded asset extraction & integrity tests
│       ├── test_render.rs      <-- Template token substitution & equivalence tests
│       ├── test_lifecycle.rs   <-- Mock service lifecycle & readiness tests
│       └── test_dryrun.rs      <-- Dry-run sandbox isolation & ledger tests
├── ui/
│   └── src-tauri/              <-- Existing Tauri Control Center crate
└── configs/                    <-- Authoritative source templates
```

#### Root `Cargo.toml` Workspace Configuration:
```toml
[workspace]
resolver = "2"
members = [
    "runner",
    "ui/src-tauri",
]
```

#### `runner/Cargo.toml` Specification:
```toml
[package]
name = "komoyasb-run"
version = "1.0.0"
description = "High-performance standalone desktop orchestrator for komoyasb"
authors = ["Komoyasb Authors"]
edition = "2021"

[[bin]]
name = "komoyasb-run"
path = "src/main.rs"

[dependencies]
include_dir = { version = "0.7", features = ["globs"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
serde_yaml = "0.9"
sha2 = "0.10"
uuid = { version = "1.7", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
thiserror = "1.0"
colored = "2.1"
windows = { version = "0.52", features = [
    "Win32_Foundation",
    "Win32_Storage_FileSystem",
    "Win32_System_Registry",
    "Win32_System_Console",
    "Win32_System_Pipes",
    "Win32_System_Threading",
    "Win32_Security",
    "Win32_UI_WindowsAndMessaging",
] }

[dev-dependencies]
tempfile = "3.10"
```

---

### 2.2 Embedded Asset Bundling (`include_dir`)

At compile time, `runner/src/assets.rs` bundles the following trees into the binary:
1. `configs/` (`komorebi/`, `polish/`, `shell/`, `yasb/`, including `.template` files, `applications.yaml`, scripts, and wallpapers).
2. `themes/` (`dark.json`, `light.json`, `theme.schema.json`, `performance.schema.json`).
3. `performance.json` (root performance profile configurations).

```rust
use include_dir::{include_dir, Dir};

pub static EMBEDDED_CONFIGS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../configs");
pub static EMBEDDED_THEMES: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../themes");
pub static EMBEDDED_PERF: &str = include_str!("../performance.json");
```

#### First-Run Materialization Matrix:
When `komoyasb-run.exe` runs, it checks `%APPDATA%\komoyasb\`. If not found, it materializes:
* `%APPDATA%\komoyasb\themes\dark.json`
* `%APPDATA%\komoyasb\themes\light.json`
* `%APPDATA%\komoyasb\performance.json`
* `%APPDATA%\komoyasb\configs\komorebi\applications.yaml`
* `%APPDATA%\komoyasb\configs\polish\wallpapers\dark.png`
* `%APPDATA%\komoyasb\configs\polish\wallpapers\light.png`
* `%APPDATA%\komoyasb\configs\yasb\widgets\Get-GpuMetrics.ps1`
* `%APPDATA%\komoyasb\configs\yasb\widgets\Get-KomorebiStatus.ps1`

> [!IMPORTANT]
> **Non-Destructive Guarantee:** If a user file already exists in `%APPDATA%\komoyasb\`, it is **never** overwritten by asset bootstrap unless `--force-defaults` is explicitly passed.

---

### 2.3 CLI & Silent Double-Click UX

Windows executables configured with `windows_subsystem = "windows"` do not allocate a console window when invoked from Windows Explorer, completely preventing the annoying black box flash.

#### Dual-Mode Console Attachment Pattern:
```rust
//! In runner/src/main.rs

#![windows_subsystem = "windows"]

use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};

fn init_console_io() -> bool {
    unsafe {
        // Attempt to attach to parent console (cmd.exe, powershell.exe, Windows Terminal)
        if AttachConsole(ATTACH_PARENT_PROCESS).is_ok() {
            true
        } else {
            false
        }
    }
}
```

#### CLI Command Line Interface:
```
komoyasb-run.exe [FLAGS] [OPTIONS]

FLAGS:
    -h, --help               Prints help information
    -V, --version            Prints version information
        --start              Starts all managed services (default action if zero args)
        --stop               Stops all running managed services gracefully
        --restart            Stops then restarts all managed services
        --status             Queries and displays tabular status of all services
        --sync               Only syncs themes, renders templates, and exits
        --no-admin           Forces rootless execution mode (no UAC / no admin)
        --dry-run            Simulates all actions without modifying host or starting processes
        --ui                 Launches the Tauri Komoyasb Control Center UI
        --register-startup   Adds komoyasb-run to HKCU Run key for login startup
        --unregister-startup Removes komoyasb-run from HKCU Run key

OPTIONS:
    -t, --theme <NAME>       Theme to compile ("dark", "light", or path) [default: from state]
    -p, --profile <NAME>     Performance profile ("ultra-low", "balanced", "visual-rich", "gaming")
    -s, --service <NAME>     Target single service ("komorebi", "whkd", "yasb")
        --ledger <PATH>      Output path for dry-run JSON execution ledger
```

---

### 2.4 Native Orchestration & Template Engine

The native Rust template engine in `runner/src/render.rs` guarantees 100% equivalence with `TemplateEngine.psm1`:

#### 1. Token Flattening & Computed Token Synthesis:
- Parses `themes/<theme>.json` into a key-value token map.
- Recursively flattens nested objects with dot notation (`colors.accent`, `typography.font_family`).
- Booleans format as lowercase strings (`"true"`, `"false"`).
- Automatically expands all `#RRGGBB` colors:
  - `colors.<key>.rgb`: `rgb(r, g, b)`
  - `colors.<key>_alpha<PCT>` & `colors.<key>.alpha<PCT>`: `rgba(r, g, b, 0.XX)` for PCT in `[5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95]`
  - `colors.<key>_argb<PCT>`: `#AARRGGBB`
- Resolves `wallpaper.path` to absolute Windows path and computes `wallpaper.url_path` with `/`.
- Merges active profile from `performance.json` with prefix `perf.` and resolves aliases:
  - `perf.komorebi.unmanaged_behaviour` -> `perf.komorebi.unmanaged_window_operation_behaviour`
  - `perf.flow.*` -> `perf.launcher.*`
  - `perf.yasb.transition_duration` -> `"${duration_s}s ease"` or `"0s"`

#### 2. Substitution & JSON Escaping:
- Regex: `\{\{([a-zA-Z0-9_\.]+)\}\}`
- If missing, applies authoritative fallback table (e.g. `border_enabled = "true"`, `bar_height = "32"`, `colors.accent = "#7aa2f7"`).
- If destination ends in `.json`, backslashes `\` are escaped to `\\` and quotes `"` to `\"`.

#### 3. SHA-256 Change Detection & Atomic Write:
- Computes SHA-256 of rendered buffer.
- Compares with existing target file SHA-256. If identical, skips disk I/O (`[SKIPPED - UNCHANGED]`).
- If different:
  1. Writes to `<target>.tmp.<uuid>`.
  2. Commits via `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)` with exponential backoff on sharing violations (`ERROR_SHARING_VIOLATION = 32`).

---

### 2.5 Native Process Lifecycle & Readiness Protocol

The process manager in `runner/src/services.rs` handles the managed stack:

| Service | Executable | Arguments | Readiness Check | Timeout |
| :--- | :--- | :--- | :--- | :--- |
| **Komorebi** | `komorebi` | `-c <APPDATA>\komoyasb\configs\komorebi\komorebi.json` | Win32 pipe: `\\.\pipe\komorebi` + `komorebic ping` | 5.0s (50 x 100ms) |
| **YASB** | `yasb` | *(none)* | Process PID existence | 1.0s (10 x 100ms) |
| **WHKD** | `whkd` | `-c <APPDATA>\komoyasb\configs\komorebi\whkdrc` | Immediate return | N/A |
| **Flow Launcher** | `Flow.Launcher.exe` | *(none, auxiliary)* | Optional presence check | N/A |
| **EarTrumpet** | `EarTrumpet.exe` | *(none, auxiliary)* | Optional presence check | N/A |

#### Win32 Pipe Readiness Implementation:
```rust
//! In runner/src/services.rs

use std::path::Path;
use std::time::{Duration, Instant};
use windows::core::PCWSTR;
use windows::Win32::System::Pipes::WaitNamedPipeW;

pub fn wait_for_komorebi_pipe(timeout: Duration) -> bool {
    let pipe_name: Vec<u16> = r"\\.\pipe\komorebi"
        .encode_utf16()
        .chain(Some(0))
        .collect();

    let start = Instant::now();
    let poll_interval = Duration::from_millis(100);

    while start.elapsed() < timeout {
        unsafe {
            // WaitNamedPipeW with 0 timeout checks if pipe exists and is listening
            if WaitNamedPipeW(PCWSTR(pipe_name.as_ptr()), 50).as_bool() {
                return true;
            }
        }
        std::thread::sleep(poll_interval);
    }
    false
}
```

#### Startup Sequence:
1. **Pre-flight & Sync:** Verify prerequisites, resolve active theme and performance profile, render all configuration templates to target locations atomically.
2. **Komorebi Window Manager:** Spawn `komorebi -c ...` in hidden background mode (`CREATE_NO_WINDOW`).
3. **Readiness Gate:** Poll `\\.\pipe\komorebi` every 100 ms up to 5.0s. If ready, log readiness time (e.g. `Komorebi daemon ready after 0.3s`).
4. **Status Bar (YASB):** Spawn `yasb` hidden; poll process table up to 1.0s.
5. **Keybinding Daemon (WHKD):** Spawn `whkd -c ...` hidden.
6. **Auxiliary Shell Tools:** If detected in PATH or standard installation directories, launch `Flow.Launcher.exe` and `EarTrumpet.exe`.

#### Stop Sequence:
1. Auxiliary tools -> WHKD -> YASB.
2. For Komorebi: First invoke `komorebic stop`. If still active after 2 seconds, terminate process gracefully.

---

## 3. Worker Ownership Map (Zero File Overlap)

To enable 3 parallel Swarm workers to construct the runner without merge conflicts or overlapping file modifications, responsibilities are strictly partitioned:

```
+-----------------------------------------------------------------------------------------+
|                                  SWARM WORKER DIVISION                                  |
+------------------------------+------------------------------+---------------------------+
|        @runner-core          |      @runner-lifecycle       |    @runner-build-tests    |
+------------------------------+------------------------------+---------------------------+
| * runner/Cargo.toml          | * runner/src/main.rs         | * runner/tests/**         |
| * runner/src/assets.rs       | * runner/src/cli.rs          | * build-release.ps1       |
| * runner/src/config.rs       | * runner/src/services.rs     | * .github/workflows/ci.yml|
| * runner/src/render.rs       | * runner/src/privilege.rs    | * .github/workflows/rel.. |
|                              |                              | * README.md               |
| [Responsibility]             | [Responsibility]             | [Responsibility]          |
| Embedded assets, APPDATA     | CLI parsing, Windows GUI     | Integration test suite,   |
| bootstrap, token renderer,   | subsystem, pipe readiness,   | build script target, CI/CD|
| atomic SHA-256 writer,       | process manager, rootless    | pipelines, documentation  |
| sandbox & dry-run ledger     | guard, HKCU Run startup      |                           |
+------------------------------+------------------------------+---------------------------+
```

### 3.1 Worker 1: `@runner-core`

#### File Ownership:
* `runner/Cargo.toml`
* `runner/src/assets.rs`
* `runner/src/config.rs`
* `runner/src/render.rs`

#### Deliverables & Module Contracts:
1. **`assets.rs`**:
   - `pub fn extract_embedded_defaults(target_dir: &Path, force: bool) -> Result<BootstrapReport, RunnerError>`
   - `pub fn get_embedded_file(relative_path: &str) -> Option<&'static [u8]>`
2. **`config.rs`**:
   - Resolves live `%APPDATA%\komoyasb\` vs sandbox directory (`UI_SANDBOX_DIR` / `--dry-run`).
   - Loads and parses `themes/*.json` and `performance.json`.
   - `pub struct RuntimePaths { pub komorebi_json: PathBuf, pub whkdrc: PathBuf, pub yasb_config: PathBuf, pub yasb_styles: PathBuf, pub flow_settings: PathBuf, pub flow_theme: PathBuf }`
   - `pub fn resolve_runtime_paths(sandbox_root: Option<&Path>) -> Result<RuntimePaths, RunnerError>`
3. **`render.rs`**:
   - `pub fn flatten_tokens(json: &serde_json::Value, prefix: &str) -> HashMap<String, String>`
   - `pub fn expand_computed_tokens(tokens: &mut HashMap<String, String>)`
   - `pub fn render_template(template_str: &str, tokens: &HashMap<String, String>, is_json: bool) -> String`
   - `pub fn sync_all_templates(state: &RuntimeConfig, dry_run: bool, sandbox: Option<&Path>) -> Result<SyncReport, RunnerError>`
   - Computes SHA-256 change detection and executes atomic file writing with `MoveFileExW`.
   - Generates structured `ledger.json` in dry-run mode.

---

### 3.2 Worker 2: `@runner-lifecycle`

#### File Ownership:
* `runner/src/main.rs`
* `runner/src/cli.rs`
* `runner/src/services.rs`
* `runner/src/privilege.rs`

#### Deliverables & Module Contracts:
1. **`main.rs`**:
   - Windows subsystem configuration: `#![windows_subsystem = "windows"]`.
   - Dynamic console attachment: `AttachConsole(ATTACH_PARENT_PROCESS)`.
   - Dispatcher: evaluates CLI flags. If zero args provided, performs default start (`sync` + `start_full_stack`).
2. **`cli.rs`**:
   - `pub struct CliOptions { pub action: Action, pub theme: Option<String>, pub profile: Option<String>, pub service: Option<String>, pub no_admin: bool, pub dry_run: bool, pub ui: bool, pub register_startup: bool, pub unregister_startup: bool, pub ledger_path: Option<PathBuf> }`
   - `pub fn parse_args() -> Result<CliOptions, RunnerError>`
3. **`services.rs`**:
   - `pub fn start_service(name: &str, paths: &RuntimePaths, dry_run: bool) -> Result<ServiceStatus, RunnerError>`
   - `pub fn stop_service(name: &str, dry_run: bool) -> Result<(), RunnerError>`
   - `pub fn start_full_stack(paths: &RuntimePaths, dry_run: bool) -> Result<StackReport, RunnerError>`
   - `pub fn stop_full_stack(dry_run: bool) -> Result<(), RunnerError>`
   - `pub fn get_service_status(name: &str) -> Result<ServiceInfo, RunnerError>`
   - Implements 100 ms Komorebi named pipe polling (`WaitNamedPipeW`) with 5.0s timeout.
4. **`privilege.rs`**:
   - `pub fn is_elevated() -> bool` (Win32 `OpenProcessToken` + `GetTokenInformation`).
   - Rootless mode degradation logic: skips machine mods when not elevated or when `--no-admin` is active.
   - `pub fn register_hkcu_startup() -> Result<(), RunnerError>`: adds entry to `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
   - `pub fn unregister_hkcu_startup() -> Result<(), RunnerError>`.

---

### 3.3 Worker 3: `@runner-build-tests`

#### File Ownership:
* `runner/tests/**` (`test_assets.rs`, `test_render.rs`, `test_lifecycle.rs`, `test_dryrun.rs`)
* `build-release.ps1` (single-exe build target updates)
* `.github/workflows/ci.yml` (CI jobs for runner tests, clippy, and coverage)
* `.github/workflows/release.yml` (release packaging `komoyasb-run.exe`)
* `README.md` (single-exe runner documentation section)

#### Deliverables & Module Contracts:
1. **`runner/tests/**`**:
   - Integration test verifying clean extraction of all embedded assets to a temporary directory.
   - Template rendering tests verifying 100% token substitution parity with PowerShell outputs.
   - Dry-run test verifying that `--dry-run` mutates zero files outside the sandbox directory and generates a valid `ledger.json`.
   - Zero-dependency verification test: executes `komoyasb-run.exe --dry-run` from an isolated temp directory outside the repository root.
2. **`build-release.ps1`**:
   - Adds single-exe compilation step: `cargo build --release -p komoyasb-run`.
   - Copies `target/release/komoyasb-run.exe` into `dist/`.
   - Generates `dist/komoyasb-run.exe.sha256` and updates `dist/SHA256SUMS.txt`.
3. **CI/CD Updates (`ci.yml`, `release.yml`)**:
   - Adds `cargo clippy -p komoyasb-run --all-targets -- -D warnings`.
   - Adds `cargo test -p komoyasb-run` to the CI test matrix.
   - Adds `komoyasb-run.exe` to GitHub Releases artifacts alongside the NSIS installer.
4. **`README.md`**:
   - Adds "Standalone Single-EXE Runner" quickstart guide.
   - Documents CLI flags and portable usage instructions.

---

## 4. Security & Reliability Invariants

### 4.1 Strict Rust Code Safety
1. **Zero `.unwrap()` or `.expect()`:** Every fallible operation (I/O, JSON parsing, Win32 API calls, environment variable reads) must map to a custom `RunnerError` enum derived via `thiserror`.
2. **Command Injection Prevention:** All external processes must be launched using `std::process::Command::new(binary).args(&[...])`. Never invoke through `cmd.exe /C` or shell interpolation strings.
3. **Path Traversal Guards:** Any user-supplied path (e.g. `--theme <path>`, `--ledger <path>`) must be canonicalized and checked against directory traversal (`..` sequences).
4. **Win32 Memory Safety:** All FFI calls (`MoveFileExW`, `WaitNamedPipeW`, `OpenProcessToken`) must wrap in small, auditable `unsafe` helper functions with explicit null-termination and size checks.

### 4.2 Dry-Run & Sandbox Guarantees
- When `--dry-run` or `UI_SANDBOX_DIR` is detected:
  - All file writes are redirected to `<SANDBOX_ROOT>\...`.
  - Process spawns are intercepted, logging simulated command lines instead of launching real processes.
  - Registry modifications are simulated in memory.
  - A structured JSON ledger (`ledger.json`) is emitted containing action summaries and cryptographic SHA-256 diffs.

---

## 5. Verification Gate & Acceptance Criteria

Before declaring the runner ready for production, the implementation must pass the following Verification Gate:

### Gate 1: Code Formatting & Static Analysis
```powershell
cargo fmt --all -- --check
cargo clippy -p komoyasb-run --all-targets --all-features -- -D warnings
```

### Gate 2: Comprehensive Test Suite (>90% Coverage)
```powershell
cargo test -p komoyasb-run --all-features
```

### Gate 3: External Zero-Repo Execution Test
```powershell
# Copy the compiled binary to an external isolated temporary directory
$tempDir = Join-Path $env:TEMP ("komoyasb-run-test-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Copy-Item -LiteralPath ".\target\release\komoyasb-run.exe" -Destination (Join-Path $tempDir "komoyasb-run.exe")

Push-Location $tempDir
try {
    # Test 1: Verify help output
    .\komoyasb-run.exe --help
    if ($LASTEXITCODE -ne 0) { throw "Help command failed" }

    # Test 2: Verify dry-run execution from outside repository
    .\komoyasb-run.exe --dry-run --status
    if ($LASTEXITCODE -ne 0) { throw "Dry-run outside repo failed" }
} finally {
    Pop-Location
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}
```

### Gate 4: Unified Regression Gate
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Invoke-AllTests.ps1
```

---

## 6. Swarm Orchestration Plan

Once approved, the coordinator will invoke `/swarm` with the 3 workers configured with the exact brief and ownership partitions defined in Section 3:

```
                  +-----------------------------------+
                  |        Swarm Coordinator          |
                  +-----------------------------------+
                                    |
          +-------------------------+-------------------------+
          |                         |                         |
          v                         v                         v
+-------------------+     +-------------------+     +-------------------+
|   @runner-core    |     | @runner-lifecycle |     |@runner-build-tests|
|                   |     |                   |     |                   |
| * assets.rs       |     | * main.rs         |     | * tests/**        |
| * config.rs       |     | * cli.rs          |     | * build-release   |
| * render.rs       |     | * services.rs     |     | * CI/CD workflows |
| * Cargo.toml      |     | * privilege.rs    |     | * README.md       |
+-------------------+     +-------------------+     +-------------------+
```
