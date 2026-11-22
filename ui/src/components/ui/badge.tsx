import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Visual presentation variants for status badges.
 */
export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';

/**
 * Component properties for the `Badge` status indicator.
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Color theme variant expressing status semantics.
   * Defaults to `'default'`.
   */
  variant?: BadgeVariant;
}

/**
 * Compact status badge component with semantic color tokens.
 *
 * Used throughout the shell to indicate service status, sandbox boundaries,
 * hotkey conflicts, and profile optimization tiers.
 *
 * @param props - HTML div attributes and badge styling variant.
 * @returns Rendered status badge element.
 */
export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'default',
  ...props
}) => {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2',
        {
          'border-transparent bg-accent text-slate-900': variant === 'default',
          'border-transparent bg-background-surface text-foreground-secondary': variant === 'secondary',
          'border-transparent bg-status-error/20 text-status-error border-status-error/30':
            variant === 'destructive',
          'border-transparent bg-status-success/20 text-status-success border-status-success/30':
            variant === 'success',
          'border-transparent bg-status-warning/20 text-status-warning border-status-warning/30':
            variant === 'warning',
          'border-border-inactive text-foreground-primary': variant === 'outline',
        },
        className
      )}
      {...props}
    />
  );
};
