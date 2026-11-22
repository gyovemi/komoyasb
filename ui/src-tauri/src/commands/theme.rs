//! Theme management commands for discovering, reading, saving, and switching themes.
//!
//! Handles unified theme payloads across Komorebi tiling borders, YASB CSS variables,
//! and Windows backdrop styling with atomic persistence and validation.

use std::fs;
use std::path::PathBuf;
use tauri::State;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;
use crate::utils::atomic_write::{atomic_write_file, read_file_string};
use crate::utils::validator::{get_default_allowed_roots, validate_safe_name, validate_safe_path, ConfigFormat};

/// Color palette definition for unified desktop themes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeColors {
    /// Primary background color in hex format.
    pub bg_primary: String,
    /// Secondary background color for sidebars and panels.
    pub bg_secondary: String,
    /// Elevated surface background color for cards and widgets.
    pub bg_surface: String,
    /// Primary foreground text and icon color.
    pub fg_primary: String,
    /// Secondary foreground color for captions and descriptions.
    pub fg_secondary: String,
    /// Muted foreground color for disabled or subtle elements.
    pub fg_muted: String,
    /// Primary accent highlight color.
    pub accent: String,
    /// Secondary accent color for badges and active toggles.
    pub accent_secondary: String,
    /// Border color for active or focused windows.
    pub border_active: String,
    /// Border color for unfocused or inactive windows.
    pub border_inactive: String,
    /// Color token for error states and validation alerts.
    pub error: String,
    /// Color token for warning badges and cautions.
    pub warning: String,
    /// Color token for successful operations.
    pub success: String,
    /// Color token for informational badges.
    pub info: String,
}

/// Typography settings for desktop UI elements and status bars.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeTypography {
    /// Primary font family name (e.g. "Segoe UI Variable Text").
    pub font_family: String,
    /// Font size for small labels and tooltips (e.g. "11px").
    pub font_size_sm: String,
    /// Default font size for standard interface text (e.g. "13px").
    pub font_size_md: String,
    /// Font size for headers and prominent widgets (e.g. "16px").
    pub font_size_lg: String,
}

/// Geometry and dimension tokens applied across tiling and status bar layouts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeGeometry {
    /// Window border stroke width in pixels.
    pub border_width: u32,
    /// Window and container corner rounding radius in pixels.
    pub border_radius: u32,
    /// Gap between tiled windows in pixels.
    pub window_gap: u32,
    /// Height of the top or bottom status bar in pixels.
    pub bar_height: u32,
}

/// Opacity and transparency coefficients applied to desktop layers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeOpacity {
    /// Status bar container opacity (0.0 to 1.0).
    pub bar: f64,
    /// Unfocused window background opacity (0.0 to 1.0).
    pub window_unfocused: f64,
    /// Flyout and modal backdrop opacity (0.0 to 1.0).
    pub flyout: f64,
    /// Application launcher backdrop opacity (0.0 to 1.0).
    pub launcher: f64,
}

/// Wallpaper background image and presentation style configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeWallpaper {
    /// Relative or absolute path to the wallpaper image asset.
    pub path: String,
    /// Win32 desktop wallpaper rendering style (e.g. "Fill", "Fit", "Stretch").
    pub style: String,
}

/// Complete unified theme specification encompassing colors, typography, and geometry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedTheme {
    /// Display name of the theme (e.g. "Tokyo Night Dark").
    pub name: String,
    /// Normalized variant identifier (e.g. "dark" or "light").
    pub variant: String,
    /// Color palette definition.
    pub colors: ThemeColors,
    /// Typography definitions.
    pub typography: ThemeTypography,
    /// Layout and border geometry rules.
    pub geometry: ThemeGeometry,
    /// Opacity and blur configuration.
    pub opacity: ThemeOpacity,
    /// Wallpaper asset configuration.
    pub wallpaper: ThemeWallpaper,
}

/// High-level summary of an available desktop theme for selection grids.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeSummary {
    /// Human-readable theme display name.
    pub name: String,
    /// Normalized theme variant identifier.
    pub variant: String,
    /// Path to the theme JSON definition file.
    pub path: String,
    /// Whether this theme is currently active.
    #[serde(rename = "isActive")]
    pub is_active: bool,
}

/// Resolves the canonical themes directory taking sandbox into account.
///
/// # Arguments
///
/// * `state` - Active application state container.
///
/// # Returns
///
/// Filesystem path to the `themes/` directory.
fn get_themes_dir(state: &AppState) -> PathBuf {
    state.resolve_path(&state.repo_root.join("themes"))
}

