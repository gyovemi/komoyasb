//! Performance tier configuration commands and system throttling controls.
//!
//! Provides granular query and transactional mutation for hardware performance tiers
//! ("ultra-low", "balanced", "visual-rich", "gaming") across Komorebi, YASB, DWM, and Windows OS.

use std::collections::HashMap;
use std::path::PathBuf;
use tauri::State;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;
use crate::utils::atomic_write::{atomic_write_file, read_file_string};
use crate::utils::process::run_powershell_script;
use crate::utils::validator::{validate_performance_profile, ConfigFormat};
use crate::commands::system::ApplyResult;

/// Performance and animation tuning options for the Komorebi tiling engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KomorebiPerfSettings {
    /// Whether window movement and resizing animations are active.
    pub animation_enabled: bool,
    /// Duration of tiling layout transitions in milliseconds.
    pub animation_duration_ms: u32,
    /// Target frame rate cap for animations in frames per second.
    pub animation_fps: u32,
    /// Whether window outline borders are drawn.
    pub border_enabled: bool,
    /// Stroke width of window borders in pixels.
    pub border_width: u32,
    /// Border offset from outer window frame in pixels.
    pub border_offset: i32,
    /// Visual style of borders ("square" or "rounded").
    pub border_style: String,
    /// Underlying border rendering mechanism ("Komorebi" or "Windows").
    pub border_implementation: String,
    /// Handling policy for windows not actively managed by Komorebi ("Op" or "NoOp").
    pub unmanaged_window_operation_behaviour: String,
    /// Whether window transparency effects are calculated.
    pub transparency_enabled: bool,
    /// Mechanism used to conceal inactive windows ("Minimize" or "Cloak").
    pub window_hiding_behaviour: String,
}

/// Throttling intervals and visual effect toggles for YASB Reborn status bar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YasbPerfSettings {
    /// Whether background blur is computed behind the status bar.
    pub blur_enabled: bool,
    /// Whether acrylic backdrop material is enabled.
    pub acrylic_enabled: bool,
    /// Whether status bar container corners are rounded.
    pub round_corners: bool,
    /// Status bar widget animation transition duration in milliseconds.
    pub animation_duration_ms: u32,
    /// CPU utilization query poll interval in milliseconds.
    pub cpu_interval_ms: u32,
    /// Memory consumption query poll interval in milliseconds.
    pub memory_interval_ms: u32,
    /// Network traffic monitoring poll interval in milliseconds.
    pub traffic_interval_ms: u32,
    /// Media player session polling interval in milliseconds.
    pub media_interval_ms: u32,
    /// Clock widget display refresh interval in milliseconds.
    pub clock_interval_ms: u32,
    /// GPU load query poll interval in milliseconds.
    pub gpu_interval_ms: u32,
}

/// Windows Desktop Window Manager (DWM) visual composition options.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DwmPerfSettings {
    /// Backdrop material type (0: None, 1: Solid/Mica, 2: MicaAlt, 3: Acrylic).
    pub backdrop_type: u32,
    /// Whether DWM dark mode attribute is forced system-wide.
    pub force_dark_mode: bool,
    /// Corner rounding preference (1: Square, 2: Round, 3: SmallRound).
    pub rounded_corners: u32,
    /// Whether OS-level motion and transition animations are suppressed.
    pub reduce_motion: bool,
    /// Whether the Windows taskbar autohide feature is enforced.
    pub taskbar_autohide_enabled: bool,
}

/// Performance options for the Flow Launcher search interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LauncherPerfSettings {
    /// Whether launcher window transitions use animations.
    pub use_animation: bool,
    /// Animation transition speed profile ("Fast", "Medium", "Slow").
    pub animation_speed: String,
    /// Search window backdrop effect ("None", "Mica", "Acrylic").
    pub search_window_effect: String,
    /// Whether drop shadows are rendered around the search box.
    pub shadow_effect: bool,
    /// Maximum count of query suggestions rendered simultaneously.
    pub max_results: u32,
    /// Maximum number of cached plugin query results in memory.
    pub plugin_cache_max: u32,
}

