import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServicesView } from './ServicesView';
import { systemApi } from '@/lib/ipc';
import type { ServiceInfo } from '@/types/ipc';

vi.mock('@/lib/ipc', () => ({
  systemApi: {
    getServicesStatus: vi.fn(),
    serviceAction: vi.fn(),
    getSandboxState: vi.fn(),
    getBackups: vi.fn(),
    applySyncTheme: vi.fn(),
  },
}));

describe('ServicesView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(systemApi.getSandboxState).mockResolvedValue({
      isSandboxed: false,
      sandboxPath: null,
      liveWorkingDir: '',
    });
    vi.mocked(systemApi.getBackups).mockResolvedValue([]);
  });

  const mockLiveServices: ServiceInfo[] = [
    {
      name: 'komorebi',
      displayName: 'Komorebi Tiling Window Manager',
      isRunning: true,
      pid: 14220,
      memoryBytes: 48 * 1024 * 1024,
      cpuPercent: 0.4,
      uptimeSeconds: 3840,
    },
    {
      name: 'whkd',
      displayName: 'WHKD Hotkey Daemon',
      isRunning: false,
      pid: null,
      memoryBytes: 0,
      cpuPercent: 0,
      uptimeSeconds: 0,
    },
  ];

  it('loads services on mount and displays service cards', async () => {
    vi.mocked(systemApi.getServicesStatus).mockResolvedValueOnce(mockLiveServices);

    render(<ServicesView />);

    expect(screen.getByText('Services Supervisor & Theme Synchronization')).toBeInTheDocument();
    expect(screen.getByText('Managed Desktop Daemons')).toBeInTheDocument();

    await waitFor(() => {
      expect(systemApi.getServicesStatus).toHaveBeenCalled();
    });

    expect(screen.getByText('Komorebi Tiling Window Manager')).toBeInTheDocument();
    expect(screen.getByText('WHKD Hotkey Daemon')).toBeInTheDocument();
  });

  it('falls back to default fallback services when API throws', async () => {
    vi.mocked(systemApi.getServicesStatus).mockRejectedValueOnce(new Error('Tauri offline'));

    render(<ServicesView />);

    expect(screen.getByText('Services Supervisor & Theme Synchronization')).toBeInTheDocument();

    await waitFor(() => {
      expect(systemApi.getServicesStatus).toHaveBeenCalled();
    });

    // Fallback list includes komorebi, whkd, yasb, watchdog
    expect(screen.getByText('YASB Reborn Status Bar')).toBeInTheDocument();
    expect(screen.getByText('Komoyasb Watchdog Supervisor')).toBeInTheDocument();
  });

  it('opens and closes backup restoration modal', async () => {
    vi.mocked(systemApi.getServicesStatus).mockResolvedValueOnce(mockLiveServices);

    render(<ServicesView />);

    const backupsBtn = screen.getByRole('button', { name: /backups & rollback/i });
    fireEvent.click(backupsBtn);

    expect(await screen.findByText('Configuration Backup & Restoration')).toBeInTheDocument();

    const closeBtns = screen.getAllByRole('button', { name: /close/i });
    fireEvent.click(closeBtns[closeBtns.length - 1]);

    await waitFor(() => {
      expect(screen.queryByText('Configuration Backup & Restoration')).not.toBeInTheDocument();
    });
  });

  it('executes manual refresh on button click', async () => {
    vi.mocked(systemApi.getServicesStatus).mockResolvedValue(mockLiveServices);

    render(<ServicesView />);

    await waitFor(() => {
      expect(systemApi.getServicesStatus).toHaveBeenCalledTimes(1);
    });

    const refreshBtn = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(systemApi.getServicesStatus).toHaveBeenCalledTimes(2);
    });
  });

  it('executes bulk restart for all services with a single supervisor call (BUG-04)', async () => {
    vi.mocked(systemApi.getServicesStatus).mockResolvedValue(mockLiveServices);
    vi.mocked(systemApi.serviceAction).mockResolvedValue(undefined);

    render(<ServicesView />);

    await waitFor(() => {
      expect(systemApi.getServicesStatus).toHaveBeenCalled();
    });

    const restartAllBtn = screen.getByRole('button', { name: /^restart all$/i });
    fireEvent.click(restartAllBtn);

    await waitFor(() => {
      expect(systemApi.serviceAction).toHaveBeenCalledTimes(1);
      expect(systemApi.serviceAction).toHaveBeenCalledWith('all', 'restart');
    });
  });

  it('executes bulk stop and start actions with single supervisor calls (BUG-04)', async () => {
    vi.mocked(systemApi.getServicesStatus).mockResolvedValue(mockLiveServices);
    vi.mocked(systemApi.serviceAction).mockResolvedValue(undefined);

    render(<ServicesView />);

    await waitFor(() => {
      expect(systemApi.getServicesStatus).toHaveBeenCalled();
    });

    const stopAllBtn = screen.getByRole('button', { name: /^stop all$/i });
    fireEvent.click(stopAllBtn);

    await waitFor(() => {
      expect(systemApi.serviceAction).toHaveBeenCalledWith('all', 'stop');
    });

    const startAllBtn = screen.getByRole('button', { name: /^start all$/i });
    fireEvent.click(startAllBtn);

    await waitFor(() => {
      expect(systemApi.serviceAction).toHaveBeenCalledWith('all', 'start');
    });
  });

  it('handles bulk action errors gracefully', async () => {
    vi.mocked(systemApi.getServicesStatus).mockResolvedValue(mockLiveServices);
    vi.mocked(systemApi.serviceAction).mockRejectedValueOnce(new Error('Process lock error'));

    render(<ServicesView />);

    await waitFor(() => {
      expect(systemApi.getServicesStatus).toHaveBeenCalled();
    });

    const restartAllBtn = screen.getByRole('button', { name: /^restart all$/i });
    fireEvent.click(restartAllBtn);

    expect(await screen.findByText('Process lock error')).toBeInTheDocument();
  });

  it('polls services status periodically', async () => {
    vi.useFakeTimers();
    vi.mocked(systemApi.getServicesStatus).mockResolvedValue(mockLiveServices);

    render(<ServicesView />);

    await vi.advanceTimersByTimeAsync(4500);
    expect(systemApi.getServicesStatus).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
