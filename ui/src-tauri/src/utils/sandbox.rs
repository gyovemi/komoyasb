//! Virtual sandbox isolation and path remapping for dry-run evaluations.
//!
//! Intercepts filesystem reads and writes when `UI_SANDBOX_DIR` is set or during
//! dry-run provisioning simulations, projecting configuration targets into an isolated
//! shadow directory structure to maintain host system safety.

use std::path::{Path, PathBuf};
use std::fs;
use crate::error::AppError;

/// Runtime context tracking whether sandbox isolation is active and remapping targets.
#[derive(Debug, Clone)]
pub struct SandboxContext {
    /// Whether virtual sandboxing is currently active.
    pub is_sandboxed: bool,
    /// Root path of the sandbox shadow filesystem if configured.
    pub sandbox_path: Option<PathBuf>,
    /// Base repository directory of the live non-sandboxed environment.
    pub live_working_dir: PathBuf,
}

impl SandboxContext {
    /// Creates a new `SandboxContext` inspecting `UI_SANDBOX_DIR` environment override.
    ///
    /// # Arguments
    ///
    /// * `live_working_dir` - Live repository directory to associate with this context.
    ///
    /// # Returns
    ///
    /// Configured [`SandboxContext`] with isolation enabled if `UI_SANDBOX_DIR` is present.
    pub fn new(live_working_dir: PathBuf) -> Self {
        let sandbox_env = std::env::var("UI_SANDBOX_DIR").ok().filter(|s| !s.trim().is_empty());
        match sandbox_env {
            Some(dir_str) => {
                let sandbox_root = PathBuf::from(dir_str);
                Self {
                    is_sandboxed: true,
                    sandbox_path: Some(sandbox_root),
                    live_working_dir,
                }
            }
            None => Self {
                is_sandboxed: false,
                sandbox_path: None,
                live_working_dir,
            },
        }
    }

    /// Creates an isolated temporary shadow sandbox root for dry-run simulation.
    ///
    /// # Returns
    ///
    /// * `Ok(PathBuf)` - Path to newly created temporary sandbox root.
    /// * `Err(AppError)` - If directory creation fails.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::IoError`] if the temporary directory hierarchy cannot be created.
    pub fn create_temp_shadow_root() -> Result<PathBuf, AppError> {
        let system_temp_dir = std::env::temp_dir();
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S_%3f").to_string();
        let shadow_path = system_temp_dir.join(format!("komoyasb-dryrun-{}", timestamp));

        fs::create_dir_all(&shadow_path)
            .map_err(|e| AppError::io(format!("Failed to create shadow root at {}: {}", shadow_path.display(), e)))?;

        Ok(shadow_path)
    }

    /// Locates the generated `ledger.json` within a given shadow root or explicit ledger path.
    ///
    /// # Arguments
    ///
    /// * `explicit_path` - Optional exact path where ledger was instructed to write.
    /// * `shadow_root` - Optional shadow root directory to check for `ledger.json`.
    ///
    /// # Returns
    ///
    /// * `Ok(PathBuf)` - Validated path to existing ledger JSON file.
    /// * `Err(AppError)` - If ledger cannot be found in candidate locations.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::IoError`] if the ledger does not exist.
    pub fn find_ledger(explicit_path: Option<&Path>, shadow_root: Option<&Path>) -> Result<PathBuf, AppError> {
        if let Some(explicit_ledger) = explicit_path {
            if explicit_ledger.exists() {
                return Ok(explicit_ledger.to_path_buf());
            }
        }

        if let Some(shadow_dir) = shadow_root {
            let candidate_path = shadow_dir.join("ledger.json");
            if candidate_path.exists() {
                return Ok(candidate_path);
            }
        }

        Err(AppError::io("Execution ledger.json not found in target shadow path"))
    }

