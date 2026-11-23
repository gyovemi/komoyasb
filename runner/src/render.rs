// runner/src/render.rs
//! Native template renderer with 100% parity to TemplateEngine.psm1.
//!
//! Features:
//! - Token flattening with dot notation
//! - Computed color variants (`.rgb`, `_alpha{5..95}`, `_argb{5..95}`)
//! - Wallpaper path resolution
//! - Performance profile token merging (`perf.*`) with aliases
//! - JSON string escaping for `.json` targets
//! - Fallback defaults matching PowerShell engine
//! - Post-render validation (zero leftover `{{...}}` tokens)
//! - Atomic writes via `MoveFileExW` with exponential backoff
//! - SHA-256 skip-unchanged optimization
//! - Dry-run ledger generation

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;
use uuid::Uuid;

use crate::config::{RunnerError, RuntimeConfig};

#[cfg(windows)]
use windows::Win32::Storage::FileSystem::{
    MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
};
#[cfg(windows)]
use windows::core::PCWSTR;

// ---------------------------------------------------------------------------
// Token flattening
// ---------------------------------------------------------------------------

/// Recursively flatten a JSON value into a dot-notation token map.
///
/// - Object keys are joined with `.`
/// - Arrays are ignored (not flattened)
/// - Booleans → `"true"` / `"false"`
/// - Numbers → their `to_string()`
/// - Strings → their value
pub fn flatten_tokens(json: &serde_json::Value, prefix: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    flatten_inner(json, prefix, &mut map);
    map
}

fn flatten_inner(value: &serde_json::Value, key: &str, map: &mut HashMap<String, String>) {
    match value {
        serde_json::Value::Object(obj) => {
            for (k, v) in obj {
                let child_key = if key.is_empty() {
                    k.clone()
                } else {
                    format!("{}.{}", key, k)
                };
                flatten_inner(v, &child_key, map);
            }
        }
        serde_json::Value::Bool(b) => {
            map.insert(key.to_string(), if *b { "true".to_string() } else { "false".to_string() });
        }
        serde_json::Value::Number(n) => {
            map.insert(key.to_string(), n.to_string());
        }
        serde_json::Value::String(s) => {
            map.insert(key.to_string(), s.clone());
        }
        serde_json::Value::Null => {
            map.insert(key.to_string(), String::new());
        }
        // Arrays are skipped intentionally
        serde_json::Value::Array(_) => {}
    }
}

// ---------------------------------------------------------------------------
// Color computation
// ---------------------------------------------------------------------------

/// Parse a `#RRGGBB` hex color string into `(r, g, b)`.
fn parse_hex_color(hex: &str) -> Option<(u8, u8, u8)> {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some((r, g, b))
}

/// Alpha percentages that the PowerShell engine generates.
const ALPHA_PCTS: &[u32] = &[5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95];

/// Expand computed color variants for all `colors.*` entries in `tokens`.
///
/// For each `colors.<key>` with a `#RRGGBB` value, adds:
/// - `colors.<key>.rgb` → `rgb(r, g, b)`
/// - `colors.<key>_alpha<pct>` and `colors.<key>.alpha<pct>` → `rgba(r, g, b, 0.XX)`
/// - `colors.<key>_argb<pct>` → `#AARRGGBB`
pub fn expand_computed_tokens(tokens: &mut HashMap<String, String>) {
    let color_keys: Vec<(String, String)> = tokens
        .iter()
        .filter(|(k, v)| k.starts_with("colors.") && v.starts_with('#') && v.len() == 7)
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    for (key, hex) in color_keys {
        if let Some((r, g, b)) = parse_hex_color(&hex) {
            // .rgb variant
            tokens.insert(format!("{}.rgb", key), format!("rgb({}, {}, {})", r, g, b));

            // alpha / argb variants
            for &pct in ALPHA_PCTS {
                let alpha_f = pct as f64 / 100.0;
                let rgba_str = format!("rgba({}, {}, {}, {:.2})", r, g, b, alpha_f);
                // _alpha<pct> (underscore form)
                tokens.insert(format!("{}_alpha{}", key, pct), rgba_str.clone());
                // .alpha<pct> (dot form)
                tokens.insert(format!("{}.alpha{}", key, pct), rgba_str);

                // _argb<pct> → #AARRGGBB
                let aa = ((pct as f64 / 100.0) * 255.0).round() as u8;
                tokens.insert(
                    format!("{}_argb{}", key, pct),
                    format!("#{:02X}{:02X}{:02X}{:02X}", aa, r, g, b),
                );
                // Also dot form for argb
                tokens.insert(
                    format!("{}.argb{}", key, pct),
                    format!("#{:02X}{:02X}{:02X}{:02X}", aa, r, g, b),
                );
            }
        }
    }
}

