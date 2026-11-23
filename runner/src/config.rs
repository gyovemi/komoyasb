// runner/src/config.rs
//! Configuration state resolution, path management, and loaders for themes and performance profiles.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use thiserror::Error;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/// All errors produced by the runner.
#[derive(Debug, Error)]
pub enum RunnerError {
    #[error("I/O error: {0}")]
    Io(String),

    #[error("JSON error: {0}")]
    Json(String),

    #[error("YAML error: {0}")]
    Yaml(String),

    #[error("CLI error: {0}")]
    Cli(String),

    #[error("Process error: {0}")]
    Process(String),

    #[error("Performance profile not found: {0}")]
    ProfileNotFound(String),

    #[error("Theme not found: {0}")]
    ThemeNotFound(String),

    #[error("Win32 error: {0}")]
    Win32(String),

    #[error("Template rendering error: {0}")]
    RenderError(String),

    #[error("Atomic write failed for {path}: {message}")]
    AtomicWrite { path: PathBuf, message: String },

    #[error("Path traversal detected in: {0}")]
    PathTraversal(String),

    #[error("{0}")]
    Other(String),
}

impl RunnerError {
    /// Convenience constructor for I/O errors with a path.
    pub fn io_path(path: impl AsRef<Path>, source: std::io::Error) -> Self {
        Self::Io(format!("{}: {}", path.as_ref().display(), source))
    }

    /// Convenience constructor for JSON errors with a path.
    pub fn json_path(path: impl AsRef<Path>, source: serde_json::Error) -> Self {
        Self::Json(format!("{}: {}", path.as_ref().display(), source))
    }

    /// Alias for io_path.
    pub fn io(path: impl AsRef<Path>, source: std::io::Error) -> Self {
        Self::io_path(path, source)
    }

    /// Alias for json_path.
    pub fn json(path: impl AsRef<Path>, source: serde_json::Error) -> Self {
        Self::json_path(path, source)
    }
}

// ---------------------------------------------------------------------------
// Resolved runtime paths
// ---------------------------------------------------------------------------

/// Resolved absolute paths for all managed service configuration files.
///
/// When sandbox root is used (via `UI_SANDBOX_DIR` or `--dry-run`), all paths
/// are rooted under that sandbox directory instead of `%APPDATA%\komoyasb\`.
#[derive(Debug, Clone)]
pub struct RuntimePaths {
    /// Komorebi window manager configuration JSON.
    pub komorebi_json: PathBuf,

    /// WHKD keybinding daemon configuration.
    pub whkdrc: PathBuf,

    /// YASB status bar YAML configuration.
    pub yasb_config: PathBuf,

    /// YASB status bar CSS styles.
    pub yasb_styles: PathBuf,

    /// Flow Launcher settings JSON.
    pub flow_settings: PathBuf,

    /// Flow Launcher theme JSON.
    pub flow_theme: PathBuf,
}

/// Resolve all runtime paths.
///
/// - If `sandbox_root` argument is provided, it overrides everything.
/// - Else if `UI_SANDBOX_DIR` environment variable is set, it overrides the base.
/// - Otherwise resolves to `%APPDATA%\komoyasb\`.
pub fn resolve_runtime_paths(sandbox_root: Option<&Path>) -> Result<RuntimePaths, RunnerError> {
    let state_root = effective_state_root(sandbox_root)?;

    let paths = RuntimePaths {
        komorebi_json: state_root.join("configs").join("komorebi").join("komorebi.json"),
        whkdrc: state_root.join("configs").join("komorebi").join("whkdrc"),
        yasb_config: state_root.join("configs").join("yasb").join("config.yaml"),
        yasb_styles: state_root.join("configs").join("yasb").join("styles.css"),
        flow_settings: resolve_flow_launcher_settings(),
        flow_theme: resolve_flow_launcher_theme(&state_root),
    };

    Ok(paths)
}

/// Determine the effective state root directory.
pub fn effective_state_root(sandbox_root: Option<&Path>) -> Result<PathBuf, RunnerError> {
    if let Some(sb) = sandbox_root {
        return Ok(sb.to_path_buf());
    }
    if let Ok(sb_env) = std::env::var("UI_SANDBOX_DIR") {
        return Ok(PathBuf::from(sb_env));
    }
    let appdata = std::env::var("APPDATA")
        .map_err(|e| RunnerError::Io(format!("APPDATA env var missing: {}", e)))?;
    Ok(PathBuf::from(appdata).join("komoyasb"))
}

/// Attempt to find Flow Launcher's user data settings.json.
fn resolve_flow_launcher_settings() -> PathBuf {
    // Flow Launcher stores config in %APPDATA%\FlowLauncher\Settings\Settings.json
    if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata)
            .join("FlowLauncher")
            .join("Settings")
            .join("Settings.json")
    } else {
        PathBuf::from(r"C:\Users\Public\AppData\Roaming\FlowLauncher\Settings\Settings.json")
    }
}

