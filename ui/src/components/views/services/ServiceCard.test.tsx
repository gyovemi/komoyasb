import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceCard } from './ServiceCard';
import { systemApi } from '@/lib/ipc';
import type { ServiceInfo } from '@/types/ipc';

vi.mock('@/lib/ipc', () => ({
  systemApi: {
    serviceAction: vi.fn(),
  },
}));

describe('ServiceCard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const runningService: ServiceInfo = {
    name: 'komorebi',
    displayName: 'Komorebi Tiling Window Manager',
    isRunning: true,
    pid: 14220,
    memoryBytes: 48 * 1024 * 1024,
    cpuPercent: 0.4,
    uptimeSeconds: 3840,
  };

  const stoppedService: ServiceInfo = {
    name: 'whkd',
    displayName: 'WHKD Hotkey Daemon',
    isRunning: false,
    pid: null,
    memoryBytes: 0,
    cpuPercent: 0,
    uptimeSeconds: 0,
  };

  it('renders running service details and telemetry', () => {
    render(<ServiceCard service={runningService} onRefresh={vi.fn()} />);

    expect(screen.getByText('Komorebi Tiling Window Manager')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('PID: 14220')).toBeInTheDocument();
    expect(screen.getByText('0.4%')).toBeInTheDocument();
    expect(screen.getByText('48 MB')).toBeInTheDocument();
    expect(screen.getByText(/1h 4m/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restart/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
  });

  it('renders stopped service details with start button', () => {
    render(<ServiceCard service={stoppedService} onRefresh={vi.fn()} />);

    expect(screen.getByText('WHKD Hotkey Daemon')).toBeInTheDocument();
    expect(screen.getByText('Stopped')).toBeInTheDocument();
    expect(screen.getByText('Process inactive')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('0 MB')).toBeInTheDocument();
    expect(screen.getByText('0s')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start service/i })).toBeInTheDocument();
  });

  it('triggers restart action and calls onRefresh after timer', async () => {
    vi.mocked(systemApi.serviceAction).mockResolvedValueOnce(undefined);
    const handleRefresh = vi.fn();

    render(<ServiceCard service={runningService} onRefresh={handleRefresh} />);

    const restartBtn = screen.getByRole('button', { name: /restart/i });
    fireEvent.click(restartBtn);

    expect(systemApi.serviceAction).toHaveBeenCalledWith('komorebi', 'restart');

    await waitFor(() => {
      expect(handleRefresh).toHaveBeenCalled();
    }, { timeout: 1500 });
  });

  it('triggers stop action on running service', async () => {
    vi.mocked(systemApi.serviceAction).mockResolvedValueOnce(undefined);
    const handleRefresh = vi.fn();

    render(<ServiceCard service={runningService} onRefresh={handleRefresh} />);

    const stopBtn = screen.getByRole('button', { name: /stop/i });
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(systemApi.serviceAction).toHaveBeenCalledWith('komorebi', 'stop');
    });
  });

  it('triggers start action on stopped service', async () => {
    vi.mocked(systemApi.serviceAction).mockResolvedValueOnce(undefined);
    const handleRefresh = vi.fn();

    render(<ServiceCard service={stoppedService} onRefresh={handleRefresh} />);

    const startBtn = screen.getByRole('button', { name: /start service/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(systemApi.serviceAction).toHaveBeenCalledWith('whkd', 'start');
    });
  });

  it('displays action error when serviceAction throws with message', async () => {
    vi.mocked(systemApi.serviceAction).mockRejectedValueOnce(new Error('Permission denied'));

    render(<ServiceCard service={runningService} onRefresh={vi.fn()} />);

    const restartBtn = screen.getByRole('button', { name: /restart/i });
    fireEvent.click(restartBtn);

    expect(await screen.findByText('Permission denied')).toBeInTheDocument();
  });

  it('displays fallback action error when rejection has no message', async () => {
    vi.mocked(systemApi.serviceAction).mockRejectedValueOnce('string error');

    render(<ServiceCard service={runningService} onRefresh={vi.fn()} />);

    const stopBtn = screen.getByRole('button', { name: /stop/i });
    fireEvent.click(stopBtn);

    expect(
      await screen.findByText('Failed to stop Komorebi Tiling Window Manager')
    ).toBeInTheDocument();
  });

  it('renders distinct icons for yasb and watchdog services', () => {
    const yasbService: ServiceInfo = {
      name: 'yasb',
      displayName: 'YASB Reborn',
      isRunning: true,
      pid: 111,
      memoryBytes: 1024,
      cpuPercent: 1.0,
      uptimeSeconds: 10,
    };
    const watchdogService: ServiceInfo = {
      name: 'watchdog',
      displayName: 'Watchdog',
      isRunning: true,
      pid: 222,
      memoryBytes: 1024,
      cpuPercent: 0.5,
      uptimeSeconds: 20,
    };
    const otherService: ServiceInfo = {
      name: 'other' as any,
      displayName: 'Other Service',
      isRunning: false,
      pid: null,
      memoryBytes: 0,
      cpuPercent: 0,
      uptimeSeconds: 0,
    };

    const { rerender } = render(<ServiceCard service={yasbService} onRefresh={vi.fn()} />);
    expect(screen.getByText('YASB Reborn')).toBeInTheDocument();

    rerender(<ServiceCard service={watchdogService} onRefresh={vi.fn()} />);
    expect(screen.getByText('Watchdog')).toBeInTheDocument();

    rerender(<ServiceCard service={otherService} onRefresh={vi.fn()} />);
    expect(screen.getByText('Other Service')).toBeInTheDocument();
  });
});
