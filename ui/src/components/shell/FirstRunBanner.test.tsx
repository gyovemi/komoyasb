import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FirstRunBanner } from './FirstRunBanner';
import { systemApi } from '@/lib/ipc';
import { listen } from '@tauri-apps/api/event';
import type { DeploymentStatus, ProvisioningResult } from '@/types/ipc';

vi.mock('@/lib/ipc', () => ({
  systemApi: {
    checkDeploymentStatus: vi.fn(),
    runInstallProvisioning: vi.fn(),
    getPrivilegeStatus: vi.fn().mockResolvedValue({ isElevated: false, isRootless: true }),
  },
}));

const mockDeployedStatus: DeploymentStatus = {
  isDeployed: true,
  komorebiConfigExists: true,
  yasbConfigExists: true,
  whkdrcExists: true,
  activeServicesRunning: true,
  missingTools: [],
};

const mockUndeployedStatus: DeploymentStatus = {
  isDeployed: false,
  komorebiConfigExists: false,
  yasbConfigExists: false,
  whkdrcExists: false,
  activeServicesRunning: false,
  missingTools: ['komorebi'],
};

describe('FirstRunBanner', () => {
  let logCallback: ((event: { payload: { line: string; isError: boolean } }) => void) | null = null;

  beforeEach(() => {
    vi.mocked(systemApi.checkDeploymentStatus).mockReset();
    vi.mocked(systemApi.runInstallProvisioning).mockReset();
    vi.mocked(systemApi.getPrivilegeStatus).mockResolvedValue({ isElevated: false, isRootless: true });
    vi.mocked(listen).mockImplementation(async (event, cb) => {
      if (event === 'install-log') {
        logCallback = cb as typeof logCallback;
      }
      return (() => {}) as any;
    });
  });

  it('renders nothing when system is already deployed', async () => {
    vi.mocked(systemApi.checkDeploymentStatus).mockResolvedValueOnce(mockDeployedStatus);

    const { container } = render(<FirstRunBanner />);
    await waitFor(() => {
      expect(systemApi.checkDeploymentStatus).toHaveBeenCalled();
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders banner when system is not deployed', async () => {
    vi.mocked(systemApi.checkDeploymentStatus).mockResolvedValueOnce(mockUndeployedStatus);

    render(<FirstRunBanner />);
    await waitFor(() => {
      expect(screen.getByText(/Fresh Setup Detected/i)).toBeInTheDocument();
    });
  });

  it('dismisses banner when dismiss button is clicked', async () => {
    vi.mocked(systemApi.checkDeploymentStatus).mockResolvedValueOnce(mockUndeployedStatus);

    render(<FirstRunBanner />);
    await waitFor(() => {
      expect(screen.getByText(/Fresh Setup Detected/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Dismiss notification'));
    expect(screen.queryByText(/Fresh Setup Detected/i)).not.toBeInTheDocument();
  });

  it('opens modal, toggles options, and executes provisioning successfully', async () => {
    const handleDeployed = vi.fn();
    vi.mocked(systemApi.checkDeploymentStatus)
      .mockResolvedValueOnce(mockUndeployedStatus)
      .mockResolvedValueOnce(mockDeployedStatus);

    const result: ProvisioningResult = {
      success: true,
      outputLog: 'All packages installed',
      exitCode: 0,
    };
    vi.mocked(systemApi.runInstallProvisioning).mockResolvedValueOnce(result);

    render(<FirstRunBanner onDeployed={handleDeployed} />);
    await waitFor(() => {
      expect(screen.getByText(/Fresh Setup Detected/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Install & Configure Stack/i }));
    expect(screen.getByText('1-Click Desktop Stack Provisioning')).toBeInTheDocument();

    const skipPackagesCheckbox = screen.getByLabelText(/Skip winget packages/i);
    const dryRunCheckbox = screen.getByLabelText(/Dry-Run Simulation/i);

    fireEvent.click(skipPackagesCheckbox);
    fireEvent.click(dryRunCheckbox);

    // Test log streaming
    const activeLogCallback = logCallback;
    if (activeLogCallback) {
      act(() => {
        activeLogCallback({ payload: { line: 'Installing packages...', isError: false } });
      });
    }

    fireEvent.click(screen.getByRole('button', { name: /Start Provisioning/i }));

    await waitFor(() => {
      expect(systemApi.runInstallProvisioning).toHaveBeenCalledWith({
        dryRun: true,
        skipPackages: true,
        noAdmin: true,
        theme: 'dark',
      });
      expect(screen.getByText(/Stack provisioning completed successfully!/i)).toBeInTheDocument();
    });
  });

  it('handles provisioning failure and displays error banner', async () => {
    vi.mocked(systemApi.checkDeploymentStatus).mockResolvedValueOnce(mockUndeployedStatus);
    vi.mocked(systemApi.runInstallProvisioning).mockRejectedValueOnce(new Error('Process exited with code 1'));

    render(<FirstRunBanner />);
    await waitFor(() => {
      expect(screen.getByText(/Fresh Setup Detected/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Install & Configure Stack/i }));
    fireEvent.click(screen.getByRole('button', { name: /Start Provisioning/i }));

    await waitFor(() => {
      expect(screen.getByText(/Provisioning encountered an error/i)).toBeInTheDocument();
    });
  });

  it('closes modal when cancel button is clicked', async () => {
    vi.mocked(systemApi.checkDeploymentStatus).mockResolvedValueOnce(mockUndeployedStatus);

    render(<FirstRunBanner />);
    await waitFor(() => {
      expect(screen.getByText(/Fresh Setup Detected/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Install & Configure Stack/i }));
    expect(screen.getByText('1-Click Desktop Stack Provisioning')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('1-Click Desktop Stack Provisioning')).not.toBeInTheDocument();
  });

  it('discards rapid double-clicks on Start Provisioning (BUG-08)', async () => {
    vi.mocked(systemApi.checkDeploymentStatus).mockResolvedValueOnce(mockUndeployedStatus);

    let resolveProvisioning: (val: any) => void = () => {};
    const provisioningPromise = new Promise((resolve) => {
      resolveProvisioning = resolve;
    });
    vi.mocked(systemApi.runInstallProvisioning).mockReturnValue(provisioningPromise as any);

    render(<FirstRunBanner />);
    await waitFor(() => {
      expect(screen.getByText(/Fresh Setup Detected/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Install & Configure Stack/i }));

    // Select Dry-Run so banner doesn't unmount upon completion
    fireEvent.click(screen.getByLabelText(/Dry-Run Simulation/i));

    const startBtn = screen.getByRole('button', { name: /Start Provisioning/i });
    // Rapid double-click before promise resolves
    fireEvent.click(startBtn);
    fireEvent.click(startBtn);

    expect(systemApi.runInstallProvisioning).toHaveBeenCalledTimes(1);

    resolveProvisioning({ success: true, outputLog: '', exitCode: 0 });
    await waitFor(() => {
      expect(screen.getByText(/Stack provisioning completed successfully!/i)).toBeInTheDocument();
    });
  });

  it('unregisters listener even if component unmounts before listen resolves (BUG-09)', async () => {
    vi.mocked(systemApi.checkDeploymentStatus).mockResolvedValueOnce(mockUndeployedStatus);

    const mockUnlisten = vi.fn();
    let resolveListen: (unlistenFn: any) => void = () => {};
    const listenPromise = new Promise((resolve) => {
      resolveListen = resolve;
    });
    vi.mocked(listen).mockReturnValue(listenPromise as any);

    const { unmount } = render(<FirstRunBanner />);

    // Unmount immediately before listenPromise resolves
    unmount();

    // Now listenPromise resolves
    resolveListen(mockUnlisten);
    await Promise.resolve();

    expect(mockUnlisten).toHaveBeenCalledTimes(1);
  });
});
