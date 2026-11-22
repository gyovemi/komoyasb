import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DryRunLedgerModal } from './DryRunLedgerModal';
import type { ExecutionLedger } from '@/types/ipc';

const mockLedger: ExecutionLedger = {
  sessionId: 'sess_12345',
  timestamp: '2026-11-22T09:30:00Z',
  isDryRun: true,
  shadowRoot: 'C:\\komoyasb_sandbox\\shadow',
  summary: {
    totalActions: 6,
    filesWritten: 2,
    filesDeleted: 1,
    registryWrites: 1,
    packagesSimulated: 1,
    processesControlled: 1,
  },
  fileDiffs: [
    {
      targetLivePath: 'C:\\Users\\test\\.config\\komorebi.json',
      targetVirtualPath: 'C:\\komoyasb_sandbox\\shadow\\komorebi.json',
      changeType: 'Modified',
      originalSha256: 'abc123sha',
      shadowSha256: 'def456sha',
    },
    {
      targetLivePath: 'C:\\Users\\test\\.config\\yasb\\custom.css',
      targetVirtualPath: 'C:\\komoyasb_sandbox\\shadow\\custom.css',
      changeType: 'Created',
      originalSha256: null,
      shadowSha256: 'ghi789sha',
    },
    {
      targetLivePath: 'C:\\Users\\test\\.config\\old.conf',
      targetVirtualPath: 'C:\\komoyasb_sandbox\\shadow\\old.conf',
      changeType: 'Deleted',
      originalSha256: 'old123sha',
      shadowSha256: null,
    },
    {
      targetLivePath: 'C:\\Users\\test\\.config\\other.conf',
      targetVirtualPath: 'C:\\komoyasb_sandbox\\shadow\\other.conf',
      changeType: 'Unknown' as any,
      originalSha256: null,
      shadowSha256: null,
    },
  ],
  actions: [
    {
      id: 'act_1',
      actionType: 'FileWrite',
      target: 'C:\\Users\\test\\.config\\komorebi.json',
      status: 'Simulated',
      timestamp: '09:30:01',
    },
    {
      id: 'act_2',
      actionType: 'FileDelete',
      target: 'C:\\Users\\test\\.config\\old.conf',
      status: 'Simulated',
      timestamp: '09:30:02',
    },
    {
      id: 'act_3',
      actionType: 'PackageInstall',
      target: 'Flow.Launcher.Plugin.WindowsTerminal',
      status: 'Simulated',
      timestamp: '09:30:03',
    },
    {
      id: 'act_4',
      actionType: 'ProcessControl',
      target: 'komorebic reload-configuration',
      status: 'Simulated',
      timestamp: '09:30:04',
    },
    {
      id: 'act_5',
      actionType: 'WallpaperApply',
      target: 'bg.png',
      status: 'Simulated',
      timestamp: '09:30:05',
    },
    {
      id: 'act_6',
      actionType: 'CustomAction' as any,
      target: 'custom command',
      status: 'Simulated',
      timestamp: '09:30:06',
    },
  ],
};

