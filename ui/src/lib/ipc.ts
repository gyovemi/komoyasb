import { invoke } from '@tauri-apps/api/core';
import type {
  AppError,
  ApplyResult,
  SandboxInfo,
  PrivilegeStatus,
  UnifiedTheme,
  ThemeSummary,
  KomorebiConfig,
  ApplicationRule,
  HotkeyBinding,
  HotkeyConflict,
  YasbConfig,
  FluentFlyoutConfig,
  EarTrumpetConfig,
  FlowSettings,
  WindhawkModStatus,
  ServiceInfo,
  ServiceControlAction,
  BackupSnapshot,
  DeploymentStatus,
  ProvisioningResult,
  ExecutionLedger,
  PerformanceConfig,
} from '../types/ipc';
import { assertValidThemeName, assertValidPath } from './validation';

/**
 * Safely invokes a Tauri v2 backend IPC command with structured error normalization.
 *
 * Catches raw IPC exceptions, extracts any pre-formatted `AppError` payloads,
 * or wraps generic backend exceptions in an `AppError` with `IO_ERROR` code.
 *
 * @template T - Expected JSON-deserialized return type from Rust.
 * @param commandIdentifier - Exact registered Tauri command name.
 * @param commandArgs - Named arguments matching the Rust command function signature.
 * @returns Promise resolving to the typed payload from the Rust command.
 * @throws {AppError} When backend processing or JSON deserialization fails.
 */
export async function invokeCommand<T>(commandIdentifier: string, commandArgs?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(commandIdentifier, commandArgs);
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
      throw error as AppError;
    }
    throw {
      code: 'IO_ERROR',
      message: typeof error === 'string' ? error : JSON.stringify(error),
    } as AppError;
  }
}

// ------------------------------------------
// Theme Commands
// ------------------------------------------

/**
 * Typed client API for Theme Studio discovery, serialization, and activation commands.
 */
export const themeApi = {
  /** Retrieves available disk theme presets with active indicator. */
  getThemes: (): Promise<ThemeSummary[]> => invokeCommand<ThemeSummary[]>('get_themes'),
  /** Loads full unified theme specification for the requested preset name. */
  loadTheme: (themeName: string): Promise<UnifiedTheme> => {
    assertValidThemeName(themeName);
    return invokeCommand<UnifiedTheme>('load_theme', { name: themeName });
  },
  /** Persists unified theme definition to its JSON configuration file. */
  saveTheme: (unifiedTheme: UnifiedTheme): Promise<void> => {
    assertValidThemeName(unifiedTheme.name);
    if (unifiedTheme.wallpaper?.path && unifiedTheme.wallpaper.path.trim().length > 0) {
      assertValidPath(unifiedTheme.wallpaper.path);
    }
    return invokeCommand<void>('save_theme', { theme: unifiedTheme });
  },
  /** Fetches the active system theme preset name. */
  getActiveThemeName: (): Promise<string> => invokeCommand<string>('get_active_theme_name'),
  /** Sets the active system theme preset name in application state. */
  setActiveTheme: (themeName: string): Promise<void> => {
    assertValidThemeName(themeName);
    return invokeCommand<void>('set_active_theme', { name: themeName });
  },
};

// ------------------------------------------
// Tiling & Keybind Commands
// ------------------------------------------

/**
 * Typed client API for Komorebi layout options, floating application rules, and WHKD hotkeys.
 */
