import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './button';

/**
 * Properties accepted by the React `ErrorBoundary` component.
 */
export interface ErrorBoundaryProps {
  /** Child component subtree protected by this error boundary. */
  children: React.ReactNode;
  /** Optional fallback UI or render function invoked on uncaught exceptions. */
  fallback?: React.ReactNode | ((props: { error: Error; resetErrorBoundary: () => void }) => React.ReactNode);
  /** Optional callback fired when an uncaught error is intercepted. */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Human-readable identifier for the bounded view or subsystem. */
  viewName?: string;
}

/**
 * Internal state for tracking intercepted errors in `ErrorBoundary`.
 */
export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Robust React Error Boundary component.
 *
 * Catches unhandled JavaScript exceptions in child view hierarchies, prevents
 * full-application blank screen crashes, displays an accessible recovery UI,
 * and provides state reset and view reload capabilities.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  public override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(`[ErrorBoundary] Uncaught exception in "${this.props.viewName || 'Application Root'}":`, error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  public resetErrorBoundary = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  public handleReload = (): void => {
    this.resetErrorBoundary();
  };

  public override render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback({
            error: this.state.error,
            resetErrorBoundary: this.resetErrorBoundary,
          });
        }
        return this.props.fallback;
      }

      const viewLabel = this.props.viewName || 'This View';

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center justify-center p-8 text-center min-h-[300px] h-full w-full bg-background-primary text-foreground-primary animate-in fade-in duration-200"
        >
          <div className="max-w-md w-full bg-background-secondary border border-border-inactive/60 rounded-xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-center">
              <div className="p-3 rounded-full bg-status-error/15 text-status-error border border-status-error/30">
                <AlertTriangle className="w-8 h-8" />
              </div>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-foreground-primary">
                {viewLabel} Encountered an Error
              </h3>
              <p className="text-xs text-foreground-muted leading-relaxed">
                An unexpected error occurred while rendering this component. The rest of the application remains operational.
              </p>
            </div>

            <div className="p-3 bg-black/40 border border-border-inactive/40 rounded-lg text-left overflow-x-auto">
              <p className="font-mono text-[11px] text-status-error break-words whitespace-pre-wrap">
                {this.state.error.message || String(this.state.error)}
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={this.handleReload}
                className="gap-2 cursor-pointer text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry View
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.location.reload()}
                className="text-xs cursor-pointer"
              >
                Reload Window
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