/// Scans the repository themes directory and returns summaries of all installed themes.
///
/// # Arguments
///
/// * `state` - Thread-safe application state containing workspace paths and sandbox mode.
///
/// # Returns
///
/// * `Ok(Vec<ThemeSummary>)` - List of discovered themes with active selection state.
/// * `Err(AppError)` - If filesystem access or directory reading fails.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if reading the themes directory fails.
#[tauri::command]
pub async fn get_themes(state: State<'_, AppState>) -> Result<Vec<ThemeSummary>, AppError> {
    let themes_dir = get_themes_dir(&state);
    let mut theme_summaries = Vec::new();

    let active_theme_name = get_active_theme_name(state.clone()).await.unwrap_or_default();

    if themes_dir.exists() {
        if let Ok(dir_entries) = fs::read_dir(&themes_dir) {
            for entry in dir_entries.flatten() {
                let file_path = entry.path();
                if file_path.extension().and_then(|ext| ext.to_str()) == Some("json")
                    && file_path.file_name().and_then(|name| name.to_str()) != Some("theme.schema.json")
                {
                    if let Ok(file_content) = read_file_string(&file_path) {
                        if let Ok(theme) = serde_json::from_str::<UnifiedTheme>(&file_content) {
                            let is_theme_active = theme.name.trim().eq_ignore_ascii_case(active_theme_name.trim())
                                || file_path
                                    .file_stem()
                                    .and_then(|stem| stem.to_str())
                                    .map(|stem_str| stem_str.eq_ignore_ascii_case(active_theme_name.trim()))
                                    .unwrap_or(false);

                            theme_summaries.push(ThemeSummary {
                                name: theme.name,
                                variant: theme.variant,
                                path: file_path.to_string_lossy().to_string(),
                                is_active: is_theme_active,
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(theme_summaries)
}

/// Loads and validates a unified theme definition by name or filename.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `name` - Theme display name or filename without extension.
///
/// # Returns
///
/// * `Ok(UnifiedTheme)` - Parsed unified theme definition.
/// * `Err(AppError)` - If file cannot be found or parsing fails.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if the theme cannot be located.
/// Returns [`AppError::ParseError`] if JSON deserialization fails.
/// Generates a normalized URL- and filesystem-safe slug from a human-readable display name.
pub fn normalize_slug(name: &str) -> String {
    let mut slug = String::new();
    let mut prev_dash = false;
    for c in name.chars() {
        if c.is_alphanumeric() {
            slug.push(c.to_ascii_lowercase());
            prev_dash = false;
        } else if c == ' ' || c == '-' || c == '_' {
            if !prev_dash && !slug.is_empty() {
                slug.push('-');
                prev_dash = true;
            }
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        "custom-theme".to_string()
    } else {
        slug
    }
}

/// Loads and validates a unified theme definition by name or filename.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `name` - Theme display name or filename without extension.
///
/// # Returns
///
/// * `Ok(UnifiedTheme)` - Parsed unified theme definition.
/// * `Err(AppError)` - If file cannot be found or parsing fails.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if the theme cannot be located.
/// Returns [`AppError::ParseError`] if JSON deserialization fails.
#[tauri::command]
pub async fn load_theme(state: State<'_, AppState>, name: String) -> Result<UnifiedTheme, AppError> {
    validate_safe_name(&name)?;
    let themes_dir = get_themes_dir(&state);
    let allowed = get_default_allowed_roots(&state.repo_root);

    // Try finding by direct filename
    let direct_theme_path = themes_dir.join(format!("{}.json", name));
    validate_safe_path(&direct_theme_path, &allowed)?;
    if direct_theme_path.exists() {
        let file_content = read_file_string(&direct_theme_path)?;
        return Ok(serde_json::from_str::<UnifiedTheme>(&file_content)?);
    }

    // Try finding by normalized slug filename
    let slug = normalize_slug(&name);
    let slug_theme_path = themes_dir.join(format!("{}.json", slug));
    if slug_theme_path.exists() {
        validate_safe_path(&slug_theme_path, &allowed)?;
        let file_content = read_file_string(&slug_theme_path)?;
        return Ok(serde_json::from_str::<UnifiedTheme>(&file_content)?);
    }

    // Try scanning for matching theme.name
    if themes_dir.exists() {
        if let Ok(dir_entries) = fs::read_dir(&themes_dir) {
            for entry in dir_entries.flatten() {
                let file_path = entry.path();
                if file_path.extension().and_then(|ext| ext.to_str()) == Some("json")
                    && file_path.file_name().and_then(|file_name| file_name.to_str()) != Some("theme.schema.json")
                {
                    if let Ok(file_content) = read_file_string(&file_path) {
                        if let Ok(candidate_theme) = serde_json::from_str::<UnifiedTheme>(&file_content) {
                            if candidate_theme.name.eq_ignore_ascii_case(&name) {
                                return Ok(candidate_theme);
                            }
                        }
                    }
                }
            }
        }
    }

    Err(AppError::io(format!("Theme '{}' not found in {}", name, themes_dir.display())))
}

/// Persists a modified unified theme to disk atomically.
///
/// Saves default shipped themes ('Tokyo Night Dark', 'Tokyo Night Light') to their
/// standard variant files (`dark.json`, `light.json`). Saves custom themes using
/// a normalized slug (`{slug}.json`) to avoid overwriting base variant files.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `theme` - Unified theme payload to save.
///
/// # Returns
///
/// * `Ok(())` - Theme saved successfully.
/// * `Err(AppError)` - If serialization or atomic write fails.
///
/// # Errors
///
/// Returns [`AppError::ParseError`] if JSON serialization fails.
/// Returns [`AppError::IoError`] if atomic writing fails.
#[tauri::command]
pub async fn save_theme(state: State<'_, AppState>, theme: UnifiedTheme) -> Result<(), AppError> {
    validate_safe_name(&theme.name)?;
    validate_safe_name(&theme.variant)?;

    // Built-in theme variant files:
    // "dark.json" corresponds to Tokyo Night Dark (variant "dark")
    // "light.json" corresponds to Tokyo Night Light (variant "light")
    // Custom themes must be saved using normalized name slug ({slug}.json)
    // rather than overwriting variant files ({variant}.json).
    let is_builtin_dark = theme.variant.eq_ignore_ascii_case("dark")
        && (theme.name.eq_ignore_ascii_case("Tokyo Night Dark") || theme.name.eq_ignore_ascii_case("dark"));
    let is_builtin_light = theme.variant.eq_ignore_ascii_case("light")
        && (theme.name.eq_ignore_ascii_case("Tokyo Night Light") || theme.name.eq_ignore_ascii_case("light"));

    let filename = if is_builtin_dark {
        "dark.json".to_string()
    } else if is_builtin_light {
        "light.json".to_string()
    } else {
        let slug = normalize_slug(&theme.name);
        validate_safe_name(&slug)?;
        format!("{}.json", slug)
    };

    let destination_path = get_themes_dir(&state).join(filename);
    let allowed = get_default_allowed_roots(&state.repo_root);
    validate_safe_path(&destination_path, &allowed)?;
    let serialized_content = serde_json::to_string_pretty(&theme)?;
    atomic_write_file(&destination_path, &serialized_content, Some(ConfigFormat::Json))
}

/// Retrieves the name of the currently active desktop theme.
///
/// Reads `.current_theme` marker file in the themes directory, falling back
/// to "Tokyo Night Dark" if no marker is present.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
///
/// # Returns
///
/// * `Ok(String)` - Active theme name.
/// * `Err(AppError)` - If marker reading encounters an unrecoverable I/O error.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if marker file reading fails unexpectedly.
#[tauri::command]
pub async fn get_active_theme_name(state: State<'_, AppState>) -> Result<String, AppError> {
    let marker_path = get_themes_dir(&state).join(".current_theme");
    if marker_path.exists() {
        let marker_content = read_file_string(&marker_path)?;
        let trimmed_name = marker_content.trim();
        if !trimmed_name.is_empty() {
            return Ok(trimmed_name.to_string());
        }
    }

    Ok("Tokyo Night Dark".to_string())
}

/// Updates the active theme marker file on disk atomically.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `name` - Theme name to set as active.
///
/// # Returns
///
/// * `Ok(())` - Marker updated successfully.
/// * `Err(AppError)` - If atomic writing fails.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if marker persistence fails.
#[tauri::command]
pub async fn set_active_theme(state: State<'_, AppState>, name: String) -> Result<(), AppError> {
    validate_safe_name(&name)?;
    let marker_path = get_themes_dir(&state).join(".current_theme");
    let allowed = get_default_allowed_roots(&state.repo_root);
    validate_safe_path(&marker_path, &allowed)?;
    atomic_write_file(&marker_path, &name, None)
}
