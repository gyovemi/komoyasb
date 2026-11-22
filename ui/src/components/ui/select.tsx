import * as React from 'react';
import { cn } from '../../lib/utils';
import { ChevronDown } from 'lucide-react';

/**
 * Key-value pair definition for select dropdown items.
 */
export interface SelectOption {
  /** Underlying technical value or key. */
  value: string;
  /** Human-readable display label. */
  label: string;
}

/**
 * Component properties for the `Select` dropdown picker.
 */
export interface SelectProps {
  /** Currently selected option value. */
  value: string;
  /** List of selectable dropdown options. */
  options: SelectOption[];
  /** Callback fired when a new selection is made. Receives string or event-compatible object. */
  onChange: (selectedValue: any) => void;
  /** Whether the select dropdown is disabled. */
  disabled?: boolean;
  /** Optional container class name overrides. */
  className?: string;
  /** Placeholder text shown when no valid value is selected. */
  placeholder?: string;
}

/**
 * Custom styled dropdown select element with chevron indicator.
 *
 * Provides a hybrid return value to support both direct value callbacks
 * and synthetic event consumers.
 *
 * @param props - Component properties and change handler.
 * @returns Rendered select dropdown control.
 */
export const Select: React.FC<SelectProps> = ({
  value,
  options,
  onChange,
  disabled = false,
  className,
  placeholder,
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const rawSelectedValue = event.target.value;
    onChange(rawSelectedValue);
  };

  return (
    <div className={cn('relative inline-block w-full', className)}>
      <select
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="w-full appearance-none rounded-md border border-border-inactive bg-background-secondary px-3 py-1.5 pr-8 text-sm text-foreground-primary shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
      >
        {placeholder && !value && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((optionItem) => (
          <option key={optionItem.value} value={optionItem.value} className="bg-background-secondary text-foreground-primary">
            {optionItem.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-foreground-muted" />
    </div>
  );
};
