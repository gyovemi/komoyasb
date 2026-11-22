import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModSourceViewer } from './ModSourceViewer';

describe('ModSourceViewer', () => {
  it('renders nothing when isOpen is false', () => {
    const handleClose = vi.fn();
    const { container } = render(
      <ModSourceViewer modId="taskbar-autohide" isOpen={false} onClose={handleClose} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders source code and filename when isOpen is true', () => {
    render(
      <ModSourceViewer modId="taskbar-autohide" isOpen={true} onClose={vi.fn()} />
    );

    expect(screen.getByText('taskbar-autohide.wh.cpp')).toBeInTheDocument();
    expect(screen.getByText(/Taskbar Auto-Hide & Work Area Enforcer/i)).toBeInTheDocument();
  });

  it('copies code to clipboard when Copy Source is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <ModSourceViewer modId="taskbar-autohide" isOpen={true} onClose={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Copy Source/i }));

    expect(writeTextMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });

  it('renders fallback when modId is unknown', () => {
    render(
      <ModSourceViewer modId="non-existent" isOpen={true} onClose={vi.fn()} />
    );

    expect(screen.getByText('Mod Source')).toBeInTheDocument();
    expect(screen.getByText(/No source available/i)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <ModSourceViewer modId="taskbar-autohide" isOpen={true} onClose={handleClose} />
    );

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalled();
  });
});
