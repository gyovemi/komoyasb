import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dialog } from './dialog';

describe('Dialog', () => {
  it('renders nothing when open is false', () => {
    const handleOpenChange = vi.fn();
    const { container } = render(
      <Dialog open={false} onOpenChange={handleOpenChange}>
        <p>Dialog Body</p>
      </Dialog>
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('Dialog Body')).not.toBeInTheDocument();
  });

  it('renders title, description, and children when open is true', () => {
    const handleOpenChange = vi.fn();
    render(
      <Dialog
        open={true}
        onOpenChange={handleOpenChange}
        title="Test Modal"
        description="Modal description text"
      >
        <p>Dialog Body</p>
      </Dialog>
    );

    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal description text')).toBeInTheDocument();
    expect(screen.getByText('Dialog Body')).toBeInTheDocument();
  });

  it('calls onOpenChange(false) when close button is clicked', () => {
    const handleOpenChange = vi.fn();
    render(
      <Dialog open={true} onOpenChange={handleOpenChange} title="Modal">
        <p>Content</p>
      </Dialog>
    );

    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange(false) when backdrop is clicked', () => {
    const handleOpenChange = vi.fn();
    const { container } = render(
      <Dialog open={true} onOpenChange={handleOpenChange}>
        <p>Content</p>
      </Dialog>
    );

    const backdrop = container.querySelector('.bg-black\\/60');
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });
});
