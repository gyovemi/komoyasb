# UI Architecture Specification: Komoyasb Control Center & Settings UI

**Version:** 1.0.0-RC1  
**Target Platform:** Windows 11 22H2+ (x64)  
**Application Framework:** Tauri v2 (`core = 2.x`, `tauri-build = 2.x`) + Vite + React 19 + TypeScript + Tailwind CSS  
**Target Working Directory:** `ui/`  
**Execution Model:** 5-Worker Swarm Parallel Architecture (`@ui-backend`, `@ui-shell-theme`, `@ui-tiling`, `@ui-bar-osd`, `@ui-mods-services`)

---

## 1. Toolchain Audit & Missing Prerequisites

An audit of the local development environment reveals the following status:

| Tool / Subsystem | Detected Version | Status | Resolution / Exact Winget ID |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v26.13.1` | **Installed** | Node.js runtime is present |
| **npm** | `v11.20.0` | **Installed** | Standard package manager present |
| **pnpm** | None | **Missing** | `winget install pnpm.pnpm` or `npm install -g pnpm` |
| **Rust Toolchain** (`rustc`, `cargo`) | None | **Missing** | `winget install Rustlang.Rustup` (then `rustup default stable-msvc`) |
| **MSVC Build Tools & C++ SDK** (`cl.exe`, Linker) | None | **Missing** | `winget install Microsoft.VisualStudio.2022.BuildTools --override "--passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"` |
| **Windows 10/11 SDK** | None (bundled with VCTools) | **Missing** | `winget install Microsoft.WindowsSDK.10.0.22621` (or via VS Build Tools) |
| **WebView2 Runtime** | System standard | **Pre-installed** (Win11) | `Microsoft.EdgeWebView2Runtime` (if absent on older builds) |

### Installation Commands (Run in Elevated PowerShell)
```powershell
# 1. Install Rustup toolchain installer
winget install Rustlang.Rustup --accept-source-agreements --accept-package-agreements

# 2. Install Visual Studio 2022 C++ Build Tools (required for Tauri MSVC linkage)
winget install Microsoft.VisualStudio.2022.BuildTools --override "--passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" --accept-source-agreements --accept-package-agreements

# 3. Install pnpm
npm install -g pnpm