/// Performance options for FluentFlyout on-screen indicators.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlyoutPerfSettings {
    /// Backdrop effect ("None", "Mica", "MicaAlt", "Acrylic").
    pub backdrop: String,
    /// Whether entrance fade animations are active.
    pub animate_show: bool,
    /// Whether exit fade animations are active.
    pub animate_hide: bool,
    /// Animation duration in milliseconds.
    pub animation_duration_ms: u32,
    /// Display timeout before auto-dismissal in milliseconds.
    pub timeout_ms: u32,
}

/// Windows operating system scheduling and process priority rules.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OsPerfSettings {
    /// Whether Windows EcoQoS (Efficiency Mode) is enforced for background helpers.
    pub background_eco_qos: bool,
    /// Process scheduling priority assigned to `komorebi.exe` ("Normal", "AboveNormal", "High").
    pub komorebi_priority: String,
    /// Process scheduling priority assigned to `yasb.exe` ("Idle", "BelowNormal", "Normal").
    pub yasb_priority: String,
    /// Whether Windows system-wide window animations are disabled via `SystemParametersInfo`.
    pub disable_windows_animations: bool,
}

/// Aggregated performance profile definition spanning all desktop subsystems.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceProfile {
    /// Komorebi tiling performance configuration.
    pub komorebi: KomorebiPerfSettings,
    /// YASB status bar polling intervals and visual toggles.
    pub yasb: YasbPerfSettings,
    /// Windows DWM backdrop and corner settings.
    pub dwm: DwmPerfSettings,
    /// Flow Launcher search cache and animation settings.
    pub launcher: LauncherPerfSettings,
    /// FluentFlyout animation and display timeouts.
    pub flyout: FlyoutPerfSettings,
    /// Windows kernel scheduling and EcoQoS settings.
    pub os: OsPerfSettings,
}

/// Root configuration schema for `performance.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceConfig {
    /// Schema validation URI.
    #[serde(rename = "$schema", skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    /// Currently active profile name ("ultra-low", "balanced", "visual-rich", "gaming").
    pub active_profile: String,
    /// Map of named performance profiles.
    pub profiles: HashMap<String, PerformanceProfile>,
}

/// Resolves the filesystem path to `performance.json`.
fn get_performance_config_path(state: &AppState) -> PathBuf {
    state.resolve_path(&state.repo_root.join("performance.json"))
}

