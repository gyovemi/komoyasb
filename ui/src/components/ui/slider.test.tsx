import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Slider } from './slider';

describe('Slider', () => {
  it('renders slider and handles numeric value change', () => {
    const handleChange = vi.fn();
    render(<Slider value={50} min={0} max={100} step={5} onChange={handleChange} />);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveValue('50');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '100');
    expect(slider).toHaveAttribute('step', '5');

    fireEvent.change(slider, { target: { value: '75' } });
    expect(handleChange).toHaveBeenCalledWith(75);
  });

  it('renders without error when onChange is not provided', () => {
    render(<Slider value={20} />);
    const slider = screen.getByRole('slider');
    expect(() => fireEvent.change(slider, { target: { value: '30' } })).not.toThrow();
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Slider ref={ref} value={10} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('applies custom className', () => {
    const { container } = render(<Slider value={10} className="custom-slider" />);
    expect(container.firstChild).toHaveClass('custom-slider');
  });
});
