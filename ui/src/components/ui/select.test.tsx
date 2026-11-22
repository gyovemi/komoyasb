import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from './select';

describe('Select', () => {
  const options = [
    { value: 'opt1', label: 'Option 1' },
    { value: 'opt2', label: 'Option 2' },
    { value: 'opt3', label: 'Option 3' },
  ];

  it('renders select with options and handles selection', () => {
    const handleChange = vi.fn();
    render(<Select value="opt1" options={options} onChange={handleChange} />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('opt1');

    fireEvent.change(select, { target: { value: 'opt2' } });
    expect(handleChange).toHaveBeenCalledWith('opt2');
  });

  it('renders placeholder when value is empty', () => {
    const handleChange = vi.fn();
    render(<Select value="" options={options} onChange={handleChange} placeholder="Select an option..." />);

    expect(screen.getByText('Select an option...')).toBeInTheDocument();
  });

  it('disables the select element when disabled prop is true', () => {
    const handleChange = vi.fn();
    render(<Select value="opt1" options={options} onChange={handleChange} disabled />);

    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('applies custom className', () => {
    const handleChange = vi.fn();
    const { container } = render(<Select value="opt1" options={options} onChange={handleChange} className="custom-select" />);

    expect(container.firstChild).toHaveClass('custom-select');
  });
});
