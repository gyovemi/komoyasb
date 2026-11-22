import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TypographyGeometry } from './TypographyGeometry';
import type { ThemeTypography, ThemeGeometry, ThemeOpacity } from '../../../types/ipc';

const mockTypography: ThemeTypography = {
  font_family: 'JetBrains Mono',
  font_size_sm: '10pt',
  font_size_md: '11pt',
  font_size_lg: '13pt',
};

const mockGeometry: ThemeGeometry = {
  border_width: 2,
  border_radius: 8,
  window_gap: 6,
  bar_height: 32,
};

const mockOpacity: ThemeOpacity = {
  bar: 0.85,
  window_unfocused: 0.75,
  flyout: 0.9,
  launcher: 0.95,
};

describe('TypographyGeometry', () => {
  it('renders all sections and initial values', () => {
    render(
      <TypographyGeometry
        typography={mockTypography}
        geometry={mockGeometry}
        opacity={mockOpacity}
        onTypographyChange={vi.fn()}
        onGeometryChange={vi.fn()}
        onOpacityChange={vi.fn()}
      />
    );

    expect(screen.getByText('Typography')).toBeInTheDocument();
    expect(screen.getByText('Window & Bar Geometry')).toBeInTheDocument();
    expect(screen.getByText('Surface Opacities & Blurs')).toBeInTheDocument();

    expect(screen.getByDisplayValue('10pt')).toBeInTheDocument();
    expect(screen.getByDisplayValue('11pt')).toBeInTheDocument();
    expect(screen.getByDisplayValue('13pt')).toBeInTheDocument();

    expect(screen.getByText('2px')).toBeInTheDocument();
    expect(screen.getByText('8px')).toBeInTheDocument();
    expect(screen.getByText('6px')).toBeInTheDocument();
    expect(screen.getByText('32px')).toBeInTheDocument();

    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('triggers onTypographyChange on font family and size edits', () => {
    const handleTypo = vi.fn();
    render(
      <TypographyGeometry
        typography={mockTypography}
        geometry={mockGeometry}
        opacity={mockOpacity}
        onTypographyChange={handleTypo}
        onGeometryChange={vi.fn()}
        onOpacityChange={vi.fn()}
      />
    );

    const fontSelect = screen.getByRole('combobox');
    fireEvent.change(fontSelect, { target: { value: 'Cascadia Code' } });
    expect(handleTypo).toHaveBeenCalled();

    const smInput = screen.getByDisplayValue('10pt');
    fireEvent.change(smInput, { target: { value: '9pt' } });
    expect(handleTypo).toHaveBeenCalledWith({
      ...mockTypography,
      font_size_sm: '9pt',
    });

    const mdInput = screen.getByDisplayValue('11pt');
    fireEvent.change(mdInput, { target: { value: '12pt' } });
    expect(handleTypo).toHaveBeenCalledWith({
      ...mockTypography,
      font_size_md: '12pt',
    });

    const lgInput = screen.getByDisplayValue('13pt');
    fireEvent.change(lgInput, { target: { value: '14pt' } });
    expect(handleTypo).toHaveBeenCalledWith({
      ...mockTypography,
      font_size_lg: '14pt',
    });
  });

  it('triggers onGeometryChange on slider adjustments', () => {
    const handleGeom = vi.fn();
    const { container } = render(
      <TypographyGeometry
        typography={mockTypography}
        geometry={mockGeometry}
        opacity={mockOpacity}
        onTypographyChange={vi.fn()}
        onGeometryChange={handleGeom}
        onOpacityChange={vi.fn()}
      />
    );

    const sliders = container.querySelectorAll('input[type="range"]');
    // First 4 sliders are geometry (border_width, border_radius, window_gap, bar_height)
    fireEvent.change(sliders[0], { target: { value: '4' } });
    expect(handleGeom).toHaveBeenCalledWith({
      ...mockGeometry,
      border_width: 4,
    });

    fireEvent.change(sliders[1], { target: { value: '12' } });
    expect(handleGeom).toHaveBeenCalledWith({
      ...mockGeometry,
      border_radius: 12,
    });

    fireEvent.change(sliders[2], { target: { value: '10' } });
    expect(handleGeom).toHaveBeenCalledWith({
      ...mockGeometry,
      window_gap: 10,
    });

    fireEvent.change(sliders[3], { target: { value: '40' } });
    expect(handleGeom).toHaveBeenCalledWith({
      ...mockGeometry,
      bar_height: 40,
    });
  });

  it('triggers onOpacityChange on opacity slider adjustments', () => {
    const handleOpacity = vi.fn();
    const { container } = render(
      <TypographyGeometry
        typography={mockTypography}
        geometry={mockGeometry}
        opacity={mockOpacity}
        onTypographyChange={vi.fn()}
        onGeometryChange={vi.fn()}
        onOpacityChange={handleOpacity}
      />
    );

    const sliders = container.querySelectorAll('input[type="range"]');
    // Sliders 4-7 are opacities: bar, window_unfocused, flyout, launcher
    fireEvent.change(sliders[4], { target: { value: '0.90' } });
    expect(handleOpacity).toHaveBeenCalledWith({
      ...mockOpacity,
      bar: 0.9,
    });

    fireEvent.change(sliders[5], { target: { value: '0.60' } });
    expect(handleOpacity).toHaveBeenCalledWith({
      ...mockOpacity,
      window_unfocused: 0.6,
    });

    fireEvent.change(sliders[6], { target: { value: '0.80' } });
    expect(handleOpacity).toHaveBeenCalledWith({
      ...mockOpacity,
      flyout: 0.8,
    });

    fireEvent.change(sliders[7], { target: { value: '0.70' } });
    expect(handleOpacity).toHaveBeenCalledWith({
      ...mockOpacity,
      launcher: 0.7,
    });
  });
});
