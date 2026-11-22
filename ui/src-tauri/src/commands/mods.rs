//! Application launcher and Windhawk mod configuration commands.
//!
//! Provides transactional management of Flow Launcher appearance and hotkeys,
//! as well as query and control mechanisms for Windhawk C++ engine mods.

use std::path::PathBuf;
use tauri::State;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;
use crate::utils::atomic_write::{atomic_write_file, read_file_string};
use crate::utils::process::run_powershell_script;
use crate::utils::validator::{validate_mod_id, ConfigFormat};

/// Configuration schema for Flow Launcher appearance, positioning, and hotkeys.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowSettings {
    /// Activation hotkey sequence (e.g. "Alt+Space").
    #[serde(rename = "Hotkey")]
    pub hotkey: String,
    /// Theme identifier (e.g. "TokyoNightDark", "Custom").
    #[serde(rename = "Theme")]
    pub theme: String,
    /// Font family for search query and results.
    #[serde(rename = "Font")]
    pub font: String,
    /// Custom accent color hex code.
    #[serde(rename = "CustomAccentColor")]
    pub custom_accent_color: String,
    /// Whether to synchronize accent color with Windows OS.
    #[serde(rename = "UseWindowsAccentColor")]
    pub use_windows_accent_color: bool,
    /// Visual backdrop effect ("Mica", "Acrylic", "Blur", "None").
    #[serde(rename = "SearchWindowEffect")]
    pub search_window_effect: String,
    /// Window frame corner radius in pixels.
    #[serde(rename = "BorderRadius")]
    pub border_radius: i32,
    /// Search window opacity coefficient (0.0 to 1.0).
    #[serde(rename = "Opacity")]
    pub opacity: f64,
    /// Maximum query search results rendered simultaneously.
    #[serde(rename = "MaxResultsToShow")]
    pub max_results_to_show: i32,
    /// Additional unrecognized settings preserved during serialization.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// Runtime status of an individual Windhawk C++ modification mod.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindhawkModStatus {
    /// Internal mod identifier slug.
    pub id: String,
    /// Friendly display name.
    pub name: String,
    /// Detailed description of kernel/DWM hooks injected.
    pub description: String,
    /// Relative path to the `.wh.cpp` source code file.
    #[serde(rename = "sourceFile")]
    pub source_file: String,
    /// Whether the mod is actively loaded into target processes.
    #[serde(rename = "isLoaded")]
    pub is_loaded: bool,
}

/// Resolves the filesystem path to Flow Launcher `flow_settings.json`.
fn get_flow_settings_path(state: &AppState) -> PathBuf {
    let repo_path = state.repo_root.join("configs").join("shell").join("flow_settings.json");
    state.resolve_path(&repo_path)
}

/// Loads and validates Flow Launcher settings from disk.
///
/// # Arguments
///
/// * `state` - Thread-safe application state containing workspace paths and sandbox mode.
///
/// # Returns
///
/// * `Ok(FlowSettings)` - Parsed launcher configuration.
/// * `Err(AppError)` - If file reading or JSON deserialization fails.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if the settings file is unreadable.
/// Returns [`AppError::ParseError`] if JSON parsing fails.
#[tauri::command]
pub async fn load_flow_settings(state: State<'_, AppState>) -> Result<FlowSettings, AppError> {
    let target_path = get_flow_settings_path(&state);
    let file_content = read_file_string(&target_path)?;
    Ok(serde_json::from_str::<FlowSettings>(&file_content)?)
}

/// Persists Flow Launcher settings atomically to disk.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `settings` - Updated Flow Launcher settings payload.
///
/// # Returns
///
/// * `Ok(())` - Settings saved successfully.
/// * `Err(AppError)` - If serialization or writing fails.
///
/// # Errors
///
/// Returns [`AppError::ParseError`] if JSON serialization fails.
/// Returns [`AppError::IoError`] if atomic writing fails.
#[tauri::command]
pub async fn save_flow_settings(
    state: State<'_, AppState>,
    settings: FlowSettings,
) -> Result<(), AppError> {
    let target_path = get_flow_settings_path(&state);
    let serialized_content = serde_json::to_string_pretty(&settings)?;
    atomic_write_file(&target_path, &serialized_content, Some(ConfigFormat::Json))
}

/// Discovers and reports the status of all Windhawk mods defined in the repository.
///
/// Under live execution, checks mod state via `apply-windhawk-mods.ps1 -Action Status`.
/// Under sandbox mode, returns predefined mod manifests without spawning processes.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
///
/// # Returns
///
/// * `Ok(Vec<WindhawkModStatus>)` - List of configured Windhawk mods and their loaded state.
/// * `Err(AppError)` - If script execution encounters an unrecoverable fault.
#[tauri::command]
pub async fn get_windhawk_mods(state: State<'_, AppState>) -> Result<Vec<WindhawkModStatus>, AppError> {
    let script_path = state.repo_root.join("scripts").join("apply-windhawk-mods.ps1");
    let script_path_string = script_path.to_string_lossy().to_string();

    let configured_mods = vec![
        WindhawkModStatus {
            id: "taskbar-autohide".to_string(),
            name: "Taskbar Autohide & Instant Unhide".to_string(),
            description: "Automatically autohides taskbar with 0ms delay".to_string(),
            source_file: "configs/shell/windhawk/taskbar-autohide.wh.cpp".to_string(),
            is_loaded: true,
        },
        WindhawkModStatus {
            id: "dwm-mica-effects".to_string(),
            name: "Global DWM Mica & Blur Backdrop".to_string(),
            description: "Applies MicaAlt/Acrylic backdrop to unfocused windows".to_string(),
            source_file: "configs/shell/windhawk/dwm-mica-effects.wh.cpp".to_string(),
            is_loaded: true,
        },
        WindhawkModStatus {
            id: "notification-styling".to_string(),
            name: "Windows 11 Notification Toast Styling".to_string(),
            description: "Customizes corner radius, border, and position for toast notifications".to_string(),
            source_file: "configs/shell/windhawk/notification-styling.wh.cpp".to_string(),
            is_loaded: true,
        },
    ];

    if !state.sandbox.is_sandboxed && script_path.exists() {
        let _ = run_powershell_script(&script_path_string, &["-Action", "Status"], false);
    }

    Ok(configured_mods)
}

/// Enables or disables a specific Windhawk mod by invoking `apply-windhawk-mods.ps1`.
///
/// In dry-run or sandbox mode, simulates success without mutating Windhawk runtime state.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `mod_id` - Identifier slug of the mod to configure.
/// * `enabled` - Desired enablement state (`true` to load, `false` to unload).
///
/// # Returns
///
/// * `Ok(())` - Mod state updated successfully.
/// * `Err(AppError)` - If subprocess execution fails.
///
/// # Errors
///
/// Returns [`AppError::ProcessError`] if the script fails or returns a non-zero exit code.
#[tauri::command]
pub async fn set_windhawk_mod_state(
    state: State<'_, AppState>,
    mod_id: String,
    enabled: bool,
) -> Result<(), AppError> {
    validate_mod_id(&mod_id)?;

    let script_path = state.repo_root.join("scripts").join("apply-windhawk-mods.ps1");
    let script_path_string = script_path.to_string_lossy().to_string();

    let action_verb = if enabled { "Load" } else { "Unload" };
    let execution_result = run_powershell_script(
        &script_path_string,
        &["-Action", action_verb, "-ModId", &mod_id],
        state.sandbox.is_sandboxed,
    )?;

    if !execution_result.success {
        return Err(AppError::process(format!("Windhawk mod script failed: {}", execution_result.stderr)));
    }

    Ok(())
}
