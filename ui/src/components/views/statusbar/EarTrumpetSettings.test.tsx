import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EarTrumpetSettings } from './EarTrumpetSettings';
import type { EarTrumpetConfig } from '@/types/ipc';

const mockEarTrumpetConfig: EarTrumpetConfig = {
  hasMigrated: true,
  showVolumePeakMeter: true,
  showPlaybackDevices: true,
  showRecordingDevices: false,
  showAppIcons: true,
  expandAll: false,
  theme: 'System',
  useAccentColor: true,
  isPromotedInTray: true,
};

describe('EarTrumpetSettings', () => {
  it('renders flyout features and shell integration sections', () => {
    render(<EarTrumpetSettings config={mockEarTrumpetConfig} onChange={vi.fn()} />);

    expect(screen.getByText('EarTrumpet Windows Audio Integration')).toBeInTheDocument();
    expect(screen.getByText('Audio Flyout Features')).toBeInTheDocument();
    expect(screen.getByText('Styling & Shell Integration')).toBeInTheDocument();
    expect(screen.getByText('Taskbar Promoted')).toBeInTheDocument();
  });

  it('renders overflow tray badge when not promoted', () => {
    render(<EarTrumpetSettings config={{ ...mockEarTrumpetConfig, isPromotedInTray: false }} onChange={vi.fn()} />);
    expect(screen.getByText('Overflow Tray')).toBeInTheDocument();
  });

  it('updates audio flyout switches', () => {
    const handleChange = vi.fn();
    render(<EarTrumpetSettings config={mockEarTrumpetConfig} onChange={handleChange} />);

    const switches = screen.getAllByRole('switch');
    // 0: showVolumePeakMeter (currently true)
    fireEvent.click(switches[0]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ showVolumePeakMeter: false })
    );

    // 1: showPlaybackDevices
    fireEvent.click(switches[1]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ showPlaybackDevices: false })
    );

    // 2: showRecordingDevices
    fireEvent.click(switches[2]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ showRecordingDevices: true })
    );

    // 3: showAppIcons
    fireEvent.click(switches[3]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ showAppIcons: false })
    );

    // 4: expandAll
    fireEvent.click(switches[4]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ expandAll: true })
    );

    // 5: useAccentColor
    fireEvent.click(switches[5]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ useAccentColor: false })
    );
  });

  it('updates theme mode dropdown', () => {
    const handleChange = vi.fn();
    render(<EarTrumpetSettings config={mockEarTrumpetConfig} onChange={handleChange} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Dark' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'Dark',
      })
    );
  });

  it('updates promotion in notification area', () => {
    const handleChange = vi.fn();
    render(<EarTrumpetSettings config={mockEarTrumpetConfig} onChange={handleChange} />);

    const switches = screen.getAllByRole('switch');
    // Last switch is isPromotedInTray
    fireEvent.click(switches[switches.length - 1]);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        isPromotedInTray: false,
      })
    );
  });
});
