import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Component properties for the numeric `Slider` input.
 */
export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  /** Numeric value represented by the slider track. */
  value: number;
  /** Minimum range bound. Defaults to `0`. */
  min?: number;
  /** Maximum range bound. Defaults to `100`. */
  max?: number;
  /** Step increment interval. Defaults to `1`. */
  step?: number;
  /** Callback triggered when slider position changes. */
  onChange?: (numericValue: number) => void;
}

/**
 * Ergonomic range slider control for configuring opacity, intervals, and pixel dimensions.
 *
 * @param props - Slider range constraints, current value, and numeric change callback.
 * @returns Rendered slider input track.
 */
export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, min = 0, max = 100, step = 1, onChange, ...props }, ref) => {
    return (
      <div className={cn('relative flex w-full touch-none select-none items-center', className)}>
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange?.(parseFloat(event.target.value))}
          className="w-full h-1.5 bg-background-surface rounded-lg appearance-none cursor-pointer accent-accent focus:outline-none"
          {...props}
        />
      </div>
    );
  }
);
Slider.displayName = 'Slider';
