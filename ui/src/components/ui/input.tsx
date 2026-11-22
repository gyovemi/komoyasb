import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Component properties for the `Input` text field.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Standard single-line text input field with Windows 11 Fluent focus styles.
 *
 * @param props - Native HTML input attributes and class overrides.
 * @returns Rendered input element.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-border-inactive bg-background-secondary px-3 py-1 text-sm text-foreground-primary shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
