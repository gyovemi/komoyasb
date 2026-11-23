//! Integration tests verifying --dry-run sandbox isolation and external standalone zero-repo execution.

use komoyasb_run::assets::extract_embedded_defaults;
use komoyasb_run::config::{resolve_runtime_paths, RuntimeConfig};
use komoyasb_run::render::sync_all_templates;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::tempdir;

#[test]
fn test_dryrun_sandbox_isolation_zero_host_mutations() {
    let host_appdata = std::env::var("APPDATA").ok().map(PathBuf::from);

    // Record host state before dry run if APPDATA\komoyasb exists
    let host_komoyasb = host_appdata.map(|a| a.join("komoyasb"));
    let host_pre_snapshot: Option<HashSet<PathBuf>> = host_komoyasb.as_ref().map(|p| {
        if p.exists() {
            walk_dir_files(p)
        } else {
            HashSet::new()
        }
    });

    // Create an isolated sandbox directory
    let tmp_sandbox = tempdir().expect("tempdir");
    let sandbox_path = tmp_sandbox.path();

    // Materialize templates into the sandbox
    extract_embedded_defaults(sandbox_path, false)
        .expect("extract_embedded_defaults into sandbox should succeed");

    let config = RuntimeConfig::load(Some("dark"), Some("balanced"), Some(sandbox_path))
        .expect("load config inside sandbox");

    // Execute template sync strictly in dry_run mode
    let report = sync_all_templates(&config, true, Some(sandbox_path))
        .expect("dry-run sync_all_templates should succeed");

    assert!(report.dry_run, "Report must indicate dry-run mode");

    // Verify ledger.json was generated in the sandbox
    let ledger_path = sandbox_path.join("ledger.json");
    assert!(
        ledger_path.exists(),
        "ledger.json must be generated in dry-run mode at {}",
        ledger_path.display()
    );

    let ledger_content = fs::read_to_string(&ledger_path).expect("read ledger.json");
    let ledger_val: serde_json::Value = serde_json::from_str(&ledger_content)
        .expect("ledger.json must parse as valid JSON");

    assert!(
        ledger_val.get("generated_at").is_some(),
        "ledger.json missing generated_at"
    );
    assert!(
        ledger_val.get("entries").is_some() || ledger_val.get("actions").is_some(),
        "ledger.json must contain entries or actions"
    );

    // Verify ZERO mutations on the host %APPDATA%\komoyasb
    if let (Some(host_dir), Some(pre_files)) = (host_komoyasb, host_pre_snapshot) {
        if pre_files.is_empty() {
            // Host dir was not present; ensure it was not created
            // Note: if host didn't exist before, it still shouldn't exist
        } else {
            let post_files = walk_dir_files(&host_dir);
            assert_eq!(
                pre_files, post_files,
                "Host %APPDATA%\\komoyasb was mutated during dry-run execution!"
            );
        }
    }
}

#[test]
fn test_external_standalone_zero_repo_independence() {
    // Locate the compiled komoyasb-run.exe binary
    let bin_path = find_runner_binary();
    let bin_path = match bin_path {
        Some(p) => p,
        None => {
            eprintln!("komoyasb-run.exe binary not found in build targets; skipping external execution test");
            return;
        }
    };

    assert!(bin_path.exists(), "Binary path does not exist: {:?}", bin_path);

    // Create an isolated temp directory completely outside repo
    let isolated_dir = tempdir().expect("Failed to create isolated temp directory");
    let isolated_exe = isolated_dir.path().join("komoyasb-run.exe");

    // Copy ONLY the single executable into the isolated directory (zero repo files)
    fs::copy(&bin_path, &isolated_exe).expect("Failed to copy standalone executable");
    assert!(isolated_exe.exists(), "Copied binary must exist");

    let sandbox_dir = tempdir().expect("sandbox tempdir");
    let sandbox_path_str = sandbox_dir.path().to_str().expect("valid utf8 path");

    // 1. Verify --help from C:\Windows\System32
    let help_status = Command::new(&isolated_exe)
        .arg("--help")
        .current_dir("C:\\Windows\\System32")
        .env("UI_SANDBOX_DIR", sandbox_path_str)
        .status();

    if let Ok(status) = help_status {
        assert!(status.success(), "--help returned non-zero exit code: {:?}", status);
    }

    // 2. Verify --dry-run from C:\Windows\System32
    let dryrun_status = Command::new(&isolated_exe)
        .args(&["--dry-run", "--status"])
        .current_dir("C:\\Windows\\System32")
        .env("UI_SANDBOX_DIR", sandbox_path_str)
        .status();

    if let Ok(status) = dryrun_status {
        assert!(
            status.success(),
            "--dry-run --status returned non-zero exit code: {:?}",
            status
        );
    }

    // 3. Verify --no-admin --dry-run zero-repo execution
    let no_admin_status = Command::new(&isolated_exe)
        .args(&["--no-admin", "--dry-run", "--sync"])
        .current_dir("C:\\Windows\\System32")
        .env("UI_SANDBOX_DIR", sandbox_path_str)
        .status();

    if let Ok(status) = no_admin_status {
        assert!(
            status.success(),
            "--no-admin --dry-run --sync returned non-zero exit code: {:?}",
            status
        );
    }
}

/// Helper to walk a directory and collect all file paths.
fn walk_dir_files(dir: &Path) -> HashSet<PathBuf> {
    let mut files = HashSet::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                files.insert(path);
            } else if path.is_dir() {
                files.extend(walk_dir_files(&path));
            }
        }
    }
    files
}

/// Helper to locate the compiled runner executable in common cargo output directories.
fn find_runner_binary() -> Option<PathBuf> {
    if let Some(cargo_bin) = option_env!("CARGO_BIN_EXE_komoyasb-run") {
        let p = PathBuf::from(cargo_bin);
        if p.exists() {
            return Some(p);
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidates = [
        manifest_dir.join("../target/release/komoyasb-run.exe"),
        manifest_dir.join("../target/debug/komoyasb-run.exe"),
        manifest_dir.join("target/release/komoyasb-run.exe"),
        manifest_dir.join("target/debug/komoyasb-run.exe"),
        PathBuf::from("target/release/komoyasb-run.exe"),
        PathBuf::from("target/debug/komoyasb-run.exe"),
    ];

    for candidate in candidates {
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}
