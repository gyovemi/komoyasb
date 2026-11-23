//! System orchestration, provisioning, dry-run ledger execution, and service monitoring.
//!
//! Provides deployment state verification, interactive installation streaming via
//! Tauri events, dry-run ledger execution parsing, and background service lifecycle control.

use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::{Emitter, State, Window};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;
use crate::utils::atomic_write::{atomic_write_file, read_file_string};
use crate::utils::process::run_powershell_script;
use crate::utils::sandbox::SandboxContext;
use crate::utils::validator::{get_default_allowed_roots, validate_safe_name, validate_safe_path};

/// Snapshot metadata describing sandbox virtualization status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxInfo {
    /// Whether virtual filesystem sandboxing is currently enforced.
    #[serde(rename = "isSandboxed")]
    pub is_sandboxed: bool,
    /// Absolute path to the shadow sandbox directory if active.
    #[serde(rename = "sandboxPath")]
    pub sandbox_path: Option<String>,
    /// Live repository path used as base for shadow projections.
    #[serde(rename = "liveWorkingDir")]
    pub live_working_dir: String,
}

/// Privilege and elevation state of the running process.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivilegeStatus {
    /// Whether the process is executing with elevated administrative rights.
    #[serde(rename = "isElevated")]
    pub is_elevated: bool,
    /// Whether rootless mode is active (standard user or sandboxed).
    #[serde(rename = "isRootless")]
    pub is_rootless: bool,
}

/// Determines whether the current process is running with elevated Administrator privileges.
#[cfg(windows)]
pub fn is_process_elevated() -> bool {
    #[repr(C)]
    struct TokenElevationStruct {
        token_is_elevated: u32,
    }

    #[link(name = "advapi32")]
    extern "system" {
        fn OpenProcessToken(
            process_handle: *mut std::ffi::c_void,
            desired_access: u32,
            token_handle: *mut *mut std::ffi::c_void,
        ) -> i32;

        fn GetTokenInformation(
            token_handle: *mut std::ffi::c_void,
            token_information_class: u32,
            token_information: *mut std::ffi::c_void,
            token_information_length: u32,
            return_length: *mut u32,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcess() -> *mut std::ffi::c_void;
        fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
    }

    const TOKEN_QUERY: u32 = 0x0008;
    const TOKEN_ELEVATION_CLASS: u32 = 20;

    unsafe {
        let mut token: *mut std::ffi::c_void = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) != 0 {
            let mut elevation = TokenElevationStruct { token_is_elevated: 0 };
            let mut return_len = 0u32;
            let ok = GetTokenInformation(
                token,
                TOKEN_ELEVATION_CLASS,
                &mut elevation as *mut _ as *mut std::ffi::c_void,
                std::mem::size_of::<TokenElevationStruct>() as u32,
                &mut return_len,
            );
            CloseHandle(token);
            if ok != 0 {
                return elevation.token_is_elevated != 0;
            }
        }
    }
    false
}

#[cfg(not(windows))]
pub fn is_process_elevated() -> bool {
    false
}

/// Reports current privilege and rootless execution state.
#[tauri::command]
pub async fn get_privilege_status(state: State<'_, AppState>) -> Result<PrivilegeStatus, AppError> {
    let is_elevated = if state.sandbox.is_sandboxed {
        false
    } else {
        is_process_elevated()
    };
    let is_rootless = !is_elevated;

    Ok(PrivilegeStatus {
        is_elevated,
        is_rootless,
    })
}

/// Execution summary returned upon applying a theme or performance profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyResult {
    /// Whether script execution completed without errors.
    pub success: bool,
    /// Target theme or profile identifier applied.
    #[serde(rename = "themeName")]
    pub theme_name: String,
    /// List of configuration files updated during compilation.
    #[serde(rename = "renderedFiles")]
    pub rendered_files: Vec<String>,
    /// List of background services signaled to reload.
    #[serde(rename = "reloadedServices")]
    pub reloaded_services: Vec<String>,
    /// Complete captured stdout and stderr log stream.
    #[serde(rename = "outputLog")]
    pub output_log: String,
}

/// Process resource and state metrics for desktop background services.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceInfo {
    /// Internal process identifier name (e.g. "komorebi").
    pub name: String,
    /// Friendly display name (e.g. "Komorebi Window Manager").
    #[serde(rename = "displayName")]
    pub display_name: String,
    /// Whether the target service process is actively running.
    #[serde(rename = "isRunning")]
    pub is_running: bool,
    /// Operating system Process ID (PID) if active.
    pub pid: Option<u32>,
    /// Working set memory consumption in bytes.
    #[serde(rename = "memoryBytes")]
    pub memory_bytes: u64,
    /// CPU utilization percentage (0.0 to 100.0).
    #[serde(rename = "cpuPercent")]
    pub cpu_percent: f32,
    /// Process uptime in seconds.
    #[serde(rename = "uptimeSeconds")]
    pub uptime_seconds: u64,
}

