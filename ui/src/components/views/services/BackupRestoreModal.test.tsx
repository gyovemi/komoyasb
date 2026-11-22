import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackupRestoreModal } from './BackupRestoreModal';
import { systemApi } from '@/lib/ipc';
import type { BackupSnapshot } from '@/types/ipc';

vi.mock('@/lib/ipc', () => ({
  systemApi: {
    getBackups: vi.fn(),
    restoreBackup: vi.fn(),
  },
}));

describe('BackupRestoreModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(systemApi.getBackups).mockResolvedValue([]);
  });

  const mockSnapshots: BackupSnapshot[] = [
    {
      timestamp: '20261122_090000',
      createdAt: '2026-11-22 09:00:00',
      directoryPath: 'C:\\Users\\test\\.komoyasb\\backups\\20261122_090000',
      files: [
        { original: 'C:\\Users\\test\\.config\\komorebi.json', backup: 'komorebi.json' },
        { original: 'C:\\Users\\test\\.config\\yasb\\config.yaml', backup: 'config.yaml' },
      ],
    },
    {
      timestamp: '20261122_080000',
      createdAt: '2026-11-22 08:00:00',
      directoryPath: 'C:\\Users\\test\\.komoyasb\\backups\\20261122_080000',
      files: [
        { original: 'C:\\Users\\test\\.config\\whkdrc', backup: 'whkdrc' },
      ],
    },
  ];

  it('does not load backups when modal is closed', () => {
    render(<BackupRestoreModal isOpen={false} onClose={vi.fn()} />);

    expect(systemApi.getBackups).not.toHaveBeenCalled();
  });

  it('loads backups and renders snapshots list when opened', async () => {
    vi.mocked(systemApi.getBackups).mockResolvedValue(mockSnapshots);

    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Loading backup history...')).toBeInTheDocument();

    expect(await screen.findByText('20261122_090000')).toBeInTheDocument();
    expect(screen.getByText('20261122_080000')).toBeInTheDocument();
    expect(screen.getByText('2 files')).toBeInTheDocument();
    expect(screen.getByText('1 files')).toBeInTheDocument();

    // Default selected snapshot details
    expect(screen.getByText('komorebi.json', { exact: false })).toBeInTheDocument();
  });

  it('renders empty state when no backups exist', async () => {
    vi.mocked(systemApi.getBackups).mockResolvedValueOnce([]);

    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />);

    expect(await screen.findByText('No Backups Found')).toBeInTheDocument();
    expect(
      screen.getByText(/Backups are automatically generated when executing theme synchronizations/)
    ).toBeInTheDocument();
  });

  it('displays error message when getBackups fails', async () => {
    vi.mocked(systemApi.getBackups).mockRejectedValueOnce(new Error('Failed reading backups'));

    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />);

    expect(await screen.findByText('Failed reading backups')).toBeInTheDocument();
  });

  it('switches selected snapshot and shows details', async () => {
    vi.mocked(systemApi.getBackups).mockResolvedValue(mockSnapshots);

    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />);

    expect(await screen.findByText('20261122_090000')).toBeInTheDocument();

    // Click second snapshot
    const secondSnapshot = screen.getByText('20261122_080000');
    fireEvent.click(secondSnapshot);

    expect(await screen.findByText('• whkdrc')).toBeInTheDocument();
  });

  it('prompts confirmation and restores selected snapshot', async () => {
    vi.mocked(systemApi.getBackups).mockResolvedValue(mockSnapshots);
    vi.mocked(systemApi.restoreBackup).mockResolvedValueOnce(undefined);

    const handleSuccess = vi.fn();
    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} onRestoreSuccess={handleSuccess} />);

    expect(await screen.findByText('Rollback to this Snapshot')).toBeInTheDocument();

    // Click Rollback button to open confirmation
    fireEvent.click(screen.getByRole('button', { name: /rollback to this snapshot/i }));

    expect(screen.getByText('Confirm Overwrite?')).toBeInTheDocument();

    // Click confirm restore
    const confirmBtn = screen.getByRole('button', { name: /yes, restore snapshot/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(systemApi.restoreBackup).toHaveBeenCalledWith('20261122_090000');
      expect(handleSuccess).toHaveBeenCalled();
    });

    expect(
      await screen.findByText(/Configuration snapshot restored successfully/)
    ).toBeInTheDocument();
  });

  it('allows cancelling restore confirmation', async () => {
    vi.mocked(systemApi.getBackups).mockResolvedValue(mockSnapshots);

    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />);

    expect(await screen.findByText('Rollback to this Snapshot')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /rollback to this snapshot/i }));
    expect(screen.getByText('Confirm Overwrite?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText('Confirm Overwrite?')).not.toBeInTheDocument();
  });

  it('handles restore error', async () => {
    vi.mocked(systemApi.getBackups).mockResolvedValue(mockSnapshots);
    vi.mocked(systemApi.restoreBackup).mockRejectedValueOnce(new Error('Access Denied'));

    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />);

    expect(await screen.findByText('Rollback to this Snapshot')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /rollback to this snapshot/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, restore snapshot/i }));

    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });

  it('triggers onClose when Close button is clicked', async () => {
    vi.mocked(systemApi.getBackups).mockResolvedValue([]);
    const handleClose = vi.fn();

    render(<BackupRestoreModal isOpen={true} onClose={handleClose} />);

    const closeBtns = screen.getAllByRole('button', { name: /close/i });
    fireEvent.click(closeBtns[closeBtns.length - 1]);

    expect(handleClose).toHaveBeenCalled();
  });

  it('triggers onClose when dialog top X button is clicked', async () => {
    vi.mocked(systemApi.getBackups).mockResolvedValue([]);
    const handleClose = vi.fn();

    render(<BackupRestoreModal isOpen={true} onClose={handleClose} />);

    const closeBtns = screen.getAllByRole('button', { name: /close/i });
    fireEvent.click(closeBtns[0]);

    expect(handleClose).toHaveBeenCalled();
  });
});
