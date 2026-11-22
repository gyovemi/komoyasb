import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Switch } from './switch';

describe('Switch', () => {
  it('renders switch with unchecked state and handles click', () => {
    const handleCheckedChange = vi.fn();
    const handleChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={handleCheckedChange} onChange={handleChange} id="test-switch" />);

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toBeInTheDocument();
    expect(switchBtn).toHaveAttribute('aria-checked', 'false');
    expect(switchBtn).toHaveAttribute('id', 'test-switch');

    fireEvent.click(switchBtn);
    expect(handleCheckedChange).toHaveBeenCalledWith(true);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('renders switch with checked state and toggles to false', () => {
    const handleCheckedChange = vi.fn();
    render(<Switch checked={true} onCheckedChange={handleCheckedChange} />);

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(switchBtn);
    expect(handleCheckedChange).toHaveBeenCalledWith(false);
  });

  it('does not trigger callbacks when disabled', () => {
    const handleCheckedChange = vi.fn();
    render(<Switch checked={false} disabled onCheckedChange={handleCheckedChange} />);

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toBeDisabled();
    fireEvent.click(switchBtn);
    expect(handleCheckedChange).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    render(<Switch checked={false} className="custom-switch" />);
    expect(screen.getByRole('switch')).toHaveClass('custom-switch');
  });
});