/// Lifecycle control action targeted at background services.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServiceControlAction {
    /// Start the service process.
    Start,
    /// Gracefully terminate the service process.
    Stop,
    /// Terminate and re-launch the service process.
    Restart,
}

/// Individual file mapping within a backup snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupEntry {
    /// Original destination filename.
    pub original: String,
    /// Absolute path to the archived backup copy.
    pub backup: String,
}

/// Historical backup snapshot containing archived configurations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSnapshot {
    /// Unique timestamp identifier for the snapshot.
    pub timestamp: String,
    /// ISO-8601 creation timestamp string.
    #[serde(rename = "createdAt")]
    pub created_at: String,
    /// Directory containing the snapshot's archived files.
    #[serde(rename = "directoryPath")]
    pub directory_path: String,
    /// List of individual backed-up configuration files.
    pub files: Vec<BackupEntry>,
}

/// Health and deployment readiness status for the host environment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentStatus {
    /// Whether core configurations and services are provisioned.
    #[serde(rename = "isDeployed")]
    pub is_deployed: bool,
    /// Whether Komorebi config exists in user profile.
    #[serde(rename = "komorebiConfigExists")]
    pub komorebi_config_exists: bool,
    /// Whether YASB config exists in user profile.
    #[serde(rename = "yasbConfigExists")]
    pub yasb_config_exists: bool,
    /// Whether WHKD hotkey config exists in user profile.
    #[serde(rename = "whkdrcExists")]
    pub whkdrc_exists: bool,
    /// Whether any desktop management services are running.
    #[serde(rename = "activeServicesRunning")]
    pub active_services_running: bool,
    /// List of prerequisite command-line binaries missing from PATH.
    #[serde(rename = "missingTools")]
    pub missing_tools: Vec<String>,
}

/// Result returned following full installation script execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvisioningResult {
    /// Whether provisioning succeeded without errors.
    pub success: bool,
    /// Process exit code if available.
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    /// Full aggregated text output log.
    #[serde(rename = "outputLog")]
    pub output_log: String,
}

/// Event payload emitted during real-time installation log streaming.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallLogPayload {
    /// Single line of output text emitted by the provisioning script.
    pub line: String,
    /// Whether the line originated from stderr.
    #[serde(rename = "isError")]
    pub is_error: bool,
}

// ==============================================================================
// Dry-Run Ledger Data Structures (from DRYRUN_ARCHITECTURE.md)
// ==============================================================================

/// High-level metric tallies recorded in the dry-run execution ledger.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerSummary {
    /// Total number of discrete actions recorded during dry run.
    #[serde(rename = "totalActions")]
    pub total_actions: u32,
    /// Number of simulated file creation or overwrite actions.
    #[serde(rename = "filesWritten")]
    pub files_written: u32,
    /// Number of simulated file deletion actions.
    #[serde(rename = "filesDeleted")]
    pub files_deleted: u32,
    /// Number of simulated Windows Registry mutations.
    #[serde(rename = "registryWrites")]
    pub registry_writes: u32,
    /// Number of winget/scoop packages evaluated for installation.
    #[serde(rename = "packagesSimulated")]
    pub packages_simulated: u32,
    /// Number of service process lifecycle actions simulated.
    #[serde(rename = "processesControlled")]
    pub processes_controlled: u32,
}

/// Individual operational step audited within the dry-run execution ledger.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerAction {
    /// Monotonically increasing synthetic identifier.
    pub id: String,
    /// ISO-8601 timestamp when action was evaluated.
    pub timestamp: String,
    /// Action category (e.g. "FILE_WRITE", "REGISTRY_SET", "PACKAGE_INSTALL").
    #[serde(rename = "actionType")]
    pub action_type: String,
    /// Target path, registry key, or package name.
    pub target: String,
    /// Evaluation outcome status ("SIMULATED", "SKIPPED", "IDENTICAL").
    pub status: String,
    /// Additional context-specific metadata attributes.
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Cryptographic SHA-256 and byte-size difference record for virtualized file mutations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    /// Simulated destination path inside the sandbox shadow root.
    #[serde(rename = "targetVirtualPath")]
    pub target_virtual_path: String,
    /// Destination path on the host system.
    #[serde(rename = "targetLivePath")]
    pub target_live_path: String,
    /// Classification of change ("CREATED", "MODIFIED", "DELETED", "IDENTICAL").
    #[serde(rename = "changeType")]
    pub change_type: String,
    /// SHA-256 hash of live existing file prior to mutation.
    #[serde(rename = "originalSha256")]
    pub original_sha256: Option<String>,
    /// SHA-256 hash of newly staged content in shadow sandbox.
    #[serde(rename = "shadowSha256")]
    pub shadow_sha256: Option<String>,
    /// File size in bytes.
    #[serde(rename = "byteSize")]
    pub byte_size: Option<u64>,
}

