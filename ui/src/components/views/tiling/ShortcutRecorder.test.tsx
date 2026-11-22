import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShortcutRecorder } from './ShortcutRecorder';
import type { HotkeyBinding } from '@/types/ipc';

const mockHotkeys: HotkeyBinding[] = [
  {
    id: 'hk-1',
    modifiers: ['alt'],
    key: 'h',
    command: 'komorebic focus left',
    category: 'navigation',
    rawComment: 'Focus Left',
  },
  {
    id: 'hk-2',
    modifiers: ['alt', 'shift'],
    key: 'enter',
    command: 'wt.exe',
    category: 'launcher',
    rawComment: 'Open Terminal',
  },
  {
    id: 'hk-conflict-1',
    modifiers: ['alt'],
    key: 'q',
    command: 'komorebic close',
    category: 'layout',
  },
  {
    id: 'hk-conflict-2',
    modifiers: ['alt'],
    key: 'q',
    command: 'taskkill /f /im test.exe',
    category: 'system',
  },
];

describe('ShortcutRecorder', () => {
  it('renders hotkey bindings list and detects duplicate conflict', () => {
    const handleChange = vi.fn();
    render(<ShortcutRecorder hotkeys={mockHotkeys} onChange={handleChange} />);

    expect(screen.getByText('Focus Left')).toBeInTheDocument();
    expect(screen.getByText('Open Terminal')).toBeInTheDocument();
    expect(screen.getByText(/Shortcut Conflicts Detected/i)).toBeInTheDocument();
  });

  it('filters hotkeys by search query', () => {
    const handleChange = vi.fn();
    render(<ShortcutRecorder hotkeys={mockHotkeys} onChange={handleChange} />);

    const searchInput = screen.getByPlaceholderText(/Search by combination/i);
    fireEvent.change(searchInput, { target: { value: 'focus left' } });

    expect(screen.getByText('Focus Left')).toBeInTheDocument();
    expect(screen.queryByText('Open Terminal')).not.toBeInTheDocument();
  });

  it('filters hotkeys by category', () => {
    const handleChange = vi.fn();
    render(<ShortcutRecorder hotkeys={mockHotkeys} onChange={handleChange} />);

    const comboboxes = screen.getAllByRole('combobox');
    fireEvent.change(comboboxes[0], { target: { value: 'launcher' } });

    expect(screen.getByText('Open Terminal')).toBeInTheDocument();
    expect(screen.queryByText('Focus Left')).not.toBeInTheDocument();
  });

  it('opens drawer, toggles modifiers, captures key, and adds new shortcut', () => {
    const handleChange = vi.fn();
    render(<ShortcutRecorder hotkeys={mockHotkeys} onChange={handleChange} />);

    fireEvent.click(screen.getByRole('button', { name: /New Shortcut/i }));
    expect(screen.getByText('Record New Hotkey Binding')).toBeInTheDocument();

    // Toggle CTRL modifier
    fireEvent.click(screen.getByRole('button', { name: 'CTRL' }));

    // Click Capture Key button
    const captureBtn = screen.getByRole('button', { name: 'Capture Key' });
    fireEvent.click(captureBtn);

    // Press a key (e.g. 'k')
    fireEvent.keyDown(captureBtn, { key: 'k', code: 'KeyK' });

    // Enter command
    const cmdInput = screen.getByPlaceholderText(/e\.g\. komorebic focus left/i);
    fireEvent.change(cmdInput, { target: { value: 'komorebic focus up' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'Add Shortcut' }));
    expect(handleChange).toHaveBeenCalledWith([
      expect.objectContaining({
        key: 'k',
        command: 'komorebic focus up',
      }),
      ...mockHotkeys,
    ]);
  });

  it('edits an existing shortcut', () => {
    const handleChange = vi.fn();
    render(<ShortcutRecorder hotkeys={mockHotkeys} onChange={handleChange} />);

    const editButtons = screen.getAllByTitle('Edit Shortcut');
    fireEvent.click(editButtons[0]);

    // Command input is now visible for editing
    const cmdInputs = screen.getAllByDisplayValue('komorebic focus left');
    fireEvent.change(cmdInputs[0], { target: { value: 'komorebic focus left-wrap' } });

    // Click key recording button in edit row
    const keyBtn = screen.getByRole('button', { name: 'H' });
    fireEvent.click(keyBtn);
    expect(screen.getByText('Press...')).toBeInTheDocument();

    // Send keydown
    fireEvent.keyDown(keyBtn, { key: 'l', code: 'KeyL' });
    expect(screen.getByRole('button', { name: 'L' })).toBeInTheDocument();

    // Edit raw comment
    const inputs = screen.getAllByRole('textbox');
    const commentInput = inputs.find((inp) => (inp as HTMLInputElement).value === 'Focus left window');
    if (commentInput) {
      fireEvent.change(commentInput, { target: { value: 'Focus left with wrap' } });
    }

    fireEvent.click(screen.getByTitle('Save'));
    expect(handleChange).toHaveBeenCalledWith([
      expect.objectContaining({
        command: 'komorebic focus left-wrap',
        key: 'l',
      }),
      mockHotkeys[1],
      mockHotkeys[2],
      mockHotkeys[3],
    ]);
  });

  it('cancels inline editing and adding', () => {
    const handleChange = vi.fn();
    render(<ShortcutRecorder hotkeys={mockHotkeys} onChange={handleChange} />);

    // Cancel Add
    fireEvent.click(screen.getByRole('button', { name: /New Shortcut/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Record New Hotkey Binding')).not.toBeInTheDocument();

    // Start inline edit and cancel
    const editButtons = screen.getAllByTitle('Edit Shortcut');
    fireEvent.click(editButtons[0]);

    // Click modifier button while editing
    const modBtn = screen.getByRole('button', { name: 'WIN' });
    fireEvent.click(modBtn);

    // Cancel edit
    fireEvent.click(screen.getByTitle('Cancel'));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('deletes a shortcut', () => {
    const handleChange = vi.fn();
    render(<ShortcutRecorder hotkeys={mockHotkeys} onChange={handleChange} />);

    const deleteButtons = screen.getAllByTitle('Delete Shortcut');
    fireEvent.click(deleteButtons[0]);

    expect(handleChange).toHaveBeenCalledWith([
      mockHotkeys[1],
      mockHotkeys[2],
      mockHotkeys[3],
    ]);
  });
});
