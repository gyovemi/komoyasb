import * as React from 'react';
import { cn } from '../../lib/utils';
import { X } from 'lucide-react';

/**
 * Component properties for the modal `Dialog` container.
 */
export interface DialogProps {
  /** Controls modal visibility. */
  open: boolean;
  /** Callback triggered when modal open state changes (e.g. backdrop click or close button). */
  onOpenChange: (isOpen: boolean) => void;
  /** Optional title rendered in the dialog header. */
  title?: React.ReactNode;
  /** Optional subtitle or descriptive text. */
  description?: React.ReactNode;
  /** Inner content and interactive elements. */
  children: React.ReactNode;
  /** Container class name overrides. */
  className?: string;
}

/**
 * Accessible modal dialog overlay with backdrop blur and responsive card layout.
 *
 * Used for detailed audit views, execution ledgers, and backup restoration prompts.
 *
 * @param props - Dialog visibility flags, content nodes, and close handlers.
 * @returns Modal dialog portal element or null when closed.
 */
export const Dialog: React.FC<DialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={() => onOpenChange(false)}
      />

      {/* Content modal */}
      <div
        className={cn(
          'relative z-50 w-full max-w-lg rounded-xl border border-border-inactive bg-background-primary p-6 shadow-2xl transition-all',
          className
        )}
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none cursor-pointer text-foreground-muted hover:text-foreground-primary"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        {title && <h2 className="text-lg font-semibold text-foreground-primary mb-1">{title}</h2>}
        {description && <p className="text-sm text-foreground-muted mb-4">{description}</p>}

        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
};
