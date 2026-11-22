/**
 * @fileoverview Domain and IPC type contracts for the komoyasb UI.
 *
 * Defines TypeScript interfaces matching the Rust Tauri v2 command schemas,
 * application JSON configuration files, and operating system interop payloads.
 */

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

export interface PrivilegeStatus {
  isElevated: boolean;
  isRootless: boolean;
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

// ==========================================
// 9. First-Run Provisioning & Deployment
// ==========================================

export interface DeploymentStatus {
  isDeployed: boolean;
  komorebiConfigExists: boolean;
  yasbConfigExists: boolean;
  whkdrcExists: boolean;
  activeServicesRunning: boolean;
  missingTools: string[];
}

export interface ProvisioningResult {
  success: boolean;
  exitCode: number | null;
  outputLog: string;
}

export interface InstallLogPayload {
  line: string;
  isError: boolean;
}

// ==========================================
// 10. Dry-Run & Shadow Execution Ledger
// ==========================================

export type ActionType =
  | 'FileWrite'
  | 'FileDelete'
  | 'DirectoryCreate'
  | 'RegistryWrite'
  | 'PackageInstall'
  | 'ProcessControl'
  | 'WallpaperApply'
  | 'WindhawkMod';

export type ActionStatus = 'Simulated' | 'Executed' | 'Failed' | 'Skipped';
export type ChangeType = 'Created' | 'Modified' | 'Deleted' | 'Unchanged';

export interface LedgerSummary {
  totalActions: number;
  filesWritten: number;
  filesDeleted: number;
  registryWrites: number;
  packagesSimulated: number;
  processesControlled: number;
}

export interface LedgerAction {
  id: string;
  timestamp: string;
  actionType: ActionType;
  target: string;
  status: ActionStatus;
  metadata?: Record<string, unknown>;
}

export interface FileDiff {
  targetVirtualPath: string;
  targetLivePath: string;
  changeType: ChangeType;
  originalSha256: string | null;
  shadowSha256: string | null;
  byteSize?: number;
}

export interface ExecutionLedger {
  sessionId: string;
  timestamp: string;
  isDryRun: boolean;
  shadowRoot: string | null;
  summary: LedgerSummary;
  actions: LedgerAction[];
  fileDiffs: FileDiff[];
}

// ==========================================
// 11. Performance Profiles & Optimization
// ==========================================

export type PerformancePreset = 'ultra-low' | 'balanced' | 'visual-rich' | 'gaming' | 'custom';

export interface KomorebiPerfSettings {
  animation_enabled: boolean;
  animation_duration_ms: number;
  animation_fps: number;
  border_enabled: boolean;
  border_width: number;
  border_offset: number;
  border_style: 'rounded' | 'square' | 'system' | string;
  border_implementation: 'Komorebi' | 'Windows' | string;
  unmanaged_window_operation_behaviour: 'Op' | 'NoOp' | string;
  transparency_enabled: boolean;
  window_hiding_behaviour: 'Cloak' | 'Hide' | 'Minimize' | string;
}

export interface YasbPerfSettings {
  blur_enabled: boolean;
  acrylic_enabled: boolean;
  round_corners: boolean;
  animation_duration_ms: number;
  cpu_interval_ms: number;
  memory_interval_ms: number;
  traffic_interval_ms: number;
  media_interval_ms: number;
  clock_interval_ms: number;
  gpu_interval_ms: number;
}

export interface DwmPerfSettings {
  backdrop_type: number;
  force_dark_mode: boolean;
  rounded_corners: number;
  reduce_motion: boolean;
  taskbar_autohide_enabled: boolean;
}

export interface LauncherPerfSettings {
  use_animation: boolean;
  animation_speed: 'Slow' | 'Medium' | 'Fast' | string;
  search_window_effect: 'None' | 'Blur' | 'Acrylic' | 'Mica' | string;
  shadow_effect: boolean;
  max_results: number;
  plugin_cache_max: number;
}

export interface FlyoutPerfSettings {
  backdrop: 'None' | 'Mica' | 'Acrylic' | 'MicaAlt' | string;
  animate_show: boolean;
  animate_hide: boolean;
  animation_duration_ms: number;
  timeout_ms: number;
}

export interface OsPerfSettings {
  background_eco_qos: boolean;
  komorebi_priority: 'Normal' | 'AboveNormal' | 'High' | string;
  yasb_priority: 'Idle' | 'BelowNormal' | 'Normal' | string;
  disable_windows_animations: boolean;
}

export interface PerformanceProfile {
  komorebi: KomorebiPerfSettings;
  yasb: YasbPerfSettings;
  dwm: DwmPerfSettings;
  launcher: LauncherPerfSettings;
  flyout: FlyoutPerfSettings;
  os: OsPerfSettings;
}

export interface PerformanceConfig {
  $schema?: string;
  active_profile: string;
  profiles: Record<string, PerformanceProfile>;
}
