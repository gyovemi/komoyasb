import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { ServicesView } from '../ServicesView';
import { ServiceCard } from '../ServiceCard';
import { BackupRestoreModal } from '../BackupRestoreModal';
import { systemApi } from '@/lib/ipc';
import type { BackupSnapshot, ServiceInfo } from '@/types/ipc';

vi.mock('@/lib/ipc', () => ({
  systemApi: {
    getServicesStatus: vi.fn(),
    serviceAction: vi.fn(),
    getSandboxState: vi.fn(),
    getBackups: vi.fn(),
    restoreBackup: vi.fn(),
    applySyncTheme: vi.fn(),
  },
}));

describe('Services Lifecycle & Timer Cleanup on Unmount (HIGH-09, MED-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(systemApi.getSandboxState).mockResolvedValue({
      isSandboxed: false,
      sandboxPath: null,
      liveWorkingDir: '',
    });
    vi.mocked(systemApi.getBackups).mockResolvedValue([]);
    vi.mocked(systemApi.getServicesStatus).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ServicesView: cancels bulk action refresh timer upon unmount', async () => {
    vi.useFakeTimers();
    vi.mocked(systemApi.getServicesStatus).mockResolvedValue([]);
    vi.mocked(systemApi.serviceAction).mockResolvedValue(undefined);

    const { unmount } = render(<ServicesView />);

    // Initial mount fetch
    await act(async () => {
      await Promise.resolve();
    });
    expect(systemApi.getServicesStatus).toHaveBeenCalledTimes(1);

    // Trigger bulk restart
    const restartAllBtn = screen.getByRole('button', { name: /^restart all$/i });
    await act(async () => {
      fireEvent.click(restartAllBtn);
      await Promise.resolve();
    });
    expect(systemApi.serviceAction).toHaveBeenCalledWith('all', 'restart');

    // Unmount before 800ms timer fires
    unmount();

    // Advance past 800ms
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // fetchServices must NOT have been called a second time
    expect(systemApi.getServicesStatus).toHaveBeenCalledTimes(1);
  });

  it('ServiceCard: cancels onRefresh timer upon unmount', async () => {
    vi.useFakeTimers();
    vi.mocked(systemApi.serviceAction).mockResolvedValue(undefined);
    const handleRefresh = vi.fn();

    const mockService: ServiceInfo = {
      name: 'komorebi',
      displayName: 'Komorebi Tiling Window Manager',
      isRunning: true,
      pid: 1234,
      memoryBytes: 1024,
      cpuPercent: 0.1,
      uptimeSeconds: 100,
    };

    const { unmount } = render(<ServiceCard service={mockService} onRefresh={handleRefresh} />);

    // Trigger restart action
    const restartBtn = screen.getByRole('button', { name: /^restart$/i });
    await act(async () => {
      fireEvent.click(restartBtn);
      await Promise.resolve();
    });
    expect(systemApi.serviceAction).toHaveBeenCalledWith('komorebi', 'restart');

    // Unmount before 500ms timer fires
    unmount();

    // Advance past 500ms
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // onRefresh must NOT have been called
    expect(handleRefresh).not.toHaveBeenCalled();
  });

  it('BackupRestoreModal: single-fetch behavior upon opening modal (MED-05)', async () => {
    const mockSnapshots: BackupSnapshot[] = [
      {
        timestamp: '20261122_120000',
        createdAt: '2026-11-22 12:00:00',
        directoryPath: 'C:\\Users\\test\\.komoyasb\\backups\\20261122_120000',
        files: [{ original: 'komorebi.json', backup: 'komorebi.json' }],
      },
    ];
    vi.mocked(systemApi.getBackups).mockResolvedValue(mockSnapshots);

    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />);

    expect(await screen.findByText('20261122_120000')).toBeInTheDocument();

    // Allow any potential re-renders or secondary effects to flush
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // getBackups must be called exactly ONCE (no double-fetch loop from selectedSnapshot dependency)
    expect(systemApi.getBackups).toHaveBeenCalledTimes(1);
  });

  it('BackupRestoreModal: cancels restore success timeout upon unmount', async () => {
    vi.useFakeTimers();
    const mockSnapshots: BackupSnapshot[] = [
      {
        timestamp: '20261122_120000',
        createdAt: '2026-11-22 12:00:00',
        directoryPath: 'C:\\Users\\test\\.komoyasb\\backups\\20261122_120000',
        files: [{ original: 'komorebi.json', backup: 'komorebi.json' }],
      },
    ];
    vi.mocked(systemApi.getBackups).mockResolvedValue(mockSnapshots);
    vi.mocked(systemApi.restoreBackup).mockResolvedValue(undefined);

    const { unmount } = render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />);

    // Wait for backups to load under fake timers
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    // Click rollback button to trigger confirmation prompt
    const rollbackBtn = screen.getByRole('button', { name: /rollback to this snapshot/i });
    await act(async () => {
      fireEvent.click(rollbackBtn);
    });

    // Confirm restore
    const confirmBtn = screen.getByRole('button', { name: /yes, restore snapshot/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
      await Promise.resolve();
    });

    expect(systemApi.restoreBackup).toHaveBeenCalledWith('20261122_120000');

    // Unmount before 4000ms success auto-clear timeout fires
    unmount();

    // Advance 5000ms
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    // Verifies no unhandled act or unmounted state update errors occur
  });
});
