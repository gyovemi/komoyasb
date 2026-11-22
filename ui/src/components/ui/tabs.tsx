import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Component properties for the root `Tabs` container.
 */
export interface TabsProps {
  /** Controlled active tab identifier. */
  value?: string;
  /** Initial tab identifier when uncontrolled. */
  defaultValue?: string;
  /** Callback fired when the active tab switches. */
  onValueChange?: (activeTabIdentifier: string) => void;
  /** Tab list triggers and tab content panes. */
  children: React.ReactNode;
  /** Container class name overrides. */
  className?: string;
}

/**
 * Top-level tabbed navigation coordinator.
 *
 * Propagates active tab selection state down to trigger buttons and content panels.
 *
 * @param props - Tab state values, change handlers, and children.
 * @returns Tab container layout.
 */
export const Tabs: React.FC<TabsProps> = ({ value, defaultValue, onValueChange, children, className }) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue || '');
  const activeValue = value !== undefined ? value : internalValue;

  const handleValueChange = (newSelectedValue: string) => {
    if (value === undefined) {
      setInternalValue(newSelectedValue);
    }
    onValueChange?.(newSelectedValue);
  };

  return (
    <div className={cn('w-full', className)} data-value={activeValue} data-tab-container>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, {
            // @ts-expect-error dynamic prop pass
            currentValue: activeValue,
            onValueChange: handleValueChange,
          });
        }
        return child;
      })}
    </div>
  );
};

/**
 * Component properties for the `TabsList` trigger bar.
 */
export interface TabsListProps {
  /** Tab trigger buttons. */
  children: React.ReactNode;
  /** Container class name overrides. */
  className?: string;
  /** Internal injected active tab value. */
  currentValue?: string;
  /** Internal injected tab switch callback. */
  onValueChange?: (tabIdentifier: string) => void;
}

/**
 * Horizontal container hosting individual tab trigger buttons.
 *
 * @param props - Trigger button children and inherited selection state.
 * @returns Rendered tab trigger bar.
 */
export const TabsList: React.FC<TabsListProps> = ({ children, className, currentValue, onValueChange }) => {
  return (
    <div
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-lg bg-background-surface p-1 text-foreground-muted',
        className
      )}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, {
            // @ts-expect-error dynamic prop pass
            currentValue,
            onValueChange,
          });
        }
        return child;
      })}
    </div>
  );
};

/**
 * Component properties for an individual `TabsTrigger` button.
 */
export interface TabsTriggerProps {
  /** Unique value identifying this tab pane. */
  value: string;
  /** Label or icon contents of the tab trigger. */
  children: React.ReactNode;
  /** Trigger button class overrides. */
  className?: string;
  /** Internal injected active tab value. */
  currentValue?: string;
  /** Internal injected tab switch callback. */
  onValueChange?: (tabIdentifier: string) => void;
}

/**
 * Interactive button that activates its associated tab content pane.
 *
 * @param props - Target tab value, children, and inherited selection state.
 * @returns Tab trigger button.
 */
export const TabsTrigger: React.FC<TabsTriggerProps> = ({ value, children, className, currentValue, onValueChange }) => {
  const isSelected = currentValue === value;
  return (
    <button
      type="button"
      onClick={() => onValueChange?.(value)}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
        isSelected
          ? 'bg-background-secondary text-foreground-primary shadow-sm'
          : 'hover:bg-background-secondary/50 hover:text-foreground-secondary text-foreground-muted',
        className
      )}
    >
      {children}
    </button>
  );
};

/**
 * Component properties for a `TabsContent` panel.
 */
export interface TabsContentProps {
  /** Value matching the trigger that exposes this content panel. */
  value: string;
  /** Content rendered when this tab is active. */
  children: React.ReactNode;
  /** Container class name overrides. */
  className?: string;
  /** Internal injected active tab value. */
  currentValue?: string;
}

/**
 * Content container rendered only when its corresponding tab trigger is active.
 *
 * @param props - Tab key value and children components.
 * @returns Rendered content pane or null if tab is inactive.
 */
export const TabsContent: React.FC<TabsContentProps> = ({ value, children, className, currentValue }) => {
  if (currentValue !== value) return null;
  return (
    <div
      className={cn('mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', className)}
    >
      {children}
    </div>
  );
};
