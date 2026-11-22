//! Status bar, flyout, and volume control configuration commands.
//!
//! Provides transactional management of YASB Reborn YAML/CSS configurations,
//! FluentFlyout layout and appearance settings, and EarTrumpet registry definitions.

use std::collections::HashMap;
use std::path::PathBuf;
use tauri::State;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;
use crate::utils::atomic_write::{atomic_write_file, read_file_string};
use crate::utils::validator::{validate_eartrumpet_theme, ConfigFormat};

/// Dimension specifications for YASB status bar containers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YasbDimensions {
    /// Width constraint (e.g. "100%" or pixel value).
    pub width: String,
    /// Bar height in pixels.
    pub height: i32,
}

/// Padding margins applied to the status bar container.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YasbPadding {
    /// Top padding in pixels.
    pub top: i32,
    /// Left padding in pixels.
    pub left: i32,
    /// Bottom padding in pixels.
    pub bottom: i32,
    /// Right padding in pixels.
    pub right: i32,
}

/// DWM blur and acrylic visual effect options for YASB.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YasbBlurEffect {
    /// Whether blur backdrop is active.
    pub enabled: bool,
    /// Whether acrylic material is enforced over basic blur.
    pub acrylic: bool,
    /// Whether dark mode tint is enforced on the blur effect.
    pub dark: bool,
    /// Whether window corner rounding is applied.
    pub round_corners: bool,
    /// Win32 corner rounding style (e.g. "normal", "small", "none").
    pub round_corners_type: String,
    /// Hex stroke color for the status bar boundary.
    pub border_color: String,
}

/// Status bar alignment and screen anchoring policy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YasbAlignment {
    /// Screen edge alignment ("top" or "bottom").
    pub position: String,
    /// Whether bar container is centered horizontally.
    pub center: bool,
}

/// Native Windows window management flags for the status bar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YasbWindowFlags {
    /// Whether bar stays above other top-level windows.
    pub always_on_top: bool,
    /// Whether bar registers as a native Windows AppBar to reserve desktop work area.
    pub windows_app_bar: bool,
}

/// Widget assignment across left, center, and right status bar sections.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YasbBarWidgets {
    /// Ordered widget IDs rendered on the left.
    pub left: Vec<String>,
    /// Ordered widget IDs rendered in the center.
    pub center: Vec<String>,
    /// Ordered widget IDs rendered on the right.
    pub right: Vec<String>,
}

/// Bar container configuration definition within YASB.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YasbBarConfig {
    /// Whether this specific bar instance is enabled.
    pub enabled: bool,
    /// Target display names or indices where this bar appears.
    pub screens: Vec<String>,
    /// CSS class name assigned to the root container.
    pub class_name: String,
    /// Alignment and positioning rules.
    pub alignment: YasbAlignment,
    /// Blur and backdrop effects.
    pub blur_effect: YasbBlurEffect,
    /// Window style and AppBar registration flags.
    pub window_flags: YasbWindowFlags,
    /// Dimension constraints.
    pub dimensions: YasbDimensions,
    /// Outer padding margins.
    pub padding: YasbPadding,
    /// Widget section assignments.
    pub widgets: YasbBarWidgets,
}

/// Widget configuration block in YASB.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YasbWidgetDefinition {
    /// Widget plugin type (e.g. "yasb.clock.ClockWidget").
    #[serde(rename = "type")]
    pub widget_type: String,
    /// Custom key-value options passed to the widget plugin.
    #[serde(default)]
    pub options: HashMap<String, serde_yaml::Value>,
}

/// Root configuration schema for YASB Reborn (`config.yaml`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YasbConfig {
    /// Whether stylesheet changes trigger automatic live reload.
    pub watch_stylesheet: bool,
    /// Whether config file modifications trigger live reload.
    pub watch_config: bool,
    /// Configured status bar instances keyed by name.
    pub bars: HashMap<String, YasbBarConfig>,
    /// Configured widget instances keyed by name.
    pub widgets: HashMap<String, YasbWidgetDefinition>,
}

