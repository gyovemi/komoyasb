// runner/src/assets.rs
//! Embedded asset bundling and %APPDATA% materialization.

use include_dir::{include_dir, Dir};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::config::RunnerError;

/// Embedded configs/ directory tree (templates, scripts, wallpapers, yaml files).
pub static EMBEDDED_CONFIGS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../configs");

/// Embedded themes/ directory tree (dark.json, light.json, schema files).
pub static EMBEDDED_THEMES: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../themes");

/// Embedded performance.json root file.
pub static EMBEDDED_PERF: &str = include_str!("$CARGO_MANIFEST_DIR/../performance.json");

/// Report produced by `extract_embedded_defaults`.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct BootstrapReport {
    /// Files successfully written.
    pub written: Vec<PathBuf>,
    /// Files skipped because they already exist (and force=false).
    pub skipped: Vec<PathBuf>,
    /// Files that failed to write; tuples of (path, error message).
    pub errors: Vec<(PathBuf, String)>,
}

/// Extract all embedded default assets into `target_dir`.
///
/// - `target_dir`: Typically `%APPDATA%\komoyasb\` or the sandbox root.
/// - `force`: When `true`, overwrite existing files. When `false`, skip them.
///
/// This function never panics; every I/O error is captured in `BootstrapReport::errors`.
pub fn extract_embedded_defaults(
    target_dir: &Path,
    force: bool,
) -> Result<BootstrapReport, RunnerError> {
    let mut report = BootstrapReport::default();

    // Materialize configs/
    extract_dir(&EMBEDDED_CONFIGS, target_dir, "configs", force, &mut report);

    // Materialize themes/
    extract_dir(&EMBEDDED_THEMES, target_dir, "themes", force, &mut report);

    // Materialize performance.json
    let perf_dest = target_dir.join("performance.json");
    write_bytes(
        &perf_dest,
        EMBEDDED_PERF.as_bytes(),
        force,
        &mut report,
    );

    Ok(report)
}

/// Recursively walk a `Dir` and materialise its files under `base/subpath`.
fn extract_dir(
    dir: &Dir<'_>,
    base: &Path,
    subpath: &str,
    force: bool,
    report: &mut BootstrapReport,
) {
    for file in dir.files() {
        let rel = file.path();
        let dest = base.join(subpath).join(rel);
        write_bytes(&dest, file.contents(), force, report);
    }
    for sub in dir.dirs() {
        let sub_name = sub
            .path()
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        let next_subpath = format!("{}/{}", subpath, sub_name);
        extract_dir(sub, base, &next_subpath, force, report);
    }
}

/// Write `bytes` to `dest`, respecting the `force` flag.
fn write_bytes(dest: &Path, bytes: &[u8], force: bool, report: &mut BootstrapReport) {
    if dest.exists() && !force {
        report.skipped.push(dest.to_path_buf());
        return;
    }
    if let Some(parent) = dest.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            report
                .errors
                .push((dest.to_path_buf(), format!("create_dir_all: {}", e)));
            return;
        }
    }
    match std::fs::write(dest, bytes) {
        Ok(()) => report.written.push(dest.to_path_buf()),
        Err(e) => report
            .errors
            .push((dest.to_path_buf(), format!("write: {}", e))),
    }
}

/// Look up a single embedded file by relative path, searching configs then themes.
///
/// Returns `Some(&[u8])` if found in either embedded tree, or `None`.
pub fn get_embedded_file(relative_path: &str) -> Option<&'static [u8]> {
    // Strip leading "configs/" prefix for EMBEDDED_CONFIGS lookup
    let in_configs = relative_path
        .strip_prefix("configs/")
        .and_then(|p| EMBEDDED_CONFIGS.get_file(p))
        .map(|f| f.contents());
    if in_configs.is_some() {
        return in_configs;
    }

    // Strip leading "themes/" prefix for EMBEDDED_THEMES lookup
    let in_themes = relative_path
        .strip_prefix("themes/")
        .and_then(|p| EMBEDDED_THEMES.get_file(p))
        .map(|f| f.contents());
    if in_themes.is_some() {
        return in_themes;
    }

    // performance.json at root
    if relative_path == "performance.json" {
        return Some(EMBEDDED_PERF.as_bytes());
    }

    None
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_extract_creates_performance_json() {
        let tmp = TempDir::new().expect("tempdir");
        let report = extract_embedded_defaults(tmp.path(), false)
            .expect("extract should succeed");
        let perf = tmp.path().join("performance.json");
        assert!(perf.exists(), "performance.json should be materialized");
        // Check content is valid JSON with known key
        let content = std::fs::read_to_string(&perf).unwrap();
        assert!(content.contains("active_profile"), "should contain active_profile key");
        // report errors must be empty
        assert!(report.errors.is_empty(), "no errors expected: {:?}", report.errors);
    }

    #[test]
    fn test_no_overwrite_without_force() {
        let tmp = TempDir::new().expect("tempdir");
        let perf_path = tmp.path().join("performance.json");
        std::fs::write(&perf_path, b"sentinel").unwrap();

        let report = extract_embedded_defaults(tmp.path(), false)
            .expect("extract should succeed");
        // The sentinel file should be in skipped
        assert!(
            report.skipped.iter().any(|p| p == &perf_path),
            "performance.json should be skipped: {:?}",
            report.skipped
        );
        // Content must remain unchanged
        assert_eq!(std::fs::read(&perf_path).unwrap(), b"sentinel");
    }

    #[test]
    fn test_force_overwrites_existing() {
        let tmp = TempDir::new().expect("tempdir");
        let perf_path = tmp.path().join("performance.json");
        std::fs::write(&perf_path, b"sentinel").unwrap();

        let report = extract_embedded_defaults(tmp.path(), true)
            .expect("extract should succeed");
        assert!(report.errors.is_empty());
        // Content must now be the embedded version
        let content = std::fs::read_to_string(&perf_path).unwrap();
        assert!(content.contains("active_profile"), "should contain embedded content");
    }

    #[test]
    fn test_themes_tree_materialized() {
        let tmp = TempDir::new().expect("tempdir");
        extract_embedded_defaults(tmp.path(), false).expect("extract");
        let dark = tmp.path().join("themes").join("dark.json");
        let light = tmp.path().join("themes").join("light.json");
        assert!(dark.exists(), "dark.json should exist");
        assert!(light.exists(), "light.json should exist");
    }

    #[test]
    fn test_get_embedded_file_perf() {
        let bytes = get_embedded_file("performance.json");
        assert!(bytes.is_some(), "performance.json should be found");
        let s = std::str::from_utf8(bytes.unwrap()).unwrap();
        assert!(s.contains("balanced"));
    }

    #[test]
    fn test_get_embedded_file_missing() {
        assert!(get_embedded_file("nonexistent/file.txt").is_none());
    }
}
