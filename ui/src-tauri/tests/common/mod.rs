use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use sysinfo::System;
use tempfile::{tempdir, TempDir};

use komoyasb_control_center_lib::state::AppState;
use komoyasb_control_center_lib::utils::sandbox::SandboxContext;

pub const SAMPLE_THEME_JSON: &str = r#"{
  "name": "Tokyo Night Dark",
  "variant": "dark",
  "colors": {
    "bg_primary": "#1a1b26",
    "bg_secondary": "#16161e",
    "bg_surface": "#24283b",
    "fg_primary": "#c0caf5",
    "fg_secondary": "#a9b1d6",
    "fg_muted": "#565f89",
    "accent": "#7aa2f7",
    "accent_secondary": "#bb9af7",
    "border_active": "#7aa2f7",
    "border_inactive": "#292e42",
    "error": "#f7768e",
    "warning": "#e0af68",
    "success": "#9ece6a",
    "info": "#7dcfff"
  },
  "typography": {
    "font_family": "JetBrainsMono Nerd Font",
    "font_size_sm": "11px",
    "font_size_md": "13px",
    "font_size_lg": "16px"
  },
  "geometry": {
    "border_width": 2,
    "border_radius": 8,
    "window_gap": 8,
    "bar_height": 32
  },
  "opacity": {
    "bar": 0.88,
    "window_unfocused": 0.85,
    "flyout": 0.90,
    "launcher": 0.92
  },
  "wallpaper": {
    "path": "configs/polish/wallpapers/dark.png",
    "style": "Fill"
  }
}"#;

pub const SAMPLE_LIGHT_THEME_JSON: &str = r#"{
  "name": "Tokyo Night Light",
  "variant": "light",
  "colors": {
    "bg_primary": "#e6e9ef",
    "bg_secondary": "#dce0e8",
    "bg_surface": "#ccd0da",
    "fg_primary": "#4c4f69",
    "fg_secondary": "#5c5f77",
    "fg_muted": "#9ca0b0",
    "accent": "#1e66f5",
    "accent_secondary": "#8839ef",
    "border_active": "#1e66f5",
    "border_inactive": "#bcc0cc",
    "error": "#d20f39",
    "warning": "#df8e1d",
    "success": "#40a02b",
    "info": "#209fb5"
  },
  "typography": {
    "font_family": "JetBrainsMono Nerd Font",
    "font_size_sm": "11px",
    "font_size_md": "13px",
    "font_size_lg": "16px"
  },
  "geometry": {
    "border_width": 2,
    "border_radius": 8,
    "window_gap": 8,
    "bar_height": 32
  },
  "opacity": {
    "bar": 0.95,
    "window_unfocused": 0.90,
    "flyout": 0.95,
    "launcher": 0.95
  },
  "wallpaper": {
    "path": "configs/polish/wallpapers/light.png",
    "style": "Fill"
  }
}"#;

pub const SAMPLE_KOMOREBI_JSON: &str = r#"{
  "$schema": "https://raw.githubusercontent.com/LGUG2Z/komorebi/v0.1.33/schema.json",
  "app_specific_configuration_path": "$USERPROFILE/.config/komorebi/applications.yaml",
  "cross_monitor_move_behaviour": "Insert",
  "default_workspace_padding": 8,
  "default_container_padding": 8,
  "border": true,
  "border_width": 2,
  "border_offset": 0,
  "border_style": "rounded",
  "border_colours": {
    "single": "#7aa2f7",
    "stack": "#bb9af7",
    "monocle": "#7aa2f7",
    "unfocused": "#292e42",
    "floating": "#bb9af7"
  },
  "mouse_follows_focus": false,
  "transparency": false,
  "transparency_alpha": 0.85,
  "window_hiding_behaviour": "Cloak",
  "workspaces_per_monitor": true,
  "monitors": [
    {
      "workspaces": [
        {
          "name": "1:dev",
          "layout": "BSP"
        }
      ]
    }
  ]
}"#;

pub const SAMPLE_APPLICATIONS_YAML: &str = r#"- name: Flow Launcher
  identifier:
    kind: Exe
    id: Flow.Launcher.exe
    matching_strategy: Equals
  float: true
- name: EarTrumpet Audio Control
  identifier:
    kind: Exe
    id: EarTrumpet.exe
    matching_strategy: Equals
  float: true
"#;

pub const SAMPLE_WHKDRC: &str = r#"# Navigation
alt + h : komorebic focus left
alt + j : komorebic focus down

# Workspaces
alt + 1 : komorebic focus-workspace 0
"#;

