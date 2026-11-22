import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FlowLauncherConfig } from './FlowLauncherConfig';
import { modsApi } from '@/lib/ipc';

vi.mock('@/lib/ipc', () => ({
  modsApi: {
    loadFlowSettings: vi.fn(),
    saveFlowSettings: vi.fn(),
  },
}));

describe('FlowLauncherConfig', () => {
  const mockFlowSettings = {
    Hotkey: 'Alt + Space',
    Theme: 'KomoyasbFluent',
    SearchWindowEffect: 'Mica' as const,
    MaxResultsToShow: 8,
    Font: 'Segoe UI',
    BorderRadius: 8,
    Opacity: 0.95,
    UseWindowsAccentColor: false,
    CustomAccentColor: '#38bdf8',
  };

  beforeEach(() => {
    vi.mocked(modsApi.loadFlowSettings).mockResolvedValue(mockFlowSettings);
    vi.mocked(modsApi.saveFlowSettings).mockResolvedValue(undefined);
  });

  it('loads Flow settings on mount and renders controls', async () => {
    render(<FlowLauncherConfig />);

    await waitFor(() => {
      expect(screen.getByText('Flow Launcher Settings')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Alt + Space')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Segoe UI')).toBeInTheDocument();
      expect(screen.getByText('8px')).toBeInTheDocument();
      expect(screen.getByText('95%')).toBeInTheDocument();
    });
  });

  it('records a new hotkey combination', async () => {
    render(<FlowLauncherConfig />);

    await waitFor(() => {
      expect(screen.getByText('Flow Launcher Settings')).toBeInTheDocument();
    });

    const recordBtn = screen.getByRole('button', { name: 'Record' });
    fireEvent.click(recordBtn);

    const input = screen.getByPlaceholderText('Click Record...');
    fireEvent.keyDown(input, { key: 'k', code: 'KeyK', ctrlKey: true });

    expect(screen.getByDisplayValue('Ctrl + K')).toBeInTheDocument();
  });

  it('updates font preset by clicking candidate button', async () => {
    render(<FlowLauncherConfig />);

    await waitFor(() => {
      expect(screen.getByText('Flow Launcher Settings')).toBeInTheDocument();
    });

    const fontBtn = screen.getByRole('button', { name: 'JetBrainsMono Nerd Font' });
    fireEvent.click(fontBtn);

    expect(screen.getByDisplayValue('JetBrainsMono Nerd Font')).toBeInTheDocument();
  });

  it('updates sliders and select options', async () => {
    render(<FlowLauncherConfig />);

    await waitFor(() => {
      expect(screen.getByText('Flow Launcher Settings')).toBeInTheDocument();
    });

    const comboboxes = screen.getAllByRole('combobox');
    // First combobox is Theme Preset
    fireEvent.change(comboboxes[0], { target: { value: 'Dracula' } });

    // Second combobox is SearchWindowEffect
    fireEvent.change(comboboxes[1], { target: { value: 'Acrylic' } });

    expect(comboboxes[0]).toHaveValue('Dracula');
    expect(comboboxes[1]).toHaveValue('Acrylic');

    // Adjust sliders
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '12' } });
    fireEvent.change(sliders[1], { target: { value: '16' } });
    fireEvent.change(sliders[2], { target: { value: '80' } });

    // Toggle switch
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);

    // Type into Font input
    const fontInput = screen.getByPlaceholderText(/e\.g\. Segoe UI, Cascadia Code/i);
    fireEvent.change(fontInput, { target: { value: 'Fira Code' } });
    expect(fontInput).toHaveValue('Fira Code');
  });

  it('saves configuration successfully', async () => {
    render(<FlowLauncherConfig />);

    await waitFor(() => {
      expect(screen.getByText('Flow Launcher Settings')).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /Save Configuration/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(modsApi.saveFlowSettings).toHaveBeenCalled();
      expect(screen.getByText('Saved successfully')).toBeInTheDocument();
    });
  });

  it('handles save error gracefully', async () => {
    vi.mocked(modsApi.saveFlowSettings).mockRejectedValueOnce(new Error('Permission denied'));
    render(<FlowLauncherConfig />);

    await waitFor(() => {
      expect(screen.getByText('Flow Launcher Settings')).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /Save Configuration/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeInTheDocument();
    });
  });

  it('displays error and retry when load fails', async () => {
    vi.mocked(modsApi.loadFlowSettings).mockRejectedValueOnce(new Error('Settings not found'));

    render(<FlowLauncherConfig />);

    await waitFor(() => {
      expect(screen.getByText('Error Loading Settings')).toBeInTheDocument();
      expect(screen.getByText('Settings not found')).toBeInTheDocument();
    });

    vi.mocked(modsApi.loadFlowSettings).mockResolvedValueOnce(mockFlowSettings);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByText('Flow Launcher Settings')).toBeInTheDocument();
    });
  });
});
