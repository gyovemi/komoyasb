import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GranularControls } from './GranularControls';
import type { PerformanceProfile } from '@/types/ipc';

const mockProfile: PerformanceProfile = {
  komorebi: {
    animation_enabled: true,
    animation_duration_ms: 150,
    animation_fps: 60,
    border_enabled: true,
    border_width: 2,
    border_offset: 0,
    border_style: 'rounded',
    border_implementation: 'Komorebi',
    unmanaged_window_operation_behaviour: 'Op',
    transparency_enabled: false,
    window_hiding_behaviour: 'Cloak',
  },
  yasb: {
    blur_enabled: true,
    acrylic_enabled: false,
    round_corners: true,
    animation_duration_ms: 150,
    cpu_interval_ms: 2000,
    memory_interval_ms: 4000,
    traffic_interval_ms: 2000,
    media_interval_ms: 1000,
    clock_interval_ms: 1000,
    gpu_interval_ms: 5000,
  },
  dwm: {
    backdrop_type: 2,
    force_dark_mode: true,
    rounded_corners: 2,
    reduce_motion: false,
    taskbar_autohide_enabled: true,
  },
  launcher: {
    use_animation: true,
    animation_speed: 'Medium',
    search_window_effect: 'Mica',
    shadow_effect: true,
    max_results: 8,
    plugin_cache_max: 100,
  },
  flyout: {
    backdrop: 'Mica',
    animate_show: true,
    animate_hide: true,
    animation_duration_ms: 150,
    timeout_ms: 3000,
  },
  os: {
    background_eco_qos: false,
    komorebi_priority: 'Normal',
    yasb_priority: 'Normal',
    disable_windows_animations: false,
  },
};