# 4. Initialize Rust MSVC target
rustup default stable-x86_64-pc-windows-msvc
```

---

## 2. Directory Tree & Worker Ownership Map

To enable seamless parallel development across 5 Swarm workers without git merge conflicts, the `ui/` directory is strictly partitioned. No worker may edit files outside its designated ownership boundary.

```
ui/
â”œâ”€â”€ index.html                                 [Owned by @ui-shell-theme]
â”œâ”€â”€ package.json                               [Co-owned / scaffolded upfront]
â”œâ”€â”€ pnpm-lock.yaml                             [Lockfile]
â”œâ”€â”€ tsconfig.json                              [Shared]
â”œâ”€â”€ tsconfig.node.json                         [Shared]
â”œâ”€â”€ vite.config.ts                             [Shared]
â”œâ”€â”€ tailwind.config.ts                         [Owned by @ui-shell-theme]
â”œâ”€â”€ postcss.config.js                          [Owned by @ui-shell-theme]
â”‚
â”œâ”€â”€ src-tauri/                                 [OWNED BY @ui-backend]
â”‚   â”œâ”€â”€ Cargo.toml                             (tauri v2, serde, serde_json, serde_yaml, tokio, sysinfo, notify)
â”‚   â”œâ”€â”€ tauri.conf.json                        (windows: mica/acrylic titlebar, permissions, csp)
â”‚   â”œâ”€â”€ build.rs                               (tauri_build::build())
â”‚   â”œâ”€â”€ capabilities/
â”‚   â”‚   â””â”€â”€ default.json                       (tauri core permissions & shell scope)
â”‚   â””â”€â”€ src/
â”‚       â”œâ”€â”€ main.rs                            (Tauri v2 entry point)
â”‚       â”œâ”€â”€ lib.rs                             (AppBuilder, register handlers)
â”‚       â”œâ”€â”€ error.rs                           (CommandResult, AppError enum)
â”‚       â”œâ”€â”€ state.rs                           (AppState: paths, sandbox_dir, watcher)
â”‚       â”œâ”€â”€ commands/
â”‚       â”‚   â”œâ”€â”€ mod.rs
â”‚       â”‚   â”œâ”€â”€ theme.rs                       (Theme load/save/compile/tokens)
â”‚       â”‚   â”œâ”€â”€ tiling.rs                      (Komorebi config, apps yaml, whkdrc parser/writer)
â”‚       â”‚   â”œâ”€â”€ statusbar.rs                   (YASB yaml/css, FluentFlyout, EarTrumpet)
â”‚       â”‚   â”œâ”€â”€ mods.rs                        (Windhawk cli wrapper, Flow Launcher json)
â”‚       â”‚   â””â”€â”€ system.rs                      (Service status, Start/Stop/Restart, ApplySync, Backup/Restore)
â”‚       â””â”€â”€ utils/
â”‚           â”œâ”€â”€ atomic_write.rs                (Secure temp-file atomic replacement with rollback)
â”‚           â”œâ”€â”€ validator.rs                   (Pre-flight schema validation for JSON/YAML/whkdrc)
â”‚           â”œâ”€â”€ sandbox.rs                     (UI_SANDBOX_DIR path remapper)
â”‚           â””â”€â”€ process.rs                     (sysinfo metrics, powershell bridge)
â”‚
â””â”€â”€ src/
    â”œâ”€â”€ main.tsx                               [Owned by @ui-shell-theme]
    â”œâ”€â”€ App.tsx                                [Owned by @ui-shell-theme]
    â”œâ”€â”€ index.css                              [Owned by @ui-shell-theme]
    â”‚
    â”œâ”€â”€ types/                                 [SHARED CONTRACT - Frozen]
    â”‚   â””â”€â”€ ipc.ts                             (All TypeScript interfaces mirroring Rust DTOs)
    â”‚
    â”œâ”€â”€ lib/                                   [SHARED UTILS]
    â”‚   â”œâ”€â”€ ipc.ts                             (Type-safe invoke wrapper & event listeners)
    â”‚   â””â”€â”€ utils.ts                           (cn, formatting, color converters)
    â”‚
    â”œâ”€â”€ components/
    â”‚   â”œâ”€â”€ ui/                                [Owned by @ui-shell-theme - Radix / Lucide primitives]
    â”‚   â”‚   â”œâ”€â”€ button.tsx
    â”‚   â”‚   â”œâ”€â”€ input.tsx
    â”‚   â”‚   â”œâ”€â”€ slider.tsx
    â”‚   â”‚   â”œâ”€â”€ switch.tsx
    â”‚   â”‚   â”œâ”€â”€ select.tsx
    â”‚   â”‚   â”œâ”€â”€ tabs.tsx
    â”‚   â”‚   â”œâ”€â”€ dialog.tsx
    â”‚   â”‚   â”œâ”€â”€ color-picker.tsx
    â”‚   â”‚   â”œâ”€â”€ badge.tsx
    â”‚   â”‚   â””â”€â”€ toast.tsx
    â”‚   â”‚
    â”‚   â”œâ”€â”€ shell/                             [Owned by @ui-shell-theme]
    â”‚   â”‚   â”œâ”€â”€ Titlebar.tsx                   (Windows 11 Mica caption buttons & status badge)
    â”‚   â”‚   â”œâ”€â”€ Navigation.tsx                 (Sidebar tabs: Theme, Tiling, Bar & OSD, Mods, Services)
    â”‚   â”‚   â””â”€â”€ StatusBar.tsx                  (Footer: Sandbox indicator, Unsaved changes, Sync button)
    â”‚   â”‚
    â”‚   â”œâ”€â”€ views/
    â”‚   â”‚   â”œâ”€â”€ theme/                         [OWNED BY @ui-shell-theme]
    â”‚   â”‚   â”‚   â”œâ”€â”€ ThemeStudioView.tsx
    â”‚   â”‚   â”‚   â”œâ”€â”€ ColorTokensEditor.tsx
    â”‚   â”‚   â”‚   â”œâ”€â”€ TypographyGeometry.tsx
    â”‚   â”‚   â”‚   â”œâ”€â”€ WallpaperPicker.tsx
    â”‚   â”‚   â”‚   â””â”€â”€ PresetManager.tsx
    â”‚   â”‚   â”‚
    â”‚   â”‚   â”œâ”€â”€ tiling/                        [OWNED BY @ui-tiling]
    â”‚   â”‚   â”‚   â”œâ”€â”€ TilingView.tsx
    â”‚   â”‚   â”‚   â”œâ”€â”€ KomorebiGeometryEditor.tsx (Padding, gaps, borders, layouts)
    â”‚   â”‚   â”‚   â”œâ”€â”€ WorkspaceListEditor.tsx    (Monitors and named workspaces)
    â”‚   â”‚   â”‚   â”œâ”€â”€ FloatRulesTable.tsx        (applications.yaml visual CRUD)
    â”‚   â”‚   â”‚   â””â”€â”€ ShortcutRecorder.tsx       (Interactive whkdrc editor + conflict detector)
    â”‚   â”‚   â”‚
    â”‚   â”‚   â”œâ”€â”€ statusbar/                     [OWNED BY @ui-bar-osd]
    â”‚   â”‚   â”‚   â”œâ”€â”€ StatusBarView.tsx
    â”‚   â”‚   â”‚   â”œâ”€â”€ YasbWidgetOrganizer.tsx    (Drag-and-drop Left/Center/Right reordering)
    â”‚   â”‚   â”‚   â”œâ”€â”€ WidgetConfigForm.tsx       (Properties editor for each active widget)
    â”‚   â”‚   â”‚   â”œâ”€â”€ YasbCssEditor.tsx          (Monaco/CodeMirror/textarea live CSS preview)
    â”‚   â”‚   â”‚   â”œâ”€â”€ FluentFlyoutEditor.tsx     (fluentflyout_config.json form)
    â”‚   â”‚   â”‚   â””â”€â”€ EarTrumpetSettings.tsx     (Registry toggles viewer & switch)
    â”‚   â”‚   â”‚
    â”‚   â”‚   â”œâ”€â”€ mods/                          [OWNED BY @ui-mods-services]
    â”‚   â”‚   â”‚   â”œâ”€â”€ ModsView.tsx
    â”‚   â”‚   â”‚   â”œâ”€â”€ FlowLauncherConfig.tsx     (flow_settings.json & theme switcher)
    â”‚   â”‚   â”‚   â”œâ”€â”€ WindhawkModsManager.tsx    (taskbar-autohide, dwm-mica, notification-styling)
    â”‚   â”‚   â”‚   â””â”€â”€ ModSourceViewer.tsx        (Read-only C++ source preview)
    â”‚   â”‚   â”‚
    â”‚   â”‚   â””â”€â”€ services/                      [OWNED BY @ui-mods-services]
    â”‚   â”‚       â”œâ”€â”€ ServicesView.tsx
    â”‚   â”‚       â”œâ”€â”€ ServiceCard.tsx            (Live status, PID, RAM/CPU sparkline, Action buttons)
    â”‚   â”‚       â”œâ”€â”€ SyncApplyPanel.tsx         (Execute sync-theme.ps1, watchdog triggers)
    â”‚   â”‚       â”œâ”€â”€ BackupRestoreModal.tsx     (Timestamped manifests inspector and 1-click restore)
    â”‚   â”‚       â””â”€â”€ SandboxToggleBanner.tsx    (UI_SANDBOX_DIR indicator and path overrides)