/// Resolve `wallpaper.path` to an absolute Windows path and add `wallpaper.url_path`.
///
/// `state_root` is `%APPDATA%\komoyasb\` (or sandbox).
pub fn expand_wallpaper_tokens(tokens: &mut HashMap<String, String>, state_root: &Path) {
    if let Some(rel_path) = tokens.get("wallpaper.path").cloned() {
        // Build absolute path
        let abs = if Path::new(&rel_path).is_absolute() {
            PathBuf::from(&rel_path)
        } else {
            state_root.join(&rel_path)
        };
        let abs_str = abs.to_string_lossy().replace('/', "\\");
        tokens.insert("wallpaper.path".to_string(), abs_str.clone());

        // url_path uses forward slashes, URL-encoded space as %20
        let url_path = abs_str.replace('\\', "/").replace(' ', "%20");
        tokens.insert("wallpaper.url_path".to_string(), url_path);
    }
}

// ---------------------------------------------------------------------------
// Performance profile token merging
// ---------------------------------------------------------------------------

/// Merge the active performance profile into `tokens` under the `perf.` prefix
/// and add all required aliases.
pub fn expand_performance_tokens(
    tokens: &mut HashMap<String, String>,
    profile_name: &str,
    profile: &crate::config::PerformanceProfile,
) {
    // Flatten each sub-object with the appropriate prefix
    let sections: &[(&str, &serde_json::Value)] = &[
        ("komorebi", &profile.komorebi),
        ("yasb", &profile.yasb),
        ("dwm", &profile.dwm),
        ("launcher", &profile.launcher),
        ("flyout", &profile.flyout),
        ("os", &profile.os),
    ];

    for (section, value) in sections {
        let sub = flatten_tokens(value, &format!("perf.{}", section));
        tokens.extend(sub);
    }

    // Alias: perf.komorebi.unmanaged_behaviour -> perf.komorebi.unmanaged_window_operation_behaviour
    if let Some(v) = tokens.get("perf.komorebi.unmanaged_window_operation_behaviour").cloned() {
        tokens.insert("perf.komorebi.unmanaged_behaviour".to_string(), v);
    }

    // Alias: perf.flow.* -> perf.launcher.*
    let launcher_keys: Vec<(String, String)> = tokens
        .iter()
        .filter(|(k, _)| k.starts_with("perf.launcher."))
        .map(|(k, v)| {
            let flow_key = k.replacen("perf.launcher.", "perf.flow.", 1);
            (flow_key, v.clone())
        })
        .collect();
    tokens.extend(launcher_keys);

    // Alias: perf.yasb.transition_duration
    // If animation_duration_ms > 0, format as "${duration_s}s ease", otherwise "0s"
    if let Some(dur_ms_str) = tokens.get("perf.yasb.animation_duration_ms").cloned() {
        let dur_ms: u64 = dur_ms_str.parse().unwrap_or(0);
        let td = if dur_ms > 0 {
            format!("{:.3}s ease", dur_ms as f64 / 1000.0)
        } else {
            "0s".to_string()
        };
        tokens.insert("perf.yasb.transition_duration".to_string(), td);
    }

    // Store active profile name as a token
    tokens.insert("perf.active_profile".to_string(), profile_name.to_string());
}

// ---------------------------------------------------------------------------
// Fallback defaults
// ---------------------------------------------------------------------------

/// Apply authoritative fallback defaults for tokens that may be absent.
/// These match the defaults hard-coded in `TemplateEngine.psm1`.
fn apply_fallback_defaults(tokens: &mut HashMap<String, String>) {
    let defaults: &[(&str, &str)] = &[
        ("geometry.border_width", "2"),
        ("geometry.border_radius", "8"),
        ("geometry.window_gap", "8"),
        ("geometry.bar_height", "32"),
        ("colors.accent", "#7aa2f7"),
        ("colors.bg_primary", "#1a1b26"),
        ("colors.bg_secondary", "#16161e"),
        ("colors.fg_primary", "#c0caf5"),
        ("colors.border_active", "#7aa2f7"),
        ("colors.border_inactive", "#292e42"),
        ("typography.font_family", "JetBrainsMono Nerd Font"),
        ("typography.font_size_sm", "11px"),
        ("typography.font_size_md", "13px"),
        ("typography.font_size_lg", "16px"),
        ("opacity.bar", "0.88"),
        ("wallpaper.style", "Fill"),
        // Performance defaults (balanced)
        ("perf.komorebi.border_enabled", "true"),
        ("perf.komorebi.animation_enabled", "true"),
        ("perf.komorebi.animation_duration_ms", "150"),
        ("perf.yasb.blur_enabled", "true"),
        ("perf.yasb.transition_duration", "0.15s ease"),
    ];
    for (key, val) in defaults {
        tokens.entry(key.to_string()).or_insert_with(|| val.to_string());
    }
}

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

