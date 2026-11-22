//! Window tiling management commands for Komorebi and WHKD.
//!
//! Provides transactional configuration loading, serialization, application float rules,
//! and hotkey binding validation across virtual desktops and display boundaries.

use std::path::PathBuf;
use tauri::State;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;
use crate::utils::atomic_write::{atomic_write_file, read_file_string};
use crate::utils::validator::ConfigFormat;

/// Border color specification for Komorebi window states.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KomorebiBorderColours {
    /// Border color for single focused windows.
    pub single: String,
    /// Border color for stacked/tabbed windows.
    pub stack: String,
    /// Border color for monocle (fullscreen) windows.
    pub monocle: String,
    /// Border color for unfocused inactive windows.
    pub unfocused: String,
    /// Border color for floating unmanaged windows.
    pub floating: String,
}

/// Workspace layout and naming definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceDefinition {
    /// Human-readable workspace name or symbol.
    pub name: String,
    /// Tiling layout algorithm (e.g. "bsp", "columns", "rows", "vertical-stack").
    pub layout: String,
}

/// Monitor configuration mapping workspaces to physical displays.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorDefinition {
    /// List of workspaces allocated to this monitor.
    pub workspaces: Vec<WorkspaceDefinition>,
}

/// Complete configuration schema for the Komorebi tiling window manager.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KomorebiConfig {
    /// Schema validation URI.
    #[serde(rename = "$schema", skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    /// Optional path to application-specific float and management rules.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_specific_configuration_path: Option<String>,
    /// Focus movement policy across monitor boundaries.
    pub cross_monitor_move_behaviour: String,
    /// Outer workspace padding in pixels.
    pub default_workspace_padding: i32,
    /// Inner container padding between windows in pixels.
    pub default_container_padding: i32,
    /// Whether window borders are rendered.
    pub border: bool,
    /// Window border thickness in pixels.
    pub border_width: i32,
    /// Offset between window frame and rendered border in pixels.
    pub border_offset: i32,
    /// Border corner style (e.g. "square", "rounded").
    pub border_style: String,
    /// Color definitions for window borders across states.
    pub border_colours: KomorebiBorderColours,
    /// Whether mouse cursor moves to newly focused windows.
    pub mouse_follows_focus: bool,
    /// Focus-follows-mouse policy if enabled.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focus_follows_mouse: Option<String>,
    /// Whether window transparency is enabled.
    pub transparency: bool,
    /// Window transparency alpha value (0.0 to 1.0).
    pub transparency_alpha: f64,
    /// Strategy for hiding inactive windows ("Minimize", "Cloak", "Hide").
    pub window_hiding_behaviour: String,
    /// Whether workspaces are isolated per physical monitor.
    pub workspaces_per_monitor: bool,
    /// Display monitor definitions and workspace bindings.
    pub monitors: Vec<MonitorDefinition>,
    /// Additional unrecognized configuration properties preserved transparently.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// Application match rule identifier specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplicationRuleIdentifier {
    /// Identifier type ("Exe", "Class", "Title").
    pub kind: String,
    /// Match value (e.g. "spotify.exe", "CabinetWClass").
    pub id: String,
    /// Matching strategy ("Equals", "StartsWith", "Contains", "Regex").
    pub matching_strategy: String,
}

/// Window management rule applied to matched applications.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplicationRule {
    /// Friendly name describing the target application.
    pub name: String,
    /// Matching criterion identifying the target window.
    pub identifier: ApplicationRuleIdentifier,
    /// Whether matched windows should float instead of tile.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub float: Option<bool>,
    /// Whether Komorebi should manage this application.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manage: Option<bool>,
    /// Whether transparency effects apply to this application.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transparency: Option<bool>,
}

/// Represents a single parsed hotkey binding from `.whkdrc`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyBinding {
    /// Unique synthetic identifier for the UI list key.
    pub id: String,
    /// Associated comment or description text from `.whkdrc`.
    #[serde(rename = "rawComment", skip_serializing_if = "Option::is_none")]
    pub raw_comment: Option<String>,
    /// Keyboard modifier keys ("alt", "ctrl", "shift", "win").
    pub modifiers: Vec<String>,
    /// Primary key symbol (e.g. "h", "j", "return", "space").
    pub key: String,
    /// Shell command executed upon hotkey trigger.
    pub command: String,
    /// Categorization bucket ("navigation", "workspace", "move", "resize", "layout", "system").
    pub category: String,
}

