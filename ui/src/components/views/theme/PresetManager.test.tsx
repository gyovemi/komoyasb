import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PresetManager } from './PresetManager';
import type { ThemeSummary, UnifiedTheme } from '../../../types/ipc';

const mockTheme: UnifiedTheme = {
  name: 'tokyo-night',
  variant: 'dark',
  colors: {} as any,
  typography: {} as any,
  geometry: {} as any,
  opacity: {} as any,
  wallpaper: {} as any,
};

const mockSummaries: ThemeSummary[] = [
  { name: 'tokyo-night', variant: 'dark', path: '/themes/tokyo-night.json', isActive: true },
  { name: 'nord-light', variant: 'light', path: '/themes/nord-light.json', isActive: false },
  { name: 'dracula', variant: 'dark', path: '/themes/dracula.json', isActive: false },
];

describe('PresetManager', () => {
  it('renders presets with variant icons and active/loaded badges', () => {
    const handleLoad = vi.fn();
    const handleSave = vi.fn();
    const handleActivate = vi.fn();

    render(
      <PresetManager
        currentTheme={mockTheme}
        themeSummaries={mockSummaries}
        onLoadTheme={handleLoad}
        onSaveTheme={handleSave}
        onActivateTheme={handleActivate}
      />
    );

    expect(screen.getByText('tokyo-night')).toBeInTheDocument();
    expect(screen.getByText('nord-light')).toBeInTheDocument();
    expect(screen.getByText('dracula')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('calls onSaveTheme when Save Changes is clicked', () => {
    const handleSave = vi.fn();
    render(
      <PresetManager
        currentTheme={mockTheme}
        themeSummaries={mockSummaries}
        onLoadTheme={vi.fn()}
        onSaveTheme={handleSave}
        onActivateTheme={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    expect(handleSave).toHaveBeenCalledWith(mockTheme);
  });

  it('calls onLoadTheme when Load into Editor is clicked', () => {
    const handleLoad = vi.fn();
    render(
      <PresetManager
        currentTheme={mockTheme}
        themeSummaries={mockSummaries}
        onLoadTheme={handleLoad}
        onSaveTheme={vi.fn()}
        onActivateTheme={vi.fn()}
      />
    );

    const loadButtons = screen.getAllByRole('button', { name: /Load into Editor/i });
    fireEvent.click(loadButtons[0]); // First non-selected theme is nord-light
    expect(handleLoad).toHaveBeenCalledWith('nord-light');
  });

  it('calls onActivateTheme when Set Active is clicked', () => {
    const handleActivate = vi.fn();
    render(
      <PresetManager
        currentTheme={mockTheme}
        themeSummaries={mockSummaries}
        onLoadTheme={vi.fn()}
        onSaveTheme={vi.fn()}
        onActivateTheme={handleActivate}
      />
    );

    const setActiveButtons = screen.getAllByRole('button', { name: /Set Active/i });
    fireEvent.click(setActiveButtons[0]);
    expect(handleActivate).toHaveBeenCalledWith('nord-light');
  });

  it('opens New Preset dialog and creates a new preset', () => {
    const handleSave = vi.fn();
    render(
      <PresetManager
        currentTheme={mockTheme}
        themeSummaries={mockSummaries}
        onLoadTheme={vi.fn()}
        onSaveTheme={handleSave}
        onActivateTheme={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /New Preset/i }));
    expect(screen.getByText('Create New Theme Preset')).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText(/e\.g\. nord-frost/i);
    fireEvent.change(nameInput, { target: { value: 'My Custom Theme' } });

    // Select light variant
    fireEvent.click(screen.getByRole('button', { name: /Light Variant/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Create Preset' }));

    expect(handleSave).toHaveBeenCalledWith({
      ...mockTheme,
      name: 'my-custom-theme',
      variant: 'light',
    });
  });

  it('closes New Preset dialog on Cancel', () => {
    render(
      <PresetManager
        currentTheme={mockTheme}
        themeSummaries={mockSummaries}
        onLoadTheme={vi.fn()}
        onSaveTheme={vi.fn()}
        onActivateTheme={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /New Preset/i }));
    expect(screen.getByText('Create New Theme Preset')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Create New Theme Preset')).not.toBeInTheDocument();
  });
});
