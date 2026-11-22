import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeStudioView } from './ThemeStudioView';
import * as themeIndex from './index';
import type { UnifiedTheme, ThemeSummary } from '../../../types/ipc';

const mockTheme: UnifiedTheme = {
  name: 'catppuccin-mocha',
  variant: 'dark',
  colors: {
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
  },
  typography: {
    font_family: 'JetBrains Mono',
    font_size_sm: '10pt',
    font_size_md: '11pt',
    font_size_lg: '13pt',
  },
  geometry: {
    border_width: 2,
    border_radius: 8,
    window_gap: 6,
    bar_height: 32,
  },
  opacity: {
    bar: 0.9,
    window_unfocused: 0.8,
    flyout: 0.9,
    launcher: 0.95,
  },
  wallpaper: {
    path: 'C:\\wallpaper.png',
    style: 'Fill',
  },
};

const mockSummaries: ThemeSummary[] = [
  { name: 'catppuccin-mocha', variant: 'dark', path: '/themes/catppuccin.json', isActive: true },
];

describe('ThemeStudioView', () => {
  it('exports components via barrel file index', () => {
    expect(themeIndex.ThemeStudioView).toBeDefined();
    expect(themeIndex.ColorTokensEditor).toBeDefined();
  });

  it('renders header, theme metadata, and default colors tab', () => {
    render(
      <ThemeStudioView
        theme={mockTheme}
        themeSummaries={mockSummaries}
        onThemeChange={vi.fn()}
        onLoadTheme={vi.fn()}
        onSaveTheme={vi.fn()}
        onActivateTheme={vi.fn()}
      />
    );

    expect(screen.getByText('Theme Studio')).toBeInTheDocument();
    expect(screen.getByText(/catppuccin-mocha \(dark\)/i)).toBeInTheDocument();
    expect(screen.getByText('Color Palette Tokens')).toBeInTheDocument();
  });

  it('switches between sub-tabs and propagates changes', () => {
    const handleThemeChange = vi.fn();
    const handleLoadTheme = vi.fn();
    const handleSaveTheme = vi.fn();
    const handleActivateTheme = vi.fn();

    const { rerender } = render(
      <ThemeStudioView
        theme={mockTheme}
        themeSummaries={mockSummaries}
        onThemeChange={handleThemeChange}
        onLoadTheme={handleLoadTheme}
        onSaveTheme={handleSaveTheme}
        onActivateTheme={handleActivateTheme}
      />
    );

    // 1. In Colors tab, edit a color
    const hexInputs = screen.getAllByRole('textbox');
    fireEvent.change(hexInputs[0], { target: { value: '#ffffff' } });
    expect(handleThemeChange).toHaveBeenCalledWith(
      expect.objectContaining({
        colors: expect.objectContaining({ bg_primary: '#ffffff' }),
      })
    );

    // 2. Switch to Typography & Geometry
    fireEvent.click(screen.getByRole('button', { name: /Typography & Geometry/i }));
    expect(screen.getByText('Window & Bar Geometry')).toBeInTheDocument();

    // Change a slider or select in Typography/Geometry
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '4' } });
    expect(handleThemeChange).toHaveBeenCalled();

    const fontSelect = screen.getByRole('combobox');
    fireEvent.change(fontSelect, { target: { value: 'Segoe UI' } });
    expect(handleThemeChange).toHaveBeenCalled();

    fireEvent.change(sliders[sliders.length - 1], { target: { value: '0.9' } });
    expect(handleThemeChange).toHaveBeenCalled();

    // 3. Switch to Wallpaper
    fireEvent.click(screen.getByRole('button', { name: /Wallpaper/i }));
    expect(screen.getByText('Desktop Wallpaper')).toBeInTheDocument();

    const wallpaperInput = screen.getByPlaceholderText(/wallpaper\.jpg/i);
    fireEvent.change(wallpaperInput, { target: { value: 'C:\\new_wall.png' } });
    expect(handleThemeChange).toHaveBeenCalledWith(
      expect.objectContaining({
        wallpaper: expect.objectContaining({ path: 'C:\\new_wall.png' }),
      })
    );

    // 4. Switch to Presets
    fireEvent.click(screen.getByRole('button', { name: /Presets & Profiles/i }));
    expect(screen.getByText('Theme Presets')).toBeInTheDocument();
  });
});
