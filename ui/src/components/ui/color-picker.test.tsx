import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColorPicker } from './color-picker';

describe('ColorPicker', () => {
  it('renders label, input, and initial hex value', () => {
    const handleChange = vi.fn();
    render(
      <ColorPicker
        label="Accent Color"
        value="#38bdf8"
        onChange={handleChange}
        description="Main theme accent"
      />
    );

    expect(screen.getByText('Accent Color')).toBeInTheDocument();
    expect(screen.getByText('Main theme accent')).toBeInTheDocument();
    const textInput = screen.getByPlaceholderText('#000000');
    expect(textInput).toHaveValue('#38bdf8');
  });

  it('updates when valid hex is typed in text input', () => {
    const handleChange = vi.fn();
    render(<ColorPicker label="Background" value="#1e1e2e" onChange={handleChange} />);
    const textInput = screen.getByPlaceholderText('#000000');

    fireEvent.change(textInput, { target: { value: '#ffffff' } });
    expect(handleChange).toHaveBeenCalledWith('#ffffff');
  });

  it('does not fire onChange when invalid hex is typed', () => {
    const handleChange = vi.fn();
    render(<ColorPicker label="Background" value="#1e1e2e" onChange={handleChange} />);
    const textInput = screen.getByPlaceholderText('#000000');

    fireEvent.change(textInput, { target: { value: '#invalid' } });
    expect(handleChange).not.toHaveBeenCalled();
    expect(textInput).toHaveValue('#invalid');
  });

  it('handles native color input change', () => {
    const handleChange = vi.fn();
    const { container } = render(<ColorPicker label="Border" value="#45475a" onChange={handleChange} />);
    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
    expect(colorInput).toBeInTheDocument();
    expect(colorInput.value).toBe('#45475a');

    fireEvent.change(colorInput, { target: { value: '#00ff00' } });
    expect(handleChange).toHaveBeenCalledWith('#00ff00');
  });

  it('falls back to #000000 for color input when value is not a valid hex', () => {
    const handleChange = vi.fn();
    const { container } = render(<ColorPicker label="Bad Value" value="invalid" onChange={handleChange} />);
    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
    expect(colorInput.value).toBe('#000000');
  });

  it('updates local state when value prop changes', () => {
    const handleChange = vi.fn();
    const { rerender } = render(<ColorPicker label="Dynamic" value="#111111" onChange={handleChange} />);
    const textInput = screen.getByPlaceholderText('#000000');
    expect(textInput).toHaveValue('#111111');

    rerender(<ColorPicker label="Dynamic" value="#222222" onChange={handleChange} />);
    expect(textInput).toHaveValue('#222222');
  });
});