/// Complete dry-run execution audit ledger payload (`ledger.json`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionLedger {
    /// Unique dry-run session identifier.
    #[serde(rename = "sessionId")]
    pub session_id: String,
    /// Timestamp when dry-run session executed.
    pub timestamp: String,
    /// Flag indicating whether execution was in dry-run mode.
    #[serde(rename = "isDryRun")]
    pub is_dry_run: bool,
    /// Temporary shadow root directory containing staged assets.
    #[serde(rename = "shadowRoot")]
    pub shadow_root: Option<String>,
    /// Aggregated summary counters.
    pub summary: LedgerSummary,
    /// Ordered log of all evaluated actions.
    pub actions: Vec<LedgerAction>,
    /// Detailed file-level SHA-256 diffs.
    #[serde(rename = "fileDiffs")]
    pub file_diffs: Vec<FileDiff>,
}

/// Checks whether configuration files and desktop management services are deployed on the host.
///
/// # Arguments
///
/// * `state` - Thread-safe application state containing workspace paths and sandbox mode.
///
/// # Returns
///
/// * `Ok(DeploymentStatus)` - Comprehensive deployment readiness snapshot.
/// * `Err(AppError)` - If status verification encounters an unrecoverable fault.
#[tauri::command]
pub async fn check_deployment_status(state: State<'_, AppState>) -> Result<DeploymentStatus, AppError> {
    if state.sandbox.is_sandboxed {
        return Ok(DeploymentStatus {
            is_deployed: true,
            komorebi_config_exists: true,
            yasb_config_exists: true,
            whkdrc_exists: true,
            active_services_running: true,
            missing_tools: vec![],
        });
    }

    let user_home = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string());
    let user_home_path = PathBuf::from(user_home);

    let komorebi_config_path = user_home_path.join(".config").join("komorebi").join("komorebi.json");
    let yasb_config_path = user_home_path.join(".config").join("yasb").join("config.yaml");
    let whkd_config_path = user_home_path.join(".config").join("whkdrc");

    let is_komorebi_present = komorebi_config_path.exists();
    let is_yasb_present = yasb_config_path.exists();
    let is_whkd_present = whkd_config_path.exists();

    let is_deployed = is_komorebi_present && is_yasb_present;

    // Check system processes for running status
    let mut are_services_running = false;
    if let Ok(mut system_monitor) = state.sys.lock() {
        system_monitor.refresh_all();
        let target_service_names = ["komorebi", "whkd", "yasb"];
        let mut running_count = 0;
        for (_, process_record) in system_monitor.processes() {
            let process_name = process_record.name().to_lowercase();
            for service_name in target_service_names {
                if process_name.contains(service_name) {
                    running_count += 1;
                    break;
                }
            }
        }
        are_services_running = running_count > 0;
    }

    Ok(DeploymentStatus {
        is_deployed,
        komorebi_config_exists: is_komorebi_present,
        yasb_config_exists: is_yasb_present,
        whkdrc_exists: is_whkd_present,
        active_services_running: are_services_running,
        missing_tools: vec![],
    })
}

/// Default timeout for interactive provisioning executions (10 minutes).
pub const PROVISIONING_TIMEOUT: Duration = Duration::from_secs(600);

