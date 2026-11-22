import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WallpaperPicker } from './WallpaperPicker';
import type { ThemeWallpaper } from '../../../types/ipc';

const mockWallpaper: ThemeWallpaper = {
  path: 'C:\\Users\\test\\Pictures\\wallpaper.png',
  style: 'Fill',
};

describe('WallpaperPicker', () => {
  it('renders path input and fit selector', () => {
    const handleChange = vi.fn();
    render(<WallpaperPicker wallpaper={mockWallpaper} onChange={handleChange} />);

    expect(screen.getByText('Desktop Wallpaper')).toBeInTheDocument();
    expect(screen.getByDisplayValue('C:\\Users\\test\\Pictures\\wallpaper.png')).toBeInTheDocument();
    expect(screen.getByText('wallpaper.png')).toBeInTheDocument();
    expect(screen.getByText('Mode: Fill')).toBeInTheDocument();
  });

  it('calls onChange when wallpaper path is modified', () => {
    const handleChange = vi.fn();
    render(<WallpaperPicker wallpaper={mockWallpaper} onChange={handleChange} />);

    const input = screen.getByPlaceholderText(/wallpaper\.jpg/i);
    fireEvent.change(input, { target: { value: 'D:\\new_bg.jpg' } });

    expect(handleChange).toHaveBeenCalledWith({
      ...mockWallpaper,
      path: 'D:\\new_bg.jpg',
    });
  });

  it('calls onChange when fit style is changed', () => {
    const handleChange = vi.fn();
    render(<WallpaperPicker wallpaper={mockWallpaper} onChange={handleChange} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Fit' } });

    expect(handleChange).toHaveBeenCalled();
  });

  it('handles image load error gracefully', () => {
    const handleChange = vi.fn();
    render(<WallpaperPicker wallpaper={mockWallpaper} onChange={handleChange} />);

    const img = screen.getByAltText('Wallpaper preview');
    expect(img).toBeInTheDocument();

    fireEvent.error(img);
    expect(img).toHaveStyle({ display: 'none' });
  });

  it('renders empty wallpaper state when path is empty', () => {
    const handleChange = vi.fn();
    render(<WallpaperPicker wallpaper={{ path: '', style: 'Center' }} onChange={handleChange} />);

    expect(screen.getByText('No image specified')).toBeInTheDocument();
    expect(screen.queryByAltText('Wallpaper preview')).not.toBeInTheDocument();
  });
});