/// Generates the standard default performance configuration with 4 optimization tiers.
fn get_default_performance_config() -> PerformanceConfig {
    let mut profile_map = HashMap::new();

    // 1. ultra-low: Maximum energy efficiency and minimal CPU overhead
    profile_map.insert(
        "ultra-low".to_string(),
        PerformanceProfile {
            komorebi: KomorebiPerfSettings {
                animation_enabled: false,
                animation_duration_ms: 0,
                animation_fps: 30,
                border_enabled: false,
                border_width: 1,
                border_offset: 0,
                border_style: "square".to_string(),
                border_implementation: "Windows".to_string(),
                unmanaged_window_operation_behaviour: "NoOp".to_string(),
                transparency_enabled: false,
                window_hiding_behaviour: "Minimize".to_string(),
            },
            yasb: YasbPerfSettings {
                blur_enabled: false,
                acrylic_enabled: false,
                round_corners: false,
                animation_duration_ms: 0,
                cpu_interval_ms: 10000,
                memory_interval_ms: 15000,
                traffic_interval_ms: 10000,
                media_interval_ms: 5000,
                clock_interval_ms: 5000,
                gpu_interval_ms: 30000,
            },
            dwm: DwmPerfSettings {
                backdrop_type: 1,
                force_dark_mode: true,
                rounded_corners: 1,
                reduce_motion: true,
                taskbar_autohide_enabled: false,
            },
            launcher: LauncherPerfSettings {
                use_animation: false,
                animation_speed: "Fast".to_string(),
                search_window_effect: "None".to_string(),
                shadow_effect: false,
                max_results: 5,
                plugin_cache_max: 50,
            },
            flyout: FlyoutPerfSettings {
                backdrop: "None".to_string(),
                animate_show: false,
                animate_hide: false,
                animation_duration_ms: 0,
                timeout_ms: 2000,
            },
            os: OsPerfSettings {
                background_eco_qos: true,
                komorebi_priority: "Normal".to_string(),
                yasb_priority: "BelowNormal".to_string(),
                disable_windows_animations: true,
            },
        },
    );

    // 2. balanced: Standard daily workflow configuration
    profile_map.insert(
        "balanced".to_string(),
        PerformanceProfile {
            komorebi: KomorebiPerfSettings {
                animation_enabled: true,
                animation_duration_ms: 150,
                animation_fps: 60,
                border_enabled: true,
                border_width: 2,
                border_offset: 0,
                border_style: "rounded".to_string(),
                border_implementation: "Komorebi".to_string(),
                unmanaged_window_operation_behaviour: "Op".to_string(),
                transparency_enabled: true,
                window_hiding_behaviour: "Cloak".to_string(),
            },
            yasb: YasbPerfSettings {
                blur_enabled: true,
                acrylic_enabled: false,
                round_corners: true,
                animation_duration_ms: 150,
                cpu_interval_ms: 2000,
                memory_interval_ms: 3000,
                traffic_interval_ms: 2000,
                media_interval_ms: 1000,
                clock_interval_ms: 1000,
                gpu_interval_ms: 5000,
            },
            dwm: DwmPerfSettings {
                backdrop_type: 2,
                force_dark_mode: true,
                rounded_corners: 2,
                reduce_motion: false,
                taskbar_autohide_enabled: false,
            },
            launcher: LauncherPerfSettings {
                use_animation: true,
                animation_speed: "Fast".to_string(),
                search_window_effect: "Mica".to_string(),
                shadow_effect: true,
                max_results: 8,
                plugin_cache_max: 200,
            },
            flyout: FlyoutPerfSettings {
                backdrop: "MicaAlt".to_string(),
                animate_show: true,
                animate_hide: true,
                animation_duration_ms: 150,
                timeout_ms: 3000,
            },
            os: OsPerfSettings {
                background_eco_qos: false,
                komorebi_priority: "Normal".to_string(),
                yasb_priority: "Normal".to_string(),
                disable_windows_animations: false,
            },
        },
    );

    // 3. visual-rich: Premium visual flair with Acrylic and high-FPS animations
    profile_map.insert(
        "visual-rich".to_string(),
        PerformanceProfile {
            komorebi: KomorebiPerfSettings {
                animation_enabled: true,
                animation_duration_ms: 250,
                animation_fps: 120,
                border_enabled: true,
                border_width: 3,
                border_offset: 1,
                border_style: "rounded".to_string(),
                border_implementation: "Komorebi".to_string(),
                unmanaged_window_operation_behaviour: "Op".to_string(),
                transparency_enabled: true,
                window_hiding_behaviour: "Cloak".to_string(),
            },
            yasb: YasbPerfSettings {
                blur_enabled: true,
                acrylic_enabled: true,
                round_corners: true,
                animation_duration_ms: 250,
                cpu_interval_ms: 1000,
                memory_interval_ms: 2000,
                traffic_interval_ms: 1000,
                media_interval_ms: 500,
                clock_interval_ms: 1000,
                gpu_interval_ms: 2000,
            },
            dwm: DwmPerfSettings {
                backdrop_type: 3,
                force_dark_mode: true,
                rounded_corners: 2,
                reduce_motion: false,
                taskbar_autohide_enabled: false,
            },
            launcher: LauncherPerfSettings {
                use_animation: true,
                animation_speed: "Medium".to_string(),
                search_window_effect: "Acrylic".to_string(),
                shadow_effect: true,
                max_results: 10,
                plugin_cache_max: 500,
            },
            flyout: FlyoutPerfSettings {
                backdrop: "Acrylic".to_string(),
                animate_show: true,
                animate_hide: true,
                animation_duration_ms: 250,
                timeout_ms: 4000,
            },
            os: OsPerfSettings {
                background_eco_qos: false,
                komorebi_priority: "Normal".to_string(),
                yasb_priority: "Normal".to_string(),
                disable_windows_animations: false,
            },
        },
    );

    // 4. gaming: Zero background overhead and prioritization of foreground frame delivery
    profile_map.insert(
        "gaming".to_string(),
        PerformanceProfile {
            komorebi: KomorebiPerfSettings {
                animation_enabled: false,
                animation_duration_ms: 0,
                animation_fps: 30,
                border_enabled: false,
                border_width: 1,
                border_offset: 0,
                border_style: "square".to_string(),
                border_implementation: "Windows".to_string(),
                unmanaged_window_operation_behaviour: "NoOp".to_string(),
                transparency_enabled: false,
                window_hiding_behaviour: "Minimize".to_string(),
            },
            yasb: YasbPerfSettings {
                blur_enabled: false,
                acrylic_enabled: false,
                round_corners: false,
                animation_duration_ms: 0,
                cpu_interval_ms: 30000,
                memory_interval_ms: 30000,
                traffic_interval_ms: 30000,
                media_interval_ms: 10000,
                clock_interval_ms: 10000,
                gpu_interval_ms: 60000,
            },
            dwm: DwmPerfSettings {
                backdrop_type: 1,
                force_dark_mode: true,
                rounded_corners: 1,
                reduce_motion: true,
                taskbar_autohide_enabled: false,
            },
            launcher: LauncherPerfSettings {
                use_animation: false,
                animation_speed: "Fast".to_string(),
                search_window_effect: "None".to_string(),
                shadow_effect: false,
                max_results: 5,
                plugin_cache_max: 50,
            },
            flyout: FlyoutPerfSettings {
                backdrop: "None".to_string(),
                animate_show: false,
                animate_hide: false,
                animation_duration_ms: 0,
                timeout_ms: 2000,
            },
            os: OsPerfSettings {
                background_eco_qos: false,
                komorebi_priority: "AboveNormal".to_string(),
                yasb_priority: "Idle".to_string(),
                disable_windows_animations: true,
            },
        },
    );

    PerformanceConfig {
        schema: Some("./themes/performance.schema.json".to_string()),
        active_profile: "balanced".to_string(),
        profiles: profile_map,
    }
}

