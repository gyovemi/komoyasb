import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluentFlyoutEditor } from './FluentFlyoutEditor';
import type { FluentFlyoutConfig } from '@/types/ipc';

const mockFluentConfig: FluentFlyoutConfig = {
  General: {
    RunAtStartup: true,
    Language: 'en-US',
  },
  Placement: {
    Alignment: 'TopCenter',
    SafePaddingYASB: 36,
    OffsetY: 12,
    AvoidWorkAreaOverlap: true,
  },
  Appearance: {
    Theme: 'dark',
    Backdrop: 'MicaAlt',
    CornerRadius: 10,
    Opacity: 0.95,
  },
  Modules: {
    Volume: { Enabled: true, StepSize: 2 },
    Brightness: { Enabled: true, StepSize: 5 },
    Media: { Enabled: true },
    LockKeys: { Enabled: false },
  },
} as unknown as FluentFlyoutConfig;

describe('FluentFlyoutEditor', () => {
  it('renders all sections and current values', () => {
    render(<FluentFlyoutEditor config={mockFluentConfig} onChange={vi.fn()} />);

    expect(screen.getByText('FluentFlyouts Media & Volume OSD')).toBeInTheDocument();
    expect(screen.getByText('Screen Placement & YASB Collision')).toBeInTheDocument();
    expect(screen.getByText('Visual Appearance')).toBeInTheDocument();
    expect(screen.getByText('Active OSD Modules')).toBeInTheDocument();

    expect(screen.getByText('36px')).toBeInTheDocument();
    expect(screen.getByText('12px')).toBeInTheDocument();
    expect(screen.getByText('10px')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('updates placement alignment and sliders', () => {
    const handleChange = vi.fn();
    const { container } = render(<FluentFlyoutEditor config={mockFluentConfig} onChange={handleChange} />);

    const comboboxes = screen.getAllByRole('combobox');
    // First combobox is Placement Alignment
    fireEvent.change(comboboxes[0], { target: { value: 'TopRight' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        Placement: expect.objectContaining({ Alignment: 'TopRight' }),
      })
    );

    // Padding slider
    const sliders = container.querySelectorAll('input[type="range"]');
    fireEvent.change(sliders[0], { target: { value: '40' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        Placement: expect.objectContaining({ SafePaddingYASB: 40 }),
      })
    );

    // Offset slider
    fireEvent.change(sliders[1], { target: { value: '16' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        Placement: expect.objectContaining({ OffsetY: 16 }),
      })
    );

    // Avoid collision switch
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        Placement: expect.objectContaining({ AvoidWorkAreaOverlap: false }),
      })
    );
  });

  it('updates appearance options', () => {
    const handleChange = vi.fn();
    const { container } = render(<FluentFlyoutEditor config={mockFluentConfig} onChange={handleChange} />);

    const comboboxes = screen.getAllByRole('combobox');
    // Second combobox is Appearance Theme, Third is Backdrop
    fireEvent.change(comboboxes[1], { target: { value: 'light' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        Appearance: expect.objectContaining({ Theme: 'light' }),
      })
    );

    fireEvent.change(comboboxes[2], { target: { value: 'Acrylic' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        Appearance: expect.objectContaining({ Backdrop: 'Acrylic' }),
      })
    );

    // Corner radius slider and opacity slider
    const sliders = container.querySelectorAll('input[type="range"]');
    fireEvent.change(sliders[2], { target: { value: '14' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        Appearance: expect.objectContaining({ CornerRadius: 14 }),
      })
    );

    fireEvent.change(sliders[3], { target: { value: '0.85' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        Appearance: expect.objectContaining({ Opacity: 0.85 }),
      })
    );
  });

  it('toggles module switches and adjusts step sizes', () => {
    const handleChange = vi.fn();
    const { container } = render(<FluentFlyoutEditor config={mockFluentConfig} onChange={handleChange} />);

    const switches = screen.getAllByRole('switch');
    // Switch 1 is Volume, Switch 2 is Brightness, Switch 3 is Media, Switch 4 is LockKeys
    fireEvent.click(switches[1]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        Modules: expect.objectContaining({
          Volume: expect.objectContaining({ Enabled: false }),
        }),
      })
    );

    fireEvent.click(switches[2]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        Modules: expect.objectContaining({
          Brightness: expect.objectContaining({ Enabled: false }),
        }),
      })
    );

    fireEvent.click(switches[3]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        Modules: expect.objectContaining({
          Media: expect.objectContaining({ Enabled: false }),
        }),
      })
    );

    fireEvent.click(switches[4]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        Modules: expect.objectContaining({
          LockKeys: expect.objectContaining({ Enabled: true }),
        }),
      })
    );

    // Sliders for step sizes (Volume StepSize is slider 4, Brightness is slider 5)
    const sliders = container.querySelectorAll('input[type="range"]');
    if (sliders.length >= 6) {
      fireEvent.change(sliders[4], { target: { value: '4' } });
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          Modules: expect.objectContaining({
            Volume: expect.objectContaining({ StepSize: 4 }),
          }),
        })
      );

      fireEvent.change(sliders[5], { target: { value: '8' } });
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          Modules: expect.objectContaining({
            Brightness: expect.objectContaining({ StepSize: 8 }),
          }),
        })
      );
    }
  });
});
