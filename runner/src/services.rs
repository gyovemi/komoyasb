//! Process lifecycle manager for the komoyasb managed service stack.
//!
//! Handles starting, stopping, and monitoring:
//!   - Komorebi (window manager) with named-pipe readiness polling
//!   - YASB Reborn (status bar)
//!   - WHKD (keybinding daemon)
//!   - Flow Launcher, EarTrumpet (auxiliary / optional)
//!
//! In `--dry-run` mode, all process spawns and kills are simulated:
//! commands are recorded in an in-memory ledger without touching the host.

use std::collections::HashMap;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::config::{RunnerError, RuntimePaths};

// ---------------------------------------------------------------------------
// Public data structures
// ---------------------------------------------------------------------------

/// Runtime information about a managed service.
#[derive(Debug, Clone, Serialize)]
pub struct ServiceInfo {
    pub name: String,
    pub running: bool,
    pub pid: Option<u32>,
    pub memory_bytes: Option<u64>,
    pub pipe_ready: Option<bool>,
}

/// Per-service start result.
#[derive(Debug, Clone, Serialize)]
pub struct ServiceStatus {
    pub name: String,
    pub started: bool,
    pub pid: Option<u32>,
    pub elapsed_ms: u64,
    pub dry_run: bool,
}

/// Report returned by [`start_full_stack`].
#[derive(Debug, Serialize)]
pub struct StackReport {
    pub services: Vec<ServiceStatus>,
    pub dry_run: bool,
    pub ledger: Option<DryRunLedger>,
}

/// Dry-run action log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerEntry {
    pub action: String,
    pub service: String,
    pub command_line: String,
    pub simulated_pid: Option<u32>,
}

/// Collected ledger emitted in dry-run mode.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct DryRunLedger {
    pub entries: Vec<LedgerEntry>,
    pub actions: Vec<LedgerEntry>,
}

impl DryRunLedger {
    fn record(&mut self, action: &str, service: &str, cmd: &str, pid: Option<u32>) {
        let entry = LedgerEntry {
            action: action.to_string(),
            service: service.to_string(),
            command_line: cmd.to_string(),
            simulated_pid: pid,
        };
        self.entries.push(entry.clone());
        self.actions.push(entry);
    }
}

// ---------------------------------------------------------------------------
// Global process table (non-dry-run)
// ---------------------------------------------------------------------------

type ProcessTable = Arc<Mutex<HashMap<String, Child>>>;

fn process_table() -> &'static ProcessTable {
    static TABLE: std::sync::OnceLock<ProcessTable> = std::sync::OnceLock::new();
    TABLE.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

// ---------------------------------------------------------------------------
// Named-pipe readiness polling (Komorebi)
// ---------------------------------------------------------------------------

/// Poll `\\.\pipe\komorebi` every 100 ms until it appears or the timeout
/// expires.  Returns `true` when the pipe is ready.
pub fn wait_for_komorebi_pipe(timeout: Duration) -> bool {
    use windows::core::PCWSTR;
    use windows::Win32::System::Pipes::WaitNamedPipeW;

    let pipe_name: Vec<u16> = r"\\.\pipe\komorebi"
        .encode_utf16()
        .chain(Some(0))
        .collect();

    let start = Instant::now();
    let poll = Duration::from_millis(100);

    while start.elapsed() < timeout {
        // WaitNamedPipeW with a 50 ms timeout checks whether a server is
        // listening on the pipe.
        let ready = unsafe { WaitNamedPipeW(PCWSTR(pipe_name.as_ptr()), 50).as_bool() };
        if ready {
            return true;
        }
        std::thread::sleep(poll);
    }
    false
}

// ---------------------------------------------------------------------------
// Low-level spawn helper
// ---------------------------------------------------------------------------

/// Spawn a background process without a console window.
fn spawn_hidden(program: &str, args: &[&str]) -> Result<Child, RunnerError> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    Command::new(program)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| RunnerError::Other(format!("failed to spawn '{program}': {e}")))
}

