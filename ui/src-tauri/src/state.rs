//! Shared application state and environment path resolution.
//!
//! Manages repository root resolution, thread-safe system telemetry primitives,
//! and sandbox path remapping across development and production environments.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use sysinfo::System;
use tauri::Manager;
use crate::utils::sandbox::SandboxContext;

/// Centralized thread-safe application state managed by the Tauri runtime.
pub struct AppState {
    /// Sandbox context for dry-run evaluations and virtual filesystem isolation.
    pub sandbox: SandboxContext,
    /// Thread-safe system metrics container for process and resource monitoring.
    pub sys: Arc<Mutex<System>>,
    /// Canonical filesystem path to the active repository root.
    pub repo_root: PathBuf,
}

impl AppState {
    /// Creates a new `AppState` instance by discovering the active repository root via `app_handle`.
    ///
    /// Resolution precedence:
    /// 1. `UI_SANDBOX_DIR` environment override for simulated execution.
    /// 2. Tauri v2 production resource bundle paths (`app.path().resource_dir()`).
    /// 3. Traversing parent directories starting from the current working directory or executable.
    ///
    /// # Arguments
    ///
    /// * `app_handle` - Optional Tauri application handle used to resolve bundled resource paths.
    ///
    /// # Returns
    ///
    /// Initialized [`AppState`] with configured sandbox context and system metrics sampler.
    pub fn new_with_app_handle<R: tauri::Runtime>(app_handle: Option<&tauri::AppHandle<R>>) -> Self {
        // Priority 1: Check UI_SANDBOX_DIR environment override
        let sandbox_env = std::env::var("UI_SANDBOX_DIR").ok().filter(|s| !s.trim().is_empty());
        let initial_root = if let Some(ref sandbox_dir) = sandbox_env {
            let sandbox_path = PathBuf::from(sandbox_dir);
            if sandbox_path.join("repo").exists() {
                sandbox_path.join("repo")
            } else {
                sandbox_path
            }
        } else {
            // Priority 2: Check Tauri v2 production resource directory
            let mut resolved_resource = None;
            if let Some(app) = app_handle {
                if let Ok(resource_dir) = app.path().resource_dir() {
                    if resource_dir.join("themes").exists() && resource_dir.join("configs").exists() {
                        resolved_resource = Some(resource_dir);
                    } else if resource_dir.join("_up_").join("_up_").join("themes").exists() {
                        // Tauri bundle resource layout fallback
                        resolved_resource = Some(resource_dir.join("_up_").join("_up_"));
                    }
                }
            }

            if let Some(resource_path) = resolved_resource {
                resource_path
            } else {
                // Priority 3: Traverse up from current working directory or current executable path
                Self::discover_dev_repo_root()
            }
        };

        let sandbox = SandboxContext::new(initial_root.clone());
        let sys = Arc::new(Mutex::new(System::new_all()));

        Self {
            sandbox,
            sys,
            repo_root: initial_root,
        }
    }

    /// Creates a default `AppState` instance without a Tauri application handle.
    ///
    /// Useful for standalone utility invocation and unit tests.
    ///
    /// # Returns
    ///
    /// Standard [`AppState`] resolved against development working directories.
    pub fn new() -> Self {
        Self::new_with_app_handle::<tauri::Wry>(None)
    }

    /// Discovers the active development repository root by searching upward from the working directory.
    ///
    /// # Returns
    ///
    /// Validated [`PathBuf`] pointing to the repository root containing `themes/` and `configs/`.
    fn discover_dev_repo_root() -> PathBuf {
        let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        if Self::is_valid_repo_root(&current_dir) {
            return current_dir;
        }

        if let Some(parent_dir) = current_dir.parent() {
            if Self::is_valid_repo_root(parent_dir) {
                return parent_dir.to_path_buf();
            }
            if let Some(grandparent_dir) = parent_dir.parent() {
                if Self::is_valid_repo_root(grandparent_dir) {
                    return grandparent_dir.to_path_buf();
                }
            }
        }

        if let Ok(exe_path) = std::env::current_exe() {
            let mut current = exe_path.as_path();
            while let Some(parent_dir) = current.parent() {
                if Self::is_valid_repo_root(parent_dir) {
                    return parent_dir.to_path_buf();
                }
                current = parent_dir;
            }
        }

        current_dir
    }