/// Conflict record when two hotkey bindings share identical modifier and key combinations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyConflict {
    /// Conflicting normalized key combination string.
    #[serde(rename = "keyCombination")]
    pub key_combination: String,
    /// First registered binding.
    #[serde(rename = "bindingA")]
    pub binding_a: HotkeyBinding,
    /// Second conflicting binding.
    #[serde(rename = "bindingB")]
    pub binding_b: HotkeyBinding,
    /// Reason code for the conflict.
    pub reason: String,
}

/// Resolves the filesystem path to the Komorebi JSON configuration file.
fn get_komorebi_config_path(state: &AppState) -> PathBuf {
    let repo_path = state.repo_root.join("configs").join("komorebi").join("komorebi.json");
    state.resolve_path(&repo_path)
}

/// Resolves the filesystem path to the Komorebi application float rules YAML.
fn get_applications_yaml_path(state: &AppState) -> PathBuf {
    let repo_path = state.repo_root.join("configs").join("komorebi").join("applications.yaml");
    state.resolve_path(&repo_path)
}

/// Resolves the filesystem path to the WHKD hotkey configuration file.
fn get_whkdrc_path(state: &AppState) -> PathBuf {
    let repo_path = state.repo_root.join("configs").join("komorebi").join("whkdrc");
    state.resolve_path(&repo_path)
}

/// Loads and validates Komorebi window manager configuration from disk.
///
/// # Arguments
///
/// * `state` - Thread-safe application state containing workspace paths and sandbox mode.
///
/// # Returns
///
/// * `Ok(KomorebiConfig)` - Parsed and validated configuration payload.
/// * `Err(AppError)` - If file reading fails or JSON schema validation fails.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if the configuration file is unreadable.
/// Returns [`AppError::ParseError`] if JSON parsing fails.
#[tauri::command]
pub async fn load_komorebi_config(state: State<'_, AppState>) -> Result<KomorebiConfig, AppError> {
    let target_path = get_komorebi_config_path(&state);
    let file_content = read_file_string(&target_path)?;
    Ok(serde_json::from_str::<KomorebiConfig>(&file_content)?)
}

/// Persists Komorebi window manager configuration atomically to disk.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `config` - Updated Komorebi configuration payload.
///
/// # Returns
///
/// * `Ok(())` - Configuration saved successfully.
/// * `Err(AppError)` - If serialization or atomic writing fails.
///
/// # Errors
///
/// Returns [`AppError::ParseError`] if JSON serialization fails.
/// Returns [`AppError::IoError`] if atomic writing fails.
#[tauri::command]
pub async fn save_komorebi_config(
    state: State<'_, AppState>,
    config: KomorebiConfig,
) -> Result<(), AppError> {
    let target_path = get_komorebi_config_path(&state);
    let serialized_content = serde_json::to_string_pretty(&config)?;
    atomic_write_file(&target_path, &serialized_content, Some(ConfigFormat::Json))
}

/// Loads application floating and management rules from `applications.yaml`.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
///
/// # Returns
///
/// * `Ok(Vec<ApplicationRule>)` - List of configured application rules.
/// * `Err(AppError)` - If file reading or YAML deserialization fails.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if the file cannot be read.
/// Returns [`AppError::ParseError`] if YAML deserialization fails.
#[tauri::command]
pub async fn load_float_rules(state: State<'_, AppState>) -> Result<Vec<ApplicationRule>, AppError> {
    let target_path = get_applications_yaml_path(&state);
    let file_content = read_file_string(&target_path)?;
    Ok(serde_yaml::from_str::<Vec<ApplicationRule>>(&file_content)?)
}

/// Persists application float rules atomically to `applications.yaml`.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `rules` - Array of application management rules to write.
///
/// # Returns
///
/// * `Ok(())` - Float rules committed to disk.
/// * `Err(AppError)` - If YAML serialization or atomic writing fails.
///
/// # Errors
///
/// Returns [`AppError::ParseError`] if YAML formatting fails.
/// Returns [`AppError::IoError`] if writing fails.
#[tauri::command]
pub async fn save_float_rules(
    state: State<'_, AppState>,
    rules: Vec<ApplicationRule>,
) -> Result<(), AppError> {
    let target_path = get_applications_yaml_path(&state);
    let serialized_content = serde_yaml::to_string(&rules)?;
    atomic_write_file(&target_path, &serialized_content, Some(ConfigFormat::Yaml))
}