    /// Remaps a target path if sandbox virtualization is active.
    ///
    /// Translates live user configuration paths (e.g. `~/.config/komorebi/komorebi.json`
    /// or repository paths) into isolated virtual locations inside `sandbox_path`.
    ///
    /// # Arguments
    ///
    /// * `path` - Target filesystem path candidate.
    ///
    /// # Returns
    ///
    /// Virtualized [`PathBuf`] pointing into the sandbox root if sandboxing is active,
    /// or the unchanged original path if running against the live system.
    pub fn remap_path<P: AsRef<Path>>(&self, path: P) -> PathBuf {
        let original_path = path.as_ref();
        if !self.is_sandboxed {
            return original_path.to_path_buf();
        }

        let sandbox_root = match &self.sandbox_path {
            Some(root) => root,
            None => return original_path.to_path_buf(),
        };

        // If path is already inside sandbox, return as is
        if original_path.starts_with(sandbox_root) {
            return original_path.to_path_buf();
        }

        // Check if inside repo live_working_dir
        if let Ok(relative_repo_path) = original_path.strip_prefix(&self.live_working_dir) {
            return sandbox_root.join("repo").join(relative_repo_path);
        }

        // Check if inside user profile
        if let Ok(user_home) = std::env::var("USERPROFILE") {
            let home_path = PathBuf::from(user_home);
            if let Ok(relative_home_path) = original_path.strip_prefix(&home_path) {
                return sandbox_root.join("userprofile").join(relative_home_path);
            }
        }

        // Fallback: strip root / prefix and append normal path components to sandbox root
        let path_components: PathBuf = original_path
            .components()
            .filter_map(|component| match component {
                std::path::Component::Normal(normal_segment) => Some(normal_segment),
                _ => None,
            })
            .collect();
        sandbox_root.join(path_components)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_sandbox_context_creation() {
        let live_path = PathBuf::from("C:\\test\\live");
        let context = SandboxContext::new(live_path.clone());
        assert_eq!(context.live_working_dir, live_path);
    }

    #[test]
    fn test_sandbox_context_with_env_override() {
        let live_path = PathBuf::from("C:\\test\\live");
        let fake_sandbox = "C:\\fake\\sandbox_root";
        std::env::set_var("UI_SANDBOX_DIR", fake_sandbox);

        let context = SandboxContext::new(live_path.clone());
        assert!(context.is_sandboxed);
        assert_eq!(context.sandbox_path, Some(PathBuf::from(fake_sandbox)));

        std::env::remove_var("UI_SANDBOX_DIR");
        let context_disabled = SandboxContext::new(live_path);
        assert!(!context_disabled.is_sandboxed);
        assert_eq!(context_disabled.sandbox_path, None);
    }

    #[test]
    fn test_remap_path_when_not_sandboxed() {
        let live_path = PathBuf::from("C:\\test\\live");
        let context = SandboxContext {
            is_sandboxed: false,
            sandbox_path: None,
            live_working_dir: live_path,
        };

        let target = PathBuf::from("C:\\some\\arbitrary\\file.txt");
        assert_eq!(context.remap_path(&target), target);
    }

    #[test]
    fn test_remap_path_already_inside_sandbox_passthrough() {
        let sandbox_root = PathBuf::from("C:\\sandbox");
        let context = SandboxContext {
            is_sandboxed: true,
            sandbox_path: Some(sandbox_root.clone()),
            live_working_dir: PathBuf::from("C:\\repo"),
        };

        let inside_sandbox = sandbox_root.join("repo").join("configs").join("test.json");
        assert_eq!(context.remap_path(&inside_sandbox), inside_sandbox);
    }

    #[test]
    fn test_remap_path_inside_repo() {
        let repo_root = PathBuf::from("C:\\my_repo");
        let sandbox_root = PathBuf::from("C:\\sandbox_dir");
        let context = SandboxContext {
            is_sandboxed: true,
            sandbox_path: Some(sandbox_root.clone()),
            live_working_dir: repo_root.clone(),
        };

        let repo_file = repo_root.join("themes").join("tokyo.json");
        let remapped = context.remap_path(&repo_file);
        assert_eq!(remapped, sandbox_root.join("repo").join("themes").join("tokyo.json"));
    }

    #[test]
    fn test_remap_path_inside_userprofile() {
        let dummy_home = "C:\\Users\\TestUser";
        std::env::set_var("USERPROFILE", dummy_home);

        let sandbox_root = PathBuf::from("C:\\sandbox_dir");
        let context = SandboxContext {
            is_sandboxed: true,
            sandbox_path: Some(sandbox_root.clone()),
            live_working_dir: PathBuf::from("C:\\repo"),
        };

        let config_file = PathBuf::from(dummy_home).join(".config").join("komorebi").join("komorebi.json");
        let remapped = context.remap_path(&config_file);
        assert_eq!(remapped, sandbox_root.join("userprofile").join(".config").join("komorebi").join("komorebi.json"));
    }

    #[test]
    fn test_remap_path_path_traversal_sanitization() {
        let sandbox_root = PathBuf::from("C:\\sandbox_dir");
        let context = SandboxContext {
            is_sandboxed: true,
            sandbox_path: Some(sandbox_root.clone()),
            live_working_dir: PathBuf::from("C:\\repo"),
        };

        // Attempting path traversal with ".." segments
        let traversal_path = PathBuf::from("C:\\Windows\\..\\secret\\passwords.txt");
        let remapped = context.remap_path(&traversal_path);

        // All ".." components are stripped by .filter_map(Component::Normal)
        assert!(!remapped.to_string_lossy().contains(".."));
        assert!(remapped.starts_with(&sandbox_root));
    }

    #[test]
    fn test_create_temp_shadow_root() {
        let temp_root = SandboxContext::create_temp_shadow_root().unwrap();
        assert!(temp_root.exists());
        assert!(temp_root.is_dir());
        let file_name = temp_root.file_name().unwrap().to_string_lossy();
        assert!(file_name.starts_with("komoyasb-dryrun-"));

        // Clean up created directory
        let _ = fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn test_find_ledger_explicit_path_found() {
        let test_dir = tempdir().unwrap();
        let explicit_ledger = test_dir.path().join("custom_ledger.json");
        fs::write(&explicit_ledger, "{\"session\": \"test\"}").unwrap();

        let result = SandboxContext::find_ledger(Some(&explicit_ledger), None);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), explicit_ledger);
    }

    #[test]
    fn test_find_ledger_shadow_root_fallback() {
        let test_dir = tempdir().unwrap();
        let shadow_ledger = test_dir.path().join("ledger.json");
        fs::write(&shadow_ledger, "{\"session\": \"shadow\"}").unwrap();

        let missing_explicit = test_dir.path().join("missing.json");
        let result = SandboxContext::find_ledger(Some(&missing_explicit), Some(test_dir.path()));
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), shadow_ledger);
    }

    #[test]
    fn test_find_ledger_both_missing_returns_io_error() {
        let test_dir = tempdir().unwrap();
        let missing_explicit = test_dir.path().join("missing.json");
        let result = SandboxContext::find_ledger(Some(&missing_explicit), Some(test_dir.path()));
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::IoError { message, .. } => {
                assert!(message.contains("ledger.json not found"));
            }
            other => panic!("Expected IoError, got {:?}", other),
        }
    }
}
