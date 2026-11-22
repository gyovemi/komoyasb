import * as React from 'react';
import { cn } from '../../lib/utils';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

/**
 * Toast notification payload structure.
 */
export interface ToastMessage {
  /** Unique random identifier assigned to this toast notification. */
  id: string;
  /** Visual severity and semantic category. */
  type?: 'success' | 'error' | 'info' | 'warning';
  /** Optional headline text for the notification. */
  title?: string;
  /** Detailed notification message body. */
  message: string;
}

/**
 * React context value exposing the application-wide toast notification dispatcher.
 */
export interface ToastContextType {
  /**
   * Enqueues a temporary toast notification message on screen.
   *
   * @param notificationMessage - Toast parameters excluding auto-generated id.
   */
  toast: (notificationMessage: Omit<ToastMessage, 'id'>) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

/**
 * Global provider component hosting the toast notification stacking portal.
 *
 * Automatically manages notification timeouts (4000ms dismiss) and smooth dismissal.
 *
 * @param props - React children wrapped by the notification provider.
 * @returns Toast provider context and floating viewport portal.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const toast = React.useCallback((notificationMessage: Omit<ToastMessage, 'id'>) => {
    const notificationId = Math.random().toString(36).substring(2, 9);
    const newToast: ToastMessage = { ...notificationMessage, id: notificationId };
    setToasts((previousToasts) => [...previousToasts, newToast]);

    setTimeout(() => {
      setToasts((activeToasts) => activeToasts.filter((item) => item.id !== notificationId));
    }, 4000);
  }, []);

  const removeToast = (targetNotificationId: string) => {
    setToasts((activeToasts) => activeToasts.filter((item) => item.id !== targetNotificationId));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-12 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((activeToast) => (
          <div
            key={activeToast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 p-3 rounded-lg shadow-xl border backdrop-blur-md transition-all',
              {
                'bg-background-secondary/95 border-status-success/40 text-foreground-primary':
                  activeToast.type === 'success',
                'bg-background-secondary/95 border-status-error/40 text-foreground-primary':
                  activeToast.type === 'error',
                'bg-background-secondary/95 border-status-warning/40 text-foreground-primary':
                  activeToast.type === 'warning',
                'bg-background-secondary/95 border-status-info/40 text-foreground-primary':
                  activeToast.type === 'info' || !activeToast.type,
              }
            )}
          >
            {activeToast.type === 'success' && <CheckCircle className="h-5 w-5 text-status-success shrink-0" />}
            {activeToast.type === 'error' && <AlertCircle className="h-5 w-5 text-status-error shrink-0" />}
            {activeToast.type === 'warning' && <AlertTriangle className="h-5 w-5 text-status-warning shrink-0" />}
            {(!activeToast.type || activeToast.type === 'info') && <Info className="h-5 w-5 text-status-info shrink-0" />}

            <div className="flex-1">
              {activeToast.title && <h4 className="text-sm font-semibold mb-0.5">{activeToast.title}</h4>}
              <p className="text-xs text-foreground-secondary">{activeToast.message}</p>
            </div>

            <button
              onClick={() => removeToast(activeToast.id)}
              className="text-foreground-muted hover:text-foreground-primary cursor-pointer p-0.5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

/**
 * Custom hook to dispatch transient alert toasts across the application.
 *
 * @returns Toast context object containing the `toast()` dispatcher method.
 * @throws {Error} If called outside of an enclosing `ToastProvider`.
 */
export const useToast = (): ToastContextType => {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