pub const SAMPLE_YASB_CONFIG_YAML: &str = r#"watch_stylesheet: true
watch_config: true
bars:
  main-bar:
    enabled: true
    screens: ["*"]
    class_name: "yasb-bar"
    alignment:
      position: "top"
      center: false
    blur_effect:
      enabled: true
      acrylic: false
      dark: true
      round_corners: true
      round_corners_type: "normal"
      border_color: "#292e42"
    window_flags:
      always_on_top: false
      windows_app_bar: true
    dimensions:
      width: "100%"
      height: 32
    padding:
      top: 0
      left: 6
      bottom: 0
      right: 6
    widgets:
      left:
        - "komorebi_workspaces"
      center:
        - "clock"
      right:
        - "cpu"
widgets:
  clock:
    type: "yasb.clock.ClockWidget"
"#;

pub const SAMPLE_YASB_CSS: &str = r#"* {
  font-family: "JetBrainsMono Nerd Font";
  font-size: 13px;
}
.yasb-bar {
  background-color: rgba(26, 27, 38, 0.88);
}
"#;

pub const SAMPLE_FLUENTFLYOUT_JSON: &str = r#"{
  "General": {
    "RunAtStartup": true,
    "ShowTrayIcon": false,
    "CheckForUpdates": false,
    "Language": "en-US"
  },
  "Appearance": {
    "Theme": "dark",
    "Backdrop": "MicaAlt",
    "AccentColor": "#7aa2f7",
    "AccentSecondaryColor": "#bb9af7",
    "BackgroundColor": "#1a1b26",
    "SurfaceColor": "#24283b",
    "ForegroundColor": "#c0caf5",
    "ForegroundMutedColor": "#565f89",
    "BorderColor": "#7aa2f7",
    "BorderWidth": 2,
    "CornerRadius": 8,
    "FontFamily": "JetBrainsMono Nerd Font",
    "FontSize": "13px",
    "Opacity": 0.90
  },
  "Placement": {
    "Alignment": "TopCenter",
    "DisplayIndex": 0,
    "OffsetX": 0,
    "OffsetY": 32,
    "Margin": 8,
    "SafePaddingYASB": 32,
    "KeepOnScreen": true,
    "AvoidWorkAreaOverlap": true
  },
  "Behavior": {
    "TimeoutMs": 3000
  },
  "Modules": {
    "Volume": {
      "Enabled": true,
      "StepSize": 2,
      "ShowMuteIndicator": true
    },
    "Brightness": {
      "Enabled": true,
      "StepSize": 5
    },
    "Media": {
      "Enabled": true,
      "ShowThumbnail": true,
      "ShowPlaybackControls": true,
      "ShowTimeline": true
    },
    "AirplaneMode": {
      "Enabled": false
    },
    "LockKeys": {
      "Enabled": true,
      "ShowCapsLock": true,
      "ShowNumLock": true,
      "ShowScrollLock": false
    }
  }
}"#;

pub const SAMPLE_FLOW_SETTINGS_JSON: &str = r#"{
  "Hotkey": "Alt + Space",
  "Theme": "KomoyasbFluent",
  "Font": "JetBrainsMono Nerd Font",
  "CustomAccentColor": "#7aa2f7",
  "UseWindowsAccentColor": false,
  "SearchWindowEffect": "Mica",
  "BorderRadius": 8,
  "Opacity": 0.92,
  "MaxResultsToShow": 8
}"#;

pub const SAMPLE_PERFORMANCE_JSON: &str = r#"{
  "$schema": "./themes/performance.schema.json",
  "active_profile": "balanced",
  "profiles": {
    "balanced": {
      "komorebi": {
        "animation_enabled": true,
        "animation_duration_ms": 150,
        "animation_fps": 60,
        "border_enabled": true,
        "border_width": 2,
        "border_offset": 0,
        "border_style": "rounded",
        "border_implementation": "Komorebi",
        "unmanaged_window_operation_behaviour": "Op",
        "transparency_enabled": true,
        "window_hiding_behaviour": "Cloak"
      },
      "yasb": {
        "blur_enabled": true,
        "acrylic_enabled": false,
        "round_corners": true,
        "animation_duration_ms": 150,
        "cpu_interval_ms": 2000,
        "memory_interval_ms": 3000,
        "traffic_interval_ms": 2000,
        "media_interval_ms": 1000,
        "clock_interval_ms": 1000,
        "gpu_interval_ms": 5000
      },
      "dwm": {
        "backdrop_type": 2,
        "force_dark_mode": true,
        "rounded_corners": 2,
        "reduce_motion": false,
        "taskbar_autohide_enabled": false
      },
      "launcher": {
        "use_animation": true,
        "animation_speed": "Fast",
        "search_window_effect": "Mica",
        "shadow_effect": true,
        "max_results": 8,
        "plugin_cache_max": 200
      },
      "flyout": {
        "backdrop": "MicaAlt",
        "animate_show": true,
        "animate_hide": true,
        "animation_duration_ms": 150,
        "timeout_ms": 3000
      },
      "os": {
        "background_eco_qos": false,
        "komorebi_priority": "Normal",
        "yasb_priority": "Normal",
        "disable_windows_animations": false
      }
    }
  }
}"#;