/// Loads and validates performance configuration from `performance.json`.
///
/// If `performance.json` is missing, initializes and saves default profile settings.
///
/// # Arguments
///
/// * `state` - Thread-safe application state containing workspace paths and sandbox mode.
///
/// # Returns
///
/// * `Ok(PerformanceConfig)` - Validated performance profile container.
/// * `Err(AppError)` - If file reading or parsing fails.
///
/// # Errors
///
/// Returns [`AppError::IoError`] if file reading fails.
/// Returns [`AppError::ParseError`] if JSON parsing fails.
#[tauri::command]
pub async fn get_performance_config(state: State<'_, AppState>) -> Result<PerformanceConfig, AppError> {
    let config_path = get_performance_config_path(&state);

    if !config_path.exists() {
        let default_config = get_default_performance_config();
        let serialized_content = serde_json::to_string_pretty(&default_config)?;
        atomic_write_file(&config_path, &serialized_content, Some(ConfigFormat::Json))?;
        return Ok(default_config);
    }

    let file_content = read_file_string(&config_path)?;
    Ok(serde_json::from_str(&file_content)?)
}

/// Persists performance configuration atomically to `performance.json`.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `config` - Updated performance configuration payload.
///
/// # Returns
///
/// * `Ok(())` - Configuration saved successfully.
/// * `Err(AppError)` - If JSON serialization or atomic writing fails.
///
/// # Errors
///
/// Returns [`AppError::ParseError`] if serialization fails.
/// Returns [`AppError::IoError`] if writing fails.
#[tauri::command]
pub async fn save_performance_config(
    state: State<'_, AppState>,
    config: PerformanceConfig,
) -> Result<(), AppError> {
    let config_path = get_performance_config_path(&state);
    let serialized_content = serde_json::to_string_pretty(&config)?;
    atomic_write_file(&config_path, &serialized_content, Some(ConfigFormat::Json))
}

