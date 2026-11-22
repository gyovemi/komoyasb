import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Titlebar } from './Titlebar';
import { getCurrentWindow } from '@tauri-apps/api/window';

describe('Titlebar', () => {
  const mockWindow = {
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(getCurrentWindow).mockReturnValue(mockWindow as unknown as ReturnType<typeof getCurrentWindow>);
    mockWindow.minimize.mockReset();
    mockWindow.toggleMaximize.mockReset();
    mockWindow.close.mockReset();
  });

  it('renders application branding', () => {
    render(<Titlebar />);
    expect(screen.getByText(/Komoyasb/i)).toBeInTheDocument();
    expect(screen.getByText(/control center/i)).toBeInTheDocument();
  });

  it('does not display sandbox badge when isSandboxed is false', () => {
    render(<Titlebar isSandboxed={false} />);
    expect(screen.queryByText(/Sandbox Active/i)).not.toBeInTheDocument();
  });

  it('displays sandbox badge and path when isSandboxed is true', () => {
    render(<Titlebar isSandboxed={true} sandboxPath="C:/sandbox/test" />);
    const badge = screen.getByText(/Sandbox Active/i);
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain('C:/sandbox/test');
  });

  it('displays sandbox badge without path if path is null', () => {
    render(<Titlebar isSandboxed={true} sandboxPath={null} />);
    expect(screen.getByText(/Sandbox Active/i)).toBeInTheDocument();
  });

  it('calls window controls on button clicks', async () => {
    render(<Titlebar />);

    const minBtn = screen.getByTitle('Minimize');
    const maxBtn = screen.getByTitle('Maximize');
    const closeBtn = screen.getByTitle('Close');

    fireEvent.click(minBtn);
    expect(mockWindow.minimize).toHaveBeenCalled();

    fireEvent.click(maxBtn);
    expect(mockWindow.toggleMaximize).toHaveBeenCalled();

    fireEvent.click(closeBtn);
    expect(mockWindow.close).toHaveBeenCalled();
  });

  it('handles window method exceptions gracefully', async () => {
    mockWindow.minimize.mockRejectedValueOnce(new Error('fail'));
    mockWindow.toggleMaximize.mockRejectedValueOnce(new Error('fail'));
    mockWindow.close.mockRejectedValueOnce(new Error('fail'));

    render(<Titlebar />);
    expect(() => fireEvent.click(screen.getByTitle('Minimize'))).not.toThrow();
    expect(() => fireEvent.click(screen.getByTitle('Maximize'))).not.toThrow();
    expect(() => fireEvent.click(screen.getByTitle('Close'))).not.toThrow();
  });

  it('displays Rootless Mode badge when isRootless is true', () => {
    render(<Titlebar isRootless={true} isSandboxed={false} />);
    expect(screen.getByText('Rootless Mode')).toBeInTheDocument();
  });

  it('displays Rootless Mode badge when isSandboxed is true even if isRootless is false', () => {
    render(<Titlebar isRootless={false} isSandboxed={true} />);
    expect(screen.getByText('Rootless Mode')).toBeInTheDocument();
  });

  it('does not display Rootless Mode badge when neither rootless nor sandboxed', () => {
    render(<Titlebar isRootless={false} isSandboxed={false} />);
    expect(screen.queryByText('Rootless Mode')).not.toBeInTheDocument();
  });
});
