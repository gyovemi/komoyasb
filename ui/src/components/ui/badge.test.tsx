import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, BadgeVariant } from './badge';

describe('Badge', () => {
  it('renders default badge with children', () => {
    render(<Badge>Default Badge</Badge>);
    const el = screen.getByText('Default Badge');
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass('bg-accent');
  });

  const variants: BadgeVariant[] = ['default', 'secondary', 'destructive', 'outline', 'success', 'warning'];

  variants.forEach((variant) => {
    it(`renders ${variant} variant correctly`, () => {
      render(<Badge variant={variant}>{variant}</Badge>);
      const el = screen.getByText(variant);
      expect(el).toBeInTheDocument();
    });
  });

  it('applies custom className', () => {
    render(<Badge className="custom-class">Custom</Badge>);
    expect(screen.getByText('Custom')).toHaveClass('custom-class');
  });
});
