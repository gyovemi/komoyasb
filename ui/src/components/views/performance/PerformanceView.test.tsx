import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PerformanceView } from './PerformanceView';
import { performanceApi } from '@/lib/ipc';
import { ToastProvider } from '@/components/ui/toast';

vi.mock('@/lib/ipc', () => ({
  performanceApi: {
    getPerformanceConfig: vi.fn(),
    savePerformanceConfig: vi.fn(),
    setPerformanceProfile: vi.fn(),
  },
}));

const renderWithToast = (ui: React.ReactElement) => {
  return render(<ToastProvider>{ui}</ToastProvider>);
};

describe('PerformanceView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(performanceApi.getPerformanceConfig).mockResolvedValue({
      active_profile: 'balanced',
      profiles: {
        'ultra-low': {} as any,
        balanced: {
          komorebi: { animation_enabled: true, animation_duration_ms: 150, animation_fps: 60 } as any,
          yasb: { blur_enabled: true } as any,
          dwm: { backdrop_type: 2 } as any,
          launcher: { use_animation: true } as any,
          flyout: { animate_show: true } as any,
          os: { background_eco_qos: false } as any,
        } as any,
        'visual-rich': {} as any,
        gaming: {} as any,
      },
    });
    vi.mocked(performanceApi.savePerformanceConfig).mockResolvedValue(undefined as any);
    vi.mocked(performanceApi.setPerformanceProfile).mockResolvedValue({
      success: true,
      themeName: 'balanced',
      isDryRun: false,
      outputLog: 'Performance profile applied successfully.\nSynced 3 config files.',
      renderedFiles: ['komorebi.json', 'yasb/config.yaml', 'whkdrc'],
      reloadedServices: ['komorebi', 'yasb'],
    } as any);
  });

  it('loads and renders performance view with presets', async () => {
    renderWithToast(<PerformanceView />);

    expect(screen.getByText('Performance Profiles & Resource Tuning')).toBeInTheDocument();
    expect(screen.getByText('Dry-Run Test')).toBeInTheDocument();
    expect(screen.getByText('Apply & Sync Profile')).toBeInTheDocument();

    await waitFor(() => {
      expect(performanceApi.getPerformanceConfig).toHaveBeenCalled();
    });
  });

  it('falls back to default config if getPerformanceConfig throws', async () => {
    vi.mocked(performanceApi.getPerformanceConfig).mockRejectedValueOnce(new Error('Network error'));
    renderWithToast(<PerformanceView />);

    expect(screen.getByText('Performance Profiles & Resource Tuning')).toBeInTheDocument();
    await waitFor(() => {
      expect(performanceApi.getPerformanceConfig).toHaveBeenCalled();
    });
    expect(screen.getByText('Balanced')).toBeInTheDocument();
  });

  it('selects a preset and enables Save Changes', async () => {
    renderWithToast(<PerformanceView />);

    await waitFor(() => {
      expect(performanceApi.getPerformanceConfig).toHaveBeenCalled();
    });

    const gamingPreset = screen.getByText('Gaming');
    fireEvent.click(gamingPreset);

    // Save Changes button appears when dirty
    const saveButton = await screen.findByRole('button', { name: /save changes/i });
    expect(saveButton).toBeInTheDocument();

    fireEvent.click(saveButton);
    await waitFor(() => {
      expect(performanceApi.savePerformanceConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          active_profile: 'gaming',
        })
      );
    });
  });

  it('handles save error gracefully', async () => {
    vi.mocked(performanceApi.savePerformanceConfig).mockRejectedValueOnce(new Error('Disk full'));
    renderWithToast(<PerformanceView />);

    await waitFor(() => {
      expect(performanceApi.getPerformanceConfig).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Ultra-Low'));
    const saveButton = await screen.findByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(performanceApi.savePerformanceConfig).toHaveBeenCalled();
    });
  });

  it('expands granular controls when toggle is switched', async () => {
    renderWithToast(<PerformanceView />);

    await waitFor(() => {
      expect(performanceApi.getPerformanceConfig).toHaveBeenCalled();
    });

    expect(screen.queryByText('Animations, Easing & Transition Framerates')).not.toBeInTheDocument();

    // Toggle granular settings switch
    const expandSwitch = screen.getByRole('switch');
    fireEvent.click(expandSwitch);

    expect(await screen.findByText('Animations, Easing & Transition Framerates')).toBeInTheDocument();

    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[1]);
    const saveBtn = await screen.findByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeInTheDocument();

    // Click Save Changes to test handleSaveConfigOnly
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(performanceApi.savePerformanceConfig).toHaveBeenCalled();
    });
  });

  it('handles save config only error flow', async () => {
    vi.mocked(performanceApi.savePerformanceConfig).mockRejectedValueOnce(
      new Error('Disk write failed')
    );

    renderWithToast(<PerformanceView />);

    await waitFor(() => {
      expect(performanceApi.getPerformanceConfig).toHaveBeenCalled();
    });

    // Make dirty
    fireEvent.click(screen.getByText('Visual-Rich'));
    const saveBtn = await screen.findByRole('button', { name: /save changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(performanceApi.savePerformanceConfig).toHaveBeenCalled();
    });
  });

  it('performs a dry-run test and displays the execution log', async () => {
    vi.mocked(performanceApi.setPerformanceProfile).mockResolvedValueOnce({
      success: true,
      themeName: 'balanced',
      isDryRun: true,
      outputLog: 'Simulation completed with zero regressions.\nRendered 3 shadow files.',
      renderedFiles: ['komorebi.json'],
      reloadedServices: [],
    } as any);

    renderWithToast(<PerformanceView />);

    await waitFor(() => {
      expect(performanceApi.getPerformanceConfig).toHaveBeenCalled();
    });

    const dryRunButton = screen.getByRole('button', { name: /dry-run test/i });
    fireEvent.click(dryRunButton);

    await waitFor(() => {
      expect(performanceApi.setPerformanceProfile).toHaveBeenCalledWith('balanced', true);
    });

    expect(await screen.findByText('Execution Output Log')).toBeInTheDocument();
    expect(screen.getAllByText(/Simulation completed with zero regressions/).length).toBeGreaterThanOrEqual(1);
  });

  it('applies profile directly and saves if dirty', async () => {
    renderWithToast(<PerformanceView />);

    await waitFor(() => {
      expect(performanceApi.getPerformanceConfig).toHaveBeenCalled();
    });

    // Make dirty by clicking Visual-Rich
    fireEvent.click(screen.getByText('Visual-Rich'));

    const applyButton = screen.getByRole('button', { name: /apply & sync profile/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(performanceApi.savePerformanceConfig).toHaveBeenCalled();
      expect(performanceApi.setPerformanceProfile).toHaveBeenCalledWith('visual-rich', false);
    });
  });

  it('handles apply failure response', async () => {
    vi.mocked(performanceApi.setPerformanceProfile).mockResolvedValueOnce({
      success: false,
      themeName: 'balanced',
      isDryRun: false,
      outputLog: 'Error: Failed to reload komorebi daemon.',
      renderedFiles: [],
      reloadedServices: [],
    } as any);

    renderWithToast(<PerformanceView />);

    await waitFor(() => {
      expect(performanceApi.getPerformanceConfig).toHaveBeenCalled();
    });

    const applyButton = screen.getByRole('button', { name: /apply & sync profile/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(performanceApi.setPerformanceProfile).toHaveBeenCalled();
    });

    expect(await screen.findByText('Execution Output Log')).toBeInTheDocument();
    expect(screen.getAllByText(/Failed to reload komorebi daemon/).length).toBeGreaterThanOrEqual(1);
  });

  it('handles apply exception thrown by API', async () => {
    vi.mocked(performanceApi.setPerformanceProfile).mockRejectedValueOnce(
      new Error('IPC channel timeout')
    );

    renderWithToast(<PerformanceView />);

    await waitFor(() => {
      expect(performanceApi.getPerformanceConfig).toHaveBeenCalled();
    });

    const applyButton = screen.getByRole('button', { name: /apply & sync profile/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(performanceApi.setPerformanceProfile).toHaveBeenCalled();
    });
  });
});