/// Visual styling and color tokens for FluentFlyout.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FluentFlyoutAppearance {
    /// Color theme name ("System", "Dark", "Light").
    #[serde(rename = "Theme")]
    pub theme: String,
    /// Backdrop material ("Mica", "MicaAlt", "Acrylic", "None").
    #[serde(rename = "Backdrop")]
    pub backdrop: String,
    /// Primary accent color hex.
    #[serde(rename = "AccentColor")]
    pub accent_color: String,
    /// Secondary accent color hex.
    #[serde(rename = "AccentSecondaryColor")]
    pub accent_secondary_color: String,
    /// Background color hex.
    #[serde(rename = "BackgroundColor")]
    pub background_color: String,
    /// Surface card background color hex.
    #[serde(rename = "SurfaceColor")]
    pub surface_color: String,
    /// Foreground text color hex.
    #[serde(rename = "ForegroundColor")]
    pub foreground_color: String,
    /// Muted text color hex.
    #[serde(rename = "ForegroundMutedColor")]
    pub foreground_muted_color: String,
    /// Boundary border stroke color hex.
    #[serde(rename = "BorderColor")]
    pub border_color: String,
    /// Boundary border width in pixels.
    #[serde(rename = "BorderWidth")]
    pub border_width: i32,
    /// Flyout window corner radius in pixels.
    #[serde(rename = "CornerRadius")]
    pub corner_radius: i32,
    /// Font family for flyout text.
    #[serde(rename = "FontFamily")]
    pub font_family: String,
    /// Base font size.
    #[serde(rename = "FontSize")]
    pub font_size: String,
    /// Backdrop opacity ratio (0.0 to 1.0).
    #[serde(rename = "Opacity")]
    pub opacity: f64,
}

/// General behavior flags for FluentFlyout.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FluentFlyoutGeneral {
    /// Whether flyout daemon launches upon Windows logon.
    #[serde(rename = "RunAtStartup")]
    pub run_at_startup: bool,
    /// Whether notification area tray icon is displayed.
    #[serde(rename = "ShowTrayIcon")]
    pub show_tray_icon: bool,
    /// Whether update checks are performed automatically.
    #[serde(rename = "CheckForUpdates")]
    pub check_for_updates: bool,
    /// Localization language code.
    #[serde(rename = "Language")]
    pub language: String,
}

/// On-screen positioning rules for FluentFlyout.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FluentFlyoutPlacement {
    /// Screen edge alignment ("TopLeft", "TopCenter", "TopRight", "BottomLeft", "BottomCenter", "BottomRight").
    #[serde(rename = "Alignment")]
    pub alignment: String,
    /// Target display index.
    #[serde(rename = "DisplayIndex")]
    pub display_index: i32,
    /// Horizontal offset in pixels.
    #[serde(rename = "OffsetX")]
    pub offset_x: i32,
    /// Vertical offset in pixels.
    #[serde(rename = "OffsetY")]
    pub offset_y: i32,
    /// Screen margin in pixels.
    #[serde(rename = "Margin")]
    pub margin: i32,
    /// Safe vertical clearance to prevent overlap with YASB status bar in pixels.
    #[serde(rename = "SafePaddingYASB")]
    pub safe_padding_yasb: i32,
    /// Whether flyout is constrained to keep entirely within screen bounds.
    #[serde(rename = "KeepOnScreen")]
    pub keep_on_screen: bool,
    /// Whether flyout avoids overlapping the desktop work area.
    #[serde(rename = "AvoidWorkAreaOverlap")]
    pub avoid_work_area_overlap: bool,
}

/// Volume indicator flyout module configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FluentFlyoutVolume {
    /// Whether modern volume flyout replaces standard Windows OSD.
    #[serde(rename = "Enabled")]
    pub enabled: bool,
    /// Step size per volume increment.
    #[serde(rename = "StepSize")]
    pub step_size: i32,
    /// Whether mute icon indicator is rendered.
    #[serde(rename = "ShowMuteIndicator")]
    pub show_mute_indicator: bool,
}

/// Brightness indicator flyout module configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FluentFlyoutBrightness {
    /// Whether brightness OSD is active.
    #[serde(rename = "Enabled")]
    pub enabled: bool,
    /// Step size per brightness increment.
    #[serde(rename = "StepSize")]
    pub step_size: i32,
}

/// Media session playback flyout module configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FluentFlyoutMedia {
    /// Whether media playback OSD is active.
    #[serde(rename = "Enabled")]
    pub enabled: bool,
    /// Whether album art thumbnail is shown.
    #[serde(rename = "ShowThumbnail")]
    pub show_thumbnail: bool,
    /// Whether playback transport controls (play/pause/next) are displayed.
    #[serde(rename = "ShowPlaybackControls")]
    pub show_playback_controls: bool,
    /// Whether track scrub timeline is displayed.
    #[serde(rename = "ShowTimeline")]
    pub show_timeline: bool,
}

