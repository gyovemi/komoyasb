import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PresetCards, PRESET_CARDS } from './PresetCards';

describe('PresetCards Component', () => {
  it('renders all four performance presets', () => {
    const handleSelect = vi.fn();
    render(<PresetCards activeProfile="balanced" onSelectProfile={handleSelect} />);

    expect(screen.getByText('Ultra-Low')).toBeInTheDocument();
    expect(screen.getByText('Balanced')).toBeInTheDocument();
    expect(screen.getByText('Visual-Rich')).toBeInTheDocument();
    expect(screen.getByText('Gaming')).toBeInTheDocument();

    PRESET_CARDS.forEach((preset) => {
      expect(screen.getByText(preset.tagline)).toBeInTheDocument();
      expect(screen.getByText(`Target: ${preset.recommendedFor}`)).toBeInTheDocument();
    });
  });

  it('marks the active profile with an Active badge', () => {
    const handleSelect = vi.fn();
    render(<PresetCards activeProfile="ultra-low" onSelectProfile={handleSelect} />);

    const activeBadges = screen.getAllByText('Active');
    expect(activeBadges).toHaveLength(1);
  });

  it('triggers onSelectProfile when clicking an inactive preset card', () => {
    const handleSelect = vi.fn();
    render(<PresetCards activeProfile="balanced" onSelectProfile={handleSelect} />);

    const gamingTitle = screen.getByText('Gaming');
    fireEvent.click(gamingTitle);

    expect(handleSelect).toHaveBeenCalledWith('gaming');
  });

  it('triggers onSelectProfile when clicking the active preset card', () => {
    const handleSelect = vi.fn();
    render(<PresetCards activeProfile="balanced" onSelectProfile={handleSelect} />);

    const balancedTitle = screen.getByText('Balanced');
    fireEvent.click(balancedTitle);

    expect(handleSelect).toHaveBeenCalledWith('balanced');
  });

  it('does not trigger onSelectProfile when disabled is true', () => {
    const handleSelect = vi.fn();
    render(
      <PresetCards activeProfile="balanced" onSelectProfile={handleSelect} disabled={true} />
    );

    const gamingTitle = screen.getByText('Gaming');
    fireEvent.click(gamingTitle);

    expect(handleSelect).not.toHaveBeenCalled();
  });

  it('renders all hardware metrics for each tier', () => {
    render(<PresetCards activeProfile="gaming" onSelectProfile={vi.fn()} />);

    expect(screen.getByText('Esports, competitive 3D gaming, and VR workloads', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText('CPU Impact').length).toBe(4);
    expect(screen.getAllByText('DWM / GPU').length).toBe(4);
    expect(screen.getAllByText('Polling Rates').length).toBe(4);
    expect(screen.getAllByText('Animations').length).toBe(4);
  });
});
