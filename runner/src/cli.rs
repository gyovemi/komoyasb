//! CLI argument parsing for komoyasb-run.exe.
//!
//! Parses flags without external crates — intentionally hand-rolled to keep
//! the binary lean and avoid heavyweight dep trees.

use std::path::PathBuf;

use crate::config::RunnerError;

// ---------------------------------------------------------------------------
// Action enum
// ---------------------------------------------------------------------------

/// The primary action to perform.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    /// Sync configs and start the full managed stack.
    Start,
    /// Stop all running managed services.
    Stop,
    /// Stop then restart all managed services.
    Restart,
    /// Query and display status of all services.
    Status,
    /// Render templates and exit without starting any process.
    Sync,
    /// Register `komoyasb-run.exe` in HKCU startup.
    RegisterStartup,
    /// Remove `komoyasb-run.exe` from HKCU startup.
    UnregisterStartup,
    /// Launch the Tauri control-center UI.
    Ui,
}

// ---------------------------------------------------------------------------
// CliOptions
// ---------------------------------------------------------------------------

/// Parsed options from the command line.
#[derive(Debug, Clone)]
pub struct CliOptions {
    pub action: Action,
    pub theme: Option<String>,
    pub profile: Option<String>,
    pub service: Option<String>,
    pub no_admin: bool,
    pub dry_run: bool,
    pub ui: bool,
    pub register_startup: bool,
    pub unregister_startup: bool,
    pub ledger_path: Option<PathBuf>,
}

impl Default for CliOptions {
    fn default() -> Self {
        Self {
            action: Action::Start,
            theme: None,
            profile: None,
            service: None,
            no_admin: false,
            dry_run: false,
            ui: false,
            register_startup: false,
            unregister_startup: false,
            ledger_path: None,
        }
    }
}

// ---------------------------------------------------------------------------
// parse_args
// ---------------------------------------------------------------------------

/// Parse `std::env::args()` into [`CliOptions`].
///
/// Returns an error if an unrecognised flag is supplied, a required value is
/// missing, or conflicting actions are combined (e.g. `--start --stop`).
pub fn parse_args() -> Result<CliOptions, RunnerError> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    parse_args_from(&args)
}