/// Airplane mode indicator module configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FluentFlyoutAirplaneMode {
    /// Whether airplane mode OSD is active.
    #[serde(rename = "Enabled")]
    pub enabled: bool,
}

/// Keyboard lock key indicators (CapsLock, NumLock, ScrollLock).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FluentFlyoutLockKeys {
    /// Whether lock key state notifications are enabled.
    #[serde(rename = "Enabled")]
    pub enabled: bool,
    /// Whether CapsLock toggle notification is displayed.
    #[serde(rename = "ShowCapsLock")]
    pub show_caps_lock: bool,
    /// Whether NumLock toggle notification is displayed.
    #[serde(rename = "ShowNumLock")]
    pub show_num_lock: bool,
    /// Whether ScrollLock toggle notification is displayed.
    #[serde(rename = "ShowScrollLock")]
    pub show_scroll_lock: bool,
}

/// Aggregated module flags for FluentFlyout components.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FluentFlyoutModules {
    /// Volume flyout settings.
    #[serde(rename = "Volume")]
    pub volume: FluentFlyoutVolume,
    /// Brightness flyout settings.
    #[serde(rename = "Brightness")]
    pub brightness: FluentFlyoutBrightness,
    /// Media playback flyout settings.
    #[serde(rename = "Media")]
    pub media: FluentFlyoutMedia,
    /// Airplane mode flyout settings.
    #[serde(rename = "AirplaneMode")]
    pub airplane_mode: FluentFlyoutAirplaneMode,
    /// Lock key status flyout settings.
    #[serde(rename = "LockKeys")]
    pub lock_keys: FluentFlyoutLockKeys,
}

/// Root configuration schema for FluentFlyout (`fluentflyout_config.json`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FluentFlyoutConfig {
    /// General daemon settings.
    #[serde(rename = "General")]
    pub general: FluentFlyoutGeneral,
    /// Appearance and color tokens.
    #[serde(rename = "Appearance")]
    pub appearance: FluentFlyoutAppearance,
    /// Screen placement and positioning rules.
    #[serde(rename = "Placement")]
    pub placement: FluentFlyoutPlacement,
    /// Behavior and animation options.
    #[serde(rename = "Behavior")]
    pub behavior: HashMap<String, serde_json::Value>,
    /// Module enablements.
    #[serde(rename = "Modules")]
    pub modules: FluentFlyoutModules,
}

/// EarTrumpet audio flyout settings mirrored from Windows Registry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EarTrumpetConfig {
    /// Migration state marker.
    #[serde(rename = "hasMigrated")]
    pub has_migrated: bool,
    /// Whether system accent color is applied to sliders.
    #[serde(rename = "useAccentColor")]
    pub use_accent_color: bool,
    /// EarTrumpet theme ("System", "Dark", "Light").
    pub theme: String,
    /// Whether animated volume peak meters are rendered.
    #[serde(rename = "showVolumePeakMeter")]
    pub show_volume_peak_meter: bool,
    /// Whether playback device output selector is visible.
    #[serde(rename = "showPlaybackDevices")]
    pub show_playback_devices: bool,
    /// Whether recording input selector is visible.
    #[serde(rename = "showRecordingDevices")]
    pub show_recording_devices: bool,
    /// Whether per-application audio icons are shown.
    #[serde(rename = "showAppIcons")]
    pub show_app_icons: bool,
    /// Whether multi-channel volume controls start expanded.
    #[serde(rename = "expandAll")]
    pub expand_all: bool,
    /// Whether EarTrumpet icon is pinned to the visible taskbar tray.
    #[serde(rename = "isPromotedInTray")]
    pub is_promoted_in_tray: bool,
}

/// Resolves the filesystem path to YASB `config.yaml`.
fn get_yasb_config_path(state: &AppState) -> PathBuf {
    let repo_path = state.repo_root.join("configs").join("yasb").join("config.yaml");
    state.resolve_path(&repo_path)
}

/// Resolves the filesystem path to YASB `styles.css`.
fn get_yasb_css_path(state: &AppState) -> PathBuf {
    let repo_path = state.repo_root.join("configs").join("yasb").join("styles.css");
    state.resolve_path(&repo_path)
}