pub fn setup_test_repo() -> TempDir {
    let dir = tempdir().expect("Failed to create tempdir");
    let root = dir.path();

    // 1. themes directory
    let themes_dir = root.join("themes");
    fs::create_dir_all(&themes_dir).unwrap();
    fs::write(themes_dir.join("dark.json"), SAMPLE_THEME_JSON).unwrap();
    fs::write(themes_dir.join("light.json"), SAMPLE_LIGHT_THEME_JSON).unwrap();
    fs::write(themes_dir.join("theme.schema.json"), "{}").unwrap();
    fs::write(themes_dir.join(".current_theme"), "Tokyo Night Dark").unwrap();
    fs::write(themes_dir.join(".current_perf"), "balanced").unwrap();

    // 2. configs/komorebi
    let komorebi_dir = root.join("configs").join("komorebi");
    fs::create_dir_all(&komorebi_dir).unwrap();
    fs::write(komorebi_dir.join("komorebi.json"), SAMPLE_KOMOREBI_JSON).unwrap();
    fs::write(komorebi_dir.join("applications.yaml"), SAMPLE_APPLICATIONS_YAML).unwrap();
    fs::write(komorebi_dir.join("whkdrc"), SAMPLE_WHKDRC).unwrap();

    // 3. configs/yasb
    let yasb_dir = root.join("configs").join("yasb");
    fs::create_dir_all(&yasb_dir).unwrap();
    fs::write(yasb_dir.join("config.yaml"), SAMPLE_YASB_CONFIG_YAML).unwrap();
    fs::write(yasb_dir.join("styles.css"), SAMPLE_YASB_CSS).unwrap();

    // 4. configs/shell
    let shell_dir = root.join("configs").join("shell");
    fs::create_dir_all(&shell_dir).unwrap();
    fs::write(shell_dir.join("flow_settings.json"), SAMPLE_FLOW_SETTINGS_JSON).unwrap();

    // 5. configs/polish
    let polish_dir = root.join("configs").join("polish");
    fs::create_dir_all(&polish_dir).unwrap();
    fs::write(polish_dir.join("fluentflyout_config.json"), SAMPLE_FLUENTFLYOUT_JSON).unwrap();
    fs::write(
        polish_dir.join("eartrumpet_settings.reg"),
        "Windows Registry Editor Version 5.00\r\n\r\n[HKEY_CURRENT_USER\\Software\\File-New-Project\\EarTrumpet]\r\n\"HasMigrated\"=dword:00000001\r\n\"UseAccentColor\"=dword:00000001\r\n\"Theme\"=\"System\"\r\n",
    ).unwrap();

    // 6. performance.json
    fs::write(root.join("performance.json"), SAMPLE_PERFORMANCE_JSON).unwrap();

    // 7. themes/.backups
    let backup_dir = root.join("themes").join(".backups").join("20261120_120000");
    fs::create_dir_all(&backup_dir).unwrap();
    fs::write(backup_dir.join("komorebi.json"), SAMPLE_KOMOREBI_JSON).unwrap();

    // 8. scripts
    let scripts_dir = root.join("scripts");
    fs::create_dir_all(&scripts_dir).unwrap();
    fs::write(scripts_dir.join("sync-theme.ps1"), "# sync theme mock script\nexit 0").unwrap();
    fs::write(scripts_dir.join("Set-PerformanceProfile.ps1"), "# perf mock script\nexit 0").unwrap();
    fs::write(scripts_dir.join("apply-windhawk-mods.ps1"), "# windhawk mock script\nexit 0").unwrap();
    fs::write(scripts_dir.join("watchdog.ps1"), "# watchdog mock script\nexit 0").unwrap();
    fs::write(scripts_dir.join("install.ps1"), "# install mock script\nexit 0").unwrap();

    dir
}

pub fn create_test_app_state(repo_root: PathBuf) -> AppState {
    AppState {
        sandbox: SandboxContext {
            is_sandboxed: false,
            sandbox_path: None,
            live_working_dir: repo_root.clone(),
        },
        sys: Arc::new(Mutex::new(System::new_all())),
        repo_root,
    }
}

pub fn create_sandboxed_test_app_state(repo_root: PathBuf, sandbox_path: PathBuf) -> AppState {
    AppState {
        sandbox: SandboxContext {
            is_sandboxed: true,
            sandbox_path: Some(sandbox_path),
            live_working_dir: repo_root.clone(),
        },
        sys: Arc::new(Mutex::new(System::new_all())),
        repo_root,
    }
}

pub fn mock_state(state: &AppState) -> tauri::State<'_, AppState> {
    unsafe { std::mem::transmute(state) }
}
