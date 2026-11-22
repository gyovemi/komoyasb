import * as React from 'react';
import { cn, isValidHex } from '../../lib/utils';
import { Input } from './input';

/**
 * Component properties for the `ColorPicker` form field.
 */
export interface ColorPickerProps {
  /** Descriptive label positioned above or beside the color input. */
  label: string;
  /** Current hexadecimal color string (e.g. "#38bdf8"). */
  value: string;
  /** Callback invoked when a valid 6-digit hex color is chosen or typed. */
  onChange: (colorHex: string) => void;
  /** Optional hint or token description displayed next to the label. */
  description?: string;
  /** Optional container class name overrides. */
  className?: string;
}

/**
 * Integrated color picker control combining an HTML5 color swatch with a validated hex text field.
 *
 * Ensures color inputs remain strict uppercase 6-digit hex codes matching theme schemas.
 *
 * @param props - Component properties and change handler.
 * @returns Rendered color picker control.
 */
export const ColorPicker: React.FC<ColorPickerProps> = ({
  label,
  value,
  onChange,
  description,
  className,
}) => {
  const [hexInputText, setHexInputText] = React.useState(value);

  React.useEffect(() => {
    setHexInputText(value);
  }, [value]);

  const handleTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const candidateHex = event.target.value;
    setHexInputText(candidateHex);
    if (isValidHex(candidateHex)) {
      onChange(candidateHex);
    }
  };

  return (
    <div className={cn('flex flex-col gap-1.5 p-2 rounded-lg bg-background-surface/50 border border-border-inactive/40', className)}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-foreground-secondary">{label}</label>
        {description && <span className="text-[10px] text-foreground-muted">{description}</span>}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-8 h-8 rounded-md overflow-hidden border border-border-inactive shrink-0 shadow-inner">
          <input
            type="color"
            value={isValidHex(value) ? value : '#000000'}
            onChange={(event) => {
              const selectedColor = event.target.value;
              setHexInputText(selectedColor);
              onChange(selectedColor);
            }}
            className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer border-0 p-0"
          />
        </div>
        <Input
          type="text"
          value={hexInputText}
          onChange={handleTextChange}
          placeholder="#000000"
          maxLength={7}
          className="font-mono text-xs h-8 uppercase"
        />
      </div>
    </div>
  );
};