/// Spawns `install.ps1` with real-time IPC log streaming to the frontend.
///
/// Pipes child process stdout and stderr through asynchronous Tokio background tasks,
/// emitting `install-log` Tauri events line-by-line so the UI installer log window updates live.
///
/// # Arguments
///
/// * `window` - Active Tauri window used to emit real-time log events.
/// * `state` - Thread-safe application state.
/// * `dry_run` - If true, evaluates installation without mutating system state.
/// * `skip_packages` - If true, skips winget/scoop package installation tasks.
/// * `theme` - Optional initial theme name to compile and apply.
///
/// # Returns
///
/// * `Ok(ProvisioningResult)` - Aggregated execution outcome and complete log output.
/// * `Err(AppError)` - If subprocess spawning or stream acquisition fails.
///
/// # Errors
///
/// Returns [`AppError::ProcessError`] if `powershell.exe` fails to spawn or wait fails.
#[tauri::command]
pub async fn run_install_provisioning(
    window: Window,
    state: State<'_, AppState>,
    dry_run: bool,
    skip_packages: bool,
    theme: Option<String>,
    no_admin: Option<bool>,
) -> Result<ProvisioningResult, AppError> {
    let script_path = state.repo_root.join("install.ps1");
    let script_path_string = script_path.to_string_lossy().to_string();

    let mut command_args = vec![
        "-NoProfile".to_string(),
        "-NonInteractive".to_string(),
        "-ExecutionPolicy".to_string(),
        "Bypass".to_string(),
        "-File".to_string(),
        script_path_string,
    ];

    let is_rootless = no_admin.unwrap_or(false) || state.sandbox.is_sandboxed || !is_process_elevated();
    if is_rootless {
        command_args.push("-NoAdmin".to_string());
    }

    let shadow_root_path = if dry_run || state.sandbox.is_sandboxed {
        command_args.push("-DryRun".to_string());
        if let Some(ref sandbox_dir) = state.sandbox.sandbox_path {
            command_args.push("-SandboxRoot".to_string());
            command_args.push(sandbox_dir.to_string_lossy().to_string());
            None
        } else {
            let temp_shadow = SandboxContext::create_temp_shadow_root().ok();
            if let Some(ref temp_root) = temp_shadow {
                command_args.push("-SandboxRoot".to_string());
                command_args.push(temp_root.to_string_lossy().to_string());
            }
            temp_shadow
        }
    } else {
        None
    };

    if skip_packages {
        command_args.push("-SkipPackages".to_string());
    }
    if let Some(theme_name) = theme {
        command_args.push("-Theme".to_string());
        command_args.push(theme_name);
    }

    let mut child_process = Command::new("powershell.exe")
        .args(&command_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::process(format!("Failed to launch provisioning process: {}", e)))?;

    let stdout_stream = child_process.stdout.take()
        .ok_or_else(|| AppError::process("Failed to open child stdout stream"))?;
    let stderr_stream = child_process.stderr.take()
        .ok_or_else(|| AppError::process("Failed to open child stderr stream"))?;

    let window_for_stdout = window.clone();
    let stdout_task = tokio::task::spawn_blocking(move || {
        let stream_reader = BufReader::new(stdout_stream);
        let mut accumulated_log = String::new();
        for line_result in stream_reader.lines().flatten() {
            let _ = window_for_stdout.emit("install-log", InstallLogPayload {
                line: line_result.clone(),
                is_error: false,
            });
            accumulated_log.push_str(&line_result);
            accumulated_log.push('\n');
        }
        accumulated_log
    });

    let window_for_stderr = window.clone();
    let stderr_task = tokio::task::spawn_blocking(move || {
        let stream_reader = BufReader::new(stderr_stream);
        let mut accumulated_err = String::new();
        for line_result in stream_reader.lines().flatten() {
            let _ = window_for_stderr.emit("install-log", InstallLogPayload {
                line: line_result.clone(),
                is_error: true,
            });
            accumulated_err.push_str(&line_result);
            accumulated_err.push('\n');
        }
        accumulated_err
    });

    let start_time = Instant::now();
    let poll_interval = Duration::from_millis(100);

    let process_status = loop {
        match child_process.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if start_time.elapsed() >= PROVISIONING_TIMEOUT {
                    let _ = child_process.kill();
                    let _ = child_process.wait();
                    if let Some(temporary_shadow_dir) = shadow_root_path {
                        let _ = fs::remove_dir_all(temporary_shadow_dir);
                    }
                    return Err(AppError::process(format!(
                        "Installation provisioning timed out after {}s",
                        PROVISIONING_TIMEOUT.as_secs()
                    )));
                }
                tokio::time::sleep(poll_interval).await;
            }
            Err(e) => {
                let _ = child_process.kill();
                let _ = child_process.wait();
                if let Some(temporary_shadow_dir) = shadow_root_path {
                    let _ = fs::remove_dir_all(temporary_shadow_dir);
                }
                return Err(AppError::process(format!(
                    "Failed waiting for child process: {}",
                    e
                )));
            }
        }
    };

    let captured_stdout = stdout_task.await.unwrap_or_default();
    let captured_stderr = stderr_task.await.unwrap_or_default();

    let combined_log = format!("{}\n{}", captured_stdout, captured_stderr);

    // Clean up temporary shadow root if one was allocated and retention was not requested
    if let Some(temporary_shadow_dir) = shadow_root_path {
        let _ = fs::remove_dir_all(temporary_shadow_dir);
    }

    Ok(ProvisioningResult {
        success: process_status.success(),
        exit_code: process_status.code(),
        output_log: combined_log,
    })
}