/// Resolves the filesystem path to FluentFlyout configuration JSON.
fn get_fluentflyout_config_path(state: &AppState) -> PathBuf {
    let repo_path = state.repo_root.join("configs").join("polish").join("fluentflyout_config.json");
    state.resolve_path(&repo_path)
}

/// Loads and validates YASB Reborn status bar configuration.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
///
/// # Returns
///
/// * `Ok(YasbConfig)` - Parsed status bar configuration.
/// * `Err(AppError)` - If reading or YAML parsing fails.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if file cannot be read.
/// Returns [`AppError::ParseError`] if YAML deserialization fails.
#[tauri::command]
pub async fn load_yasb_config(state: State<'_, AppState>) -> Result<YasbConfig, AppError> {
    let target_path = get_yasb_config_path(&state);
    let file_content = read_file_string(&target_path)?;
    Ok(serde_yaml::from_str::<YasbConfig>(&file_content)?)
}

/// Persists YASB Reborn configuration atomically to disk.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `config` - Updated YASB configuration payload.
///
/// # Returns
///
/// * `Ok(())` - Configuration saved successfully.
/// * `Err(AppError)` - If serialization or writing fails.
///
/// # Errors
///
/// Returns [`AppError::ParseError`] if YAML serialization fails.
/// Returns [`AppError::IoError`] if atomic writing fails.
#[tauri::command]
pub async fn save_yasb_config(
    state: State<'_, AppState>,
    config: YasbConfig,
) -> Result<(), AppError> {
    let target_path = get_yasb_config_path(&state);
    let serialized_content = serde_yaml::to_string(&config)?;
    atomic_write_file(&target_path, &serialized_content, Some(ConfigFormat::Yaml))
}

/// Reads the raw CSS stylesheet for YASB status bar.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
///
/// # Returns
///
/// * `Ok(String)` - Raw CSS file contents.
/// * `Err(AppError)` - If reading fails.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if `styles.css` cannot be read.
#[tauri::command]
pub async fn load_yasb_css(state: State<'_, AppState>) -> Result<String, AppError> {
    let target_path = get_yasb_css_path(&state);
    read_file_string(&target_path)
}

/// Persists raw CSS stylesheet content for YASB status bar atomically.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `css` - CSS stylesheet content string.
///
/// # Returns
///
/// * `Ok(())` - CSS stylesheet updated successfully.
/// * `Err(AppError)` - If atomic writing fails.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if writing fails.
#[tauri::command]
pub async fn save_yasb_css(state: State<'_, AppState>, css: String) -> Result<(), AppError> {
    let target_path = get_yasb_css_path(&state);
    atomic_write_file(&target_path, &css, None)
}

/// Loads and validates FluentFlyout configuration JSON.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
///
/// # Returns
///
/// * `Ok(FluentFlyoutConfig)` - Parsed FluentFlyout configuration.
/// * `Err(AppError)` - If file reading or JSON parsing fails.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if the file cannot be read.
/// Returns [`AppError::ParseError`] if JSON deserialization fails.
#[tauri::command]
pub async fn load_fluentflyout_config(
    state: State<'_, AppState>,
) -> Result<FluentFlyoutConfig, AppError> {
    let target_path = get_fluentflyout_config_path(&state);
    let file_content = read_file_string(&target_path)?;
    Ok(serde_json::from_str::<FluentFlyoutConfig>(&file_content)?)
}

/// Persists FluentFlyout configuration JSON atomically to disk.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `config` - Updated FluentFlyout configuration payload.
///
/// # Returns
///
/// * `Ok(())` - Configuration saved successfully.
/// * `Err(AppError)` - If serialization or writing fails.
///
/// # Errors
///
/// Returns [`AppError::ParseError`] if JSON serialization fails.
/// Returns [`AppError::IoError`] if atomic writing fails.
#[tauri::command]
pub async fn save_fluentflyout_config(
    state: State<'_, AppState>,
    config: FluentFlyoutConfig,
) -> Result<(), AppError> {
    let target_path = get_fluentflyout_config_path(&state);
    let serialized_content = serde_json::to_string_pretty(&config)?;
    atomic_write_file(&target_path, &serialized_content, Some(ConfigFormat::Json))
}

