import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Visual styling variants for interactive action buttons.
 */
export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';

/**
 * Size scale options for button padding and typography.
 */
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

/**
 * Component properties for the `Button` element.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual emphasis variant. Defaults to `'default'`. */
  variant?: ButtonVariant;
  /** Size dimension preset. Defaults to `'default'`. */
  size?: ButtonSize;
}

/**
 * Reusable interactive button component with Windows 11 fluent styling.
 *
 * Supports accessible keyboard focus rings, disabled states, and size scales.
 *
 * @param props - Native button attributes, styling variant, and size preset.
 * @returns Rendered button element.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
          {
            'bg-accent text-slate-900 shadow hover:bg-accent/90': variant === 'default',
            'bg-status-error text-white shadow-sm hover:bg-status-error/90': variant === 'destructive',
            'border border-border-inactive bg-transparent hover:bg-background-secondary text-foreground-primary':
              variant === 'outline',
            'bg-background-surface text-foreground-primary shadow-sm hover:bg-background-secondary':
              variant === 'secondary',
            'hover:bg-background-surface hover:text-foreground-primary text-foreground-secondary':
              variant === 'ghost',
            'text-accent underline-offset-4 hover:underline': variant === 'link',
            'h-9 px-4 py-2': size === 'default',
            'h-8 rounded-md px-3 text-xs': size === 'sm',
            'h-10 rounded-md px-8': size === 'lg',
            'h-9 w-9': size === 'icon',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
