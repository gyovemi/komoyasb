//! Integration tests for CLI parsing and mock service lifecycle operations in dry-run mode.

use komoyasb_run::cli::{parse_args_from, Action};
use komoyasb_run::config::resolve_runtime_paths;
use komoyasb_run::services::{
    get_all_service_statuses, get_service_status, restart_full_stack, start_full_stack,
    start_service, stop_full_stack, stop_service,
};
use std::path::PathBuf;
use tempfile::tempdir;

#[test]
fn test_cli_parsing_empty_defaults_to_start() {
    let args: Vec<String> = vec![];
    let opts = parse_args_from(&args).expect("Empty args should succeed");

    assert_eq!(opts.action, Action::Start);
    assert!(!opts.dry_run);
    assert!(!opts.no_admin);
    assert_eq!(opts.theme, None);
    assert_eq!(opts.profile, None);
    assert_eq!(opts.service, None);
    assert_eq!(opts.ledger_path, None);
}

#[test]
fn test_cli_parsing_distinct_actions() {
    let cases = vec![
        (vec!["--start".to_string()], Action::Start),
        (vec!["--stop".to_string()], Action::Stop),
        (vec!["--restart".to_string()], Action::Restart),
        (vec!["--status".to_string()], Action::Status),
        (vec!["--sync".to_string()], Action::Sync),
        (vec!["--ui".to_string()], Action::Ui),
        (vec!["--register-startup".to_string()], Action::RegisterStartup),
        (vec!["--unregister-startup".to_string()], Action::UnregisterStartup),
    ];

    for (args, expected_action) in cases {
        let opts = parse_args_from(&args).unwrap_or_else(|e| panic!("Failed parsing {:?}: {e}", args));
        assert_eq!(opts.action, expected_action, "Mismatch for args {:?}", args);
    }
}

#[test]
fn test_cli_parsing_options_and_flags() {
    let args = vec![
        "--start".to_string(),
        "--theme".to_string(),
        "dark".to_string(),
        "--profile".to_string(),
        "gaming".to_string(),
        "--service".to_string(),
        "komorebi".to_string(),
        "--no-admin".to_string(),
        "--dry-run".to_string(),
        "--ledger".to_string(),
        "C:\\temp\\ledger.json".to_string(),
    ];

    let opts = parse_args_from(&args).expect("Valid args should succeed");
    assert_eq!(opts.action, Action::Start);
    assert_eq!(opts.theme.as_deref(), Some("dark"));
    assert_eq!(opts.profile.as_deref(), Some("gaming"));
    assert_eq!(opts.service.as_deref(), Some("komorebi"));
    assert!(opts.no_admin);
    assert!(opts.dry_run);
    assert_eq!(opts.ledger_path, Some(PathBuf::from("C:\\temp\\ledger.json")));
}

#[test]
fn test_cli_parsing_short_options() {
    let args = vec![
        "-t".to_string(),
        "light".to_string(),
        "-p".to_string(),
        "ultra-low".to_string(),
        "-s".to_string(),
        "yasb".to_string(),
    ];

    let opts = parse_args_from(&args).expect("Short flags should succeed");
    assert_eq!(opts.action, Action::Start);
    assert_eq!(opts.theme.as_deref(), Some("light"));
    assert_eq!(opts.profile.as_deref(), Some("ultra-low"));
    assert_eq!(opts.service.as_deref(), Some("yasb"));
}

#[test]
fn test_cli_parsing_conflicting_actions_error() {
    let args = vec!["--start".to_string(), "--stop".to_string()];
    let res = parse_args_from(&args);
    assert!(
        res.is_err(),
        "Combining --start and --stop should return an error"
    );
}

#[test]
fn test_cli_parsing_missing_option_value_error() {
    let args = vec!["--theme".to_string()];
    let res = parse_args_from(&args);
    assert!(res.is_err(), "--theme without value should error");
}

#[test]
fn test_lifecycle_single_service_dry_run() {
    let tmp = tempdir().expect("tempdir");
    let paths = resolve_runtime_paths(Some(tmp.path())).expect("paths");

    // Test starting komorebi in dry-run mode
    let start_res = start_service("komorebi", &paths, true).expect("dry-run start komorebi");
    assert_eq!(start_res.name, "komorebi");
    assert!(start_res.dry_run);
    assert!(start_res.started);

    // Test stopping komorebi in dry-run mode
    let stop_res = stop_service("komorebi", true);
    assert!(stop_res.is_ok(), "dry-run stop komorebi should succeed");

    // Test starting yasb in dry-run mode
    let yasb_start = start_service("yasb", &paths, true).expect("dry-run start yasb");
    assert_eq!(yasb_start.name, "yasb");
    assert!(yasb_start.dry_run);
    assert!(yasb_start.started);

    // Test stopping yasb in dry-run mode
    let yasb_stop = stop_service("yasb", true);
    assert!(yasb_stop.is_ok(), "dry-run stop yasb should succeed");
}

#[test]
fn test_lifecycle_full_stack_dry_run() {
    let tmp = tempdir().expect("tempdir");
    let paths = resolve_runtime_paths(Some(tmp.path())).expect("paths");

    // Start full stack in dry-run mode
    let start_report = start_full_stack(&paths, true).expect("start_full_stack in dry run");
    assert!(start_report.dry_run);
    assert!(
        !start_report.services.is_empty(),
        "Expected managed services in report"
    );

    // Verify komorebi, whkd, and yasb are present
    let service_names: Vec<&str> = start_report
        .services
        .iter()
        .map(|s| s.name.as_str())
        .collect();
    assert!(service_names.contains(&"komorebi"));
    assert!(service_names.contains(&"whkd"));
    assert!(service_names.contains(&"yasb"));

    // Verify dry-run ledger exists in report
    assert!(
        start_report.ledger.is_some(),
        "Expected dry-run ledger in start_full_stack report"
    );
    let ledger = start_report.ledger.unwrap();
    assert!(
        !ledger.actions.is_empty(),
        "Expected simulated actions recorded in ledger"
    );

    // Restart full stack in dry-run mode
    let restart_report = restart_full_stack(&paths, true).expect("restart_full_stack in dry run");
    assert!(restart_report.dry_run);
    assert!(!restart_report.services.is_empty());

    // Stop full stack in dry-run mode
    let stop_report = stop_full_stack(true);
    assert!(stop_report.is_ok(), "stop_full_stack in dry run should succeed");
}

#[test]
fn test_lifecycle_service_status_query() {
    let komo_status = get_service_status("komorebi").expect("get komorebi status");
    assert_eq!(komo_status.name, "komorebi");

    let all_statuses = get_all_service_statuses().expect("get all statuses");
    assert!(
        all_statuses.len() >= 3,
        "Expected at least komorebi, whkd, and yasb in status query"
    );
    let names: Vec<&str> = all_statuses.iter().map(|s| s.name.as_str()).collect();
    assert!(names.contains(&"komorebi"));
    assert!(names.contains(&"whkd"));
    assert!(names.contains(&"yasb"));
}
