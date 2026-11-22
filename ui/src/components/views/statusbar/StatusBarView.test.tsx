import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StatusBarView } from './StatusBarView';
import { statusBarApi } from '@/lib/ipc';

vi.mock('@/lib/ipc', () => ({
  statusBarApi: {
    loadYasbConfig: vi.fn(),
    loadYasbCss: vi.fn(),
    loadFluentFlyoutConfig: vi.fn(),
    getEarTrumpetConfig: vi.fn(),
    saveYasbConfig: vi.fn(),
    saveYasbCss: vi.fn(),
    saveFluentFlyoutConfig: vi.fn(),
    setEarTrumpetConfig: vi.fn(),
  },
}));

describe('StatusBarView', () => {
  beforeEach(() => {
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
          widgets: { left: ['clock'], center: [], right: [] },
        },
      },
      widgets: {
        clock: { type: 'yasb.clock.ClockWidget', options: { label: 'clock' } },
      },
    });
    vi.mocked(statusBarApi.loadYasbCss).mockResolvedValue('.yasb-bar { color: white; }');
    vi.mocked(statusBarApi.loadFluentFlyoutConfig).mockResolvedValue({
      General: { RunAtStartup: true, Language: 'en-US' },
      Placement: { Alignment: 'TopCenter', SafePaddingYASB: 36, OffsetY: 12, AvoidWorkAreaOverlap: true },
      Appearance: { Theme: 'dark', Backdrop: 'MicaAlt', CornerRadius: 10, Opacity: 0.95 },
      Modules: {
        Volume: { Enabled: true, StepSize: 2 },
        Brightness: { Enabled: true, StepSize: 5 },
        Media: { Enabled: true },
        LockKeys: { Enabled: false },
      },
    } as any);
    vi.mocked(statusBarApi.getEarTrumpetConfig).mockResolvedValue({
      hasMigrated: true,
      showVolumePeakMeter: true,
      showPlaybackDevices: true,
      showRecordingDevices: false,
      showAppIcons: true,
      expandAll: false,
      theme: 'System',
      useAccentColor: true,
      isPromotedInTray: true,
    });
  });

  it('loads configurations on mount and renders header and sub-tabs', async () => {
    render(<StatusBarView />);

    await waitFor(() => {
      expect(screen.getByText('Status Bar & Media OSD')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /YASB Widgets & Layout/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Custom CSS/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /FluentFlyout OSD/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /EarTrumpet Audio/i })).toBeInTheDocument();
    });
  });

  it('switches between sub-tabs', async () => {
    render(<StatusBarView />);

    await waitFor(() => {
      expect(screen.getByText('Status Bar & Media OSD')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Custom CSS/i }));
    expect(screen.getByText('YASB Custom Stylesheet (styles.css)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /FluentFlyout OSD/i }));
    expect(screen.getByText('FluentFlyouts Media & Volume OSD')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /EarTrumpet Audio/i }));
    expect(screen.getByText('EarTrumpet Windows Audio Integration')).toBeInTheDocument();
  });

  it('handles save all flow successfully', async () => {
    vi.mocked(statusBarApi.saveYasbConfig).mockResolvedValueOnce(undefined);
    vi.mocked(statusBarApi.saveYasbCss).mockResolvedValueOnce(undefined);
    vi.mocked(statusBarApi.saveFluentFlyoutConfig).mockResolvedValueOnce(undefined);
    vi.mocked(statusBarApi.setEarTrumpetConfig).mockResolvedValueOnce(undefined);

    render(<StatusBarView />);

    await waitFor(() => {
      expect(screen.getByText('Status Bar & Media OSD')).toBeInTheDocument();
    });

    // Make dirty by editing css
    fireEvent.click(screen.getByRole('button', { name: /Custom CSS/i }));
    const textarea = screen.getByPlaceholderText(/Enter custom YASB CSS rules here/i);
    fireEvent.change(textarea, { target: { value: '.new-css {}' } });

    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: /Save Configuration/i });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(statusBarApi.saveYasbCss).toHaveBeenCalledWith('.new-css {}');
      expect(screen.getByText('Status Bar & OSD configurations saved successfully!')).toBeInTheDocument();
    });
  });

  it('handles save error flow gracefully', async () => {
    vi.mocked(statusBarApi.saveYasbCss).mockRejectedValueOnce(new Error('Failed writing styles.css'));

    render(<StatusBarView />);

    await waitFor(() => {
      expect(screen.getByText('Status Bar & Media OSD')).toBeInTheDocument();
    });

    // Make dirty
    fireEvent.click(screen.getByRole('button', { name: /Custom CSS/i }));
    const textarea = screen.getByPlaceholderText(/Enter custom YASB CSS rules here/i);
    fireEvent.change(textarea, { target: { value: '.err {}' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Configuration/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed writing styles.css')).toBeInTheDocument();
    });
  });

  it('reloads configurations when Reload button is clicked', async () => {
    render(<StatusBarView />);

    await waitFor(() => {
      expect(screen.getByText('Status Bar & Media OSD')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Reload/i }));

    await waitFor(() => {
      expect(statusBarApi.loadYasbConfig).toHaveBeenCalledTimes(2);
    });
  });

  it('renders fallback empty messages when configs are null', async () => {
    vi.mocked(statusBarApi.loadYasbConfig).mockResolvedValueOnce(null as any);
    vi.mocked(statusBarApi.loadFluentFlyoutConfig).mockResolvedValueOnce(null as any);
    vi.mocked(statusBarApi.getEarTrumpetConfig).mockResolvedValueOnce(null as any);

    render(<StatusBarView />);

    await waitFor(() => {
      expect(screen.getByText('No YASB bar configuration loaded.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /FluentFlyout OSD/i }));
    expect(screen.getByText('No FluentFlyout configuration loaded.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /EarTrumpet Audio/i }));
    expect(screen.getByText('No EarTrumpet configuration loaded.')).toBeInTheDocument();
  });

  it('propagates child changes for yasb, fluent flyout, and eartrumpet sub-tabs', async () => {
    render(<StatusBarView />);

    await waitFor(() => {
      expect(screen.getByText('Status Bar & Media OSD')).toBeInTheDocument();
    });

    // In yasb-layout tab, expand Bar Geometry & Blur accordion and toggle a switch
    const barSettingsBtn = screen.getByRole('button', { name: /Bar Geometry & Blur/i });
    fireEvent.click(barSettingsBtn);
    const blurSwitch = screen.getAllByRole('switch')[0];
    fireEvent.click(blurSwitch);
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();

    // Switch to FluentFlyout tab and toggle a switch
    fireEvent.click(screen.getByRole('button', { name: /FluentFlyout OSD/i }));
    const flyoutSwitches = screen.getAllByRole('switch');
    fireEvent.click(flyoutSwitches[0]);
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();

    // Switch to EarTrumpet tab and toggle a switch
    fireEvent.click(screen.getByRole('button', { name: /EarTrumpet Audio/i }));
    const earTrumpetSwitches = screen.getAllByRole('switch');
    fireEvent.click(earTrumpetSwitches[0]);
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
  });
});