describe('DryRunLedgerModal Component', () => {
  it('renders nothing when ledger is null', () => {
    const { container } = render(
      <DryRunLedgerModal open={true} onOpenChange={vi.fn()} ledger={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders summary metrics tab by default', () => {
    render(<DryRunLedgerModal open={true} onOpenChange={vi.fn()} ledger={mockLedger} />);

    expect(screen.getByText('Execution Ledger & Simulation Diff')).toBeInTheDocument();
    expect(screen.getByText('sess_12345')).toBeInTheDocument();
    expect(screen.getByText('Total Evaluated Actions')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Simulated File Writes')).toBeInTheDocument();
    expect(screen.getByText('C:\\komoyasb_sandbox\\shadow')).toBeInTheDocument();
    expect(screen.getByText('Zero Live Host Mutation Guarantee')).toBeInTheDocument();
  });

  it('switches to File Mutations tab and toggles diff expansion', () => {
    render(<DryRunLedgerModal open={true} onOpenChange={vi.fn()} ledger={mockLedger} />);

    const diffsTab = screen.getByRole('button', { name: /file mutations/i });
    fireEvent.click(diffsTab);

    expect(screen.getByText('C:\\Users\\test\\.config\\komorebi.json')).toBeInTheDocument();
    expect(screen.getByText('Modified')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Deleted')).toBeInTheDocument();

    // Expand the first diff
    const firstDiffBtn = screen.getByText('C:\\Users\\test\\.config\\komorebi.json');
    fireEvent.click(firstDiffBtn);

    expect(screen.getByText('C:\\komoyasb_sandbox\\shadow\\komorebi.json')).toBeInTheDocument();
    expect(screen.getByText('abc123sha')).toBeInTheDocument();
    expect(screen.getByText('def456sha')).toBeInTheDocument();

    // Collapse it
    fireEvent.click(firstDiffBtn);
    expect(screen.queryByText('abc123sha')).not.toBeInTheDocument();

    // Expand Created diff to verify None (New file)
    const secondDiffBtn = screen.getByText('C:\\Users\\test\\.config\\yasb\\custom.css');
    fireEvent.click(secondDiffBtn);
    expect(screen.getByText('None (New file)')).toBeInTheDocument();

    // Expand Deleted diff to verify None (Deleted file)
    const thirdDiffBtn = screen.getByText('C:\\Users\\test\\.config\\old.conf');
    fireEvent.click(thirdDiffBtn);
    expect(screen.getByText('None (Deleted file)')).toBeInTheDocument();
  });

  it('switches to Action Ledger tab and filters actions by type', () => {
    render(<DryRunLedgerModal open={true} onOpenChange={vi.fn()} ledger={mockLedger} />);

    const actionsTab = screen.getByRole('button', { name: /action ledger/i });
    fireEvent.click(actionsTab);

    // Shows actions
    expect(screen.getByText('FileWrite')).toBeInTheDocument();
    expect(screen.getByText('FileDelete')).toBeInTheDocument();
    expect(screen.getByText('PackageInstall')).toBeInTheDocument();
    expect(screen.getByText('ProcessControl')).toBeInTheDocument();
    expect(screen.getByText('WallpaperApply')).toBeInTheDocument();
    expect(screen.getByText('CustomAction')).toBeInTheDocument();

    // Filter by FileWrite
    const filterSelect = screen.getByRole('combobox');
    fireEvent.change(filterSelect, { target: { value: 'FileWrite' } });

    expect(screen.getByText('C:\\Users\\test\\.config\\komorebi.json')).toBeInTheDocument();
    expect(screen.queryByText('Flow.Launcher.Plugin.WindowsTerminal')).not.toBeInTheDocument();

    // Switch back to summary tab
    const summaryTab = screen.getByRole('button', { name: /summary metrics/i });
    fireEvent.click(summaryTab);
    expect(screen.getByText('Total Evaluated Actions')).toBeInTheDocument();
  });

  it('triggers onExecuteLive callback when Promote button is clicked', () => {
    const handleExecuteLive = vi.fn();
    render(
      <DryRunLedgerModal
        open={true}
        onOpenChange={vi.fn()}
        ledger={mockLedger}
        onExecuteLive={handleExecuteLive}
        isLoadingLive={false}
      />
    );

    const promoteBtn = screen.getByRole('button', { name: /promote to live execution/i });
    fireEvent.click(promoteBtn);

    expect(handleExecuteLive).toHaveBeenCalled();
  });

  it('renders loading state for live promotion button', () => {
    render(
      <DryRunLedgerModal
        open={true}
        onOpenChange={vi.fn()}
        ledger={mockLedger}
        onExecuteLive={vi.fn()}
        isLoadingLive={true}
      />
    );

    expect(screen.getByRole('button', { name: /applying live\.\.\./i })).toBeDisabled();
  });

  it('calls onOpenChange(false) when Close button is clicked', () => {
    const handleOpenChange = vi.fn();
    render(
      <DryRunLedgerModal open={true} onOpenChange={handleOpenChange} ledger={mockLedger} />
    );

    const closeBtns = screen.getAllByRole('button', { name: /close/i });
    fireEvent.click(closeBtns[closeBtns.length - 1]);

    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });
});