/// Retrieves EarTrumpet settings from the registry staging template.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
///
/// # Returns
///
/// * `Ok(EarTrumpetConfig)` - Parsed EarTrumpet registry configuration.
/// * `Err(AppError)` - Never fails; returns fallback defaults on error.
#[tauri::command]
pub async fn get_eartrumpet_config(
    state: State<'_, AppState>,
) -> Result<EarTrumpetConfig, AppError> {
    // If in sandbox mode or reading fails, inspect staging reg file
    let registry_file_path = state.resolve_path(&state.repo_root.join("configs").join("polish").join("eartrumpet_settings.reg"));
    if registry_file_path.exists() {
        let registry_content = read_file_string(&registry_file_path).unwrap_or_default();
        return Ok(EarTrumpetConfig {
            has_migrated: registry_content.contains("\"HasMigrated\"=dword:00000001"),
            use_accent_color: registry_content.contains("\"UseAccentColor\"=dword:00000001"),
            theme: if registry_content.contains("\"Theme\"=\"System\"") {
                "System".to_string()
            } else if registry_content.contains("\"Theme\"=\"Dark\"") {
                "Dark".to_string()
            } else {
                "Light".to_string()
            },
            show_volume_peak_meter: registry_content.contains("\"ShowVolumePeakMeter\"=dword:00000001"),
            show_playback_devices: registry_content.contains("\"ShowPlaybackDevices\"=dword:00000001"),
            show_recording_devices: registry_content.contains("\"ShowRecordingDevices\"=dword:00000001"),
            show_app_icons: registry_content.contains("\"ShowAppIcons\"=dword:00000001"),
            expand_all: registry_content.contains("\"ExpandAll\"=dword:00000001"),
            is_promoted_in_tray: registry_content.contains("\"IsPromoted\"=dword:00000001"),
        });
    }

    Ok(EarTrumpetConfig {
        has_migrated: true,
        use_accent_color: true,
        theme: "System".to_string(),
        show_volume_peak_meter: true,
        show_playback_devices: true,
        show_recording_devices: false,
        show_app_icons: true,
        expand_all: false,
        is_promoted_in_tray: true,
    })
}

/// Generates and persists EarTrumpet registry file (`eartrumpet_settings.reg`) atomically.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `config` - EarTrumpet configuration payload.
///
/// # Returns
///
/// * `Ok(())` - Registry export staged successfully.
/// * `Err(AppError)` - If atomic writing fails.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if file write fails.
#[tauri::command]
pub async fn set_eartrumpet_config(
    state: State<'_, AppState>,
    config: EarTrumpetConfig,
) -> Result<(), AppError> {
    validate_eartrumpet_theme(&config.theme)?;

    let registry_file_path = state.resolve_path(&state.repo_root.join("configs").join("polish").join("eartrumpet_settings.reg"));
    let registry_file_content = format!(
        "Windows Registry Editor Version 5.00\r\n\r\n\
        [HKEY_CURRENT_USER\\Software\\File-New-Project\\EarTrumpet]\r\n\
        \"HasMigrated\"=dword:{:08x}\r\n\
        \"UseAccentColor\"=dword:{:08x}\r\n\
        \"Theme\"=\"{}\"\r\n\
        \"FirstRun\"=dword:00000000\r\n\r\n\
        [HKEY_CURRENT_USER\\Software\\File-New-Project\\EarTrumpet\\Flyout]\r\n\
        \"ShowVolumePeakMeter\"=dword:{:08x}\r\n\
        \"ShowPlaybackDevices\"=dword:{:08x}\r\n\
        \"ShowRecordingDevices\"=dword:{:08x}\r\n\
        \"ShowAppIcons\"=dword:{:08x}\r\n\
        \"ExpandAll\"=dword:{:08x}\r\n\r\n\
        [HKEY_CURRENT_USER\\Control Panel\\NotifyIconSettings\\EarTrumpet]\r\n\
        \"IsPromoted\"=dword:{:08x}\r\n",
        if config.has_migrated { 1 } else { 0 },
        if config.use_accent_color { 1 } else { 0 },
        config.theme,
        if config.show_volume_peak_meter { 1 } else { 0 },
        if config.show_playback_devices { 1 } else { 0 },
        if config.show_recording_devices { 1 } else { 0 },
        if config.show_app_icons { 1 } else { 0 },
        if config.expand_all { 1 } else { 0 },
        if config.is_promoted_in_tray { 1 } else { 0 }
    );

    atomic_write_file(&registry_file_path, &registry_file_content, None)
}
