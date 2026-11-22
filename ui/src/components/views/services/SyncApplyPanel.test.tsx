import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncApplyPanel } from './SyncApplyPanel';
import { systemApi } from '@/lib/ipc';
import type { ApplyResult } from '@/types/ipc';

vi.mock('@/lib/ipc', () => ({
  systemApi: {
    applySyncTheme: vi.fn(),
  },
}));

describe('SyncApplyPanel Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const successResult: ApplyResult = {
    success: true,
    themeName: 'dark',
    renderedFiles: ['komorebi.json', 'yasb/config.yaml', 'whkdrc'],
    reloadedServices: ['komorebi', 'yasb'],
    outputLog: 'Theme compilation and reload completed cleanly.',
  };

  it('renders sync apply panel with default live mode', () => {
    render(<SyncApplyPanel />);

    expect(screen.getByText('Compile, Sync & Reload Stack')).toBeInTheDocument();
    expect(screen.getByText('Dry Run')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply & sync/i })).toBeInTheDocument();
  });

  it('toggles dry-run mode and updates button label', () => {
    render(<SyncApplyPanel />);

    const switchEl = screen.getByRole('switch');
    fireEvent.click(switchEl);

    expect(screen.getByRole('button', { name: /simulate sync/i })).toBeInTheDocument();
  });

  it('executes live theme apply and opens results dialog', async () => {
    vi.mocked(systemApi.applySyncTheme).mockResolvedValueOnce(successResult);

    render(<SyncApplyPanel />);

    const applyBtn = screen.getByRole('button', { name: /apply & sync/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(systemApi.applySyncTheme).toHaveBeenCalledWith(false);
    });

    expect(await screen.findByText('Theme Synchronization Results')).toBeInTheDocument();
    expect(screen.getByText('Status: Success')).toBeInTheDocument();
    expect(screen.getByText('3 Files Rendered')).toBeInTheDocument();
    expect(screen.getByText('2 Services Reloaded')).toBeInTheDocument();
    expect(screen.getByText('• komorebi.json')).toBeInTheDocument();
    expect(screen.getByText('Theme compilation and reload completed cleanly.')).toBeInTheDocument();
  });

  it('executes dry-run simulation when toggle is checked', async () => {
    vi.mocked(systemApi.applySyncTheme).mockResolvedValueOnce({
      ...successResult,
      outputLog: 'Dry-run evaluation finished without errors.',
    });

    render(<SyncApplyPanel />);

    // Check dry run
    fireEvent.click(screen.getByRole('switch'));

    const simBtn = screen.getByRole('button', { name: /simulate sync/i });
    fireEvent.click(simBtn);

    await waitFor(() => {
      expect(systemApi.applySyncTheme).toHaveBeenCalledWith(true);
    });

    expect(await screen.findByText(/Dry Run Simulation/i)).toBeInTheDocument();
  });

  it('handles apply failure response and shows error status in dialog', async () => {
    vi.mocked(systemApi.applySyncTheme).mockResolvedValueOnce({
      success: false,
      themeName: 'dark',
      renderedFiles: [],
      reloadedServices: [],
      outputLog: 'Compilation error in template',
    });

    render(<SyncApplyPanel />);

    fireEvent.click(screen.getByRole('button', { name: /apply & sync/i }));

    expect(await screen.findByText('Status: Encountered Issues')).toBeInTheDocument();
    expect(screen.getByText('Compilation error in template')).toBeInTheDocument();
  });

  it('copies log to clipboard when Copy button is clicked', async () => {
    vi.mocked(systemApi.applySyncTheme).mockResolvedValueOnce(successResult);
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<SyncApplyPanel />);

    fireEvent.click(screen.getByRole('button', { name: /apply & sync/i }));

    const copyBtn = await screen.findByRole('button', { name: /copy/i });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(successResult.outputLog);
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('displays error notice when API call rejects', async () => {
    vi.mocked(systemApi.applySyncTheme).mockRejectedValueOnce(new Error('Tauri connection dropped'));

    render(<SyncApplyPanel />);

    fireEvent.click(screen.getByRole('button', { name: /apply & sync/i }));

    expect(await screen.findByText('Tauri connection dropped')).toBeInTheDocument();
  });

  it('displays fallback error message when error has no message property', async () => {
    vi.mocked(systemApi.applySyncTheme).mockRejectedValueOnce('raw string error');

    render(<SyncApplyPanel />);

    fireEvent.click(screen.getByRole('button', { name: /apply & sync/i }));

    expect(await screen.findByText('Failed to apply & sync theme')).toBeInTheDocument();
  });

  it('displays fallback log text when outputLog is empty', async () => {
    vi.mocked(systemApi.applySyncTheme).mockResolvedValueOnce({
      ...successResult,
      outputLog: '',
    });

    render(<SyncApplyPanel />);

    fireEvent.click(screen.getByRole('button', { name: /apply & sync/i }));

    expect(await screen.findByText('No log output provided.')).toBeInTheDocument();
  });

  it('closes dialog when Close button inside modal is clicked', async () => {
    vi.mocked(systemApi.applySyncTheme).mockResolvedValueOnce(successResult);

    render(<SyncApplyPanel />);

    fireEvent.click(screen.getByRole('button', { name: /apply & sync/i }));

    expect(await screen.findByText('Theme Synchronization Results')).toBeInTheDocument();

    const closeBtns = screen.getAllByRole('button', { name: /close/i });
    fireEvent.click(closeBtns[closeBtns.length - 1]);

    await waitFor(() => {
      expect(screen.queryByText('Theme Synchronization Results')).not.toBeInTheDocument();
    });
  });

  it('discards rapid double-clicks on Apply & Sync (BUG-08)', async () => {
    let resolveApply: (val: any) => void = () => {};
    const applyPromise = new Promise((resolve) => {
      resolveApply = resolve;
    });
    vi.mocked(systemApi.applySyncTheme).mockReturnValue(applyPromise as any);

    render(<SyncApplyPanel />);

    const applyBtn = screen.getByRole('button', { name: /apply & sync/i });
    // Rapid double-clicks
    fireEvent.click(applyBtn);
    fireEvent.click(applyBtn);

    expect(systemApi.applySyncTheme).toHaveBeenCalledTimes(1);

    resolveApply(successResult);
    await waitFor(() => {
      expect(screen.getByText('Theme Synchronization Results')).toBeInTheDocument();
    });
  });
});
