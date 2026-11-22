import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KomorebiGeometryEditor } from './KomorebiGeometryEditor';
import type { KomorebiConfig } from '@/types/ipc';

const mockConfig: KomorebiConfig = {
  cross_monitor_move_behaviour: 'Insert',
  default_workspace_padding: 10,
  default_container_padding: 10,
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
  transparency: true,
  transparency_alpha: 0.85,
  window_hiding_behaviour: 'Cloak',
  workspaces_per_monitor: true,
  monitors: [],
};

describe('KomorebiGeometryEditor', () => {
  it('renders spacing, border, behavior, and transparency controls', () => {
    render(<KomorebiGeometryEditor config={mockConfig} onChange={vi.fn()} />);

    expect(screen.getByText('Window & Container Spacing')).toBeInTheDocument();
    expect(screen.getByText('Active Border Styling')).toBeInTheDocument();
    expect(screen.getByText('Window Behaviors & Integration')).toBeInTheDocument();
    expect(screen.getByText('Window Transparency')).toBeInTheDocument();

    expect(screen.getByText('Single Window')).toBeInTheDocument();
    expect(screen.getByText('Stack')).toBeInTheDocument();
    expect(screen.getByText('Monocle')).toBeInTheDocument();
    expect(screen.getByText('Unfocused')).toBeInTheDocument();
    expect(screen.getByText('Floating')).toBeInTheDocument();
  });

  it('updates padding sliders', () => {
    const handleChange = vi.fn();
    const { container } = render(<KomorebiGeometryEditor config={mockConfig} onChange={handleChange} />);

    const sliders = container.querySelectorAll('input[type="range"]');
    // First slider is workspace padding
    fireEvent.change(sliders[0], { target: { value: '16' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ default_workspace_padding: 16 })
    );

    // Second slider is container padding
    fireEvent.change(sliders[1], { target: { value: '12' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ default_container_padding: 12 })
    );
  });

  it('updates border settings, dimensions, style and colors', () => {
    const handleChange = vi.fn();
    const { container } = render(<KomorebiGeometryEditor config={mockConfig} onChange={handleChange} />);

    // Toggle border switch
    const switches = screen.getAllByRole('switch');
    // First switch is Enable Border
    fireEvent.click(switches[0]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ border: false })
    );

    // Border width and offset sliders
    const sliders = container.querySelectorAll('input[type="range"]');
    // slider 2 is border_width
    fireEvent.change(sliders[2], { target: { value: '4' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ border_width: 4 })
    );

    // slider 3 is border_offset
    fireEvent.change(sliders[3], { target: { value: '2' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ border_offset: 2 })
    );

    // Border style combobox
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'Square' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ border_style: 'Square' })
    );

    // Color picker hex input
    const hexInputs = screen.getAllByRole('textbox');
    fireEvent.change(hexInputs[0], { target: { value: '#112233' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        border_colours: expect.objectContaining({ single: '#112233' }),
      })
    );

    // Stack color picker
    fireEvent.change(hexInputs[1], { target: { value: '#223344' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        border_colours: expect.objectContaining({ stack: '#223344' }),
      })
    );

    // Monocle, unfocused, and floating color pickers
    if (hexInputs[2]) {
      fireEvent.change(hexInputs[2], { target: { value: '#334455' } });
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          border_colours: expect.objectContaining({ monocle: '#334455' }),
        })
      );
    }
    if (hexInputs[3]) {
      fireEvent.change(hexInputs[3], { target: { value: '#445566' } });
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          border_colours: expect.objectContaining({ unfocused: '#445566' }),
        })
      );
    }
    if (hexInputs[4]) {
      fireEvent.change(hexInputs[4], { target: { value: '#556677' } });
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          border_colours: expect.objectContaining({ floating: '#556677' }),
        })
      );
    }
  });

  it('updates behaviors like mouse_follows_focus and focus_follows_mouse', () => {
    const handleChange = vi.fn();
    render(<KomorebiGeometryEditor config={mockConfig} onChange={handleChange} />);

    // Mouse Follows Focus switch
    const switches = screen.getAllByRole('switch');
    // Second switch is Mouse Follows Focus
    fireEvent.click(switches[1]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ mouse_follows_focus: true })
    );

    const selects = screen.getAllByRole('combobox');
    // Cross monitor behavior select
    fireEvent.change(selects[1], { target: { value: 'Swap' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ cross_monitor_move_behaviour: 'Swap' })
    );

    // Window hiding behavior select
    fireEvent.change(selects[2], { target: { value: 'Minimize' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ window_hiding_behaviour: 'Minimize' })
    );

    // Focus follows mouse select
    fireEvent.change(selects[3], { target: { value: 'None' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ focus_follows_mouse: null })
    );
  });

  it('updates transparency alpha when enabled and toggles transparency', () => {
    const handleChange = vi.fn();
    const { container } = render(<KomorebiGeometryEditor config={mockConfig} onChange={handleChange} />);

    const sliders = container.querySelectorAll('input[type="range"]');
    // Last slider is transparency_alpha
    fireEvent.change(sliders[sliders.length - 1], { target: { value: '0.9' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ transparency_alpha: 0.9 })
    );

    // Toggle transparency switch
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[2]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ transparency: false })
    );
  });
});