/// Executes a complete dry-run evaluation of `install.ps1`, generating and parsing `ledger.json`.
///
/// Sets up an isolated shadow sandbox root, executes the full provisioning pipeline in dry-run mode,
/// and deserializes the resulting ledger containing SHA-256 diffs and simulated actions.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `theme` - Optional theme to evaluate during dry run.
/// * `keep_sandbox` - If true, retains the shadow sandbox directory after execution.
///
/// # Returns
///
/// * `Ok(ExecutionLedger)` - Parsed ledger detailing all audited dry-run actions and diffs.
/// * `Err(AppError)` - If subprocess execution, ledger location, or JSON parsing fails.
///
/// # Errors
///
/// Returns [`AppError::ProcessError`] if `powershell.exe` fails or ledger is missing.
/// Returns [`AppError::ParseError`] if `ledger.json` fails deserialization.
#[tauri::command]
pub async fn execute_full_dryrun(
    state: State<'_, AppState>,
    theme: Option<String>,
    keep_sandbox: Option<bool>,
) -> Result<ExecutionLedger, AppError> {
    let script_path = state.repo_root.join("install.ps1");
    let script_path_string = script_path.to_string_lossy().to_string();

    let shadow_root_dir = match &state.sandbox.sandbox_path {
        Some(existing_sandbox) => existing_sandbox.clone(),
        None => SandboxContext::create_temp_shadow_root()?,
    };

    let ledger_file_path = shadow_root_dir.join("ledger.json");
    let ledger_path_string = ledger_file_path.to_string_lossy().to_string();
    let shadow_root_string = shadow_root_dir.to_string_lossy().to_string();

    let mut command_args = vec![
        "-NoProfile".to_string(),
        "-NonInteractive".to_string(),
        "-ExecutionPolicy".to_string(),
        "Bypass".to_string(),
        "-File".to_string(),
        script_path_string,
        "-DryRun".to_string(),
        "-SandboxRoot".to_string(),
        shadow_root_string.clone(),
        "-LedgerPath".to_string(),
        ledger_path_string.clone(),
    ];

    let is_rootless = state.sandbox.is_sandboxed || !is_process_elevated();
    if is_rootless {
        command_args.push("-NoAdmin".to_string());
    }

    let should_keep_sandbox = keep_sandbox.unwrap_or(false);
    if should_keep_sandbox {
        command_args.push("-KeepSandbox".to_string());
    }

    if let Some(target_theme) = theme {
        command_args.push("-Theme".to_string());
        command_args.push(target_theme);
    }

    let command_output = Command::new("powershell.exe")
        .args(&command_args)
        .output()
        .map_err(|e| AppError::process(format!("Failed to spawn dryrun process: {}", e)))?;

    // Locate and parse generated ledger.json
    let resolved_ledger_path = SandboxContext::find_ledger(Some(&ledger_file_path), Some(&shadow_root_dir))
        .map_err(|_| AppError::process(format!(
            "Dry-run executed but ledger.json was not generated at {}. Process exit: {:?}. Output: {}",
            ledger_path_string,
            command_output.status.code(),
            String::from_utf8_lossy(&command_output.stdout)
        )))?;

    let ledger_file_content = read_file_string(&resolved_ledger_path)?;
    let parsed_ledger: ExecutionLedger = serde_json::from_str(&ledger_file_content)?;

    if !should_keep_sandbox && state.sandbox.sandbox_path.is_none() {
        let _ = fs::remove_dir_all(&shadow_root_dir);
    }

    Ok(parsed_ledger)
}

/// Queries current process telemetry (PID, memory, CPU, uptime) for desktop services.
///
/// # Arguments
///
/// * `state` - Thread-safe application state containing system telemetry sampler.
///
/// # Returns
///
/// * `Ok(Vec<ServiceInfo>)` - List of tracked services with current operational metrics.
/// * `Err(AppError)` - If mutex acquisition fails.
///
/// # Errors
///
/// Returns [`AppError::ProcessError`] if acquiring the system metrics lock fails.
#[tauri::command]
pub async fn get_services_status(state: State<'_, AppState>) -> Result<Vec<ServiceInfo>, AppError> {
    let monitored_service_definitions = [
        ("komorebi", "Komorebi Window Manager"),
        ("whkd", "Windows Hotkey Daemon"),
        ("yasb", "YASB Status Bar"),
        ("watchdog", "Komoyasb Process Watchdog"),
    ];

    let mut service_status_list = Vec::new();

    if state.sandbox.is_sandboxed {
        for (service_name, display_label) in monitored_service_definitions {
            service_status_list.push(ServiceInfo {
                name: service_name.to_string(),
                display_name: display_label.to_string(),
                is_running: true,
                pid: Some(1234),
                memory_bytes: 42_000_000,
                cpu_percent: 0.5,
                uptime_seconds: 3600,
            });
        }
        return Ok(service_status_list);
    }

    let mut system_monitor = state.sys.lock().map_err(|e| {
        AppError::process(format!("Failed to acquire system mutex: {}", e))
    })?;
    system_monitor.refresh_all();

    for (service_name, display_label) in monitored_service_definitions {
        let mut matched_metrics = None;
        for (pid, process_record) in system_monitor.processes() {
            let process_name = process_record.name();
            if process_name.to_lowercase().contains(service_name) {
                matched_metrics = Some((pid.as_u32(), process_record.memory(), process_record.cpu_usage(), process_record.run_time()));
                break;
            }
        }

        if let Some((process_id, memory_bytes, cpu_percent, uptime_seconds)) = matched_metrics {
            service_status_list.push(ServiceInfo {
                name: service_name.to_string(),
                display_name: display_label.to_string(),
                is_running: true,
                pid: Some(process_id),
                memory_bytes: memory_bytes,
                cpu_percent: cpu_percent,
                uptime_seconds: uptime_seconds,
            });
        } else {
            service_status_list.push(ServiceInfo {
                name: service_name.to_string(),
                display_name: display_label.to_string(),
                is_running: false,
                pid: None,
                memory_bytes: 0,
                cpu_percent: 0.0,
                uptime_seconds: 0,
            });
        }
    }

    Ok(service_status_list)
}