    /// Validates whether a candidate path represents the repository root.
    ///
    /// # Arguments
    ///
    /// * `path` - Directory path candidate to check.
    ///
    /// # Returns
    ///
    /// `true` if both `themes` and `configs` directories exist within the path.
    fn is_valid_repo_root(path: &Path) -> bool {
        path.join("themes").exists() && path.join("configs").exists()
    }

    /// Resolves a path taking sandbox virtualization into account.
    ///
    /// When sandbox mode is active, redirects reads and writes into isolated
    /// shadow paths to prevent mutation of host system configurations.
    ///
    /// # Arguments
    ///
    /// * `relative_or_absolute` - Target path requiring resolution.
    ///
    /// # Returns
    ///
    /// Virtualized [`PathBuf`] mapped according to current sandbox policies.
    pub fn resolve_path(&self, relative_or_absolute: &std::path::Path) -> PathBuf {
        self.sandbox.remap_path(relative_or_absolute)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use std::fs;

    #[test]
    fn test_app_state_new() {
        let state = AppState::new();
        assert!(!state.repo_root.as_os_str().is_empty());
        assert!(state.sys.lock().is_ok());
    }

    #[test]
    fn test_is_valid_repo_root_both_present() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("themes")).unwrap();
        fs::create_dir(dir.path().join("configs")).unwrap();

        assert!(AppState::is_valid_repo_root(dir.path()));
    }

    #[test]
    fn test_is_valid_repo_root_missing_themes() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("configs")).unwrap();

        assert!(!AppState::is_valid_repo_root(dir.path()));
    }

    #[test]
    fn test_is_valid_repo_root_missing_configs() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("themes")).unwrap();

        assert!(!AppState::is_valid_repo_root(dir.path()));
    }

    #[test]
    fn test_is_valid_repo_root_empty() {
        let dir = tempdir().unwrap();
        assert!(!AppState::is_valid_repo_root(dir.path()));
    }

    #[test]
    fn test_resolve_path_delegates_to_sandbox() {
        let dir = tempdir().unwrap();
        let repo_root = dir.path().to_path_buf();

        // Non-sandboxed
        let state_live = AppState {
            sandbox: SandboxContext {
                is_sandboxed: false,
                sandbox_path: None,
                live_working_dir: repo_root.clone(),
            },
            sys: Arc::new(Mutex::new(System::new_all())),
            repo_root: repo_root.clone(),
        };
        let target = repo_root.join("themes").join("dark.json");
        assert_eq!(state_live.resolve_path(&target), target);

        // Sandboxed
        let sandbox_dir = tempdir().unwrap();
        let sandbox_root = sandbox_dir.path().to_path_buf();
        let state_sandboxed = AppState {
            sandbox: SandboxContext {
                is_sandboxed: true,
                sandbox_path: Some(sandbox_root.clone()),
                live_working_dir: repo_root.clone(),
            },
            sys: Arc::new(Mutex::new(System::new_all())),
            repo_root: repo_root.clone(),
        };
        let expected = sandbox_root.join("repo").join("themes").join("dark.json");
        assert_eq!(state_sandboxed.resolve_path(&target), expected);
    }

    #[test]
    fn test_new_with_app_handle_sandbox_with_repo_subfolder() {
        let dir = tempdir().unwrap();
        let sandbox_path = dir.path().to_path_buf();
        let repo_subfolder = sandbox_path.join("repo");
        fs::create_dir(&repo_subfolder).unwrap();

        std::env::set_var("UI_SANDBOX_DIR", sandbox_path.to_str().unwrap());
        let state = AppState::new();
        assert_eq!(state.repo_root, repo_subfolder);
        assert!(state.sandbox.is_sandboxed);

        std::env::remove_var("UI_SANDBOX_DIR");
    }

    #[test]
    fn test_new_with_app_handle_sandbox_without_repo_subfolder() {
        let dir = tempdir().unwrap();
        let sandbox_path = dir.path().to_path_buf();

        std::env::set_var("UI_SANDBOX_DIR", sandbox_path.to_str().unwrap());
        let state = AppState::new();
        assert_eq!(state.repo_root, sandbox_path);
        assert!(state.sandbox.is_sandboxed);

        std::env::remove_var("UI_SANDBOX_DIR");
    }
}