/// Resolve the Flow Launcher theme JSON path within the state root.
fn resolve_flow_launcher_theme(state_root: &Path) -> PathBuf {
    // We store a generated Flow Launcher theme inside our config tree
    state_root
        .join("configs")
        .join("flow")
        .join("komoyasb.json")
}

// ---------------------------------------------------------------------------
// Theme loading
// ---------------------------------------------------------------------------

/// A parsed theme token map (flattened key -> value).
/// The actual flattening happens in `render.rs`.
pub type ThemeMap = HashMap<String, String>;

/// Load and return the raw JSON `Value` for the named theme.
///
/// `theme_name` can be `"dark"`, `"light"`, or an absolute file path.
pub fn load_theme_json(
    state_root: &Path,
    theme_name: &str,
) -> Result<serde_json::Value, RunnerError> {
    let path: PathBuf = if theme_name == "dark" || theme_name == "light" {
        state_root.join("themes").join(format!("{}.json", theme_name))
    } else {
        // Treat as absolute/relative path; guard against traversal
        let candidate = PathBuf::from(theme_name);
        guard_traversal(candidate.to_str().unwrap_or(""))?;
        candidate
    };

    let content = std::fs::read_to_string(&path)
        .map_err(|e| RunnerError::io_path(&path, e))?;
    let value: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| RunnerError::json_path(&path, e))?;
    Ok(value)
}

// ---------------------------------------------------------------------------
// Performance profile loading
// ---------------------------------------------------------------------------

/// A single performance profile (one of the four presets).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceProfile {
    #[serde(default)]
    pub komorebi: serde_json::Value,
    #[serde(default)]
    pub yasb: serde_json::Value,
    #[serde(default)]
    pub dwm: serde_json::Value,
    #[serde(default)]
    pub launcher: serde_json::Value,
    #[serde(default)]
    pub flyout: serde_json::Value,
    #[serde(default)]
    pub os: serde_json::Value,
}

/// Top-level structure of `performance.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceConfig {
    pub active_profile: String,
    pub profiles: HashMap<String, PerformanceProfile>,
}

/// Load `performance.json` from the state root.
pub fn load_performance_config(state_root: &Path) -> Result<PerformanceConfig, RunnerError> {
    let path = state_root.join("performance.json");
    let content = std::fs::read_to_string(&path)
        .map_err(|e| RunnerError::io_path(&path, e))?;
    let cfg: PerformanceConfig = serde_json::from_str(&content)
        .map_err(|e| RunnerError::json_path(&path, e))?;
    Ok(cfg)
}

/// Retrieve the active (or named) performance profile from the config.
pub fn get_active_profile<'a>(
    cfg: &'a PerformanceConfig,
    profile_override: Option<&str>,
) -> Result<(&'a str, &'a PerformanceProfile), RunnerError> {
    let name = profile_override.unwrap_or(&cfg.active_profile);
    let profile = cfg
        .profiles
        .get(name)
        .ok_or_else(|| RunnerError::ProfileNotFound(name.to_string()))?;
    Ok((name, profile))
}

// ---------------------------------------------------------------------------
// RuntimeConfig – aggregate config passed to the renderer
// ---------------------------------------------------------------------------

/// Aggregate runtime configuration that the template renderer consumes.
#[derive(Debug, Clone)]
pub struct RuntimeConfig {
    /// Resolved filesystem paths.
    pub paths: RuntimePaths,
    /// The effective state root (may differ from %APPDATA% in sandbox mode).
    pub state_root: PathBuf,
    /// Raw theme JSON value.
    pub theme_json: serde_json::Value,
    /// Name of the active theme (`"dark"` or `"light"`).
    pub theme_name: String,
    /// Active performance profile name.
    pub profile_name: String,
    /// Active performance profile data.
    pub profile: PerformanceProfile,
}

impl RuntimeConfig {
    /// Construct a `RuntimeConfig` by loading theme and performance from disk.
    ///
    /// - `theme_override`: optional theme name (`"dark"`, `"light"`, or path)
    /// - `profile_override`: optional profile name
    /// - `sandbox_root`: optional sandbox directory (overrides %APPDATA%)
    pub fn load(
        theme_override: Option<&str>,
        profile_override: Option<&str>,
        sandbox_root: Option<&Path>,
    ) -> Result<Self, RunnerError> {
        let state_root = effective_state_root(sandbox_root)?;
        let paths = resolve_runtime_paths(sandbox_root)?;

        // Determine theme name
        let theme_name = theme_override.unwrap_or("dark").to_string();

        let theme_json = load_theme_json(&state_root, &theme_name)?;
        let perf_cfg = load_performance_config(&state_root)?;
        let (profile_name, profile) = get_active_profile(&perf_cfg, profile_override)?;

        Ok(Self {
            paths,
            state_root,
            theme_json,
            theme_name,
            profile_name: profile_name.to_string(),
            profile: profile.clone(),
        })
    }
}

