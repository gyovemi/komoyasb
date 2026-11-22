import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Component properties for the boolean `Switch` toggle.
 */
export interface SwitchProps {
  /** Whether the switch toggle is in the active (on) state. */
  checked: boolean;
  /** Primary callback triggered when toggle state flips. */
  onCheckedChange?: (isChecked: boolean) => void;
  /** Secondary alias callback for compatibility. */
  onChange?: (isChecked: boolean) => void;
  /** Whether user interaction is disabled. */
  disabled?: boolean;
  /** Optional class name overrides. */
  className?: string;
  /** Optional HTML identifier. */
  id?: string;
}

/**
 * Windows 11 Fluent styled toggle switch component.
 *
 * Implements accessible `role="switch"` and `aria-checked` semantics.
 *
 * @param props - Switch checked state, change handlers, and disabled status.
 * @returns Rendered toggle switch button.
 */
export const Switch: React.FC<SwitchProps> = ({
  checked,
  onCheckedChange,
  onChange,
  disabled = false,
  className,
  id,
}) => {
  const handleClick = () => {
    const nextCheckedState = !checked;
    onCheckedChange?.(nextCheckedState);
    onChange?.(nextCheckedState);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-background-surface border-border-inactive',
        className
      )}
    >
      <span
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-foreground-primary shadow-lg ring-0 transition-transform',
          checked ? 'translate-x-4 bg-slate-900' : 'translate-x-0 bg-foreground-muted'
        )}
      />
    </button>
  );
};
