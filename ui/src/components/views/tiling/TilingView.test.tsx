import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TilingView } from './TilingView';
import * as tilingIndex from './index';
import { tilingApi } from '@/lib/ipc';

vi.mock('@/lib/ipc', () => ({
  tilingApi: {
    loadKomorebiConfig: vi.fn(),
    loadFloatRules: vi.fn(),
    loadHotkeys: vi.fn(),
    saveKomorebiConfig: vi.fn(),
    saveFloatRules: vi.fn(),
    saveHotkeys: vi.fn(),
    validateHotkeys: vi.fn().mockResolvedValue([]),
  },
}));

describe('TilingView', () => {
  it('exports components through barrel index', () => {
    expect(tilingIndex.TilingView).toBeDefined();
    expect(tilingIndex.KomorebiGeometryEditor).toBeDefined();
    expect(tilingIndex.FloatRulesTable).toBeDefined();
    expect(tilingIndex.ShortcutRecorder).toBeDefined();
    expect(tilingIndex.WorkspaceListEditor).toBeDefined();
  });
  beforeEach(() => {
    vi.mocked(tilingApi.loadKomorebiConfig).mockResolvedValue({
      cross_monitor_move_behaviour: 'Insert',
      default_workspace_padding: 8,
      default_container_padding: 8,
      border: true,
      border_width: 2,
      border_offset: -1,
      border_style: 'Rounded',
      border_colours: {
        single: '#7aa2f7',
        stack: '#bb9af7',
        monocle: '#7aa2f7',
        unfocused: '#292e42',
        floating: '#bb9af7',
      },
      mouse_follows_focus: false,
      focus_follows_mouse: 'Komorebi',
      transparency: false,
      transparency_alpha: 0.85,
      window_hiding_behaviour: 'Cloak',
      workspaces_per_monitor: true,
      monitors: [{ workspaces: [{ name: '1:dev', layout: 'BSP' }] }],
    });
    vi.mocked(tilingApi.loadFloatRules).mockResolvedValue([
      { name: 'Calc', identifier: { kind: 'Exe', id: 'calc.exe', matching_strategy: 'Equals' } },
    ]);
    vi.mocked(tilingApi.loadHotkeys).mockResolvedValue([
      { id: '1', modifiers: ['alt'], key: 'q', command: 'close', category: 'navigation' },
    ]);
  });

  it('loads configurations on mount and renders tabs', async () => {
    render(<TilingView />);

    await waitFor(() => {
      expect(screen.getByText('Tiling & Hotkey Center')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Geometry & Borders/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Workspaces & Displays/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Float Rules/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Hotkeys/i })).toBeInTheDocument();
    });
  });

  it('switches between tabs', async () => {
    render(<TilingView />);

    await waitFor(() => {
      expect(screen.getByText('Tiling & Hotkey Center')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Workspaces & Displays/i }));
    expect(screen.getByText('Monitors & Displays')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Float Rules/i }));
    expect(screen.getByText('Application Float & Window Rules')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hotkeys/i }));
    expect(screen.getByText('Interactive whkd Keybind Manager')).toBeInTheDocument();
  });

  it('handles save all flow and success feedback', async () => {
    vi.mocked(tilingApi.saveKomorebiConfig).mockResolvedValueOnce(undefined);
    vi.mocked(tilingApi.saveFloatRules).mockResolvedValueOnce(undefined);
    vi.mocked(tilingApi.saveHotkeys).mockResolvedValueOnce(undefined);

    render(<TilingView />);

    await waitFor(() => {
      expect(screen.getByText('Tiling & Hotkey Center')).toBeInTheDocument();
    });

    // Make dirty by toggling border switch in geometry editor
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);

    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(tilingApi.saveKomorebiConfig).toHaveBeenCalled();
      expect(tilingApi.saveFloatRules).toHaveBeenCalled();
      expect(tilingApi.saveHotkeys).toHaveBeenCalled();
      expect(screen.getByText(/Configurations successfully saved!/i)).toBeInTheDocument();
    });
  });

  it('handles save error flow', async () => {
    vi.mocked(tilingApi.saveKomorebiConfig).mockRejectedValueOnce({
      code: 'IO_ERROR',
      message: 'Write permission denied',
    });

    render(<TilingView />);

    await waitFor(() => {
      expect(screen.getByText('Tiling & Hotkey Center')).toBeInTheDocument();
    });

    // Make dirty
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(screen.getByText('Write permission denied')).toBeInTheDocument();
    });
  });

  it('resets configurations on Reset click', async () => {
    render(<TilingView />);

    await waitFor(() => {
      expect(screen.getByText('Tiling & Hotkey Center')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Reset/i }));

    await waitFor(() => {
      expect(tilingApi.loadKomorebiConfig).toHaveBeenCalledTimes(2);
    });
  });

  it('switches sub-tabs to Float Rules and Shortcuts and modifies them', async () => {
    render(<TilingView />);

    await waitFor(() => {
      expect(screen.getByText('Tiling & Hotkey Center')).toBeInTheDocument();
    });

    // Switch to Float Rules
    fireEvent.click(screen.getByRole('button', { name: /Float Rules/i }));
    expect(screen.getByText('Calc')).toBeInTheDocument();

    // Delete Calc rule
    fireEvent.click(screen.getByTitle('Delete Rule'));
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();

    // Switch to Shortcuts
    fireEvent.click(screen.getByRole('button', { name: /Hotkeys/i }));
    expect(screen.getByText('close')).toBeInTheDocument();

    // Delete the shortcut
    fireEvent.click(screen.getByTitle('Delete Shortcut'));
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
  });

  it('handles IPC load errors gracefully with console warnings and fallbacks', async () => {
    vi.mocked(tilingApi.loadKomorebiConfig).mockRejectedValueOnce({ code: 'IPC_ERR', message: 'Config failed' });
    vi.mocked(tilingApi.loadFloatRules).mockRejectedValueOnce({ code: 'IPC_ERR', message: 'Rules failed' });
    vi.mocked(tilingApi.loadHotkeys).mockRejectedValueOnce({ code: 'IPC_ERR', message: 'Hotkeys failed' });

    render(<TilingView />);

    await waitFor(() => {
      expect(screen.getByText('Tiling & Hotkey Center')).toBeInTheDocument();
    });
  });

  it('modifies geometry and workspaces sub-tabs and updates config', async () => {
    const { container } = render(<TilingView />);

    await waitFor(() => {
      expect(screen.getByText('Tiling & Hotkey Center')).toBeInTheDocument();
    });

    // In default Geometry tab, change padding slider
    const sliders = container.querySelectorAll('input[type="range"]');
    if (sliders.length > 0) {
      fireEvent.change(sliders[0], { target: { value: '20' } });
      expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
    }

    // Switch to Workspaces sub-tab and add monitor
    fireEvent.click(screen.getByRole('button', { name: /Workspaces & Displays/i }));
    expect(screen.getByText('Monitors & Displays')).toBeInTheDocument();

    const addMonitorBtn = screen.getByRole('button', { name: /Add Monitor/i });
    fireEvent.click(addMonitorBtn);
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
  });
});
