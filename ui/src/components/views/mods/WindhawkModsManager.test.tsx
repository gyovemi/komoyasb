import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WindhawkModsManager } from './WindhawkModsManager';
import { modsApi, systemApi } from '@/lib/ipc';

vi.mock('@/lib/ipc', () => ({
  modsApi: {
    getWindhawkMods: vi.fn(),
    setWindhawkModState: vi.fn(),
  },
  systemApi: {
    getPrivilegeStatus: vi.fn(),
  },
}));

describe('WindhawkModsManager', () => {
  const mockMods = [
    {
      id: 'taskbar-autohide',
      name: 'Taskbar Auto-Hide & Work Area Enforcer',
      description: 'Forces Windows 11 taskbar to auto-hide',
      sourceFile: 'taskbar-autohide.wh.cpp',
      isLoaded: true,
    },
    {
      id: 'dwm-mica-effects',
      name: 'DWM Mica & Acrylic Backing Enforcer',
      description: 'Injects Mica / Acrylic backdrop effects',
      sourceFile: 'dwm-mica-effects.wh.cpp',
      isLoaded: true,
    },
    {
      id: 'notification-styling',
      name: 'Modern Notification & Flyout Styling',
      description: 'Customizes Windows 11 notification banners',
      sourceFile: 'notification-styling.wh.cpp',
      isLoaded: false,
    },
  ];

  beforeEach(() => {
    vi.mocked(systemApi.getPrivilegeStatus).mockResolvedValue({ isElevated: true, isRootless: false });
    vi.mocked(modsApi.getWindhawkMods).mockResolvedValue(mockMods as any);
    vi.mocked(modsApi.setWindhawkModState).mockResolvedValue(undefined);
  });

  it('renders all mod cards and badges', async () => {
    render(<WindhawkModsManager />);

    await waitFor(() => {
      expect(screen.getByText('Windhawk C++ Shell Hooks')).toBeInTheDocument();
      expect(screen.getByText('Taskbar Auto-Hide & Work Area Enforcer')).toBeInTheDocument();
      expect(screen.getByText('DWM Mica & Acrylic Backing Enforcer')).toBeInTheDocument();
      expect(screen.getByText('Modern Notification & Flyout Styling')).toBeInTheDocument();
      expect(screen.getAllByText('Injected').length).toBe(2);
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  it('toggles mod state and updates backend', async () => {
    render(<WindhawkModsManager />);

    await waitFor(() => {
      expect(screen.getByText('Taskbar Auto-Hide & Work Area Enforcer')).toBeInTheDocument();
    });

    const switches = screen.getAllByRole('switch');
    // Toggle first mod (currently true)
    fireEvent.click(switches[0]);

    await waitFor(() => {
      expect(modsApi.setWindhawkModState).toHaveBeenCalledWith('taskbar-autohide', false);
    });
  });

  it('reverts optimistic update and shows error on failure', async () => {
    vi.mocked(modsApi.setWindhawkModState).mockRejectedValueOnce(new Error('CLI injection failed'));

    render(<WindhawkModsManager />);

    await waitFor(() => {
      expect(screen.getByText('Taskbar Auto-Hide & Work Area Enforcer')).toBeInTheDocument();
    });

    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);

    await waitFor(() => {
      expect(screen.getByText('CLI injection failed')).toBeInTheDocument();
    });
  });

  it('opens source viewer when View Source is clicked', async () => {
    render(<WindhawkModsManager />);

    await waitFor(() => {
      expect(screen.getByText('Taskbar Auto-Hide & Work Area Enforcer')).toBeInTheDocument();
    });

    const viewSourceBtns = screen.getAllByRole('button', { name: /View Source/i });
    fireEvent.click(viewSourceBtns[0]);

    expect(screen.getAllByText('taskbar-autohide.wh.cpp').length).toBeGreaterThan(1);

    // Close the source viewer modal
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);
  });

  it('refreshes status on button click', async () => {
    render(<WindhawkModsManager />);

    await waitFor(() => {
      expect(screen.getByText('Windhawk C++ Shell Hooks')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Refresh Status/i }));

    await waitFor(() => {
      expect(modsApi.getWindhawkMods).toHaveBeenCalledTimes(2);
    });
  });

  it('falls back to default mods definitions when getWindhawkMods fails', async () => {
    vi.mocked(modsApi.getWindhawkMods).mockRejectedValueOnce(new Error('IPC failed'));
    render(<WindhawkModsManager />);

    await waitFor(() => {
      expect(screen.getByText('Windhawk C++ Shell Hooks')).toBeInTheDocument();
      expect(screen.getByText('Taskbar Auto-Hide & Work Area Enforcer')).toBeInTheDocument();
    });
  });

  it('displays Admin Required badge and StuckRects3 fallback info in rootless mode', async () => {
    vi.mocked(systemApi.getPrivilegeStatus).mockResolvedValueOnce({ isElevated: false, isRootless: true });
    render(<WindhawkModsManager />);

    await waitFor(() => {
      expect(screen.getAllByText('Admin Required (Windhawk Disabled)').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/HKCU StuckRects3 taskbar auto-hide fallback is active/i)).toBeInTheDocument();
    });
  });
});
