import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';
import { ToastProvider } from './components/ui/toast';
import {
  themeApi,
  systemApi,
  tilingApi,
  statusBarApi,
  modsApi,
  performanceApi,
} from './lib/ipc';

vi.mock('./lib/ipc', () => ({
  themeApi: {
    getThemes: vi.fn(),
    getActiveThemeName: vi.fn(),
    loadTheme: vi.fn(),
    saveTheme: vi.fn(),
    setActiveTheme: vi.fn(),
  },
  systemApi: {
    getSandboxState: vi.fn(),
    getPrivilegeStatus: vi.fn(),
    checkDeploymentStatus: vi.fn(),
    applySyncTheme: vi.fn(),
    getServicesStatus: vi.fn(),
    getBackups: vi.fn(),
    serviceAction: vi.fn(),
    runInstallProvisioning: vi.fn(),
  },
  tilingApi: {
    loadKomorebiConfig: vi.fn(),
    loadHotkeys: vi.fn(),
    loadFloatRules: vi.fn(),
  },
  statusBarApi: {
    loadYasbConfig: vi.fn(),
    loadYasbCss: vi.fn(),
    loadFluentFlyoutConfig: vi.fn(),
    getEarTrumpetConfig: vi.fn(),
  },
  modsApi: {
    loadFlowSettings: vi.fn(),
    getWindhawkMods: vi.fn(),
    setWindhawkModState: vi.fn(),
  },
  performanceApi: {
    getPerformanceConfig: vi.fn(),
    setPerformanceProfile: vi.fn(),
    savePerformanceConfig: vi.fn(),
  },
}));

const mockTheme = {
  name: 'dark',
  variant: 'dark',
  colors: {
    bg_primary: '#0f141c',
    bg_secondary: '#1a202c',
    bg_surface: '#232b3b',
    fg_primary: '#f8fafc',
    fg_secondary: '#cbd5e1',
    fg_muted: '#64748b',
    accent: '#38bdf8',
    accent_secondary: '#818cf8',
    border_active: '#38bdf8',
    border_inactive: '#334155',
    error: '#f43f5e',
    warning: '#f59e0b',
    success: '#10b981',
    info: '#0ea5e9',
  },
  typography: {
    font_family: 'Segoe UI Variable Text',
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
    path: '',
    style: 'Fill',
  },
};

const renderApp = () => {
  return render(
    <ToastProvider>
      <App />
    </ToastProvider>
  );
};

