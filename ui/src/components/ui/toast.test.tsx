import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from './toast';

const TestComponent: React.FC<{
  type?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message?: string;
}> = ({ type, title = 'Title', message = 'Test message' }) => {
  const { toast } = useToast();
  return (
    <button onClick={() => toast({ type, title, message })}>
      Trigger Toast
    </button>
  );
};

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws error when useToast is used outside of ToastProvider', () => {
    // Suppress console.error during expected throw
    const originalError = console.error;
    console.error = vi.fn();
    expect(() => render(<TestComponent />)).toThrow('useToast must be used within a ToastProvider');
    console.error = originalError;
  });

  it('renders and displays toast on trigger', () => {
    render(
      <ToastProvider>
        <TestComponent type="success" title="Success Title" message="Success message body" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trigger Toast' }));
    expect(screen.getByText('Success Title')).toBeInTheDocument();
    expect(screen.getByText('Success message body')).toBeInTheDocument();
  });

  it('renders different types: error, warning, info, and default', () => {
    const MultiToast = () => {
      const { toast } = useToast();
      return (
        <div>
          <button onClick={() => toast({ type: 'error', message: 'err msg' })}>Err</button>
          <button onClick={() => toast({ type: 'warning', message: 'warn msg' })}>Warn</button>
          <button onClick={() => toast({ type: 'info', message: 'info msg' })}>Info</button>
          <button onClick={() => toast({ message: 'plain msg' })}>Plain</button>
        </div>
      );
    };

    render(
      <ToastProvider>
        <MultiToast />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Err'));
    fireEvent.click(screen.getByText('Warn'));
    fireEvent.click(screen.getByText('Info'));
    fireEvent.click(screen.getByText('Plain'));

    expect(screen.getByText('err msg')).toBeInTheDocument();
    expect(screen.getByText('warn msg')).toBeInTheDocument();
    expect(screen.getByText('info msg')).toBeInTheDocument();
    expect(screen.getByText('plain msg')).toBeInTheDocument();
  });

  it('dismisses toast when close button is clicked', () => {
    render(
      <ToastProvider>
        <TestComponent message="Dismissible toast" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trigger Toast' }));
    expect(screen.getByText('Dismissible toast')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(closeBtn);
    expect(screen.queryByText('Dismissible toast')).not.toBeInTheDocument();
  });

  it('auto-dismisses toast after 4000ms timer', () => {
    vi.useFakeTimers();

    render(
      <ToastProvider>
        <TestComponent message="Auto dismiss toast" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trigger Toast' }));
    expect(screen.getByText('Auto dismiss toast')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4100);
    });

    expect(screen.queryByText('Auto dismiss toast')).not.toBeInTheDocument();
  });
});
