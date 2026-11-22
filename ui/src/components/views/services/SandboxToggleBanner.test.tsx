import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SandboxToggleBanner } from './SandboxToggleBanner';
import { systemApi } from '@/lib/ipc';

vi.mock('@/lib/ipc', () => ({
  systemApi: {
    getSandboxState: vi.fn(),
  },
}));

describe('SandboxToggleBanner Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when not sandboxed', async () => {
    vi.mocked(systemApi.getSandboxState).mockResolvedValueOnce({
      isSandboxed: false,
      sandboxPath: null,
      liveWorkingDir: 'C:\\Users\\test',
    });

    const { container } = render(<SandboxToggleBanner />);

    await waitFor(() => {
      expect(systemApi.getSandboxState).toHaveBeenCalled();
    });

    expect(container.firstChild).toBeNull();
  });

  it('renders banner with sandbox path when isSandboxed is true', async () => {
    vi.mocked(systemApi.getSandboxState).mockResolvedValueOnce({
      isSandboxed: true,
      sandboxPath: 'C:\\komoyasb_sandbox',
      liveWorkingDir: 'C:\\Users\\test',
    });

    render(<SandboxToggleBanner />);

    expect(await screen.findByText(/Sandbox Mode Active/i)).toBeInTheDocument();
    expect(screen.getByText('Isolated Environment')).toBeInTheDocument();
    expect(screen.getByText('C:\\komoyasb_sandbox')).toBeInTheDocument();
  });

  it('renders fallback virtual path text when sandboxPath is null', async () => {
    vi.mocked(systemApi.getSandboxState).mockResolvedValueOnce({
      isSandboxed: true,
      sandboxPath: null,
      liveWorkingDir: 'C:\\Users\\test',
    });

    render(<SandboxToggleBanner />);

    expect(await screen.findByText('Isolated virtual directory')).toBeInTheDocument();
  });

  it('handles getSandboxState error gracefully without crashing', async () => {
    vi.mocked(systemApi.getSandboxState).mockRejectedValueOnce(new Error('Tauri IPC failed'));

    const { container } = render(<SandboxToggleBanner />);

    await waitFor(() => {
      expect(systemApi.getSandboxState).toHaveBeenCalled();
    });

    expect(container.firstChild).toBeNull();
  });

  it('unmounts cleanly and cancels state updates', () => {
    let resolvePromise: any;
    vi.mocked(systemApi.getSandboxState).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
    );

    const { unmount } = render(<SandboxToggleBanner />);
    unmount();

    if (resolvePromise) {
      resolvePromise({
        isSandboxed: true,
        sandboxPath: 'C:\\tmp',
        liveWorkingDir: 'C:\\',
      });
    }
  });
});
