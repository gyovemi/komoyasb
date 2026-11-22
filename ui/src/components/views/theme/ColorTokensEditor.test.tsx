import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColorTokensEditor } from './ColorTokensEditor';
import type { ThemeColors } from '../../../types/ipc';

const mockColors: ThemeColors = {
  bg_primary: '#1e1e2e',
  bg_secondary: '#181825',
  bg_surface: '#313244',
  fg_primary: '#cdd6f4',
  fg_secondary: '#a6adc8',
  fg_muted: '#6c7086',
  accent: '#89b4fa',
  accent_secondary: '#f5c2e7',
  border_active: '#b4befe',
  border_inactive: '#45475a',
  error: '#f38ba8',
  warning: '#f9e2af',
  success: '#a6e3a1',
  info: '#89dceb',
};

describe('ColorTokensEditor', () => {
  it('renders all 14 color token inputs across categories', () => {
    const handleChange = vi.fn();
    render(<ColorTokensEditor colors={mockColors} onChange={handleChange} />);

    expect(screen.getByText('Backgrounds')).toBeInTheDocument();
    expect(screen.getByText('Text & Foregrounds')).toBeInTheDocument();
    expect(screen.getByText('Accents & Borders')).toBeInTheDocument();
    expect(screen.getByText('Status Indicators')).toBeInTheDocument();

    const expectedLabels = [
      'Primary Background',
      'Secondary Background',
      'Surface Background',
      'Primary Text',
      'Secondary Text',
      'Muted Text',
      'Accent',
      'Secondary Accent',
      'Active Border',
      'Inactive Border',
      'Error',
      'Warning',
      'Success',
      'Info',
    ];

    expectedLabels.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('calls onChange with updated colors when a token changes', () => {
    const handleChange = vi.fn();
    const { container } = render(<ColorTokensEditor colors={mockColors} onChange={handleChange} />);

    const inputs = container.querySelectorAll('input[type="text"]');
    // First input is Primary Background (bg_primary)
    fireEvent.change(inputs[0], { target: { value: '#000000' } });

    expect(handleChange).toHaveBeenCalledWith({
      ...mockColors,
      bg_primary: '#000000',
    });
  });
});