/// Render a template string by substituting `{{token}}` placeholders.
///
/// - `tokens`: the full merged token map.
/// - `is_json`: when `true`, values are escaped for JSON (backslash and quote).
///
/// Unknown tokens are replaced with an empty string (matching PowerShell engine behavior).
pub fn render_template(
    template_str: &str,
    tokens: &HashMap<String, String>,
    is_json: bool,
) -> String {
    // Simple iterative replacement; avoids regex dependency on critical path
    let mut result = template_str.to_string();
    // Collect all token keys so we process longest-first to avoid partial matches
    let mut keys: Vec<&str> = tokens.keys().map(|s| s.as_str()).collect();
    keys.sort_by_key(|k| std::cmp::Reverse(k.len()));

    // Build a list of replacements; iterate over result scanning for {{...}}
    result = replace_tokens(&result, tokens, is_json);
    result
}

/// Scan for `{{...}}` patterns and replace them. Unknown tokens → empty string.
fn replace_tokens(
    template: &str,
    tokens: &HashMap<String, String>,
    is_json: bool,
) -> String {
    let mut out = String::with_capacity(template.len());
    let bytes = template.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        // Look for '{{'
        if i + 1 < len && bytes[i] == b'{' && bytes[i + 1] == b'{' {
            // Find matching '}}'
            if let Some(end) = find_closing(bytes, i + 2) {
                let token_name = &template[i + 2..end];
                let value = tokens.get(token_name).map(|s| s.as_str()).unwrap_or("");
                if is_json {
                    out.push_str(&escape_json_value(value));
                } else {
                    out.push_str(value);
                }
                i = end + 2; // skip past '}}'
            } else {
                // No closing found — emit literally
                out.push(bytes[i] as char);
                i += 1;
            }
        } else {
            out.push(bytes[i] as char);
            i += 1;
        }
    }
    out
}

/// Find the position of `}}` starting from `start`.
fn find_closing(bytes: &[u8], start: usize) -> Option<usize> {
    let mut j = start;
    while j + 1 < bytes.len() {
        if bytes[j] == b'}' && bytes[j + 1] == b'}' {
            return Some(j);
        }
        j += 1;
    }
    None
}