export const tilingApi = {
  /** Loads Komorebi window manager configuration from disk. */
  loadKomorebiConfig: (): Promise<KomorebiConfig> => invokeCommand<KomorebiConfig>('load_komorebi_config'),
  /** Persists updated Komorebi configuration to disk. */
  saveKomorebiConfig: (komorebiConfig: KomorebiConfig): Promise<void> =>
    invokeCommand<void>('save_komorebi_config', { config: komorebiConfig }),
  /** Loads application float rules from applications.yaml. */
  loadFloatRules: (): Promise<ApplicationRule[]> => invokeCommand<ApplicationRule[]>('load_float_rules'),
  /** Persists application float rules to applications.yaml. */
  saveFloatRules: (applicationRules: ApplicationRule[]): Promise<void> =>
    invokeCommand<void>('save_float_rules', { rules: applicationRules }),
  /** Loads parsed WHKD keyboard shortcut bindings. */
  loadHotkeys: (): Promise<HotkeyBinding[]> => invokeCommand<HotkeyBinding[]>('load_hotkeys'),
  /** Serializes and saves WHKD keyboard bindings to .whkdrc. */
  saveHotkeys: (hotkeyBindings: HotkeyBinding[]): Promise<void> =>
    invokeCommand<void>('save_hotkeys', { hotkeys: hotkeyBindings }),
  /** Validates proposed hotkeys against duplicate key combinations and system reserved bindings. */
  validateHotkeys: (candidateBindings: HotkeyBinding[]): Promise<HotkeyConflict[]> =>
    invokeCommand<HotkeyConflict[]>('validate_hotkeys', { hotkeys: candidateBindings }),
};

// ------------------------------------------
// Status Bar & OSD Commands
// ------------------------------------------

/**
 * Typed client API for YASB Reborn configuration, custom styles, and FluentFlyouts / EarTrumpet settings.
 */
export const statusBarApi = {
  /** Loads YASB status bar configuration from config.yaml. */
  loadYasbConfig: (): Promise<YasbConfig> => invokeCommand<YasbConfig>('load_yasb_config'),
  /** Persists updated YASB status bar configuration to config.yaml. */
  saveYasbConfig: (yasbConfig: YasbConfig): Promise<void> =>
    invokeCommand<void>('save_yasb_config', { config: yasbConfig }),
  /** Loads raw CSS stylesheet from styles.css. */
  loadYasbCss: (): Promise<string> => invokeCommand<string>('load_yasb_css'),
  /** Persists raw CSS stylesheet to styles.css. */
  saveYasbCss: (yasbCss: string): Promise<void> => invokeCommand<void>('save_yasb_css', { css: yasbCss }),
  /** Loads FluentFlyouts layout and module appearance configuration. */
  loadFluentFlyoutConfig: (): Promise<FluentFlyoutConfig> =>
    invokeCommand<FluentFlyoutConfig>('load_fluentflyout_config'),
  /** Persists FluentFlyouts layout and appearance settings. */
  saveFluentFlyoutConfig: (fluentFlyoutConfig: FluentFlyoutConfig): Promise<void> =>
    invokeCommand<void>('save_fluentflyout_config', { config: fluentFlyoutConfig }),
  /** Reads EarTrumpet audio flyout registry settings. */
  getEarTrumpetConfig: (): Promise<EarTrumpetConfig> => invokeCommand<EarTrumpetConfig>('get_eartrumpet_config'),
  /** Updates EarTrumpet audio flyout registry settings. */
  setEarTrumpetConfig: (earTrumpetConfig: EarTrumpetConfig): Promise<void> =>
    invokeCommand<void>('set_eartrumpet_config', { config: earTrumpetConfig }),
};

// ------------------------------------------
// Mods & Flow Launcher Commands
// ------------------------------------------

/**
 * Typed client API for Flow Launcher settings and Windhawk mod injection management.
 */
export const modsApi = {
  /** Reads Flow Launcher JSON settings. */
  loadFlowSettings: (): Promise<FlowSettings> => invokeCommand<FlowSettings>('load_flow_settings'),
  /** Persists Flow Launcher JSON settings. */
  saveFlowSettings: (flowSettings: FlowSettings): Promise<void> =>
    invokeCommand<void>('save_flow_settings', { settings: flowSettings }),
  /** Queries loaded status for all configured Windhawk modification modules. */
  getWindhawkMods: (): Promise<WindhawkModStatus[]> => invokeCommand<WindhawkModStatus[]>('get_windhawk_mods'),
  /** Toggles loaded or disabled state for a specific Windhawk mod. */
  setWindhawkModState: (modIdentifier: string, isEnabled: boolean): Promise<void> =>
    invokeCommand<void>('set_windhawk_mod_state', { modId: modIdentifier, enabled: isEnabled }),
};