/// Applies a performance profile across all system subsystems.
///
/// Updates active profile in `performance.json`, records `themes/.current_perf`,
/// and delegates configuration rendering and process throttling to `Set-PerformanceProfile.ps1`.
///
/// # Arguments
///
/// * `state` - Thread-safe application state.
/// * `profile` - Target profile name ("ultra-low", "balanced", "visual-rich", "gaming").
/// * `dry_run` - If true, evaluates changes without modifying live configuration or services.
///
/// # Returns
///
/// * `Ok(ApplyResult)` - Summary of rendered files, reloaded services, and execution logs.
/// * `Err(AppError)` - If profile application script encounters a critical error.
///
/// # Errors
///
/// Returns [`AppError::ProcessError`] if PowerShell execution fails.
#[tauri::command]
pub async fn set_performance_profile(
    state: State<'_, AppState>,
    profile: String,
    dry_run: bool,
) -> Result<ApplyResult, AppError> {
    validate_performance_profile(&profile)?;

    let is_dry_run = dry_run || state.sandbox.is_sandboxed;

    if !is_dry_run {
        // 1. If performance.json exists, update active_profile in it
        let config_path = get_performance_config_path(&state);
        if config_path.exists() {
            if let Ok(file_content) = read_file_string(&config_path) {
                if let Ok(mut parsed_config) = serde_json::from_str::<PerformanceConfig>(&file_content) {
                    parsed_config.active_profile = profile.clone();
                    if let Ok(serialized_content) = serde_json::to_string_pretty(&parsed_config) {
                        let _ = atomic_write_file(&config_path, &serialized_content, Some(ConfigFormat::Json));
                    }
                }
            }
        }

        // 2. Write themes/.current_perf marker file
        let current_perf_path = state.resolve_path(&state.repo_root.join("themes").join(".current_perf"));
        let _ = atomic_write_file(&current_perf_path, &profile, None);
    }

    // 3. Invoke Set-PerformanceProfile.ps1 (or fallback to sync-theme.ps1)
    let script_path = state.repo_root.join("scripts").join("Set-PerformanceProfile.ps1");
    let fallback_script = state.repo_root.join("scripts").join("sync-theme.ps1");

    let mut command_args = Vec::new();

    let target_script = if script_path.exists() {
        command_args.push("-Profile");
        command_args.push(&profile);
        if is_dry_run {
            command_args.push("-DryRun");
        }
        if let Some(ref sandbox_dir) = state.sandbox.sandbox_path {
            command_args.push("-SandboxRoot");
            command_args.push(sandbox_dir.to_str().unwrap_or(""));
        }
        script_path.to_string_lossy().to_string()
    } else {
        if is_dry_run {
            command_args.push("-DryRun");
        }
        if let Some(ref sandbox_dir) = state.sandbox.sandbox_path {
            command_args.push("-SandboxRoot");
            command_args.push(sandbox_dir.to_str().unwrap_or(""));
        }
        command_args.push("-PerformanceProfile");
        command_args.push(&profile);
        fallback_script.to_string_lossy().to_string()
    };

    let execution_result = run_powershell_script(&target_script, &command_args, false)?;

    let rendered_files = vec![
        "configs/komorebi/komorebi.json".to_string(),
        "configs/yasb/config.yaml".to_string(),
        "configs/yasb/styles.css".to_string(),
        "configs/shell/flow_settings.json".to_string(),
        "configs/polish/fluentflyout_config.json".to_string(),
    ];

    let reloaded_services = vec![
        "komorebi".to_string(),
        "yasb".to_string(),
        "whkd".to_string(),
    ];

    Ok(ApplyResult {
        success: execution_result.success,
        theme_name: format!("profile:{}", profile),
        rendered_files,
        reloaded_services,
        output_log: format!("{}\n{}", execution_result.stdout, execution_result.stderr),
    })
}