/// Escape a string for embedding inside a JSON string value.
/// Only `\` → `\\` and `"` → `\"` are needed; the template engine does not
/// produce other control characters.
fn escape_json_value(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Validate that no `{{...}}` tokens remain in the rendered output.
pub fn validate_no_leftover_tokens(rendered: &str) -> Result<(), RunnerError> {
    if let Some(start) = rendered.find("{{") {
        if rendered[start..].find("}}").is_some() {
            // Extract up to 64 chars of context
            let snippet = &rendered[start..std::cmp::min(start + 64, rendered.len())];
            return Err(RunnerError::RenderError(format!(
                "Unrendered token found in output: {:?}",
                snippet
            )));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// SHA-256 helpers
// ---------------------------------------------------------------------------

/// Compute SHA-256 of `data`.
fn sha256_bytes(data: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

/// Compute SHA-256 of a file on disk, returning `None` if the file doesn't exist.
fn sha256_file(path: &Path) -> Option<Vec<u8>> {
    let data = std::fs::read(path).ok()?;
    Some(sha256_bytes(&data))
}

// ---------------------------------------------------------------------------
// Atomic write (Windows: MoveFileExW)
// ---------------------------------------------------------------------------

/// Write `data` to `dest` atomically using a `.tmp.<uuid>` staging file.
///
/// Uses `MoveFileExW(MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)` with
/// exponential backoff on `ERROR_SHARING_VIOLATION` (32).
fn atomic_write(dest: &Path, data: &[u8]) -> Result<(), RunnerError> {
    let tmp_name = format!("{}.tmp.{}", dest.display(), Uuid::new_v4());
    let tmp_path = PathBuf::from(&tmp_name);

    // Write to temp file
    std::fs::write(&tmp_path, data).map_err(|e| RunnerError::io(tmp_path.clone(), e))?;

    // Commit atomically
    let result = move_file_atomic(&tmp_path, dest);
    if result.is_err() {
        // Best-effort cleanup of temp file
        let _ = std::fs::remove_file(&tmp_path);
    }
    result
}

#[cfg(windows)]
fn move_file_atomic(src: &Path, dest: &Path) -> Result<(), RunnerError> {
    use std::os::windows::ffi::OsStrExt;

    fn to_wide_null(p: &Path) -> Vec<u16> {
        p.as_os_str().encode_wide().chain(Some(0)).collect()
    }

    let src_wide = to_wide_null(src);
    let dst_wide = to_wide_null(dest);
    let flags = MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH;

    const MAX_ATTEMPTS: u32 = 7;
    const BASE_DELAY_MS: u64 = 10;
    const ERROR_SHARING_VIOLATION: u32 = 32;

    for attempt in 0..MAX_ATTEMPTS {
        let res = unsafe {
            MoveFileExW(
                PCWSTR(src_wide.as_ptr()),
                PCWSTR(dst_wide.as_ptr()),
                flags,
            )
        };

        if res.is_ok() {
            return Ok(());
        }

        // Check if it is a sharing violation
        let err = unsafe { windows::Win32::Foundation::GetLastError() };
        if err.0 != ERROR_SHARING_VIOLATION || attempt == MAX_ATTEMPTS - 1 {
            return Err(RunnerError::AtomicWrite {
                path: dest.to_path_buf(),
                message: format!("MoveFileExW failed: {:?}", err),
            });
        }

        // Exponential backoff
        let delay_ms = BASE_DELAY_MS * (1u64 << attempt);
        std::thread::sleep(Duration::from_millis(delay_ms));
    }

    Err(RunnerError::AtomicWrite {
        path: dest.to_path_buf(),
        message: "MoveFileExW: max retries exceeded".to_string(),
    })
}

#[cfg(not(windows))]
fn move_file_atomic(src: &Path, dest: &Path) -> Result<(), RunnerError> {
    // On non-Windows (e.g. CI lint/check): use rename which is atomic on POSIX
    std::fs::rename(src, dest).map_err(|e| RunnerError::AtomicWrite {
        path: dest.to_path_buf(),
        message: format!("rename: {}", e),
    })
}

// ---------------------------------------------------------------------------
// Sync report & ledger
// ---------------------------------------------------------------------------

/// Per-file outcome of a sync operation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum SyncStatus {
    /// File was written (content changed or new).
    Written,
    /// File was skipped because content hash was identical.
    Unchanged,
    /// Dry-run: would write but didn't.
    DryRunWrite,
    /// An error occurred.
    Error(String),
}

/// Per-file sync record.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSyncRecord {
    pub path: PathBuf,
    pub status: SyncStatus,
    pub sha256_new: Option<String>,
    pub sha256_old: Option<String>,
}

/// Report returned by `sync_all_templates`.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct SyncReport {
    pub files: Vec<FileSyncRecord>,
    pub dry_run: bool,
    /// Number of files actually written (or would-write in dry-run).
    pub rendered: usize,
    /// Number of files skipped (content unchanged).
    pub skipped: usize,
    /// Number of file processing errors.
    pub errors: usize,
}

/// A dry-run ledger entry.
#[derive(Debug, Serialize, Deserialize)]
pub struct LedgerEntry {
    pub action: String,
    pub path: PathBuf,
    pub sha256_rendered: Option<String>,
    pub sha256_existing: Option<String>,
    pub would_change: bool,
}

/// A complete dry-run ledger.
#[derive(Debug, Serialize, Deserialize)]
pub struct DryRunLedger {
    pub run_id: String,
    pub timestamp: String,
    pub theme: String,
    pub profile: String,
    pub entries: Vec<LedgerEntry>,
}

// ---------------------------------------------------------------------------
// Template scanning helpers
// ---------------------------------------------------------------------------

/// Scan a directory tree for `*.template` files.
fn find_templates(root: &Path) -> Vec<PathBuf> {
    let mut templates = Vec::new();
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                templates.extend(find_templates(&path));
            } else if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.ends_with(".template") {
                    templates.push(path);
                }
            }
        }
    }
    templates
}

/// Derive the output path from a template path by stripping `.template`.
fn output_path_for_template(template_path: &Path) -> PathBuf {
    let stem = template_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .strip_suffix(".template")
        .unwrap_or("");
    template_path.with_file_name(stem)
}