/// Dispatches a lifecycle action (Start, Stop, Restart) to a service via `watchdog.ps1`.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `name` - Service identifier name (e.g. "komorebi", "yasb", "whkd").
/// * `action` - Desired [`ServiceControlAction`].
///
/// # Returns
///
/// * `Ok(())` - Service control action executed successfully.
/// * `Err(AppError)` - If subprocess execution fails.
///
/// # Errors
///
/// Returns [`AppError::ProcessError`] if watchdog execution fails.
#[tauri::command]
pub async fn service_action(
    state: State<'_, AppState>,
    name: String,
    action: ServiceControlAction,
) -> Result<(), AppError> {
    validate_safe_name(&name)?;
    let script_path = state.repo_root.join("scripts").join("watchdog.ps1");
    let script_path_string = script_path.to_string_lossy().to_string();

    let action_verb = match action {
        ServiceControlAction::Start => "Start",
        ServiceControlAction::Stop => "Stop",
        ServiceControlAction::Restart => "Restart",
    };

    let mut command_args = vec!["-Action", action_verb];
    let service_name = name.trim();
    if !service_name.is_empty() {
        command_args.push("-Service");
        command_args.push(service_name);
    }
    if state.sandbox.is_sandboxed {
        command_args.push("-DryRun");
    }

    let execution_result = run_powershell_script(
        &script_path_string,
        &command_args,
        false,
    )?;

    if !execution_result.success {
        return Err(AppError::process(format!(
            "Service action {} failed for {}: {}",
            action_verb, name, execution_result.stderr
        )));
    }

    Ok(())
}

/// Compiles and synchronizes the active theme across desktop components via `sync-theme.ps1`.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `dry_run` - If true, compiles files into shadow sandbox without modifying live configs.
///
/// # Returns
///
/// * `Ok(ApplyResult)` - Summary of rendered files and reloaded services.
/// * `Err(AppError)` - If synchronization script execution fails.
///
/// # Errors
///
/// Returns [`AppError::ProcessError`] if script execution fails.
#[tauri::command]
pub async fn apply_sync_theme(
    state: State<'_, AppState>,
    dry_run: bool,
    no_admin: Option<bool>,
) -> Result<ApplyResult, AppError> {
    let script_path = state.repo_root.join("scripts").join("sync-theme.ps1");
    let script_path_string = script_path.to_string_lossy().to_string();

    let mut command_args = Vec::new();
    let is_dry_run = dry_run || state.sandbox.is_sandboxed;
    if is_dry_run {
        command_args.push("-DryRun");
    }
    if let Some(ref sandbox_dir) = state.sandbox.sandbox_path {
        command_args.push("-SandboxRoot");
        command_args.push(sandbox_dir.to_str().unwrap_or(""));
    }

    let is_rootless = no_admin.unwrap_or(false) || state.sandbox.is_sandboxed || !is_process_elevated();
    if is_rootless {
        if let Ok(content) = fs::read_to_string(&script_path) {
            if content.contains("NoAdmin") {
                command_args.push("-NoAdmin");
            }
        }
    }

    let active_theme = crate::commands::theme::get_active_theme_name(state.clone())
        .await
        .unwrap_or_else(|_| "Tokyo Night Dark".to_string());
    command_args.push("-Theme");
    command_args.push(&active_theme);

    let execution_result = run_powershell_script(&script_path_string, &command_args, false)?;

    let rendered_files = vec![
        "configs/komorebi/komorebi.json".to_string(),
        "configs/yasb/config.yaml".to_string(),
        "configs/yasb/styles.css".to_string(),
        "configs/shell/flow_settings.json".to_string(),
        "configs/polish/fluentflyout_config.json".to_string(),
    ];

    let reloaded_services = vec![
        "komorebi".to_string(),
        "yasb".to_string(),
        "whkd".to_string(),
    ];

    Ok(ApplyResult {
        success: execution_result.success,
        theme_name: active_theme,
        rendered_files,
        reloaded_services,
        output_log: format!("{}\n{}", execution_result.stdout, execution_result.stderr),
    })
}