/// Parse a slice of string arguments (useful for unit tests).
pub fn parse_args_from(args: &[String]) -> Result<CliOptions, RunnerError> {
    if args.is_empty() {
        return Ok(CliOptions::default());
    }

    let mut opts = CliOptions {
        action: Action::Start,
        ..Default::default()
    };
    let mut action_set = false;
    let mut i = 0usize;

    macro_rules! set_action {
        ($act:expr) => {{
            if action_set {
                return Err(RunnerError::Other(
                    "conflicting action flags: specify only one of --start, --stop, --restart, \
                     --status, --sync, --register-startup, --unregister-startup, --ui"
                        .into(),
                ));
            }
            opts.action = $act;
            action_set = true;
        }};
    }

    while i < args.len() {
        match args[i].as_str() {
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            "--version" | "-V" => {
                println!("komoyasb-run {}", env!("CARGO_PKG_VERSION"));
                std::process::exit(0);
            }
            "--start" => set_action!(Action::Start),
            "--stop" => set_action!(Action::Stop),
            "--restart" => set_action!(Action::Restart),
            "--status" => set_action!(Action::Status),
            "--sync" => set_action!(Action::Sync),
            "--register-startup" => {
                set_action!(Action::RegisterStartup);
                opts.register_startup = true;
            }
            "--unregister-startup" => {
                set_action!(Action::UnregisterStartup);
                opts.unregister_startup = true;
            }
            "--ui" => {
                set_action!(Action::Ui);
                opts.ui = true;
            }
            "--no-admin" => opts.no_admin = true,
            "--dry-run" => opts.dry_run = true,
            "--theme" | "-t" => {
                i += 1;
                opts.theme = Some(next_value(&args, i, "--theme")?);
            }
            "--profile" | "-p" => {
                i += 1;
                opts.profile = Some(next_value(&args, i, "--profile")?);
            }
            "--service" | "-s" => {
                i += 1;
                opts.service = Some(next_value(&args, i, "--service")?);
            }
            "--ledger" => {
                i += 1;
                let raw = next_value(&args, i, "--ledger")?;
                opts.ledger_path = Some(sanitize_ledger_path(raw)?);
            }
            other => {
                return Err(RunnerError::Other(format!("unrecognised flag: {other}")));
            }
        }
        i += 1;
    }

    Ok(opts)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn next_value(args: &[String], i: usize, flag: &str) -> Result<String, RunnerError> {
    args.get(i)
        .filter(|v| !v.starts_with('-'))
        .cloned()
        .ok_or_else(|| RunnerError::Other(format!("{flag} requires a value")))
}

/// Canonicalize and guard against path traversal.
fn sanitize_ledger_path(raw: String) -> Result<PathBuf, RunnerError> {
    let path = PathBuf::from(&raw);
    // Reject paths that try to traverse upward
    if path.components().any(|c| {
        matches!(
            c,
            std::path::Component::ParentDir | std::path::Component::Prefix(_)
        ) && raw.contains("..")
    }) {
        return Err(RunnerError::PathTraversal(path));
    }
    Ok(path)
}

fn print_help() {
    println!(
        r#"komoyasb-run {}

USAGE:
    komoyasb-run.exe [FLAGS] [OPTIONS]

FLAGS:
    -h, --help               Print help information
    -V, --version            Print version information
        --start              Start all managed services [default if zero args]
        --stop               Stop all running managed services gracefully
        --restart            Stop then restart all managed services
        --status             Display status table for all services
        --sync               Sync themes/templates and exit
        --no-admin           Force rootless mode (skip UAC / machine-wide mods)
        --dry-run            Simulate all actions without touching the host
        --ui                 Launch the Komoyasb Control Center UI
        --register-startup   Add komoyasb-run to HKCU login startup
        --unregister-startup Remove komoyasb-run from HKCU login startup

OPTIONS:
    -t, --theme <NAME>       Theme to compile ("dark", "light", or path)
    -p, --profile <NAME>     Performance profile (ultra-low|balanced|visual-rich|gaming)
    -s, --service <NAME>     Target a single service (komorebi|whkd|yasb)
        --ledger <PATH>      Output path for dry-run JSON execution ledger
"#,
        env!("CARGO_PKG_VERSION")
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn args(raw: &[&str]) -> Vec<String> {
        raw.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn test_zero_args_defaults_to_start() {
        let opts = parse_args_from(&[]).unwrap();
        assert_eq!(opts.action, Action::Start);
        assert!(!opts.dry_run);
        assert!(!opts.no_admin);
    }

    #[test]
    fn test_start_flag() {
        let opts = parse_args_from(&args(&["--start"])).unwrap();
        assert_eq!(opts.action, Action::Start);
    }

    #[test]
    fn test_stop_flag() {
        let opts = parse_args_from(&args(&["--stop"])).unwrap();
        assert_eq!(opts.action, Action::Stop);
    }

    #[test]
    fn test_restart_flag() {
        let opts = parse_args_from(&args(&["--restart"])).unwrap();
        assert_eq!(opts.action, Action::Restart);
    }

    #[test]
    fn test_status_flag() {
        let opts = parse_args_from(&args(&["--status"])).unwrap();
        assert_eq!(opts.action, Action::Status);
    }

    #[test]
    fn test_sync_flag() {
        let opts = parse_args_from(&args(&["--sync"])).unwrap();
        assert_eq!(opts.action, Action::Sync);
    }

    #[test]
    fn test_no_admin_dry_run() {
        let opts = parse_args_from(&args(&["--start", "--no-admin", "--dry-run"])).unwrap();
        assert!(opts.no_admin);
        assert!(opts.dry_run);
    }

    #[test]
    fn test_theme_option() {
        let opts = parse_args_from(&args(&["--theme", "dark"])).unwrap();
        assert_eq!(opts.theme.as_deref(), Some("dark"));
    }

    #[test]
    fn test_profile_option() {
        let opts = parse_args_from(&args(&["--profile", "balanced"])).unwrap();
        assert_eq!(opts.profile.as_deref(), Some("balanced"));
    }

    #[test]
    fn test_service_option() {
        let opts = parse_args_from(&args(&["--service", "komorebi"])).unwrap();
        assert_eq!(opts.service.as_deref(), Some("komorebi"));
    }

    #[test]
    fn test_ledger_option() {
        let opts = parse_args_from(&args(&["--dry-run", "--ledger", "output/ledger.json"])).unwrap();
        assert_eq!(
            opts.ledger_path,
            Some(PathBuf::from("output/ledger.json"))
        );
    }

    #[test]
    fn test_register_startup() {
        let opts = parse_args_from(&args(&["--register-startup"])).unwrap();
        assert_eq!(opts.action, Action::RegisterStartup);
        assert!(opts.register_startup);
    }

    #[test]
    fn test_unregister_startup() {
        let opts = parse_args_from(&args(&["--unregister-startup"])).unwrap();
        assert_eq!(opts.action, Action::UnregisterStartup);
        assert!(opts.unregister_startup);
    }

    #[test]
    fn test_conflicting_actions_error() {
        let result = parse_args_from(&args(&["--start", "--stop"]));
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("conflicting"), "got: {msg}");
    }

    #[test]
    fn test_unknown_flag_error() {
        let result = parse_args_from(&args(&["--foobar"]));
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("unrecognised"), "got: {msg}");
    }

    #[test]
    fn test_theme_missing_value_error() {
        let result = parse_args_from(&args(&["--theme"]));
        assert!(result.is_err());
    }

    #[test]
    fn test_short_flags() {
        let opts = parse_args_from(&args(&["-t", "light", "-p", "gaming", "-s", "yasb"])).unwrap();
        assert_eq!(opts.theme.as_deref(), Some("light"));
        assert_eq!(opts.profile.as_deref(), Some("gaming"));
        assert_eq!(opts.service.as_deref(), Some("yasb"));
    }
}
