//! Entry point for `komoyasb-run.exe`.
//!
//! Configured as a Windows GUI subsystem binary so that double-clicking in
//! Explorer produces **zero** console window flash.  When launched from a
//! terminal, the process attaches dynamically to the parent console and prints
//! colored status output via ANSI escape sequences.

#![windows_subsystem = "windows"]

use std::process;

use colored::Colorize;

use komoyasb_run::assets;
use komoyasb_run::cli::{self, Action, CliOptions};
use komoyasb_run::config::{resolve_runtime_paths, RunnerError, RuntimeConfig};
use komoyasb_run::privilege::{is_rootless, register_hkcu_startup, unregister_hkcu_startup};
use komoyasb_run::render;
use komoyasb_run::services::{
    self, get_all_service_statuses, restart_full_stack, start_full_stack, start_service,
    stop_full_stack, stop_service,
};

// ---------------------------------------------------------------------------
// Console initialisation
// ---------------------------------------------------------------------------

/// Attempt to attach to the parent process console (cmd.exe / PowerShell /
/// Windows Terminal).  Returns `true` on success.
///
/// When run by double-clicking in Explorer, `AttachConsole` will fail — that
/// is the expected path: the binary runs silently in the background without
/// allocating any console window.
fn init_console_io() -> bool {
    use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
    unsafe { AttachConsole(ATTACH_PARENT_PROCESS).is_ok() }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() {
    let console_attached = init_console_io();

    // Silence `colored` when there is no console.
    if !console_attached {
        colored::control::set_override(false);
    }

    match run() {
        Ok(()) => process::exit(0),
        Err(e) => {
            if console_attached {
                eprintln!("{} {e}", "error:".red().bold());
            }
            process::exit(1);
        }
    }
}

// ---------------------------------------------------------------------------
// Core dispatch
// ---------------------------------------------------------------------------

fn run() -> Result<(), RunnerError> {
    let opts = cli::parse_args()?;
    dispatch(opts)
}

fn dispatch(opts: CliOptions) -> Result<(), RunnerError> {
    let rootless = is_rootless(opts.no_admin);
    let sandbox = std::env::var("UI_SANDBOX_DIR").ok().map(std::path::PathBuf::from);
    let dry_run = opts.dry_run || sandbox.is_some();

    let paths = resolve_runtime_paths(sandbox.as_deref())?;

    match opts.action {
        // ------------------------------------------------------------------
        // Start (default action)
        // ------------------------------------------------------------------
        Action::Start => {
            if let Some(ref svc) = opts.service {
                // Single-service start.
                let status = start_service(svc, &paths, dry_run)?;
                println!(
                    "{} {} (pid {})",
                    "started".green().bold(),
                    svc,
                    status
                        .pid
                        .map(|p| p.to_string())
                        .unwrap_or_else(|| "?".into())
                );
            } else {
                // Full stack start: sync templates then launch all services.
                if !dry_run {
                    // Bootstrap embedded assets if first run
                    let _ = assets::extract_embedded_defaults(&paths.state_root, false);

                    // Build a RuntimeConfig for the current theme/profile.
                    let cfg = RuntimeConfig::load(
                        &paths,
                        opts.theme.as_deref(),
                        opts.profile.as_deref(),
                    )?;
                    render::sync_all_templates(&cfg, dry_run, sandbox.as_deref())?;
                }
                let report = start_full_stack(&paths, dry_run)?;
                for svc in &report.services {
                    if svc.started {
                        println!(
                            "{} {} (pid {})",
                            "started".green().bold(),
                            svc.name,
                            svc.pid
                                .map(|p| p.to_string())
                                .unwrap_or_else(|| "?".into())
                        );
                    } else {
                        println!("{} {} (not found / skipped)", "skipped".yellow(), svc.name);
                    }
                }
                if dry_run {
                    if let Some(ledger) = report.ledger {
                        write_ledger(&ledger, opts.ledger_path.as_deref())?;
                    }
                }
            }
        }

        // ------------------------------------------------------------------
        // Stop
        // ------------------------------------------------------------------
        Action::Stop => {
            if let Some(ref svc) = opts.service {
                stop_service(svc, dry_run)?;
                println!("{} {svc}", "stopped".yellow().bold());
            } else {
                stop_full_stack(dry_run)?;
                println!("{}", "all services stopped".yellow().bold());
            }
        }

        // ------------------------------------------------------------------
        // Restart
        // ------------------------------------------------------------------
        Action::Restart => {
            let report = restart_full_stack(&paths, dry_run)?;
            println!("{}", "restarted".green().bold());
            for svc in &report.services {
                println!(
                    "  {} {}",
                    if svc.started { "✓".green() } else { "✗".red() },
                    svc.name
                );
            }
        }

        // ------------------------------------------------------------------
        // Status
        // ------------------------------------------------------------------
        Action::Status => {
            let statuses = get_all_service_statuses()?;
            println!("{:<20} {:<8} {:<10} {}", "SERVICE", "RUNNING", "PID", "MEMORY");
            println!("{}", "-".repeat(50));
            for s in statuses {
                let pid_str = s.pid.map(|p| p.to_string()).unwrap_or_else(|| "-".into());
                let mem_str = s
                    .memory_bytes
                    .map(|b| format!("{:.1} MB", b as f64 / 1_048_576.0))
                    .unwrap_or_else(|| "-".into());
                let running_str = if s.running {
                    "yes".green()
                } else {
                    "no".red()
                };
                println!("{:<20} {:<8} {:<10} {}", s.name, running_str, pid_str, mem_str);
            }
        }

        // ------------------------------------------------------------------
        // Sync only
        // ------------------------------------------------------------------
        Action::Sync => {
            if !dry_run {
                let _ = assets::extract_embedded_defaults(&paths.state_root, false);
            }
            let cfg = RuntimeConfig::load(
                &paths,
                opts.theme.as_deref(),
                opts.profile.as_deref(),
            )?;
            let report = render::sync_all_templates(&cfg, dry_run, sandbox.as_deref())?;
            let written = report
                .files
                .iter()
                .filter(|r| matches!(r.status, render::SyncStatus::Written | render::SyncStatus::DryRunWouldWrite))
                .count();
            let unchanged = report
                .files
                .iter()
                .filter(|r| matches!(r.status, render::SyncStatus::Unchanged | render::SyncStatus::DryRunWouldSkip))
                .count();
            let errors = report
                .files
                .iter()
                .filter(|r| matches!(r.status, render::SyncStatus::Error(_)))
                .count();
            println!(
                "{} {} files rendered, {} unchanged, {} errors",
                "sync:".cyan().bold(),
                written,
                unchanged,
                errors
            );
            if dry_run {
                if let Some(ledger_path) = opts.ledger_path.as_deref() {
                    let ledger_json = serde_json::to_string_pretty(&report)
                        .map_err(|e| RunnerError::Other(e.to_string()))?;
                    if let Some(parent) = ledger_path.parent() {
                        std::fs::create_dir_all(parent)
                            .map_err(|e| RunnerError::io(parent, e))?;
                    }
                    std::fs::write(ledger_path, ledger_json)
                        .map_err(|e| RunnerError::io(ledger_path, e))?;
                }
            }
        }

        // ------------------------------------------------------------------
        // Startup registration
        // ------------------------------------------------------------------
        Action::RegisterStartup => {
            if rootless {
                println!("{}", "Operating in rootless (user-only) mode".dimmed());
            }
            register_hkcu_startup()?;
            println!("{}", "komoyasb-run added to HKCU startup".green());
        }

        Action::UnregisterStartup => {
            unregister_hkcu_startup()?;
            println!("{}", "komoyasb-run removed from HKCU startup".yellow());
        }

        // ------------------------------------------------------------------
        // Launch Tauri UI
        // ------------------------------------------------------------------
        Action::Ui => {
            // Locate and launch the Tauri control center next to the runner.
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.to_path_buf()))
                .unwrap_or_default();
            let ui_exe = exe_dir.join("komoyasb-control-center.exe");
            if !ui_exe.exists() {
                return Err(RunnerError::Other(format!(
                    "Control Center binary not found: {}",
                    ui_exe.display()
                )));
            }
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            std::process::Command::new(&ui_exe)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| RunnerError::Other(format!("failed to launch UI: {e}")))?;
            println!("{}", "Launched Komoyasb Control Center".green());
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Ledger file helper
// ---------------------------------------------------------------------------

fn write_ledger(
    ledger: &services::DryRunLedger,
    path: Option<&std::path::Path>,
) -> Result<(), RunnerError> {
    let json =
        serde_json::to_string_pretty(ledger).map_err(|e| RunnerError::Other(e.to_string()))?;

    if let Some(out) = path {
        // Ensure parent directory exists.
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|e| RunnerError::io(parent, e))?;
        }
        std::fs::write(out, &json).map_err(|e| RunnerError::io(out, e))?;
        println!("{} {}", "ledger written:".cyan(), out.display());
    } else {
        // Print to stdout if no path given.
        println!("{json}");
    }

    Ok(())
}
