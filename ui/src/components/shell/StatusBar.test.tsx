import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusBar } from './StatusBar';

describe('StatusBar', () => {
  it('renders default state with Live System and All configs synced', () => {
    render(<StatusBar />);
    expect(screen.getByText('Live System')).toBeInTheDocument();
    expect(screen.getByText('All configs synced')).toBeInTheDocument();
  });

  it('renders Sandbox Mode Active when isSandboxed is true', () => {
    render(<StatusBar isSandboxed={true} />);
    expect(screen.getByText('Sandbox Mode Active')).toBeInTheDocument();
    expect(screen.queryByText('Live System')).not.toBeInTheDocument();
  });

  it('renders Unsaved Changes badge when isDirty is true', () => {
    render(<StatusBar isDirty={true} />);
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
    expect(screen.queryByText('All configs synced')).not.toBeInTheDocument();
  });

  it('renders last sync time when provided', () => {
    render(<StatusBar lastSyncTime="14:32:00" />);
    expect(screen.getByText(/Last sync: 14:32:00/i)).toBeInTheDocument();
  });

  it('handles Dry-Run Test click', () => {
    const handleApply = vi.fn();
    render(<StatusBar onApplyAndSync={handleApply} />);

    fireEvent.click(screen.getByRole('button', { name: /Dry-Run Test/i }));
    expect(handleApply).toHaveBeenCalledWith(true);
  });

  it('handles Apply & Sync Theme click', () => {
    const handleApply = vi.fn();
    render(<StatusBar onApplyAndSync={handleApply} />);

    fireEvent.click(screen.getByRole('button', { name: /Apply & Sync Theme/i }));
    expect(handleApply).toHaveBeenCalledWith(false);
  });

  it('disables buttons during isApplying', () => {
    const handleApply = vi.fn();
    render(<StatusBar isApplying={true} onApplyAndSync={handleApply} />);

    const dryRunBtn = screen.getByRole('button', { name: /Dry-Run Test/i });
    const applyBtn = screen.getByRole('button', { name: /Apply & Sync Theme/i });

    expect(dryRunBtn).toBeDisabled();
    expect(applyBtn).toBeDisabled();

    fireEvent.click(dryRunBtn);
    fireEvent.click(applyBtn);
    expect(handleApply).not.toHaveBeenCalled();
  });

  it('discards rapid double-clicks on Apply & Sync (BUG-08)', async () => {
    let resolveApply: (val: any) => void = () => {};
    const applyPromise = new Promise((resolve) => {
      resolveApply = resolve;
    });
    const handleApply = vi.fn().mockReturnValue(applyPromise);
    render(<StatusBar onApplyAndSync={handleApply} />);

    const applyBtn = screen.getByRole('button', { name: /Apply & Sync Theme/i });
    // Rapid double-clicks
    fireEvent.click(applyBtn);
    fireEvent.click(applyBtn);

    expect(handleApply).toHaveBeenCalledTimes(1);

    resolveApply(undefined);
  });
});