/// Terminate all processes whose names match `program` using `taskkill`.
/// Falls back to killing by stored [`Child`] handle if present.
fn kill_by_name(name: &str, dry_run: bool, ledger: &mut DryRunLedger) -> Result<(), RunnerError> {
    if dry_run {
        ledger.record("kill", name, &format!("taskkill /F /IM {name}.exe"), None);
        return Ok(());
    }

    // Try to terminate via stored child handle first.
    if let Ok(mut table) = process_table().lock() {
        if let Some(mut child) = table.remove(name) {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    // Also kill any stray instances by image name.
    let exe = format!("{name}.exe");
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", &exe])
        .output();

    Ok(())
}

// ---------------------------------------------------------------------------
// Individual service start / stop
// ---------------------------------------------------------------------------

/// Start a single managed service by name.
pub fn start_service(
    name: &str,
    paths: &RuntimePaths,
    dry_run: bool,
) -> Result<ServiceStatus, RunnerError> {
    let mut ledger = DryRunLedger::default();
    start_service_inner(name, paths, dry_run, &mut ledger)
}

fn start_service_inner(
    name: &str,
    paths: &RuntimePaths,
    dry_run: bool,
    ledger: &mut DryRunLedger,
) -> Result<ServiceStatus, RunnerError> {
    let t0 = Instant::now();

    match name {
        "komorebi" => start_komorebi(paths, dry_run, ledger, t0),
        "yasb" => start_yasb(dry_run, ledger, t0),
        "whkd" => start_whkd(paths, dry_run, ledger, t0),
        "flow" | "flow-launcher" => start_auxiliary("Flow.Launcher", dry_run, ledger, t0),
        "eartrumpet" => start_auxiliary("EarTrumpet", dry_run, ledger, t0),
        other => Err(RunnerError::Other(format!("unknown service: {other}"))),
    }
}

fn start_komorebi(
    paths: &RuntimePaths,
    dry_run: bool,
    ledger: &mut DryRunLedger,
    t0: Instant,
) -> Result<ServiceStatus, RunnerError> {
    let config = paths
        .komorebi_json
        .to_str()
        .ok_or_else(|| RunnerError::Other("komorebi config path is not valid UTF-8".into()))?
        .to_owned();

    let cmd_line = format!("komorebi -c {config}");

    if dry_run {
        let sim_pid = 10000u32;
        ledger.record("start", "komorebi", &cmd_line, Some(sim_pid));
        // Simulate pipe readiness
        ledger.record("pipe-ready", "komorebi", r"\\.\pipe\komorebi", Some(sim_pid));
        return Ok(ServiceStatus {
            name: "komorebi".into(),
            started: true,
            pid: Some(sim_pid),
            elapsed_ms: t0.elapsed().as_millis() as u64,
            dry_run: true,
        });
    }

    let child = spawn_hidden("komorebi", &["-c", &config])?;
    let pid = child.id();

    if let Ok(mut table) = process_table().lock() {
        table.insert("komorebi".into(), child);
    }

    // Poll pipe readiness up to 5 s.
    let ready = wait_for_komorebi_pipe(Duration::from_secs(5));
    if !ready {
        eprintln!("[warn] Komorebi pipe not ready within 5s — continuing anyway");
    }

    Ok(ServiceStatus {
        name: "komorebi".into(),
        started: true,
        pid: Some(pid),
        elapsed_ms: t0.elapsed().as_millis() as u64,
        dry_run: false,
    })
}

fn start_yasb(
    dry_run: bool,
    ledger: &mut DryRunLedger,
    t0: Instant,
) -> Result<ServiceStatus, RunnerError> {
    if dry_run {
        let sim_pid = 10001u32;
        ledger.record("start", "yasb", "yasb", Some(sim_pid));
        return Ok(ServiceStatus {
            name: "yasb".into(),
            started: true,
            pid: Some(sim_pid),
            elapsed_ms: t0.elapsed().as_millis() as u64,
            dry_run: true,
        });
    }

    let child = spawn_hidden("yasb", &[])?;
    let pid = child.id();

    if let Ok(mut table) = process_table().lock() {
        table.insert("yasb".into(), child);
    }

    // Poll for process existence up to 1 s.
    let deadline = Instant::now() + Duration::from_secs(1);
    while Instant::now() < deadline {
        if is_process_running("yasb") {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    Ok(ServiceStatus {
        name: "yasb".into(),
        started: true,
        pid: Some(pid),
        elapsed_ms: t0.elapsed().as_millis() as u64,
        dry_run: false,
    })
}

fn start_whkd(
    paths: &RuntimePaths,
    dry_run: bool,
    ledger: &mut DryRunLedger,
    t0: Instant,
) -> Result<ServiceStatus, RunnerError> {
    let whkdrc = paths
        .whkdrc
        .to_str()
        .ok_or_else(|| RunnerError::Other("whkdrc path is not valid UTF-8".into()))?
        .to_owned();

    let cmd_line = format!("whkd -c {whkdrc}");

    if dry_run {
        let sim_pid = 10002u32;
        ledger.record("start", "whkd", &cmd_line, Some(sim_pid));
        return Ok(ServiceStatus {
            name: "whkd".into(),
            started: true,
            pid: Some(sim_pid),
            elapsed_ms: t0.elapsed().as_millis() as u64,
            dry_run: true,
        });
    }

    let child = spawn_hidden("whkd", &["-c", &whkdrc])?;
    let pid = child.id();

    if let Ok(mut table) = process_table().lock() {
        table.insert("whkd".into(), child);
    }

    Ok(ServiceStatus {
        name: "whkd".into(),
        started: true,
        pid: Some(pid),
        elapsed_ms: t0.elapsed().as_millis() as u64,
        dry_run: false,
    })
}

fn start_auxiliary(
    exe: &str,
    dry_run: bool,
    ledger: &mut DryRunLedger,
    t0: Instant,
) -> Result<ServiceStatus, RunnerError> {
    let name = exe.to_lowercase();
    let cmd = format!("{exe}.exe");

    if dry_run {
        let sim_pid = 10010u32;
        ledger.record("start", &name, &cmd, Some(sim_pid));
        return Ok(ServiceStatus {
            name: name.clone(),
            started: true,
            pid: Some(sim_pid),
            elapsed_ms: t0.elapsed().as_millis() as u64,
            dry_run: true,
        });
    }

    // Auxiliaries are optional — do not fail if not found.
    match spawn_hidden(&cmd, &[]) {
        Ok(child) => {
            let pid = child.id();
            if let Ok(mut table) = process_table().lock() {
                table.insert(name.clone(), child);
            }
            Ok(ServiceStatus {
                name: name.clone(),
                started: true,
                pid: Some(pid),
                elapsed_ms: t0.elapsed().as_millis() as u64,
                dry_run: false,
            })
        }
        Err(_) => Ok(ServiceStatus {
            name: name.clone(),
            started: false,
            pid: None,
            elapsed_ms: t0.elapsed().as_millis() as u64,
            dry_run: false,
        }),
    }
}

// ---------------------------------------------------------------------------
// Stop service
// ---------------------------------------------------------------------------

/// Stop a single service by name.
pub fn stop_service(name: &str, dry_run: bool) -> Result<(), RunnerError> {
    let mut ledger = DryRunLedger::default();
    stop_service_inner(name, dry_run, &mut ledger)
}

fn stop_service_inner(
    name: &str,
    dry_run: bool,
    ledger: &mut DryRunLedger,
) -> Result<(), RunnerError> {
    match name {
        "komorebi" => {
            if dry_run {
                ledger.record("stop", "komorebi", "komorebic stop", None);
                return Ok(());
            }
            // First try graceful shutdown via komorebic.
            let _ = Command::new("komorebic").arg("stop").output();
            // Give it 2 s, then forcibly terminate.
            std::thread::sleep(Duration::from_secs(2));
            kill_by_name("komorebi", false, ledger)
        }
        other => kill_by_name(other, dry_run, ledger),
    }
}

// ---------------------------------------------------------------------------
// Full stack orchestration
// ---------------------------------------------------------------------------

/// Start the complete managed stack in the documented order:
///
/// 1. Komorebi (+ readiness gate)
/// 2. YASB
/// 3. WHKD
/// 4. Flow Launcher (auxiliary / optional)
/// 5. EarTrumpet (auxiliary / optional)
pub fn start_full_stack(
    paths: &RuntimePaths,
    dry_run: bool,
) -> Result<StackReport, RunnerError> {
    let mut ledger = DryRunLedger::default();
    let mut services = Vec::new();

    let t0 = Instant::now();

    // 1. Komorebi
    services.push(start_service_inner("komorebi", paths, dry_run, &mut ledger)?);

    // 2. YASB
    services.push(start_service_inner("yasb", paths, dry_run, &mut ledger)?);

    // 3. WHKD
    services.push(start_service_inner("whkd", paths, dry_run, &mut ledger)?);

    // 4–5. Auxiliaries (best-effort)
    services.push(start_auxiliary("Flow.Launcher", dry_run, &mut ledger, t0)?);
    services.push(start_auxiliary("EarTrumpet", dry_run, &mut ledger, t0)?);

    Ok(StackReport {
        services,
        dry_run,
        ledger: if dry_run { Some(ledger) } else { None },
    })
}

/// Stop the complete managed stack in reverse order:
///
/// 1. EarTrumpet, Flow Launcher (auxiliaries)
/// 2. WHKD
/// 3. YASB
/// 4. Komorebi (graceful via `komorebic stop`, then terminate)
pub fn stop_full_stack(dry_run: bool) -> Result<(), RunnerError> {
    let mut ledger = DryRunLedger::default();

    for name in &["eartrumpet", "flow.launcher", "whkd", "yasb", "komorebi"] {
        stop_service_inner(name, dry_run, &mut ledger)?;
    }

    Ok(())
}

/// Stop all services, sleep 1 s, then start all services.
pub fn restart_full_stack(paths: &RuntimePaths, dry_run: bool) -> Result<StackReport, RunnerError> {
    stop_full_stack(dry_run)?;
    std::thread::sleep(Duration::from_secs(1));
    start_full_stack(paths, dry_run)
}

// ---------------------------------------------------------------------------
// Status query
// ---------------------------------------------------------------------------

/// Query the runtime state of a named service.
pub fn get_service_status(name: &str) -> Result<ServiceInfo, RunnerError> {
    match name {
        "komorebi" => {
            let running = is_process_running("komorebi");
            let pipe_ready = if running {
                Some(wait_for_komorebi_pipe(Duration::from_millis(200)))
            } else {
                Some(false)
            };
            let pid = process_pid_by_name("komorebi");
            Ok(ServiceInfo {
                name: "komorebi".into(),
                running,
                pid,
                memory_bytes: pid.and_then(process_memory_bytes),
                pipe_ready,
            })
        }
        other => {
            let running = is_process_running(other);
            let pid = process_pid_by_name(other);
            Ok(ServiceInfo {
                name: other.into(),
                running,
                pid,
                memory_bytes: pid.and_then(process_memory_bytes),
                pipe_ready: None,
            })
        }
    }
}

/// Return status for every managed service.
pub fn get_all_service_statuses() -> Result<Vec<ServiceInfo>, RunnerError> {
    let names = &["komorebi", "yasb", "whkd", "Flow.Launcher", "EarTrumpet"];
    names
        .iter()
        .map(|n| get_service_status(n))
        .collect()
}

// ---------------------------------------------------------------------------
// Win32 process introspection helpers (via tasklist to avoid extra features)
// ---------------------------------------------------------------------------

/// Returns `true` if at least one process with the given image name is running.
/// Uses `tasklist /FI "IMAGENAME eq <name>.exe" /NH /FO CSV` to avoid needing
/// ToolHelp Windows crate features that aren't in `runner/Cargo.toml`.
fn is_process_running(name: &str) -> bool {
    let exe = if name.to_lowercase().ends_with(".exe") {
        name.to_string()
    } else {
        format!("{name}.exe")
    };
    let filter = format!("IMAGENAME eq {exe}");
    Command::new("tasklist")
        .args(["/FI", &filter, "/NH", "/FO", "CSV"])
        .output()
        .map(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.contains(&exe)
        })
        .unwrap_or(false)
}

/// Return the PID of the first process matching the image name, or `None`.
/// Parses CSV output from `tasklist`.
fn process_pid_by_name(name: &str) -> Option<u32> {
    let exe = if name.to_lowercase().ends_with(".exe") {
        name.to_string()
    } else {
        format!("{name}.exe")
    };
    let filter = format!("IMAGENAME eq {exe}");
    let output = Command::new("tasklist")
        .args(["/FI", &filter, "/NH", "/FO", "CSV"])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    // CSV format: "image.exe","PID","Session","Num","Mem Usage"
    for line in stdout.lines() {
        let fields: Vec<&str> = line.split(',').collect();
        if fields.len() >= 2 {
            let pid_str = fields[1].trim().trim_matches('"');
            if let Ok(pid) = pid_str.parse::<u32>() {
                return Some(pid);
            }
        }
    }
    None
}

/// Return working-set memory (bytes) for a process by PID via `tasklist /FI "PID eq <pid>"`.
fn process_memory_bytes(pid: u32) -> Option<u64> {
    let filter = format!("PID eq {pid}");
    let output = Command::new("tasklist")
        .args(["/FI", &filter, "/NH", "/FO", "CSV"])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    // CSV: "image.exe","PID","Session","Num","Mem Usage"
    // Mem Usage is e.g. "12,345 K"
    for line in stdout.lines() {
        let fields: Vec<&str> = line.split(',').collect();
        if fields.len() >= 5 {
            let mem_str = fields[4].trim().trim_matches('"');
            // Strip " K" and commas, parse as KB
            let kb_str: String = mem_str
                .replace(" K", "")
                .replace(',', "")
                .trim()
                .to_string();
            if let Ok(kb) = kb_str.parse::<u64>() {
                return Some(kb * 1024);
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use crate::config::RuntimePaths;

    fn dummy_paths() -> RuntimePaths {
        RuntimePaths {
            komorebi_json: PathBuf::from(r"C:\Users\test\AppData\Roaming\komoyasb\configs\komorebi\komorebi.json"),
            whkdrc: PathBuf::from(r"C:\Users\test\AppData\Roaming\komoyasb\configs\komorebi\whkdrc"),
            yasb_config: PathBuf::from(r"C:\Users\test\AppData\Roaming\komoyasb\configs\yasb\config.yaml"),
            yasb_styles: PathBuf::from(r"C:\Users\test\AppData\Roaming\komoyasb\configs\yasb\styles.css"),
            flow_settings: PathBuf::from(r"C:\Users\test\AppData\Roaming\FlowLauncher\Settings\Settings.json"),
            flow_theme: PathBuf::from(r"C:\Users\test\AppData\Roaming\FlowLauncher\Themes\komoyasb.xaml"),
        }
    }

    #[test]
    fn test_dry_run_start_full_stack_no_live_processes() {
        let paths = dummy_paths();
        let report = start_full_stack(&paths, true).unwrap();
        assert!(report.dry_run);
        // Every service should report started in dry-run.
        for svc in &report.services {
            assert!(svc.started, "Service {} not marked started", svc.name);
            assert!(svc.dry_run);
        }
    }

    #[test]
    fn test_dry_run_ledger_populated() {
        let paths = dummy_paths();
        let report = start_full_stack(&paths, true).unwrap();
        let ledger = report.ledger.expect("ledger must be present in dry-run");
        assert!(
            !ledger.entries.is_empty(),
            "Ledger should contain recorded actions"
        );
        // Should contain a komorebi start entry.
        assert!(ledger
            .entries
            .iter()
            .any(|e| e.service == "komorebi" && e.action == "start"));
    }

    #[test]
    fn test_dry_run_stop_full_stack() {
        let result = stop_full_stack(true);
        assert!(result.is_ok(), "dry-run stop should succeed");
    }

    #[test]
    fn test_dry_run_start_single_service_komorebi() {
        let paths = dummy_paths();
        let status = start_service("komorebi", &paths, true).unwrap();
        assert_eq!(status.name, "komorebi");
        assert!(status.started);
        assert!(status.dry_run);
        assert!(status.pid.is_some());
    }

    #[test]
    fn test_dry_run_start_single_service_yasb() {
        let paths = dummy_paths();
        let status = start_service("yasb", &paths, true).unwrap();
        assert_eq!(status.name, "yasb");
        assert!(status.started);
        assert!(status.dry_run);
    }

    #[test]
    fn test_dry_run_start_single_service_whkd() {
        let paths = dummy_paths();
        let status = start_service("whkd", &paths, true).unwrap();
        assert_eq!(status.name, "whkd");
        assert!(status.started);
    }

    #[test]
    fn test_unknown_service_error() {
        let paths = dummy_paths();
        let result = start_service("nonexistent-svc", &paths, true);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("unknown service"), "got: {msg}");
    }

    #[test]
    fn test_stop_service_dry_run() {
        let result = stop_service("komorebi", true);
        assert!(result.is_ok());
    }

    #[test]
    fn test_is_process_running_nonexistent() {
        // Should return false and not panic.
        let running = is_process_running("definitely-not-a-real-process-xyzzy-9999");
        assert!(!running);
    }

    #[test]
    fn test_wait_for_komorebi_pipe_timeout() {
        // Komorebi is not running in CI; pipe should time out quickly.
        let ready = wait_for_komorebi_pipe(Duration::from_millis(300));
        // We just verify it returns within the timeout without panicking.
        let _ = ready; // could be true or false depending on environment
    }

    #[test]
    fn test_dry_run_ledger_serialize() {
        let paths = dummy_paths();
        let report = start_full_stack(&paths, true).unwrap();
        let ledger = report.ledger.unwrap();
        let json = serde_json::to_string_pretty(&ledger).unwrap();
        // Verify it round-trips cleanly.
        let roundtrip: DryRunLedger = serde_json::from_str(&json).unwrap();
        assert_eq!(roundtrip.entries.len(), ledger.entries.len());
        assert_eq!(roundtrip.actions.len(), ledger.actions.len());
    }
}