// ---------------------------------------------------------------------------
// Safety utilities
// ---------------------------------------------------------------------------

/// Return an error if `path_str` contains any `..` path traversal sequence.
pub fn guard_traversal(path_str: &str) -> Result<(), RunnerError> {
    let path = Path::new(path_str);
    for component in path.components() {
        if component == std::path::Component::ParentDir {
            return Err(RunnerError::PathTraversal(path_str.to_string()));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write_perf_json(dir: &Path) {
        // Write the real embedded performance.json
        let perf = include_str!("../performance.json");
        std::fs::write(dir.join("performance.json"), perf).unwrap();
    }

    fn write_dark_theme(dir: &Path) {
        let themes_dir = dir.join("themes");
        std::fs::create_dir_all(&themes_dir).unwrap();
        let dark_theme = serde_json::json!({
            "name": "Test Dark",
            "variant": "dark",
            "colors": { "accent": "#7aa2f7", "bg_primary": "#1a1b26" },
            "typography": { "font_family": "JetBrains Mono" },
            "geometry": { "bar_height": 32 },
            "opacity": { "bar": 0.88 },
            "wallpaper": { "path": "configs/polish/wallpapers/dark.png", "style": "Fill" }
        });
        std::fs::write(
            themes_dir.join("dark.json"),
            serde_json::to_string_pretty(&dark_theme).unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn test_resolve_runtime_paths_sandbox() {
        let tmp = TempDir::new().unwrap();
        let paths = resolve_runtime_paths(Some(tmp.path())).unwrap();
        assert!(paths.komorebi_json.starts_with(tmp.path()));
        assert!(paths.whkdrc.starts_with(tmp.path()));
        assert!(paths.yasb_config.starts_with(tmp.path()));
    }

    #[test]
    fn test_guard_traversal_ok() {
        assert!(guard_traversal("configs/komorebi/komorebi.json").is_ok());
    }

    #[test]
    fn test_guard_traversal_reject() {
        assert!(guard_traversal("../../etc/passwd").is_err());
    }

    #[test]
    fn test_load_theme_dark() {
        let tmp = TempDir::new().unwrap();
        write_dark_theme(tmp.path());
        let val = load_theme_json(tmp.path(), "dark").unwrap();
        assert_eq!(val["variant"].as_str().unwrap(), "dark");
    }

    #[test]
    fn test_load_perf_all_profiles() {
        let tmp = TempDir::new().unwrap();
        write_perf_json(tmp.path());
        let cfg = load_performance_config(tmp.path()).unwrap();
        for name in &["ultra-low", "balanced", "visual-rich", "gaming"] {
            assert!(
                cfg.profiles.contains_key(*name),
                "missing profile: {}",
                name
            );
        }
    }

    #[test]
    fn test_active_profile_override_all() {
        let tmp = TempDir::new().unwrap();
        write_perf_json(tmp.path());
        let cfg = load_performance_config(tmp.path()).unwrap();
        for name in &["ultra-low", "balanced", "visual-rich", "gaming"] {
            let (pname, _profile) = get_active_profile(&cfg, Some(name)).unwrap();
            assert_eq!(pname, *name);
        }
    }

    #[test]
    fn test_profile_not_found_error() {
        let tmp = TempDir::new().unwrap();
        write_perf_json(tmp.path());
        let cfg = load_performance_config(tmp.path()).unwrap();
        let result = get_active_profile(&cfg, Some("does-not-exist"));
        assert!(matches!(result, Err(RunnerError::ProfileNotFound(_))));
    }

    #[test]
    fn test_runtime_config_load_via_sandbox() {
        let tmp = TempDir::new().unwrap();
        write_dark_theme(tmp.path());
        write_perf_json(tmp.path());
        let cfg = RuntimeConfig::load(Some("dark"), Some("balanced"), Some(tmp.path())).unwrap();
        assert_eq!(cfg.theme_name, "dark");
        assert_eq!(cfg.profile_name, "balanced");
        assert_eq!(cfg.state_root, tmp.path());
    }

    #[test]
    fn test_all_four_perf_profiles_load() {
        let tmp = TempDir::new().unwrap();
        write_dark_theme(tmp.path());
        write_perf_json(tmp.path());
        for profile in &["ultra-low", "balanced", "visual-rich", "gaming"] {
            let cfg = RuntimeConfig::load(Some("dark"), Some(profile), Some(tmp.path())).unwrap();
            assert_eq!(cfg.profile_name, *profile);
        }
    }
}