/// Loads and parses hotkey bindings from `.whkdrc`.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
///
/// # Returns
///
/// * `Ok(Vec<HotkeyBinding>)` - Parsed hotkey list with categorized actions.
/// * `Err(AppError)` - If reading `.whkdrc` fails.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if `.whkdrc` cannot be read.
#[tauri::command]
pub async fn load_hotkeys(state: State<'_, AppState>) -> Result<Vec<HotkeyBinding>, AppError> {
    let target_path = get_whkdrc_path(&state);
    let file_content = read_file_string(&target_path)?;

    let mut hotkey_bindings = Vec::new();
    let mut pending_comment = None;

    for (line_index, line) in file_content.lines().enumerate() {
        let trimmed_line = line.trim();
        if trimmed_line.is_empty() {
            continue;
        }
        if trimmed_line.starts_with('#') {
            pending_comment = Some(trimmed_line.trim_start_matches('#').trim().to_string());
            continue;
        }

        if let Some((left_hand_side, right_hand_side)) = trimmed_line.split_once(':') {
            let key_combination = left_hand_side.trim();
            let command_string = right_hand_side.trim();

            let combination_parts: Vec<&str> = key_combination.split('+').map(|segment| segment.trim()).collect();
            let mut modifiers = Vec::new();
            let mut key = String::new();

            for part in combination_parts {
                let lower_part = part.to_lowercase();
                if ["alt", "ctrl", "shift", "win"].contains(&lower_part.as_str()) {
                    modifiers.push(lower_part);
                } else {
                    key = part.to_string();
                }
            }

            let category = if command_string.contains("focus-workspace") || command_string.contains("move-to-workspace") || command_string.contains("cycle-workspace") {
                "workspace"
            } else if command_string.contains("focus") {
                "navigation"
            } else if command_string.contains("move") {
                "move"
            } else if command_string.contains("resize") {
                "resize"
            } else if command_string.contains("layout") {
                "layout"
            } else {
                "system"
            };

            hotkey_bindings.push(HotkeyBinding {
                id: format!("binding-{}", line_index),
                raw_comment: pending_comment.take(),
                modifiers,
                key,
                command: command_string.to_string(),
                category: category.to_string(),
            });
        }
    }

    Ok(hotkey_bindings)
}

/// Persists hotkey bindings atomically to `.whkdrc`.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `hotkeys` - List of hotkey bindings to serialize.
///
/// # Returns
///
/// * `Ok(())` - Hotkeys written successfully.
/// * `Err(AppError)` - If atomic writing fails or syntax is invalid.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if file write fails.
/// Returns [`AppError::ValidationFailed`] if generated content violates WHKD syntax rules.
#[tauri::command]
pub async fn save_hotkeys(
    state: State<'_, AppState>,
    hotkeys: Vec<HotkeyBinding>,
) -> Result<(), AppError> {
    let target_path = get_whkdrc_path(&state);
    let mut config_lines = Vec::new();
    config_lines.push("# .whkdrc - Windows Hotkey Daemon Configuration".to_string());
    config_lines.push("# Managed by Komoyasb Control Center".to_string());
    config_lines.push("".to_string());

    for binding in hotkeys {
        if let Some(comment) = binding.raw_comment {
            config_lines.push(format!("# {}", comment));
        }
        let combination_str = if binding.modifiers.is_empty() {
            binding.key
        } else {
            format!("{} + {}", binding.modifiers.join(" + "), binding.key)
        };
        config_lines.push(format!("{} : {}", combination_str, binding.command));
    }

    let serialized_content = config_lines.join("\n");
    atomic_write_file(&target_path, &serialized_content, Some(ConfigFormat::Whkdrc))
}

/// Validates a list of hotkey bindings for duplicate key combinations.
///
/// # Arguments
///
/// * `hotkeys` - List of hotkey bindings to check for collisions.
///
/// # Returns
///
/// * `Ok(Vec<HotkeyConflict>)` - Array of detected conflicts (empty if valid).
/// * `Err(AppError)` - Never fails under normal conditions.
#[tauri::command]
pub async fn validate_hotkeys(
    hotkeys: Vec<HotkeyBinding>,
) -> Result<Vec<HotkeyConflict>, AppError> {
    let mut detected_conflicts = Vec::new();
    let mut registered_bindings: std::collections::HashMap<String, HotkeyBinding> = std::collections::HashMap::new();

    for binding in hotkeys {
        let mut sorted_modifiers = binding.modifiers.clone();
        sorted_modifiers.sort();
        let normalized_combination = format!("{}+{}", sorted_modifiers.join("+"), binding.key.to_lowercase());

        if let Some(existing_binding) = registered_bindings.get(&normalized_combination) {
            detected_conflicts.push(HotkeyConflict {
                key_combination: normalized_combination.clone(),
                binding_a: existing_binding.clone(),
                binding_b: binding.clone(),
                reason: "DUPLICATE_BINDING".to_string(),
            });
        } else {
            registered_bindings.insert(normalized_combination, binding);
        }
    }

    Ok(detected_conflicts)
}