// ---------------------------------------------------------------------------
// Main sync entry point
// ---------------------------------------------------------------------------

/// Build the full merged token map for a `RuntimeConfig`.
pub fn build_token_map(state: &RuntimeConfig) -> HashMap<String, String> {
    let mut tokens = flatten_tokens(&state.theme_json, "");
    expand_computed_tokens(&mut tokens);
    expand_wallpaper_tokens(&mut tokens, &state.state_root);
    expand_performance_tokens(&mut tokens, &state.profile_name, &state.profile);
    apply_fallback_defaults(&mut tokens);
    tokens
}

/// Render all `*.template` files found under `state.paths.state_root` to their
/// corresponding output files, using SHA-256 skip-unchanged and atomic writes.
///
/// When `dry_run` is `true`, no host files are modified; a `ledger.json` is written
/// to the sandbox directory (or state_root if sandbox is None).
pub fn sync_all_templates(
    state: &RuntimeConfig,
    dry_run: bool,
    sandbox: Option<&Path>,
) -> Result<SyncReport, RunnerError> {
    let token_map = build_token_map(state);
    let scan_root = sandbox.unwrap_or(&state.state_root);

    let templates = find_templates(scan_root);
    let mut report = SyncReport {
        dry_run,
        ..Default::default()
    };
    let mut ledger_entries: Vec<LedgerEntry> = Vec::new();

    for tmpl_path in &templates {
        let out_path = output_path_for_template(tmpl_path);
        let is_json = out_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e == "json")
            .unwrap_or(false);

        // Read template
        let template_str = match std::fs::read_to_string(tmpl_path) {
            Ok(s) => s,
            Err(e) => {
                report.files.push(FileSyncRecord {
                    path: out_path.clone(),
                    status: SyncStatus::Error(format!("read template: {}", e)),
                    sha256_new: None,
                    sha256_old: None,
                });
                continue;
            }
        };

        // Render
        let rendered = render_template(&template_str, &token_map, is_json);

        // Validate no leftover tokens
        if let Err(e) = validate_no_leftover_tokens(&rendered) {
            report.files.push(FileSyncRecord {
                path: out_path.clone(),
                status: SyncStatus::Error(e.to_string()),
                sha256_new: None,
                sha256_old: None,
            });
            continue;
        }

        let rendered_bytes = rendered.as_bytes();
        let sha_new_bytes = sha256_bytes(rendered_bytes);
        let sha_new_hex = hex_encode(&sha_new_bytes);
        let sha_old = sha256_file(&out_path);
        let sha_old_hex = sha_old.as_ref().map(|b| hex_encode(b));

        // Skip-unchanged check
        if sha_old.as_deref() == Some(&sha_new_bytes) {
            report.files.push(FileSyncRecord {
                path: out_path.clone(),
                status: SyncStatus::Unchanged,
                sha256_new: Some(sha_new_hex.clone()),
                sha256_old: sha_old_hex.clone(),
            });
            if dry_run {
                ledger_entries.push(LedgerEntry {
                    action: "skip-unchanged".to_string(),
                    path: out_path,
                    sha256_rendered: Some(sha_new_hex),
                    sha256_existing: sha_old_hex,
                    would_change: false,
                });
            }
            continue;
        }

        if dry_run {
            ledger_entries.push(LedgerEntry {
                action: "write".to_string(),
                path: out_path.clone(),
                sha256_rendered: Some(sha_new_hex.clone()),
                sha256_existing: sha_old_hex.clone(),
                would_change: true,
            });
            report.files.push(FileSyncRecord {
                path: out_path,
                status: SyncStatus::DryRunWrite,
                sha256_new: Some(sha_new_hex),
                sha256_old: sha_old_hex,
            });
        } else {
            // Ensure parent directory exists
            if let Some(parent) = out_path.parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    report.files.push(FileSyncRecord {
                        path: out_path.clone(),
                        status: SyncStatus::Error(format!("create_dir_all: {}", e)),
                        sha256_new: Some(sha_new_hex),
                        sha256_old: sha_old_hex,
                    });
                    continue;
                }
            }
            match atomic_write(&out_path, rendered_bytes) {
                Ok(()) => {
                    report.files.push(FileSyncRecord {
                        path: out_path,
                        status: SyncStatus::Written,
                        sha256_new: Some(sha_new_hex),
                        sha256_old: sha_old_hex,
                    });
                }
                Err(e) => {
                    report.files.push(FileSyncRecord {
                        path: out_path,
                        status: SyncStatus::Error(e.to_string()),
                        sha256_new: Some(sha_new_hex),
                        sha256_old: sha_old_hex,
                    });
                }
            }
        }
    }

    // Write ledger.json in dry-run mode
    if dry_run {
        let ledger_root = sandbox.unwrap_or(&state.state_root);
        let ledger = DryRunLedger {
            run_id: Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            theme: state.theme_name.clone(),
            profile: state.profile_name.clone(),
            entries: ledger_entries,
        };
        let ledger_path = ledger_root.join("ledger.json");
        let ledger_json = serde_json::to_string_pretty(&ledger)
            .map_err(|e| RunnerError::json(ledger_path.clone(), e))?;
        if let Some(parent) = ledger_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| RunnerError::io(parent.to_path_buf(), e))?;
        }
        std::fs::write(&ledger_path, ledger_json)
            .map_err(|e| RunnerError::io(ledger_path, e))?;
    }

    report.rendered = report
        .files
        .iter()
        .filter(|r| matches!(r.status, SyncStatus::Written | SyncStatus::DryRunWrite))
        .count();
    report.skipped = report
        .files
        .iter()
        .filter(|r| matches!(r.status, SyncStatus::Unchanged))
        .count();
    report.errors = report
        .files
        .iter()
        .filter(|r| matches!(r.status, SyncStatus::Error(_)))
        .count();

    Ok(report)
}

