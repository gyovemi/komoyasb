import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetConfigForm } from './WidgetConfigForm';
import type { YasbConfig } from '@/types/ipc';

const mockConfig: YasbConfig = {
  watch_stylesheet: true,
  watch_config: true,
  bars: {
    'main-bar': {
      enabled: true,
      screens: ['*'],
      class_name: 'bar',
      alignment: { position: 'top', center: false },
      blur_effect: { enabled: true, acrylic: false, dark: true, round_corners: true, round_corners_type: 'normal', border_color: '#000' },
      window_flags: { always_on_top: false, windows_app_bar: true },
      dimensions: { width: '100%', height: 32 },
      padding: { top: 0, left: 0, bottom: 0, right: 0 },
      widgets: { left: ['clock', 'komorebi_workspaces'], center: [], right: [] },
    },
  },
  widgets: {
    clock: {
      type: 'yasb.clock.ClockWidget',
      options: {
        label: '<span>󰥔</span> {%H:%M}',
        label_alt: '<span>󰃭</span> {%a, %b %d %Y}',
        calendar: { blur: true, round_corners: true },
      },
    },
    komorebi_workspaces: {
      type: 'komorebi.workspaces.WorkspaceWidget',
      options: {
        label_offline: 'Offline',
        label_zero_index: false,
        toggle_workspace_layer: { tiling_label: 'Tiling', floating_label: 'Floating' },
      },
    },
    traffic: {
      type: 'yasb.traffic.TrafficWidget',
      options: {
        speed_unit: 'bytes',
        hide_decimal: true,
      },
    },
  },
};

describe('WidgetConfigForm', () => {
  it('renders fallback notice when widget is not in config', () => {
    render(<WidgetConfigForm widgetName="non_existent" config={mockConfig} onChange={vi.fn()} />);
    expect(screen.getByText(/No configuration definition found for widget "non_existent"/i)).toBeInTheDocument();
  });

  it('renders clock widget fields and special calendar settings', () => {
    const handleChange = vi.fn();
    render(<WidgetConfigForm widgetName="clock" config={mockConfig} onChange={handleChange} />);

    expect(screen.getByText('clock')).toBeInTheDocument();
    expect(screen.getByText('Calendar Popup Settings')).toBeInTheDocument();

    const timeFormatInput = screen.getByDisplayValue('<span>󰥔</span> {%H:%M}');
    fireEvent.change(timeFormatInput, { target: { value: '{%H:%M:%S}' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        widgets: expect.objectContaining({
          clock: expect.objectContaining({
            options: expect.objectContaining({ label: '{%H:%M:%S}' }),
          }),
        }),
      })
    );

    // Toggle calendar switches
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);
    expect(handleChange).toHaveBeenCalled();
    fireEvent.click(switches[1]);
    expect(handleChange).toHaveBeenCalled();
  });

  it('renders komorebi_workspaces special layer settings', () => {
    const handleChange = vi.fn();
    render(<WidgetConfigForm widgetName="komorebi_workspaces" config={mockConfig} onChange={handleChange} />);

    expect(screen.getByText('Workspace Layer Indicator')).toBeInTheDocument();

    const tilingInput = screen.getByDisplayValue('Tiling');
    fireEvent.change(tilingInput, { target: { value: 'Tile Mode' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        widgets: expect.objectContaining({
          komorebi_workspaces: expect.objectContaining({
            options: expect.objectContaining({
              toggle_workspace_layer: expect.objectContaining({ tiling_label: 'Tile Mode' }),
            }),
          }),
        }),
      })
    );

    const floatingInput = screen.getByDisplayValue('Floating');
    fireEvent.change(floatingInput, { target: { value: 'Float Mode' } });
    expect(handleChange).toHaveBeenCalled();
  });

  it('renders traffic widget speed unit and decimals switch', () => {
    const handleChange = vi.fn();
    render(<WidgetConfigForm widgetName="traffic" config={mockConfig} onChange={handleChange} />);

    expect(screen.getByText('Hide Decimals')).toBeInTheDocument();
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'bits' } });

    expect(handleChange).toHaveBeenCalled();
  });

  it('toggles and edits raw JSON in advanced mode', () => {
    const handleChange = vi.fn();
    const { container } = render(<WidgetConfigForm widgetName="clock" config={mockConfig} onChange={handleChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Advanced Raw Options/i }));

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeInTheDocument();

    fireEvent.change(textarea!, { target: { value: JSON.stringify({ label: 'custom_time' }) } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        widgets: expect.objectContaining({
          clock: expect.objectContaining({
            options: { label: 'custom_time' },
          }),
        }),
      })
    );
  });
});