/// Discovers historical configuration backups stored in `themes/.backups/`.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
///
/// # Returns
///
/// * `Ok(Vec<BackupSnapshot>)` - List of discovered backup snapshots with timestamps and file lists.
/// * `Err(AppError)` - If filesystem traversal fails.
#[tauri::command]
pub async fn get_backups(state: State<'_, AppState>) -> Result<Vec<BackupSnapshot>, AppError> {
    let themes_backups = state.resolve_path(&state.repo_root.join("themes").join(".backups"));
    let legacy_backups = state.resolve_path(&state.repo_root.join(".backups"));
    let backup_root_dir = if themes_backups.exists() {
        themes_backups
    } else if legacy_backups.exists() {
        legacy_backups
    } else {
        themes_backups
    };
    let mut discovered_snapshots = Vec::new();

    if backup_root_dir.exists() {
        if let Ok(dir_entries) = fs::read_dir(&backup_root_dir) {
            for entry in dir_entries.flatten() {
                if entry.file_type().map(|file_type| file_type.is_dir()).unwrap_or(false) {
                    let snapshot_timestamp = entry.file_name().to_string_lossy().to_string();
                    let snapshot_directory_path = entry.path();
                    let mut archived_files = Vec::new();

                    let manifest_path = snapshot_directory_path.join("manifest.json");
                    if manifest_path.exists() {
                        if let Ok(content) = read_file_string(&manifest_path) {
                            if let Ok(manifest_val) = serde_json::from_str::<serde_json::Value>(&content) {
                                let backups_val = manifest_val
                                    .get("Backups")
                                    .or_else(|| manifest_val.get("backups"))
                                    .or_else(|| manifest_val.get("files"));

                                if let Some(val) = backups_val {
                                    if let Some(arr) = val.as_array() {
                                        for item in arr {
                                            let orig = item.get("Original").or_else(|| item.get("original")).and_then(|v| v.as_str());
                                            let bkp = item.get("Backup").or_else(|| item.get("backup")).and_then(|v| v.as_str());
                                            if let (Some(o), Some(b)) = (orig, bkp) {
                                                archived_files.push(BackupEntry {
                                                    original: o.to_string(),
                                                    backup: b.to_string(),
                                                });
                                            }
                                        }
                                    } else if let Some(item) = val.as_object() {
                                        let orig = item.get("Original").or_else(|| item.get("original")).and_then(|v| v.as_str());
                                        let bkp = item.get("Backup").or_else(|| item.get("backup")).and_then(|v| v.as_str());
                                        if let (Some(o), Some(b)) = (orig, bkp) {
                                            archived_files.push(BackupEntry {
                                                original: o.to_string(),
                                                backup: b.to_string(),
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if archived_files.is_empty() {
                        if let Ok(subentries) = fs::read_dir(&snapshot_directory_path) {
                            for subentry in subentries.flatten() {
                                if subentry.file_name() == "manifest.json" {
                                    continue;
                                }
                                let file_path_string = subentry.path().to_string_lossy().to_string();
                                archived_files.push(BackupEntry {
                                    original: subentry.file_name().to_string_lossy().to_string(),
                                    backup: file_path_string,
                                });
                            }
                        }
                    }

                    discovered_snapshots.push(BackupSnapshot {
                        timestamp: snapshot_timestamp.clone(),
                        created_at: snapshot_timestamp,
                        directory_path: snapshot_directory_path.to_string_lossy().to_string(),
                        files: archived_files,
                    });
                }
            }
        }
    }

    Ok(discovered_snapshots)
}

/// Restores configuration files from a historical backup snapshot.
///
/// Discovers and parses `manifest.json` within the snapshot directory, validates
/// target paths against traversal tokens and permitted roots, and restores each
/// file to its recorded `original` destination rather than dumping files into a single directory.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `timestamp` - Target snapshot timestamp directory name to restore.
///
/// # Returns
///
/// * `Ok(())` - Configurations restored successfully.
/// * `Err(AppError)` - If snapshot does not exist or file restoration encounters errors.
///
/// # Errors
///
/// Returns [`AppError::SandboxViolation`] if the timestamp or paths contain traversal tokens.
/// Returns [`AppError::IoError`] if snapshot directory or files are missing or unreadable.
#[tauri::command]
pub async fn restore_backup(
    state: State<'_, AppState>,
    timestamp: String,
) -> Result<(), AppError> {
    let trimmed = timestamp.trim();
    if trimmed.is_empty()
        || trimmed.contains("..")
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains('\0')
        || !trimmed.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-')
    {
        return Err(AppError::sandbox(format!(
            "Path traversal or invalid characters in backup timestamp rejected: '{}'",
            timestamp
        )));
    }

    let themes_backups = state.resolve_path(&state.repo_root.join("themes").join(".backups"));
    let legacy_backups = state.resolve_path(&state.repo_root.join(".backups"));
    let backup_root_dir = if themes_backups.exists() {
        themes_backups
    } else if legacy_backups.exists() {
        legacy_backups
    } else {
        themes_backups
    };

    let target_snapshot_dir = backup_root_dir.join(trimmed);
    let allowed = get_default_allowed_roots(&state.repo_root);
    validate_safe_path(&target_snapshot_dir, &allowed)?;

    if !target_snapshot_dir.exists() {
        return Err(AppError::io(format!("Backup snapshot {} does not exist", timestamp)));
    }

    let manifest_path = target_snapshot_dir.join("manifest.json");
    if manifest_path.exists() {
        validate_safe_path(&manifest_path, &allowed)?;
        let manifest_content = read_file_string(&manifest_path)?;
        let manifest_val: serde_json::Value = serde_json::from_str(&manifest_content)?;

        let backups_val = manifest_val
            .get("Backups")
            .or_else(|| manifest_val.get("backups"))
            .or_else(|| manifest_val.get("files"));

        let mut manifest_entries: Vec<(String, String)> = Vec::new();

        if let Some(val) = backups_val {
            if let Some(arr) = val.as_array() {
                for item in arr {
                    let orig = item.get("Original").or_else(|| item.get("original")).and_then(|v| v.as_str());
                    let bkp = item.get("Backup").or_else(|| item.get("backup")).and_then(|v| v.as_str());
                    if let (Some(o), Some(b)) = (orig, bkp) {
                        manifest_entries.push((o.to_string(), b.to_string()));
                    }
                }
            } else if let Some(item) = val.as_object() {
                let orig = item.get("Original").or_else(|| item.get("original")).and_then(|v| v.as_str());
                let bkp = item.get("Backup").or_else(|| item.get("backup")).and_then(|v| v.as_str());
                if let (Some(o), Some(b)) = (orig, bkp) {
                    manifest_entries.push((o.to_string(), b.to_string()));
                }
            }
        }

        for (orig_path_str, backup_file_str) in manifest_entries {
            // Guard against traversal tokens inside backup manifest entries
            if orig_path_str.contains("..") || orig_path_str.contains('\0')
                || backup_file_str.contains("..") || backup_file_str.contains('\0')
            {
                return Err(AppError::sandbox(format!(
                    "Path traversal detected in backup manifest entry: '{}' / '{}'",
                    orig_path_str, backup_file_str
                )));
            }

            // Locate backup source file on disk
            let direct_backup = PathBuf::from(&backup_file_str);
            let backup_source_path = if direct_backup.is_absolute() && direct_backup.exists() {
                direct_backup
            } else {
                let filename_only = direct_backup.file_name().unwrap_or_default();
                let candidate_in_snapshot = target_snapshot_dir.join(filename_only);
                if candidate_in_snapshot.exists() {
                    candidate_in_snapshot
                } else {
                    target_snapshot_dir.join(&backup_file_str)
                }
            };

            validate_safe_path(&backup_source_path, &allowed)?;
            if !backup_source_path.exists() {
                return Err(AppError::io(format!(
                    "Backup file '{}' does not exist in snapshot {}",
                    backup_file_str, timestamp
                )));
            }

            // Restore to the original destination (respecting sandbox redirection)
            let original_target = PathBuf::from(&orig_path_str);
            let destination_file_path = state.resolve_path(&original_target);
            validate_safe_path(&destination_file_path, &allowed)?;

            let file_content = read_file_string(&backup_source_path)?;
            atomic_write_file(&destination_file_path, &file_content, None)?;
        }
    } else {
        // Fallback for legacy snapshots without manifest.json
        if let Ok(dir_entries) = fs::read_dir(&target_snapshot_dir) {
            for entry in dir_entries.flatten() {
                let source_file_path = entry.path();
                let destination_filename = entry.file_name();
                let dest_name_str = destination_filename.to_string_lossy();
                if dest_name_str == "manifest.json"
                    || dest_name_str.contains("..")
                    || dest_name_str.contains('/')
                    || dest_name_str.contains('\\')
                {
                    continue;
                }

                let destination_file_path = state.resolve_path(
                    &state.repo_root.join("configs").join("komorebi").join(&destination_filename),
                );
                validate_safe_path(&destination_file_path, &allowed)?;

                if let Ok(file_content) = read_file_string(&source_file_path) {
                    atomic_write_file(&destination_file_path, &file_content, None)?;
                }
            }
        }
    }

    Ok(())
}

/// Returns the current virtualization and sandbox status of the running backend.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
///
/// # Returns
///
/// * `Ok(SandboxInfo)` - Current sandbox configuration status.
/// * `Err(AppError)` - Never fails.
#[tauri::command]
pub async fn get_sandbox_state(state: State<'_, AppState>) -> Result<SandboxInfo, AppError> {
    Ok(SandboxInfo {
        is_sandboxed: state.sandbox.is_sandboxed,
        sandbox_path: state.sandbox.sandbox_path.as_ref().map(|path| path.to_string_lossy().to_string()),
        live_working_dir: state.sandbox.live_working_dir.to_string_lossy().to_string(),
    })
}