```

### Worker Allocation & Boundaries

| Worker Tag | Responsibility Domain | Exclusive File Boundaries | Dependencies / Inputs |
| :--- | :--- | :--- | :--- |
| **`@ui-backend`** | Rust Tauri v2 core, validation, atomic IO, IPC handlers, powershell execution, sandbox remapping | `ui/src-tauri/**/*` | `themes/*`, `src/**/*` schemas |
| **`@ui-shell-theme`** | App shell, navigation, design tokens, UI primitives, unified Theme Studio | `ui/src/components/ui/*`, `ui/src/components/shell/*`, `ui/src/components/views/theme/*`, Tailwind config, `App.tsx` | `ui/src/types/ipc.ts` |
| **`@ui-tiling`** | Komorebi JSON geometry/monitors, `applications.yaml` float rules, `whkdrc` hotkey recorder & collision analyzer | `ui/src/components/views/tiling/*` | `ui/src/types/ipc.ts` |
| **`@ui-bar-osd`** | YASB bar layouts/widgets/CSS, FluentFlyout configuration, EarTrumpet registry toggles | `ui/src/components/views/statusbar/*` | `ui/src/types/ipc.ts` |
| **`@ui-mods-services`**| Flow Launcher config, Windhawk mod manager, Process supervisor (RAM/PID/controls), Apply & Backup/Restore | `ui/src/components/views/mods/*`, `ui/src/components/views/services/*` | `ui/src/types/ipc.ts` |

---

## 3. IPC & Type Contract (Single Source of Truth)

All communication between React and Tauri occurs via structured commands. 

### 3.1 Rust Command Signatures (`src-tauri/src/commands/`)

```rust
// ==========================================
// Theme Commands (theme.rs)
// ==========================================
#[tauri::command]
pub async fn get_themes(state: State<'_, AppState>) -> Result<Vec<ThemeSummary>, AppError>;

#[tauri::command]
pub async fn load_theme(state: State<'_, AppState>, name: String) -> Result<UnifiedTheme, AppError>;

#[tauri::command]
pub async fn save_theme(state: State<'_, AppState>, theme: UnifiedTheme) -> Result<(), AppError>;

#[tauri::command]
pub async fn get_active_theme_name(state: State<'_, AppState>) -> Result<String, AppError>;

#[tauri::command]
pub async fn set_active_theme(state: State<'_, AppState>, name: String) -> Result<(), AppError>;

// ==========================================
// Tiling & Keybind Commands (tiling.rs)
// ==========================================
#[tauri::command]
pub async fn load_komorebi_config(state: State<'_, AppState>) -> Result<KomorebiConfig, AppError>;

#[tauri::command]
pub async fn save_komorebi_config(state: State<'_, AppState>, config: KomorebiConfig) -> Result<(), AppError>;

#[tauri::command]
pub async fn load_float_rules(state: State<'_, AppState>) -> Result<Vec<ApplicationRule>, AppError>;

#[tauri::command]
pub async fn save_float_rules(state: State<'_, AppState>, rules: Vec<ApplicationRule>) -> Result<(), AppError>;

#[tauri::command]
pub async fn load_hotkeys(state: State<'_, AppState>) -> Result<Vec<HotkeyBinding>, AppError>;

#[tauri::command]
pub async fn save_hotkeys(state: State<'_, AppState>, hotkeys: Vec<HotkeyBinding>) -> Result<(), AppError>;

#[tauri::command]
pub async fn validate_hotkeys(hotkeys: Vec<HotkeyBinding>) -> Result<Vec<HotkeyConflict>, AppError>;

// ==========================================
// Status Bar & OSD Commands (statusbar.rs)
// ==========================================
#[tauri::command]
pub async fn load_yasb_config(state: State<'_, AppState>) -> Result<YasbConfig, AppError>;

#[tauri::command]
pub async fn save_yasb_config(state: State<'_, AppState>, config: YasbConfig) -> Result<(), AppError>;

#[tauri::command]
pub async fn load_yasb_css(state: State<'_, AppState>) -> Result<String, AppError>;

#[tauri::command]
pub async fn save_yasb_css(state: State<'_, AppState>, css: String) -> Result<(), AppError>;

#[tauri::command]
pub async fn load_fluentflyout_config(state: State<'_, AppState>) -> Result<FluentFlyoutConfig, AppError>;

#[tauri::command]
pub async fn save_fluentflyout_config(state: State<'_, AppState>, config: FluentFlyoutConfig) -> Result<(), AppError>;

#[tauri::command]
pub async fn get_eartrumpet_config(state: State<'_, AppState>) -> Result<EarTrumpetConfig, AppError>;

#[tauri::command]
pub async fn set_eartrumpet_config(state: State<'_, AppState>, config: EarTrumpetConfig) -> Result<(), AppError>;

// ==========================================
// Mods & Launcher Commands (mods.rs)
// ==========================================
#[tauri::command]
pub async fn load_flow_settings(state: State<'_, AppState>) -> Result<FlowSettings, AppError>;

#[tauri::command]
pub async fn save_flow_settings(state: State<'_, AppState>, settings: FlowSettings) -> Result<(), AppError>;

#[tauri::command]
pub async fn get_windhawk_mods(state: State<'_, AppState>) -> Result<Vec<WindhawkModStatus>, AppError>;

#[tauri::command]
pub async fn set_windhawk_mod_state(state: State<'_, AppState>, mod_id: String, enabled: bool) -> Result<(), AppError>;

// ==========================================
// System, Services & Apply Commands (system.rs)
// ==========================================
#[tauri::command]
pub async fn get_services_status(state: State<'_, AppState>) -> Result<Vec<ServiceInfo>, AppError>;

#[tauri::command]
pub async fn service_action(state: State<'_, AppState>, name: String, action: ServiceControlAction) -> Result<(), AppError>;

#[tauri::command]
pub async fn apply_sync_theme(state: State<'_, AppState>, dry_run: bool) -> Result<ApplyResult, AppError>;

#[tauri::command]
pub async fn get_backups(state: State<'_, AppState>) -> Result<Vec<BackupSnapshot>, AppError>;

#[tauri::command]
pub async fn restore_backup(state: State<'_, AppState>, timestamp: String) -> Result<(), AppError>;

#[tauri::command]
pub async fn get_sandbox_state(state: State<'_, AppState>) -> Result<SandboxInfo, AppError>;
```

---

### 3.2 Shared TypeScript Interface Contract (`ui/src/types/ipc.ts`)

```typescript
// ==========================================
// 1. Error & Operation Results
// ==========================================
export interface AppError {
  code: 'VALIDATION_FAILED' | 'IO_ERROR' | 'PROCESS_ERROR' | 'SANDBOX_VIOLATION' | 'PARSE_ERROR';
  message: string;
  details?: Record<string, unknown>;
}

export interface ApplyResult {
  success: boolean;
  themeName: string;
  renderedFiles: string[];
  reloadedServices: string[];
  outputLog: string;
}

export interface SandboxInfo {
  isSandboxed: boolean;
  sandboxPath: string | null;
  liveWorkingDir: string;
}

// ==========================================
// 2. Theme Studio (Matching theme.schema.json)
// ==========================================
export interface ThemeColors {
  bg_primary: string;
  bg_secondary: string;
  bg_surface: string;
  fg_primary: string;
  fg_secondary: string;
  fg_muted: string;
  accent: string;
  accent_secondary: string;
  border_active: string;
  border_inactive: string;
  error: string;
  warning: string;
  success: string;
  info: string;
}

export interface ThemeTypography {
  font_family: string;
  font_size_sm: string;
  font_size_md: string;
  font_size_lg: string;
}

export interface ThemeGeometry {
  border_width: number;
  border_radius: number;
  window_gap: number;
  bar_height: number;
}

export interface ThemeOpacity {
  bar: number;
  window_unfocused: number;
  flyout: number;
  launcher: number;
}

export interface ThemeWallpaper {
  path: string;
  style: 'Fill' | 'Fit' | 'Stretch' | 'Tile' | 'Center' | 'Span';
}

export interface UnifiedTheme {
  name: string;
  variant: 'dark' | 'light';
  colors: ThemeColors;
  typography: ThemeTypography;
  geometry: ThemeGeometry;
  opacity: ThemeOpacity;
  wallpaper: ThemeWallpaper;
}

export interface ThemeSummary {
  name: string;
  variant: 'dark' | 'light';
  path: string;
  isActive: boolean;
}

// ==========================================
// 3. Komorebi & Applications Rules
// ==========================================
export interface KomorebiBorderColours {
  single: string;
  stack: string;
  monocle: string;
  unfocused: string;
  floating: string;
}

export interface WorkspaceDefinition {
  name: string;
  layout: 'BSP' | 'Columns' | 'Rows' | 'Grid' | 'Floating' | 'VerticalStack';
}

export interface MonitorDefinition {
  workspaces: WorkspaceDefinition[];
}

export interface KomorebiConfig {
  $schema?: string;
  app_specific_configuration_path?: string;
  cross_monitor_move_behaviour: 'Insert' | 'Swap';
  default_workspace_padding: number;
  default_container_padding: number;
  border: boolean;
  border_width: number;
  border_offset: number;
  border_style: 'Rounded' | 'Square';
  border_colours: KomorebiBorderColours;
  mouse_follows_focus: boolean;
  focus_follows_mouse: 'Komorebi' | 'Windows' | null;
  transparency: boolean;
  transparency_alpha: number;
  window_hiding_behaviour: 'Cloak' | 'Minimize' | 'Hide';
  workspaces_per_monitor: boolean;
  monitors: MonitorDefinition[];
  [key: string]: unknown;
}

export interface ApplicationRuleIdentifier {
  kind: 'Exe' | 'Class' | 'Title';
  id: string;
  matching_strategy: 'Equals' | 'StartsWith' | 'EndsWith' | 'Contains' | 'Regex';
}

export interface ApplicationRule {
  name: string;
  identifier: ApplicationRuleIdentifier;
  float?: boolean;
  manage?: boolean;
  transparency?: boolean;
}

// ==========================================
// 4. whkd Hotkey Recorder
// ==========================================
export interface HotkeyBinding {
  id: string;
  rawComment?: string;
  modifiers: ('alt' | 'ctrl' | 'shift' | 'win')[];
  key: string;
  command: string;
  category: 'navigation' | 'move' | 'resize' | 'workspace' | 'monitor' | 'layout' | 'launcher' | 'system' | 'custom';
}

export interface HotkeyConflict {
  keyCombination: string;
  bindingA: HotkeyBinding;
  bindingB: HotkeyBinding;
  reason: 'DUPLICATE_BINDING' | 'SYSTEM_RESERVED';
}

// ==========================================
// 5. YASB Reborn Status Bar
// ==========================================
export interface YasbDimensions {
  width: string;
  height: number;
}

export interface YasbPadding {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface YasbBlurEffect {
  enabled: boolean;
  acrylic: boolean;
  dark: boolean;
  round_corners: boolean;
  round_corners_type: 'normal' | 'small';
  border_color: string;
}

export interface YasbBarConfig {
  enabled: boolean;
  screens: string[];
  class_name: string;
  alignment: {
    position: 'top' | 'bottom';
    center: boolean;
  };
  blur_effect: YasbBlurEffect;
  window_flags: {
    always_on_top: boolean;
    windows_app_bar: boolean;
  };
  dimensions: YasbDimensions;
  padding: YasbPadding;
  widgets: {
    left: string[];
    center: string[];
    right: string[];
  };
}

export interface YasbConfig {
  watch_stylesheet: boolean;
  watch_config: boolean;
  bars: Record<string, YasbBarConfig>;
  widgets: Record<string, {
    type: string;
    options: Record<string, unknown>;
  }>;
}

// ==========================================
// 6. Media OSD & Registry
// ==========================================
export interface FluentFlyoutAppearance {
  Theme: 'dark' | 'light';
  Backdrop: 'MicaAlt' | 'Mica' | 'Acrylic' | 'Default';
  AccentColor: string;
  AccentSecondaryColor: string;
  BackgroundColor: string;
  SurfaceColor: string;
  ForegroundColor: string;
  ForegroundMutedColor: string;
  BorderColor: string;
  BorderWidth: number;
  CornerRadius: number;
  FontFamily: string;
  FontSize: string;
  Opacity: number;
}

export interface FluentFlyoutConfig {
  General: {
    RunAtStartup: boolean;
    ShowTrayIcon: boolean;
    CheckForUpdates: boolean;
    Language: string;
  };
  Appearance: FluentFlyoutAppearance;
  Placement: {
    Alignment: string;
    DisplayIndex: number;
    OffsetX: number;
    OffsetY: number;
    Margin: number;
    SafePaddingYASB: number;
    KeepOnScreen: boolean;
    AvoidWorkAreaOverlap: boolean;
  };
  Behavior: Record<string, unknown>;
  Modules: {
    Volume: { Enabled: boolean; StepSize: number; ShowMuteIndicator: boolean };
    Brightness: { Enabled: boolean; StepSize: number };
    Media: { Enabled: boolean; ShowThumbnail: boolean; ShowPlaybackControls: boolean; ShowTimeline: boolean };
    AirplaneMode: { Enabled: boolean };
    LockKeys: { Enabled: boolean; ShowCapsLock: boolean; ShowNumLock: boolean; ShowScrollLock: boolean };
  };
}

export interface EarTrumpetConfig {
  hasMigrated: boolean;
  useAccentColor: boolean;
  theme: 'System' | 'Dark' | 'Light';
  showVolumePeakMeter: boolean;
  showPlaybackDevices: boolean;
  showRecordingDevices: boolean;
  showAppIcons: boolean;
  expandAll: boolean;
  isPromotedInTray: boolean;
}

// ==========================================
// 7. Launcher & Windhawk Mods
// ==========================================
export interface FlowSettings {
  Hotkey: string;
  Theme: string;
  Font: string;
  CustomAccentColor: string;
  UseWindowsAccentColor: boolean;
  SearchWindowEffect: 'Mica' | 'Acrylic' | 'None';
  BorderRadius: number;
  Opacity: number;
  MaxResultsToShow: number;
  [key: string]: unknown;
}

export interface WindhawkModStatus {
  id: 'taskbar-autohide' | 'dwm-mica-effects' | 'notification-styling';
  name: string;
  description: string;
  sourceFile: string;
  isLoaded: boolean;
}

// ==========================================
// 8. Services Supervisor & Backups
// ==========================================
export type ServiceControlAction = 'start' | 'stop' | 'restart';

export interface ServiceInfo {
  name: 'komorebi' | 'whkd' | 'yasb' | 'watchdog';
  displayName: string;
  isRunning: boolean;
  pid: number | null;
  memoryBytes: number;
  cpuPercent: number;
  uptimeSeconds: number;
}

export interface BackupEntry {
  original: string;
  backup: string;
}

export interface BackupSnapshot {
  timestamp: string;
  createdAt: string;
  directoryPath: string;
  files: BackupEntry[];
}
```

---

## 4. Safety & Atomicity Rules

### 4.1 Atomic Temp-File Write Pattern
Never write directly to configuration files (`komorebi.json`, `config.yaml`, `whkdrc`, `theme.json`). 
All backend write operations must follow the atomic staging pipeline:

1. **Staging:** Serialize new payload to `<target_file>.tmp.<timestamp>.<random_uuid>`.
2. **Pre-flight Syntax Validation:** Validate staged file against its parser:
   - JSON files: Parse into dynamic `serde_json::Value` (and check schema).
   - YAML files: Parse into `serde_yaml::Value`.
   - `whkdrc`: Parse into line tokens, validating syntax (`modifier + key : command`).
3. **Atomic Replace:** Call `std::fs::rename()` (or `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING` on Windows) to atomically swap the temporary file into place.
4. **Cleanup on Failure:** If validation fails, immediately remove the `.tmp` file and return a descriptive `AppError::VALIDATION_FAILED` without touching the original file.

### 4.2 Sandbox Mode (`UI_SANDBOX_DIR`)
To allow automated UI tests, integration tests, and QA without risking host desktop corruption:
- The backend checks for the environment variable `UI_SANDBOX_DIR`.
- If set:
  - All targets (`$USERPROFILE/.config/komorebi`, `$USERPROFILE/.config/yasb`, `$USERPROFILE/.config/whkdrc`, Flow Launcher settings, and `themes/`) are remapped inside `UI_SANDBOX_DIR`.
  - Process operations (`komorebi.exe`, `yasb.exe`, `windhawk-cli.exe`) are stubbed or run in dry-run simulation mode.
  - The UI header displays a persistent Amber Warning Banner: **"SANDBOX ACTIVE: <path>"**.
- If unset: Targets default to the real user profile and project repository paths.

### 4.3 Template Synchronization Safety
When **Apply & Sync** is triggered:
1. Active `theme.json` is verified against `themes/theme.schema.json`.
2. `scripts/sync-theme.ps1` is executed with `-DryRun` first.
3. If clean, execute `sync-theme.ps1` to render all `.template` files.
4. Services are signaled gracefully:
   - `komorebic reload-configuration`
   - `yasb` / `whkd` restarted via watchdog or process reload.

---

## 5. Parallel Swarm Execution Strategy

When `/swarm` is activated with the 5 workers:

```
[Coordinator]
   â”‚
   â”œâ”€â–º @ui-backend: Implements src-tauri/ (Rust structs, IPC handlers, atomic_write, validators)
   â”œâ”€â–º @ui-shell-theme: Sets up Tailwind/Vite, Navigation, Titlebar, ThemeStudioView, Color Pickers
   â”œâ”€â–º @ui-tiling: Builds KomorebiGeometryEditor, WorkspaceList, FloatRulesTable, ShortcutRecorder
   â”œâ”€â–º @ui-bar-osd: Builds YasbWidgetOrganizer, WidgetConfigForm, YasbCssEditor, FluentFlyoutEditor
   â””â”€â–º @ui-mods-services: Builds FlowLauncherConfig, WindhawkModsManager, ServicesView, BackupRestoreModal
```

Each worker operates exclusively inside its assigned folder, binding against the shared `ui/src/types/ipc.ts` contract.

