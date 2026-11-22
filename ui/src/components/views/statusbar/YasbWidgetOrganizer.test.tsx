import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { YasbWidgetOrganizer } from './YasbWidgetOrganizer';
import type { YasbConfig } from '@/types/ipc';

const mockYasbConfig: YasbConfig = {
  watch_stylesheet: true,
  watch_config: true,
  bars: {
    'main-bar': {
      enabled: true,
      screens: ['*'],
      class_name: 'yasb-bar',
      alignment: { position: 'top', center: false },
      blur_effect: {
        enabled: true,
        acrylic: false,
        dark: true,
        round_corners: true,
        round_corners_type: 'normal',
        border_color: '#292e42',
      },
      window_flags: { always_on_top: false, windows_app_bar: true },
      dimensions: { width: '100%', height: 32 },
      padding: { top: 0, left: 6, bottom: 0, right: 6 },
      widgets: {
        left: ['komorebi_workspaces', 'active_window'],
        center: ['media', 'clock'],
        right: ['cpu', 'volume'],
      },
    },
  },
  widgets: {
    komorebi_workspaces: { type: 'komorebi.workspaces.WorkspaceWidget', options: {} },
    active_window: { type: 'yasb.active_window.ActiveWindowWidget', options: {} },
    media: { type: 'yasb.media.MediaWidget', options: {} },
    clock: { type: 'yasb.clock.ClockWidget', options: {} },
    cpu: { type: 'yasb.cpu.CpuWidget', options: {} },
    volume: { type: 'yasb.volume.VolumeWidget', options: {} },
  },
};

describe('YasbWidgetOrganizer', () => {
  it('renders all three zones with assigned widgets', () => {
    const handleChange = vi.fn();
    render(<YasbWidgetOrganizer config={mockYasbConfig} onChange={handleChange} />);

    expect(screen.getByRole('heading', { name: /Left Zone/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Center Zone/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Right Zone/i })).toBeInTheDocument();

    expect(screen.getAllByText('Workspaces').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active Window').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Now Playing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Clock & Calendar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CPU Meter').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Volume & Audio').length).toBeGreaterThan(0);
  });

  it('toggles bar geometry & appearance settings', () => {
    const handleChange = vi.fn();
    render(<YasbWidgetOrganizer config={mockYasbConfig} onChange={handleChange} />);

    const toggleBtn = screen.getByRole('button', { name: /Bar Geometry & Blur/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByText('Main Bar Physical Geometry & Appearance')).toBeInTheDocument();
    expect(screen.getByText(/Bar Height: 32px/i)).toBeInTheDocument();

    // Adjust position
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'bottom' } });
    expect(handleChange).toHaveBeenCalled();

    // Adjust height slider
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '36' } });
    expect(handleChange).toHaveBeenCalled();

    // Adjust padding slider
    fireEvent.change(sliders[1], { target: { value: '12' } });
    expect(handleChange).toHaveBeenCalled();

    // Toggle blur switch
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);
    expect(handleChange).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Hide Bar Geometry/i }));
    expect(screen.queryByText('Main Bar Physical Geometry & Appearance')).not.toBeInTheDocument();
  });

  it('moves widget to a different zone', () => {
    const handleChange = vi.fn();
    render(<YasbWidgetOrganizer config={mockYasbConfig} onChange={handleChange} />);

    // In left zone, 'Workspaces' has quick move buttons 'C' and 'R'
    const moveButtons = screen.getAllByTitle('Move to center zone');
    fireEvent.click(moveButtons[0]);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        bars: expect.objectContaining({
          'main-bar': expect.objectContaining({
            widgets: expect.objectContaining({
              left: ['active_window'],
              center: ['media', 'clock', 'komorebi_workspaces'],
            }),
          }),
        }),
      })
    );
  });

  it('reorders widgets within a zone', () => {
    const handleChange = vi.fn();
    render(<YasbWidgetOrganizer config={mockYasbConfig} onChange={handleChange} />);

    // 'Workspaces' is at index 0, click move down (right chevron)
    const rightChevrons = screen.getAllByRole('button', { name: '' });
    // Find chevron buttons
    const svgs = document.querySelectorAll('svg.lucide-chevron-right');
    const firstDownBtn = svgs[0].closest('button');
    fireEvent.click(firstDownBtn!);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        bars: expect.objectContaining({
          'main-bar': expect.objectContaining({
            widgets: expect.objectContaining({
              left: ['active_window', 'komorebi_workspaces'],
            }),
          }),
        }),
      })
    );
  });

  it('removes a widget from a zone', () => {
    const handleChange = vi.fn();
    render(<YasbWidgetOrganizer config={mockYasbConfig} onChange={handleChange} />);

    const trashSvgs = document.querySelectorAll('svg.lucide-trash-2');
    const firstTrashBtn = trashSvgs[0].closest('button');
    fireEvent.click(firstTrashBtn!);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        bars: expect.objectContaining({
          'main-bar': expect.objectContaining({
            widgets: expect.objectContaining({
              left: ['active_window'],
            }),
          }),
        }),
      })
    );
  });

  it('adds a new widget to a zone', () => {
    const handleChange = vi.fn();
    render(<YasbWidgetOrganizer config={mockYasbConfig} onChange={handleChange} />);

    const comboboxes = screen.getAllByRole('combobox');
    // First combobox is "+ Add Widget" for Left Zone
    fireEvent.change(comboboxes[0], { target: { value: 'memory' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        bars: expect.objectContaining({
          'main-bar': expect.objectContaining({
            widgets: expect.objectContaining({
              left: ['komorebi_workspaces', 'active_window', 'memory'],
            }),
          }),
        }),
      })
    );
  });

  it('displays selected widget properties form', () => {
    render(<YasbWidgetOrganizer config={mockYasbConfig} onChange={vi.fn()} />);

    expect(screen.getByText(/Widget Properties:/i)).toBeInTheDocument();
    expect(screen.getAllByText('komorebi_workspaces').length).toBeGreaterThan(0);
  });

  it('toggles rounded bar corners and windows app bar mode', () => {
    const handleChange = vi.fn();
    render(<YasbWidgetOrganizer config={mockYasbConfig} onChange={handleChange} />);

    const switches = screen.getAllByRole('switch');
    // Switch 1: Rounded Bar Corners
    fireEvent.click(switches[1]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        bars: expect.objectContaining({
          'main-bar': expect.objectContaining({
            blur_effect: expect.objectContaining({ round_corners: true }),
          }),
        }),
      })
    );

    // Switch 2: Windows App Bar Mode
    fireEvent.click(switches[2]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        bars: expect.objectContaining({
          'main-bar': expect.objectContaining({
            window_flags: expect.objectContaining({ windows_app_bar: true }),
          }),
        }),
      })
    );
  });

  it('renders custom unknown widgets with fallback display', () => {
    const customConfig: YasbConfig = {
      ...mockYasbConfig,
      bars: {
        'main-bar': {
          ...mockYasbConfig.bars['main-bar'],
          widgets: { left: ['custom_widget_x'], center: [], right: [] },
        },
      },
    };
    render(<YasbWidgetOrganizer config={customConfig} onChange={vi.fn()} />);
    expect(screen.getByText('custom_widget_x')).toBeInTheDocument();
  });
});
