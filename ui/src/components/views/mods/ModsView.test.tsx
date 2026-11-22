import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModsView } from './ModsView';
import { modsApi } from '@/lib/ipc';

vi.mock('@/lib/ipc', () => ({
  modsApi: {
    loadFlowSettings: vi.fn().mockResolvedValue({ Hotkey: 'Alt + Space' }),
    saveFlowSettings: vi.fn(),
    getWindhawkMods: vi.fn().mockResolvedValue([]),
    setWindhawkModState: vi.fn(),
  },
  systemApi: {
    getPrivilegeStatus: vi.fn().mockResolvedValue({ isElevated: true, isRootless: false }),
  },
}));

describe('ModsView', () => {
  it('renders header, hero, and sub-tabs', async () => {
    render(<ModsView />);

    expect(screen.getByText('Launcher & Windhawk Shell Mods')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Flow Launcher/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Windhawk Mods/i })).toBeInTheDocument();
  });

  it('switches between Flow Launcher and Windhawk sub-tabs', async () => {
    render(<ModsView />);

    await waitFor(() => {
      expect(screen.getByText('Flow Launcher Settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Windhawk Mods/i }));

    await waitFor(() => {
      expect(screen.getByText('Windhawk C++ Shell Hooks')).toBeInTheDocument();
    });
  });
});