/// Hex-encode a byte slice.
fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::TempDir;

    // ---- flatten_tokens ----

    #[test]
    fn test_flatten_simple() {
        let json = serde_json::json!({ "a": 1, "b": "hello", "c": true });
        let m = flatten_tokens(&json, "");
        assert_eq!(m["a"], "1");
        assert_eq!(m["b"], "hello");
        assert_eq!(m["c"], "true");
    }

    #[test]
    fn test_flatten_nested() {
        let json = serde_json::json!({ "colors": { "accent": "#7aa2f7" } });
        let m = flatten_tokens(&json, "");
        assert_eq!(m["colors.accent"], "#7aa2f7");
    }

    #[test]
    fn test_flatten_with_prefix() {
        let json = serde_json::json!({ "x": 42 });
        let m = flatten_tokens(&json, "perf.komorebi");
        assert_eq!(m["perf.komorebi.x"], "42");
    }

    // ---- color expansion ----

    #[test]
    fn test_expand_rgb_variant() {
        let mut tokens = HashMap::new();
        tokens.insert("colors.accent".to_string(), "#7aa2f7".to_string());
        expand_computed_tokens(&mut tokens);
        assert_eq!(tokens["colors.accent.rgb"], "rgb(122, 162, 247)");
    }

    #[test]
    fn test_expand_alpha_variants() {
        let mut tokens = HashMap::new();
        tokens.insert("colors.accent".to_string(), "#7aa2f7".to_string());
        expand_computed_tokens(&mut tokens);
        // Both underscore and dot forms
        assert!(tokens.contains_key("colors.accent_alpha50"));
        assert!(tokens.contains_key("colors.accent.alpha50"));
        assert!(tokens.contains_key("colors.accent_argb50"));
        assert!(tokens.contains_key("colors.accent.argb50"));
        // Value check: rgba(122, 162, 247, 0.50)
        assert_eq!(tokens["colors.accent_alpha50"], "rgba(122, 162, 247, 0.50)");
    }

    #[test]
    fn test_expand_argb() {
        let mut tokens = HashMap::new();
        tokens.insert("colors.bg".to_string(), "#1a1b26".to_string());
        expand_computed_tokens(&mut tokens);
        // 50% = 128 (0x80)
        let argb50 = &tokens["colors.bg_argb50"];
        assert!(argb50.starts_with('#'));
        assert_eq!(argb50.len(), 9); // #AARRGGBB
    }

    #[test]
    fn test_no_expansion_for_non_color_keys() {
        let mut tokens = HashMap::new();
        tokens.insert("typography.font_family".to_string(), "#NotAColor".to_string());
        expand_computed_tokens(&mut tokens);
        // Should not add .rgb for non-colors.* keys
        assert!(!tokens.contains_key("typography.font_family.rgb"));
    }

    // ---- render_template ----

    #[test]
    fn test_render_basic() {
        let mut tokens = HashMap::new();
        tokens.insert("colors.accent".to_string(), "#7aa2f7".to_string());
        let result = render_template("color: {{colors.accent}};", &tokens, false);
        assert_eq!(result, "color: #7aa2f7;");
    }

    #[test]
    fn test_render_unknown_token_empty() {
        let tokens = HashMap::new();
        let result = render_template("{{unknown.token}}", &tokens, false);
        assert_eq!(result, "");
    }

    #[test]
    fn test_render_json_escaping() {
        let mut tokens = HashMap::new();
        tokens.insert("path.value".to_string(), r#"C:\Users\"test""#.to_string());
        let result = render_template(r#"{"path": "{{path.value}}"}"#, &tokens, true);
        assert!(result.contains(r#"C:\\Users\\"#), "backslash should be escaped");
        assert!(result.contains(r#"\""#), "quote should be escaped");
    }

    #[test]
    fn test_render_no_leftover_tokens() {
        let tokens = HashMap::new();
        let rendered = render_template("hello {{name}}", &tokens, false);
        // name is unknown → replaced with empty string → no leftover
        assert!(validate_no_leftover_tokens(&rendered).is_ok());
    }

    #[test]
    fn test_validate_leftover_detection() {
        // Simulate a template where }} is missing (literal {{token}} survived)
        let rendered = "prefix {{broken}";
        // find }} missing → shouldn't trigger error (no closing }} means it was treated literally)
        // But a valid {{token}} with no replacement should produce empty string, not leftover
        // This test verifies the validator itself with a manually crafted string
        let with_leftover = "text {{leftover}} end";
        assert!(validate_no_leftover_tokens(with_leftover).is_err());
    }

    // ---- SHA-256 ----

    #[test]
    fn test_sha256_deterministic() {
        let a = sha256_bytes(b"hello world");
        let b = sha256_bytes(b"hello world");
        assert_eq!(a, b);
    }

    // ---- atomic write ----

    #[test]
    fn test_atomic_write_creates_file() {
        let tmp = TempDir::new().unwrap();
        let dest = tmp.path().join("output.txt");
        atomic_write(&dest, b"hello").unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), b"hello");
    }

    #[test]
    fn test_atomic_write_overwrites() {
        let tmp = TempDir::new().unwrap();
        let dest = tmp.path().join("output.txt");
        std::fs::write(&dest, b"old").unwrap();
        atomic_write(&dest, b"new").unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), b"new");
    }

    // ---- dry-run isolation ----

    #[test]
    fn test_dry_run_does_not_write_outputs() {
        use crate::config::{PerformanceProfile, RuntimeConfig, RuntimePaths};

        let tmp = TempDir::new().unwrap();

        // Set up minimal state tree
        let themes_dir = tmp.path().join("themes");
        std::fs::create_dir_all(&themes_dir).unwrap();
        let dark_theme = serde_json::json!({
            "name": "dark", "variant": "dark",
            "colors": { "accent": "#7aa2f7" },
            "typography": { "font_family": "Mono" },
            "geometry": { "bar_height": 32 },
            "opacity": { "bar": 0.88 },
            "wallpaper": { "path": "configs/polish/wallpapers/dark.png", "style": "Fill" }
        });
        std::fs::write(
            themes_dir.join("dark.json"),
            serde_json::to_string_pretty(&dark_theme).unwrap(),
        )
        .unwrap();

        // Write a template
        let configs_dir = tmp.path().join("configs").join("komorebi");
        std::fs::create_dir_all(&configs_dir).unwrap();
        let tmpl_path = configs_dir.join("komorebi.json.template");
        std::fs::write(&tmpl_path, r#"{"accent": "{{colors.accent}}"}"#).unwrap();

        let paths = RuntimePaths {
            komorebi_json: configs_dir.join("komorebi.json"),
            whkdrc: configs_dir.join("whkdrc"),
            yasb_config: tmp.path().join("configs").join("yasb").join("config.yaml"),
            yasb_styles: tmp.path().join("configs").join("yasb").join("styles.css"),
            flow_settings: tmp.path().join("flow_settings.json"),
            flow_theme: tmp.path().join("flow_theme.json"),
        };

        let profile = PerformanceProfile {
            komorebi: serde_json::json!({ "animation_enabled": true, "animation_duration_ms": 150, "border_enabled": true, "unmanaged_window_operation_behaviour": "Op" }),
            yasb: serde_json::json!({ "blur_enabled": true, "animation_duration_ms": 150 }),
            dwm: serde_json::json!({}),
            launcher: serde_json::json!({}),
            flyout: serde_json::json!({}),
            os: serde_json::json!({}),
        };

        let state = RuntimeConfig {
            paths: paths.clone(),
            state_root: tmp.path().to_path_buf(),
            theme_json: dark_theme,
            theme_name: "dark".to_string(),
            profile_name: "balanced".to_string(),
            profile,
        };

        let sandbox = TempDir::new().unwrap();
        // Copy template to sandbox too so it's found
        let sb_configs = sandbox.path().join("configs").join("komorebi");
        std::fs::create_dir_all(&sb_configs).unwrap();
        std::fs::copy(&tmpl_path, sb_configs.join("komorebi.json.template")).unwrap();

        let report = sync_all_templates(&state, true, Some(sandbox.path())).unwrap();
        assert!(report.dry_run);

        // ledger.json should exist in sandbox
        let ledger_path = sandbox.path().join("ledger.json");
        assert!(ledger_path.exists(), "ledger.json should be created in sandbox");

        // The output file must NOT exist in original state root
        let orig_out = configs_dir.join("komorebi.json");
        assert!(!orig_out.exists(), "dry-run must not write to live paths");

        // The ledger should contain the entry
        let ledger_text = std::fs::read_to_string(&ledger_path).unwrap();
        let ledger: DryRunLedger = serde_json::from_str(&ledger_text).unwrap();
        assert!(!ledger.run_id.is_empty());
    }

    // ---- performance profile tokens ----

    #[test]
    fn test_perf_unmanaged_alias() {
        use crate::config::PerformanceProfile;

        let profile = PerformanceProfile {
            komorebi: serde_json::json!({ "unmanaged_window_operation_behaviour": "Op" }),
            yasb: serde_json::json!({ "animation_duration_ms": 150 }),
            dwm: serde_json::json!({}),
            launcher: serde_json::json!({}),
            flyout: serde_json::json!({}),
            os: serde_json::json!({}),
        };
        let mut tokens = HashMap::new();
        expand_performance_tokens(&mut tokens, "balanced", &profile);
        // Alias must exist
        assert_eq!(tokens["perf.komorebi.unmanaged_behaviour"], "Op");
    }

    #[test]
    fn test_perf_flow_alias() {
        use crate::config::PerformanceProfile;

        let profile = PerformanceProfile {
            komorebi: serde_json::json!({}),
            yasb: serde_json::json!({ "animation_duration_ms": 150 }),
            dwm: serde_json::json!({}),
            launcher: serde_json::json!({ "use_animation": true, "animation_speed": "Fast" }),
            flyout: serde_json::json!({}),
            os: serde_json::json!({}),
        };
        let mut tokens = HashMap::new();
        expand_performance_tokens(&mut tokens, "balanced", &profile);
        // perf.flow.* must mirror perf.launcher.*
        assert_eq!(tokens["perf.flow.use_animation"], "true");
        assert_eq!(tokens["perf.flow.animation_speed"], "Fast");
    }

    #[test]
    fn test_perf_transition_duration_non_zero() {
        use crate::config::PerformanceProfile;

        let profile = PerformanceProfile {
            komorebi: serde_json::json!({}),
            yasb: serde_json::json!({ "animation_duration_ms": 250 }),
            dwm: serde_json::json!({}),
            launcher: serde_json::json!({}),
            flyout: serde_json::json!({}),
            os: serde_json::json!({}),
        };
        let mut tokens = HashMap::new();
        expand_performance_tokens(&mut tokens, "visual-rich", &profile);
        assert_eq!(tokens["perf.yasb.transition_duration"], "0.250s ease");
    }

    #[test]
    fn test_perf_transition_duration_zero() {
        use crate::config::PerformanceProfile;

        let profile = PerformanceProfile {
            komorebi: serde_json::json!({}),
            yasb: serde_json::json!({ "animation_duration_ms": 0 }),
            dwm: serde_json::json!({}),
            launcher: serde_json::json!({}),
            flyout: serde_json::json!({}),
            os: serde_json::json!({}),
        };
        let mut tokens = HashMap::new();
        expand_performance_tokens(&mut tokens, "ultra-low", &profile);
        assert_eq!(tokens["perf.yasb.transition_duration"], "0s");
    }

    #[test]
    fn test_wallpaper_url_path() {
        let tmp = TempDir::new().unwrap();
        let mut tokens = HashMap::new();
        tokens.insert(
            "wallpaper.path".to_string(),
            "configs/polish/wallpapers/dark.png".to_string(),
        );
        expand_wallpaper_tokens(&mut tokens, tmp.path());
        let url = &tokens["wallpaper.url_path"];
        assert!(url.contains('/'), "url_path should use forward slashes");
        assert!(!url.contains('\\'), "url_path must not contain backslashes");
    }
}
