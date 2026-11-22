import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from './input';

describe('Input', () => {
  it('renders input and responds to change events', () => {
    const handleChange = vi.fn();
    render(<Input placeholder="Enter text" onChange={handleChange} />);
    const input = screen.getByPlaceholderText('Enter text');
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'hello' } });
    expect(handleChange).toHaveBeenCalled();
  });

  it('renders with specific type and disabled attribute', () => {
    render(<Input type="password" disabled placeholder="Secret" />);
    const input = screen.getByPlaceholderText('Secret');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toBeDisabled();
  });

  it('forwards ref properly', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Input ref={ref} defaultValue="ref-value" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.value).toBe('ref-value');
  });

  it('applies custom className', () => {
    render(<Input className="custom-input" placeholder="Styled" />);
    expect(screen.getByPlaceholderText('Styled')).toHaveClass('custom-input');
  });
});