// ------------------------------------------
// System, Services & Apply Commands
// ------------------------------------------

/**
 * Typed client API for host supervisor status, service recycling, theme compilation, backups, and dry-run execution.
 */
export const systemApi = {
  /** Checks host deployment status and missing CLI dependencies. */
  checkDeploymentStatus: (): Promise<DeploymentStatus> => invokeCommand<DeploymentStatus>('check_deployment_status'),
  /** Executes initial provisioning script run. */
  runInstallProvisioning: (provisioningParams: {
    dryRun: boolean;
    skipPackages: boolean;
    noAdmin?: boolean;
    theme?: string;
  }): Promise<ProvisioningResult> => {
    if (provisioningParams.theme) {
      assertValidThemeName(provisioningParams.theme);
    }
    return invokeCommand<ProvisioningResult>('run_install_provisioning', {
      dryRun: provisioningParams.dryRun,
      skipPackages: provisioningParams.skipPackages,
      noAdmin: provisioningParams.noAdmin,
      theme: provisioningParams.theme,
    });
  },
  /** Queries current execution privilege level and rootless (non-admin) status. */
  getPrivilegeStatus: (): Promise<PrivilegeStatus> => invokeCommand<PrivilegeStatus>('get_privilege_status'),
  /** Queries status and process performance metrics for all managed desktop services. */
  getServicesStatus: (): Promise<ServiceInfo[]> => invokeCommand<ServiceInfo[]>('get_services_status'),
  /** Sends start, stop, or restart command to a specific managed desktop service. */
  serviceAction: (serviceName: string, serviceAction: ServiceControlAction): Promise<void> =>
    invokeCommand<void>('service_action', { name: serviceName, action: serviceAction }),
  /** Renders templates and synchronizes active theme across desktop components. */
  applySyncTheme: (isDryRun: boolean): Promise<ApplyResult> =>
    invokeCommand<ApplyResult>('apply_sync_theme', { dryRun: isDryRun }),
  /** Retrieves snapshot history of configuration backups. */
  getBackups: (): Promise<BackupSnapshot[]> => invokeCommand<BackupSnapshot[]>('get_backups'),
  /** Restores configuration files from a historical backup snapshot timestamp. */
  restoreBackup: (snapshotTimestamp: string): Promise<void> => {
    assertValidThemeName(snapshotTimestamp);
    return invokeCommand<void>('restore_backup', { timestamp: snapshotTimestamp });
  },
  /** Queries sandbox environment state and live working directory paths. */
  getSandboxState: (): Promise<SandboxInfo> => invokeCommand<SandboxInfo>('get_sandbox_state'),
  /** Executes non-destructive simulated dry-run generating full action ledger and file diffs. */
  executeFullDryRun: (themeName?: string, keepSandbox?: boolean): Promise<ExecutionLedger> => {
    if (themeName) {
      assertValidThemeName(themeName);
    }
    return invokeCommand<ExecutionLedger>('execute_full_dryrun', { theme: themeName, keepSandbox });
  },
};

// ------------------------------------------
// Performance Commands
// ------------------------------------------

/**
 * Typed client API for performance optimization profiles, EcoQoS throttling, and animation toggles.
 */
export const performanceApi = {
  /** Loads current performance configuration profiles from performance.json. */
  getPerformanceConfig: (): Promise<PerformanceConfig> => invokeCommand<PerformanceConfig>('get_performance_config'),
  /** Activates and applies a performance profile tier across Komorebi, YASB, and DWM. */
  setPerformanceProfile: (profileTier: string, isDryRun: boolean): Promise<ApplyResult> =>
    invokeCommand<ApplyResult>('set_performance_profile', { profile: profileTier, dryRun: isDryRun }),
  /** Persists updated performance profile configuration to performance.json. */
  savePerformanceConfig: (performanceConfig: PerformanceConfig): Promise<void> =>
    invokeCommand<void>('save_performance_config', { config: performanceConfig }),
};
