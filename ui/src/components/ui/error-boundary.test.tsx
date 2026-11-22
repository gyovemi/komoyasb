import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './error-boundary';

const ProblemChild: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('Explosion in ProblemChild!');
  }
  return <div>Normal Content</div>;
};

describe('ErrorBoundary Component', () => {
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary viewName="TestView">
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Normal Content')).toBeInTheDocument();
  });

  it('catches render error and displays fallback UI', () => {
    render(
      <ErrorBoundary viewName="ThemeStudio">
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('ThemeStudio Encountered an Error')).toBeInTheDocument();
    expect(screen.getByText('Explosion in ProblemChild!')).toBeInTheDocument();
    expect(screen.getByText('Retry View')).toBeInTheDocument();
  });

  it('invokes custom onError callback when exception is caught', () => {
    const onErrorMock = vi.fn();

    render(
      <ErrorBoundary viewName="CustomView" onError={onErrorMock}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(onErrorMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock.mock.calls[0][0].message).toBe('Explosion in ProblemChild!');
  });

  it('resets error state when Retry View button is clicked', () => {
    let shouldThrow = true;

    const TestParent: React.FC = () => {
      const [, setRerender] = React.useState(0);
      return (
        <div>
          <button onClick={() => { shouldThrow = false; setRerender((v) => v + 1); }}>
            Fix Error
          </button>
          <ErrorBoundary viewName="FlakyView">
            <ProblemChild shouldThrow={shouldThrow} />
          </ErrorBoundary>
        </div>
      );
    };

    render(<TestParent />);

    expect(screen.getByText('FlakyView Encountered an Error')).toBeInTheDocument();

    // Fix problem in state
    fireEvent.click(screen.getByText('Fix Error'));

    // Click retry
    fireEvent.click(screen.getByText('Retry View'));

    expect(screen.getByText('Normal Content')).toBeInTheDocument();
  });
});