describe('GranularControls Component', () => {
  it('renders all four section headers initially open', () => {
    render(<GranularControls profile={mockProfile} onChange={vi.fn()} />);

    expect(screen.getByText('Animations, Easing & Transition Framerates')).toBeInTheDocument();
    expect(screen.getByText('Visual Blurs, Acrylic Backdrops & DWM Composition')).toBeInTheDocument();
    expect(screen.getByText('YASB Widget Telemetry Polling Frequencies')).toBeInTheDocument();
    expect(screen.getByText('OS Process Scheduling, Priority & EcoQoS Throttling')).toBeInTheDocument();

    // Check presence of items inside open sections
    expect(screen.getByText('Komorebi Animations')).toBeInTheDocument();
    expect(screen.getByText('YASB Status Bar Blur')).toBeInTheDocument();
    expect(screen.getByText('CPU Sensor Polling')).toBeInTheDocument();
    expect(screen.getByText('Windows EcoQoS Mode')).toBeInTheDocument();
  });

  it('toggles section accordion on header click', () => {
    render(<GranularControls profile={mockProfile} onChange={vi.fn()} />);

    const animHeader = screen.getByText('Animations, Easing & Transition Framerates');
    fireEvent.click(animHeader);
    expect(screen.queryByText('Komorebi Animations')).not.toBeInTheDocument();
    fireEvent.click(animHeader);
    expect(screen.getByText('Komorebi Animations')).toBeInTheDocument();

    // Toggle blur section
    const blurHeader = screen.getByText('Visual Blurs, Acrylic Backdrops & DWM Composition');
    fireEvent.click(blurHeader);
    expect(screen.queryByText('YASB Status Bar Blur')).not.toBeInTheDocument();
    fireEvent.click(blurHeader);
    expect(screen.getByText('YASB Status Bar Blur')).toBeInTheDocument();

    // Toggle telemetry section
    const telemetryHeader = screen.getByText('YASB Widget Telemetry Polling Frequencies');
    fireEvent.click(telemetryHeader);
    expect(screen.queryByText('CPU Sensor Polling')).not.toBeInTheDocument();
    fireEvent.click(telemetryHeader);
    expect(screen.getByText('CPU Sensor Polling')).toBeInTheDocument();

    // Toggle os section
    const osHeader = screen.getByText('OS Process Scheduling, Priority & EcoQoS Throttling');
    fireEvent.click(osHeader);
    expect(screen.queryByText('Windows EcoQoS Mode')).not.toBeInTheDocument();
    fireEvent.click(osHeader);
    expect(screen.getByText('Windows EcoQoS Mode')).toBeInTheDocument();
  });

  it('updates Komorebi animation settings, duration and fps', () => {
    const handleChange = vi.fn();
    const { container } = render(<GranularControls profile={mockProfile} onChange={handleChange} />);

    // Toggle komorebi animation switch
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        komorebi: expect.objectContaining({
          animation_enabled: false,
        }),
      })
    );

    // Duration and FPS sliders
    const sliders = container.querySelectorAll('input[type="range"]');
    // First slider is Komorebi duration
    fireEvent.change(sliders[0], { target: { value: '200' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        komorebi: expect.objectContaining({
          animation_duration_ms: 200,
        }),
      })
    );

    // Second slider is Komorebi FPS
    fireEvent.change(sliders[1], { target: { value: '120' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        komorebi: expect.objectContaining({
          animation_fps: 120,
        }),
      })
    );
  });

  it('updates Launcher animation and speed settings', () => {
    const handleChange = vi.fn();
    render(<GranularControls profile={mockProfile} onChange={handleChange} />);

    // Toggle Flow Launcher animation switch
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[1]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        launcher: expect.objectContaining({
          use_animation: false,
        }),
      })
    );

    const speedSelect = screen.getByDisplayValue('Medium (Standard 150ms)');
    fireEvent.change(speedSelect, { target: { value: 'Fast' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        launcher: expect.objectContaining({
          animation_speed: 'Fast',
        }),
      })
    );
  });

  it('updates Flyout motion and duration', () => {
    const handleChange = vi.fn();
    const { container } = render(<GranularControls profile={mockProfile} onChange={handleChange} />);

    // Flyout switch
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[2]);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        flyout: expect.objectContaining({
          animate_show: false,
          animate_hide: false,
        }),
      })
    );

    // Flyout duration slider (slider 2)
    const sliders = container.querySelectorAll('input[type="range"]');
    fireEvent.change(sliders[2], { target: { value: '250' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        flyout: expect.objectContaining({
          animation_duration_ms: 250,
        }),
      })
    );
  });

  it('updates DWM backdrop type and blur settings', () => {
    const handleChange = vi.fn();
    render(<GranularControls profile={mockProfile} onChange={handleChange} />);

    const backdropSelect = screen.getByDisplayValue('Mica (Hardware Efficient)');
    fireEvent.change(backdropSelect, { target: { value: '3' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dwm: expect.objectContaining({
          backdrop_type: 3,
        }),
      })
    );

    // Blur switch and acrylic switch
    const switches = screen.getAllByRole('switch');
    // switch 3 is YASB blur
    fireEvent.click(switches[3]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        yasb: expect.objectContaining({ blur_enabled: false }),
      })
    );

    // switch 4 is acrylic
    fireEvent.click(switches[4]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        yasb: expect.objectContaining({ acrylic_enabled: true }),
      })
    );

    // switch 5 is taskbar autohide
    fireEvent.click(switches[5]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dwm: expect.objectContaining({ taskbar_autohide_enabled: false }),
      })
    );

    // switch 6 is reduce motion
    fireEvent.click(switches[6]);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dwm: expect.objectContaining({ reduce_motion: true }),
      })
    );
  });

  it('updates telemetry polling slider value', () => {
    const handleChange = vi.fn();
    render(<GranularControls profile={mockProfile} onChange={handleChange} />);

    const sliders = screen.getAllByRole('slider');
    // Find one of the polling sliders
    fireEvent.change(sliders[sliders.length - 1], { target: { value: '5000' } });

    expect(handleChange).toHaveBeenCalled();
  });

  it('updates OS process scheduling priorities and EcoQoS', () => {
    const handleChange = vi.fn();
    render(<GranularControls profile={mockProfile} onChange={handleChange} />);

    // EcoQoS switch
    const switches = screen.getAllByRole('switch');
    const ecoSwitch = switches[switches.length - 1];
    fireEvent.click(ecoSwitch);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        os: expect.objectContaining({
          background_eco_qos: true,
        }),
      })
    );

    // Komorebi priority select (first one with Normal (Standard scheduler))
    const prioritySelects = screen.getAllByDisplayValue('Normal (Standard scheduler)');
    fireEvent.change(prioritySelects[0], { target: { value: 'High' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        os: expect.objectContaining({
          komorebi_priority: 'High',
        }),
      })
    );

    // YASB priority select (second one)
    fireEvent.change(prioritySelects[1], { target: { value: 'Idle' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        os: expect.objectContaining({
          yasb_priority: 'Idle',
        }),
      })
    );
  });

  it('disables controls when disabled prop is true', () => {
    render(<GranularControls profile={mockProfile} onChange={vi.fn()} disabled={true} />);

    const switches = screen.getAllByRole('switch');
    switches.forEach((sw) => {
      expect(sw).toBeDisabled();
    });
  });
});