describe('App Root Shell Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(systemApi.getSandboxState).mockResolvedValue({
      isSandboxed: true,
      sandboxPath: 'C:/sandbox/test',
      liveWorkingDir: 'C:/live',
    });
    vi.mocked(systemApi.getPrivilegeStatus).mockResolvedValue({
      isElevated: false,
      isRootless: true,
    });
    vi.mocked(systemApi.checkDeploymentStatus).mockResolvedValue({
      isDeployed: true,
      komorebiConfigExists: true,
      yasbConfigExists: true,
      whkdrcExists: true,
      activeServicesRunning: true,
      missingTools: [],
    });
    vi.mocked(systemApi.getServicesStatus).mockResolvedValue([]);
    vi.mocked(systemApi.getBackups).mockResolvedValue([]);
    vi.mocked(systemApi.applySyncTheme).mockResolvedValue({
      success: true,
      themeName: 'dark',
      renderedFiles: ['komorebi.json', 'yasb.yaml'],
      reloadedServices: ['komorebi', 'yasb'],
      outputLog: 'Sync success',
    });

    vi.mocked(themeApi.getThemes).mockResolvedValue([
      { name: 'dark', variant: 'dark', path: 'themes/dark.json', isActive: true },
      { name: 'light', variant: 'light', path: 'themes/light.json', isActive: false },
    ]);
    vi.mocked(themeApi.getActiveThemeName).mockResolvedValue('dark');
    vi.mocked(themeApi.loadTheme).mockResolvedValue(mockTheme as any);
    vi.mocked(themeApi.saveTheme).mockResolvedValue(undefined as any);
    vi.mocked(themeApi.setActiveTheme).mockResolvedValue(undefined as any);

    vi.mocked(tilingApi.loadKomorebiConfig).mockResolvedValue({} as any);
    vi.mocked(tilingApi.loadHotkeys).mockResolvedValue([]);
    vi.mocked(tilingApi.loadFloatRules).mockResolvedValue([]);

    vi.mocked(statusBarApi.loadYasbConfig).mockResolvedValue({
      watch_stylesheet: true,
      watch_config: true,
      bars: {
        'main-bar': {
          enabled: true,
          screens: ['*'],
          class_name: 'yasb-bar',
          alignment: { position: 'top', center: false },
          blur_effect: { enabled: true, acrylic: false, dark: true, round_corners: true, round_corners_type: 'normal', border_color: '#000' },
          window_flags: { always_on_top: false, windows_app_bar: true },
          dimensions: { width: '100%', height: 32 },
          padding: { top: 0, left: 6, bottom: 0, right: 6 },
          widgets: { left: [], center: [], right: [] },
        },
      },
      widgets: {},
    });
    vi.mocked(statusBarApi.loadYasbCss).mockResolvedValue('');
    vi.mocked(statusBarApi.loadFluentFlyoutConfig).mockResolvedValue({} as any);
    vi.mocked(statusBarApi.getEarTrumpetConfig).mockResolvedValue({} as any);

    vi.mocked(modsApi.loadFlowSettings).mockResolvedValue({} as any);
    vi.mocked(modsApi.getWindhawkMods).mockResolvedValue([]);

    vi.mocked(performanceApi.getPerformanceConfig).mockResolvedValue({
      active_profile: 'balanced',
      profiles: {},
    } as any);
  });

  it('renders titlebar, navigation sidebar, and initial Theme Studio view', async () => {
    renderApp();

    expect(screen.getByText(/Komoyasb/i)).toBeInTheDocument();
    expect(screen.getAllByText('Theme Studio').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Tiling & Whkd')).toBeInTheDocument();
    expect(screen.getByText('Status Bar & OSD')).toBeInTheDocument();
    expect(screen.getByText('Mods & Launcher')).toBeInTheDocument();
    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Services & Sync')).toBeInTheDocument();

    await waitFor(() => {
      expect(systemApi.getSandboxState).toHaveBeenCalled();
      expect(themeApi.getThemes).toHaveBeenCalled();
      expect(themeApi.getActiveThemeName).toHaveBeenCalled();
      expect(themeApi.loadTheme).toHaveBeenCalledWith('dark');
    });

    // Theme studio active
    expect(
      screen.getByText('Single source of truth styling compiled across Komorebi borders, YASB CSS, and Flow Launcher.')
    ).toBeInTheDocument();
  });

  it('sets CSS variables on root document element when theme loads', async () => {
    renderApp();

    await waitFor(() => {
      expect(themeApi.loadTheme).toHaveBeenCalled();
    });

    expect(document.documentElement.style.getPropertyValue('--color-bg-primary')).toBe('#0f141c');
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe('8px');
  });

  it('switches tabs to Tiling Manager and displays TilingView', async () => {
    renderApp();

    const tilingTab = screen.getByRole('button', { name: /tiling & whkd/i });
    fireEvent.click(tilingTab);

    expect(await screen.findByText('Tiling & Hotkey Center')).toBeInTheDocument();
  });

  it('switches tabs to Status Bar and displays StatusBarView', async () => {
    renderApp();

    const statusBarTab = screen.getByRole('button', { name: /status bar & osd/i });
    fireEvent.click(statusBarTab);

    expect(await screen.findByText('Status Bar & Media OSD')).toBeInTheDocument();
  });

  it('switches tabs to Add-on Mods and displays ModsView', async () => {
    renderApp();

    const modsTab = screen.getByRole('button', { name: /mods & launcher/i });
    fireEvent.click(modsTab);

    expect(await screen.findByText('Launcher & Windhawk Shell Mods')).toBeInTheDocument();
  });

  it('switches tabs to Performance and displays PerformanceView', async () => {
    renderApp();

    const perfTab = screen.getByRole('button', { name: /^performance/i });
    fireEvent.click(perfTab);

    expect(await screen.findByText('Performance Profiles & Resource Tuning')).toBeInTheDocument();
  });

  it('switches tabs to Services and displays ServicesView', async () => {
    renderApp();

    const servicesTab = screen.getByRole('button', { name: /services & sync/i });
    fireEvent.click(servicesTab);

    expect(await screen.findByText('Services Supervisor & Theme Synchronization')).toBeInTheDocument();
  });

  it('executes live Apply & Sync from global status bar', async () => {
    renderApp();

    await waitFor(() => {
      expect(systemApi.getSandboxState).toHaveBeenCalled();
    });

    const applySyncBtn = screen.getByRole('button', { name: /apply & sync/i });
    fireEvent.click(applySyncBtn);

    await waitFor(() => {
      expect(systemApi.applySyncTheme).toHaveBeenCalledWith(false);
    });

    expect(await screen.findByText(/Theme Applied & Synced/i)).toBeInTheDocument();
  });

  it('executes Dry-Run Test from global status bar', async () => {
    renderApp();

    await waitFor(() => {
      expect(systemApi.getSandboxState).toHaveBeenCalled();
    });

    const dryRunBtn = screen.getByRole('button', { name: /dry-run test/i });
    fireEvent.click(dryRunBtn);

    await waitFor(() => {
      expect(systemApi.applySyncTheme).toHaveBeenCalledWith(true);
    });

    expect(await screen.findByText(/Dry-Run Validated/i)).toBeInTheDocument();
  });

  it('handles apply failure response from global status bar', async () => {
    vi.mocked(systemApi.applySyncTheme).mockResolvedValueOnce({
      success: false,
      themeName: 'dark',
      renderedFiles: [],
      reloadedServices: [],
      outputLog: 'Compilation error: bad color token',
    });

    renderApp();

    const applySyncBtn = screen.getByRole('button', { name: /apply & sync/i });
    fireEvent.click(applySyncBtn);

    expect(await screen.findByText(/Sync Encountered Issues/i)).toBeInTheDocument();
    expect(screen.getByText('Compilation error: bad color token')).toBeInTheDocument();
  });

  it('handles apply exception from global status bar', async () => {
    vi.mocked(systemApi.applySyncTheme).mockRejectedValueOnce(new Error('Tauri command failure'));

    renderApp();

    const applySyncBtn = screen.getByRole('button', { name: /apply & sync/i });
    fireEvent.click(applySyncBtn);

    expect(await screen.findByText(/Apply Failed/i)).toBeInTheDocument();
    expect(screen.getByText('Tauri command failure')).toBeInTheDocument();
  });

  it('handles theme loading and error reporting in theme studio', async () => {
    renderApp();

    await waitFor(() => {
      expect(themeApi.loadTheme).toHaveBeenCalled();
    });

    // Click Presets tab trigger
    const presetsTab = screen.getByRole('button', { name: /presets & profiles/i });
    fireEvent.click(presetsTab);

    // Preset list in Theme Studio has presets
    expect(await screen.findByText('Theme Presets')).toBeInTheDocument();
  });

  it('prevents tab switch when dirty and allows cancellation', async () => {
    renderApp();

    await waitFor(() => {
      expect(themeApi.loadTheme).toHaveBeenCalled();
    });

    // Mutate a color token to mark app as dirty
    const textInputs = screen.getAllByRole('textbox');
    fireEvent.change(textInputs[0], { target: { value: '#ff00aa' } });

    // Status bar shows Unsaved Changes
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();

    // Attempt to switch to Tiling tab
    const tilingTab = screen.getByRole('button', { name: /tiling & whkd/i });
    fireEvent.click(tilingTab);

    // Modal dialog pops up warning about unsaved changes
    expect(screen.getByText(/Are you sure you want to discard them and leave this view\?/i)).toBeInTheDocument();
    // Tiling view should not be mounted yet
    expect(screen.queryByText('Tiling & Hotkey Center')).not.toBeInTheDocument();

    // Click "Stay on Tab"
    const stayBtn = screen.getByRole('button', { name: /stay on tab/i });
    fireEvent.click(stayBtn);

    // Dialog closes and user remains on Theme Studio
    expect(screen.queryByText(/Are you sure you want to discard them and leave this view\?/i)).not.toBeInTheDocument();
    expect(screen.getByText('Single source of truth styling compiled across Komorebi borders, YASB CSS, and Flow Launcher.')).toBeInTheDocument();
  });

  it('allows discarding unsaved changes and switching tabs on confirmation', async () => {
    renderApp();

    await waitFor(() => {
      expect(themeApi.loadTheme).toHaveBeenCalled();
    });

    // Mutate a color token to mark app as dirty
    const textInputs = screen.getAllByRole('textbox');
    fireEvent.change(textInputs[0], { target: { value: '#ff00aa' } });

    // Attempt to switch to Tiling tab
    const tilingTab = screen.getByRole('button', { name: /tiling & whkd/i });
    fireEvent.click(tilingTab);

    expect(screen.getByText(/Are you sure you want to discard them and leave this view\?/i)).toBeInTheDocument();

    // Click "Discard & Switch"
    const discardBtn = screen.getByRole('button', { name: /discard & switch/i });
    fireEvent.click(discardBtn);

    // Dialog closes and Tiling view is mounted
    expect(await screen.findByText('Tiling & Hotkey Center')).toBeInTheDocument();
    // Dirty state is cleared
    expect(screen.getByText('All configs synced')).toBeInTheDocument();
  });
});
