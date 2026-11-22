import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  invokeCommand,
  themeApi,
  tilingApi,
  statusBarApi,
  modsApi,
  systemApi,
  performanceApi,
} from './ipc';
import type {
  UnifiedTheme,
  KomorebiConfig,
  ApplicationRule,
  HotkeyBinding,
  YasbConfig,
  FluentFlyoutConfig,
  EarTrumpetConfig,
  FlowSettings,
  PerformanceConfig,
} from '../types/ipc';

const mockInvoke = vi.mocked(invoke);

describe('ipc client', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  describe('invokeCommand', () => {
    it('returns result when invoke succeeds without args', async () => {
      mockInvoke.mockResolvedValueOnce({ key: 'value' });
      const result = await invokeCommand<{ key: string }>('test_cmd');
      expect(mockInvoke).toHaveBeenCalledWith('test_cmd', undefined);
      expect(result).toEqual({ key: 'value' });
    });

    it('passes arguments to invoke', async () => {
      mockInvoke.mockResolvedValueOnce('ok');
      const result = await invokeCommand<string>('test_cmd_with_args', { foo: 'bar' });
      expect(mockInvoke).toHaveBeenCalledWith('test_cmd_with_args', { foo: 'bar' });
      expect(result).toBe('ok');
    });

    it('re-throws structured AppError when error has code and message', async () => {
      const customError = { code: 'VALIDATION_ERROR', message: 'Invalid input' };
      mockInvoke.mockRejectedValueOnce(customError);

      await expect(invokeCommand('fail_cmd')).rejects.toEqual(customError);
    });

    it('wraps string error in AppError with IO_ERROR code', async () => {
      mockInvoke.mockRejectedValueOnce('Network connection failed');

      await expect(invokeCommand('fail_cmd')).rejects.toEqual({
        code: 'IO_ERROR',
        message: 'Network connection failed',
      });
    });

    it('wraps non-string non-AppError in AppError with stringified message', async () => {
      mockInvoke.mockRejectedValueOnce(12345);

      await expect(invokeCommand('fail_cmd')).rejects.toEqual({
        code: 'IO_ERROR',
        message: '12345',
      });
    });

    it('wraps null error in AppError with IO_ERROR code', async () => {
      mockInvoke.mockRejectedValueOnce(null);

      await expect(invokeCommand('fail_cmd')).rejects.toEqual({
        code: 'IO_ERROR',
        message: 'null',
      });
    });
  });

  describe('themeApi', () => {
    it('getThemes calls get_themes', async () => {
      const summaries = [{ name: 'tokyo-night', variant: 'dark', path: '/themes/tokyo.json', isActive: true }];
      mockInvoke.mockResolvedValueOnce(summaries);
      const res = await themeApi.getThemes();
      expect(mockInvoke).toHaveBeenCalledWith('get_themes', undefined);
      expect(res).toEqual(summaries);
    });

    it('loadTheme calls load_theme with name', async () => {
      const theme: UnifiedTheme = {
        name: 'catppuccin-mocha',
        variant: 'dark',
        colors: {
          bg_primary: '#1e1e2e',
          bg_secondary: '#181825',
          bg_surface: '#313244',
          fg_primary: '#cdd6f4',
          fg_secondary: '#a6adc8',
          fg_muted: '#6c7086',
          accent: '#89b4fa',
          accent_secondary: '#f5c2e7',
          border_active: '#b4befe',
          border_inactive: '#45475a',
          error: '#f38ba8',
          warning: '#f9e2af',
          success: '#a6e3a1',
          info: '#89dceb',
        },
        typography: {
          font_family: 'JetBrains Mono',
          font_size_sm: '10pt',
          font_size_md: '11pt',
          font_size_lg: '13pt',
        },
        geometry: {
          border_width: 2,
          border_radius: 8,
          window_gap: 8,
          bar_height: 32,
        },
        opacity: {
          bar: 0.9,
          window_unfocused: 0.85,
          flyout: 0.95,
          launcher: 0.95,
        },
        wallpaper: {
          path: '/wallpapers/bg.png',
          style: 'Fill',
        },
      };
      mockInvoke.mockResolvedValueOnce(theme);
      const res = await themeApi.loadTheme('catppuccin-mocha');
      expect(mockInvoke).toHaveBeenCalledWith('load_theme', { name: 'catppuccin-mocha' });
      expect(res).toEqual(theme);
    });

    it('saveTheme calls save_theme with theme', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      const theme = { name: 'test-theme' } as unknown as UnifiedTheme;
      await themeApi.saveTheme(theme);
      expect(mockInvoke).toHaveBeenCalledWith('save_theme', { theme });
    });

    it('getActiveThemeName calls get_active_theme_name', async () => {
      mockInvoke.mockResolvedValueOnce('dracula');
      const res = await themeApi.getActiveThemeName();
      expect(mockInvoke).toHaveBeenCalledWith('get_active_theme_name', undefined);
      expect(res).toBe('dracula');
    });

    it('setActiveTheme calls set_active_theme with name', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      await themeApi.setActiveTheme('gruvbox');
      expect(mockInvoke).toHaveBeenCalledWith('set_active_theme', { name: 'gruvbox' });
    });
  });

  describe('tilingApi', () => {
    it('loadKomorebiConfig calls load_komorebi_config', async () => {
      const config = { border_width: 2 } as KomorebiConfig;
      mockInvoke.mockResolvedValueOnce(config);
      const res = await tilingApi.loadKomorebiConfig();
      expect(mockInvoke).toHaveBeenCalledWith('load_komorebi_config', undefined);
      expect(res).toEqual(config);
    });

    it('saveKomorebiConfig calls save_komorebi_config with config', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      const config = { border_width: 3 } as KomorebiConfig;
      await tilingApi.saveKomorebiConfig(config);
      expect(mockInvoke).toHaveBeenCalledWith('save_komorebi_config', { config });
    });

    it('loadFloatRules calls load_float_rules', async () => {
      const rules: ApplicationRule[] = [{ name: 'Notepad', identifier: { kind: 'Exe', id: 'notepad.exe', matching_strategy: 'Equals' } }];
      mockInvoke.mockResolvedValueOnce(rules);
      const res = await tilingApi.loadFloatRules();
      expect(mockInvoke).toHaveBeenCalledWith('load_float_rules', undefined);
      expect(res).toEqual(rules);
    });

    it('saveFloatRules calls save_float_rules with rules', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      const rules: ApplicationRule[] = [{ name: 'Calc', identifier: { kind: 'Class', id: 'calc', matching_strategy: 'Contains' } }];
      await tilingApi.saveFloatRules(rules);
      expect(mockInvoke).toHaveBeenCalledWith('save_float_rules', { rules });
    });

    it('loadHotkeys calls load_hotkeys', async () => {
      const bindings: HotkeyBinding[] = [{ id: 'b1', category: 'navigation', modifiers: ['alt'], key: 'q', command: 'komorebic close' }];
      mockInvoke.mockResolvedValueOnce(bindings);
      const res = await tilingApi.loadHotkeys();
      expect(mockInvoke).toHaveBeenCalledWith('load_hotkeys', undefined);
      expect(res).toEqual(bindings);
    });

    it('saveHotkeys calls save_hotkeys with hotkeys', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      const bindings: HotkeyBinding[] = [{ id: 'b2', category: 'launcher', modifiers: ['alt', 'shift'], key: 'Enter', command: 'wt' }];
      await tilingApi.saveHotkeys(bindings);
      expect(mockInvoke).toHaveBeenCalledWith('save_hotkeys', { hotkeys: bindings });
    });

    it('validateHotkeys calls validate_hotkeys with candidate bindings', async () => {
      const conflicts = [{ keyCombo: 'Alt+q', existingCommand: 'close', proposedCommand: 'quit' }];
      mockInvoke.mockResolvedValueOnce(conflicts);
      const bindings: HotkeyBinding[] = [{ id: 'b3', category: 'navigation', modifiers: ['alt'], key: 'q', command: 'quit' }];
      const res = await tilingApi.validateHotkeys(bindings);
      expect(mockInvoke).toHaveBeenCalledWith('validate_hotkeys', { hotkeys: bindings });
      expect(res).toEqual(conflicts);
    });
  });

  describe('statusBarApi', () => {
    it('loadYasbConfig calls load_yasb_config', async () => {
      const config = { bars: {} } as YasbConfig;
      mockInvoke.mockResolvedValueOnce(config);
      const res = await statusBarApi.loadYasbConfig();
      expect(mockInvoke).toHaveBeenCalledWith('load_yasb_config', undefined);
      expect(res).toEqual(config);
    });

    it('saveYasbConfig calls save_yasb_config with config', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      const config = { bars: {} } as YasbConfig;
      await statusBarApi.saveYasbConfig(config);
      expect(mockInvoke).toHaveBeenCalledWith('save_yasb_config', { config });
    });

    it('loadYasbCss calls load_yasb_css', async () => {
      mockInvoke.mockResolvedValueOnce('.bar { background: red; }');
      const res = await statusBarApi.loadYasbCss();
      expect(mockInvoke).toHaveBeenCalledWith('load_yasb_css', undefined);
      expect(res).toBe('.bar { background: red; }');
    });

    it('saveYasbCss calls save_yasb_css with css', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      await statusBarApi.saveYasbCss('.bar { background: blue; }');
      expect(mockInvoke).toHaveBeenCalledWith('save_yasb_css', { css: '.bar { background: blue; }' });
    });

    it('loadFluentFlyoutConfig calls load_fluentflyout_config', async () => {
      const cfg = { enableAcrylic: true } as unknown as FluentFlyoutConfig;
      mockInvoke.mockResolvedValueOnce(cfg);
      const res = await statusBarApi.loadFluentFlyoutConfig();
      expect(mockInvoke).toHaveBeenCalledWith('load_fluentflyout_config', undefined);
      expect(res).toEqual(cfg);
    });

    it('saveFluentFlyoutConfig calls save_fluentflyout_config with config', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      const cfg = { enableAcrylic: false } as unknown as FluentFlyoutConfig;
      await statusBarApi.saveFluentFlyoutConfig(cfg);
      expect(mockInvoke).toHaveBeenCalledWith('save_fluentflyout_config', { config: cfg });
    });

    it('getEarTrumpetConfig calls get_eartrumpet_config', async () => {
      const cfg = { theme: 'System' } as EarTrumpetConfig;
      mockInvoke.mockResolvedValueOnce(cfg);
      const res = await statusBarApi.getEarTrumpetConfig();
      expect(mockInvoke).toHaveBeenCalledWith('get_eartrumpet_config', undefined);
      expect(res).toEqual(cfg);
    });

    it('setEarTrumpetConfig calls set_eartrumpet_config with config', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      const cfg = { theme: 'Dark' } as EarTrumpetConfig;
      await statusBarApi.setEarTrumpetConfig(cfg);
      expect(mockInvoke).toHaveBeenCalledWith('set_eartrumpet_config', { config: cfg });
    });
  });

  describe('modsApi', () => {
    it('loadFlowSettings calls load_flow_settings', async () => {
      const settings = { hotkey: 'Alt+Space' } as unknown as FlowSettings;
      mockInvoke.mockResolvedValueOnce(settings);
      const res = await modsApi.loadFlowSettings();
      expect(mockInvoke).toHaveBeenCalledWith('load_flow_settings', undefined);
      expect(res).toEqual(settings);
    });

    it('saveFlowSettings calls save_flow_settings with settings', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      const settings = { hotkey: 'Ctrl+Space' } as unknown as FlowSettings;
      await modsApi.saveFlowSettings(settings);
      expect(mockInvoke).toHaveBeenCalledWith('save_flow_settings', { settings });
    });

    it('getWindhawkMods calls get_windhawk_mods', async () => {
      const mods = [{ id: 'taskbar-height', name: 'Taskbar Height', enabled: true, sourcePath: '/mods/th.cpp' }];
      mockInvoke.mockResolvedValueOnce(mods);
      const res = await modsApi.getWindhawkMods();
      expect(mockInvoke).toHaveBeenCalledWith('get_windhawk_mods', undefined);
      expect(res).toEqual(mods);
    });

    it('setWindhawkModState calls set_windhawk_mod_state with modId and enabled', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      await modsApi.setWindhawkModState('taskbar-height', false);
      expect(mockInvoke).toHaveBeenCalledWith('set_windhawk_mod_state', { modId: 'taskbar-height', enabled: false });
    });
  });

  describe('systemApi', () => {
    it('checkDeploymentStatus calls check_deployment_status', async () => {
      const status = { isInstalled: true, komorebiInstalled: true, yasbInstalled: true, whkdInstalled: true, missingDependencies: [] };
      mockInvoke.mockResolvedValueOnce(status);
      const res = await systemApi.checkDeploymentStatus();
      expect(mockInvoke).toHaveBeenCalledWith('check_deployment_status', undefined);
      expect(res).toEqual(status);
    });

    it('runInstallProvisioning calls run_install_provisioning with params', async () => {
      const result = { success: true, stdout: 'ok', stderr: '', exitCode: 0 };
      mockInvoke.mockResolvedValueOnce(result);
      const res = await systemApi.runInstallProvisioning({ dryRun: true, skipPackages: false, theme: 'tokyo-night' });
      expect(mockInvoke).toHaveBeenCalledWith('run_install_provisioning', {
        dryRun: true,
        skipPackages: false,
        noAdmin: undefined,
        theme: 'tokyo-night',
      });
      expect(res).toEqual(result);
    });

    it('getPrivilegeStatus calls get_privilege_status', async () => {
      const privilege = { isElevated: false, isRootless: true };
      mockInvoke.mockResolvedValueOnce(privilege);
      const res = await systemApi.getPrivilegeStatus();
      expect(mockInvoke).toHaveBeenCalledWith('get_privilege_status', undefined);
      expect(res).toEqual(privilege);
    });

    it('getServicesStatus calls get_services_status', async () => {
      const services = [{ name: 'komorebi', isRunning: true, pid: 1001, memoryBytes: 2048, cpuPercent: 1.2, uptimeSeconds: 300 }];
      mockInvoke.mockResolvedValueOnce(services);
      const res = await systemApi.getServicesStatus();
      expect(mockInvoke).toHaveBeenCalledWith('get_services_status', undefined);
      expect(res).toEqual(services);
    });

    it('serviceAction calls service_action with name and action', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      await systemApi.serviceAction('komorebi', 'restart');
      expect(mockInvoke).toHaveBeenCalledWith('service_action', { name: 'komorebi', action: 'restart' });
    });

    it('applySyncTheme calls apply_sync_theme with dryRun', async () => {
      const applyResult = { success: true, message: 'Synced', isDryRun: false, renderedFiles: ['/path/to/rendered'] };
      mockInvoke.mockResolvedValueOnce(applyResult);
      const res = await systemApi.applySyncTheme(false);
      expect(mockInvoke).toHaveBeenCalledWith('apply_sync_theme', { dryRun: false });
      expect(res).toEqual(applyResult);
    });

    it('getBackups calls get_backups', async () => {
      const backups = [{ timestamp: '20261122_120000', path: '/backups/20261122', sizeBytes: 1024, fileCount: 5 }];
      mockInvoke.mockResolvedValueOnce(backups);
      const res = await systemApi.getBackups();
      expect(mockInvoke).toHaveBeenCalledWith('get_backups', undefined);
      expect(res).toEqual(backups);
    });

    it('restoreBackup calls restore_backup with timestamp', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      await systemApi.restoreBackup('20261122_120000');
      expect(mockInvoke).toHaveBeenCalledWith('restore_backup', { timestamp: '20261122_120000' });
    });

    it('getSandboxState calls get_sandbox_state', async () => {
      const state = { isSandboxed: true, sandboxPath: 'C:\\temp\\sandbox' };
      mockInvoke.mockResolvedValueOnce(state);
      const res = await systemApi.getSandboxState();
      expect(mockInvoke).toHaveBeenCalledWith('get_sandbox_state', undefined);
      expect(res).toEqual(state);
    });

    it('executeFullDryRun calls execute_full_dryrun with theme and keepSandbox', async () => {
      const ledger = {
        sessionTimestamp: '20261122',
        summary: { totalActions: 3, fileWrites: 2, registryWrites: 0, serviceRestarts: 1, packageInstalls: 0 },
        actions: [],
        diffs: [],
      };
      mockInvoke.mockResolvedValueOnce(ledger);
      const res = await systemApi.executeFullDryRun('dark', true);
      expect(mockInvoke).toHaveBeenCalledWith('execute_full_dryrun', { theme: 'dark', keepSandbox: true });
      expect(res).toEqual(ledger);
    });
  });

  describe('performanceApi', () => {
    it('getPerformanceConfig calls get_performance_config', async () => {
      const cfg = { activeProfile: 'balanced' } as unknown as PerformanceConfig;
      mockInvoke.mockResolvedValueOnce(cfg);
      const res = await performanceApi.getPerformanceConfig();
      expect(mockInvoke).toHaveBeenCalledWith('get_performance_config', undefined);
      expect(res).toEqual(cfg);
    });

    it('setPerformanceProfile calls set_performance_profile with profile and dryRun', async () => {
      const applyResult = { success: true, message: 'Profile set', isDryRun: true, renderedFiles: [] };
      mockInvoke.mockResolvedValueOnce(applyResult);
      const res = await performanceApi.setPerformanceProfile('ultra-low', true);
      expect(mockInvoke).toHaveBeenCalledWith('set_performance_profile', { profile: 'ultra-low', dryRun: true });
      expect(res).toEqual(applyResult);
    });

    it('savePerformanceConfig calls save_performance_config with config', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      const cfg = { activeProfile: 'gaming' } as unknown as PerformanceConfig;
      await performanceApi.savePerformanceConfig(cfg);
      expect(mockInvoke).toHaveBeenCalledWith('save_performance_config', { config: cfg });
    });
  });
});
