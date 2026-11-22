import * as React from 'react';
import type { ThemeColors } from '../../../types/ipc';
import { ColorPicker } from '../../ui/color-picker';

/**
 * Component properties for the `ColorTokensEditor` view.
 */
export interface ColorTokensEditorProps {
  /** Current set of 14 atomic hex color tokens. */
  colors: ThemeColors;
  /** Callback fired when any hex color token is updated. */
  onChange: (updatedColors: ThemeColors) => void;
}

/**
 * Metadata descriptor for each configurable color token.
 */
interface TokenMeta {
  /** Color token property key matching `ThemeColors`. */
  key: keyof ThemeColors;
  /** Human-readable display label. */
  label: string;
  /** Functional grouping category. */
  category: 'Backgrounds' | 'Text & Foregrounds' | 'Accents & Borders' | 'Status Indicators';
  /** Explanatory hint regarding token usage. */
  description: string;
}

const TOKEN_DEFINITIONS: TokenMeta[] = [
  // Backgrounds
  { key: 'bg_primary', label: 'Primary Background', category: 'Backgrounds', description: 'Base wallpaper/window surface' },
  { key: 'bg_secondary', label: 'Secondary Background', category: 'Backgrounds', description: 'Sidebar, cards, flyout base' },
  { key: 'bg_surface', label: 'Surface Background', category: 'Backgrounds', description: 'Input fields, elevated items' },

  // Foregrounds
  { key: 'fg_primary', label: 'Primary Text', category: 'Text & Foregrounds', description: 'Headings, active labels' },
  { key: 'fg_secondary', label: 'Secondary Text', category: 'Text & Foregrounds', description: 'Body text, secondary metadata' },
  { key: 'fg_muted', label: 'Muted Text', category: 'Text & Foregrounds', description: 'Placeholders, subtle hints' },

  // Accents & Borders
  { key: 'accent', label: 'Accent', category: 'Accents & Borders', description: 'Primary highlight color' },
  { key: 'accent_secondary', label: 'Secondary Accent', category: 'Accents & Borders', description: 'Complementary highlight' },
  { key: 'border_active', label: 'Active Border', category: 'Accents & Borders', description: 'Focused window / card border' },
  { key: 'border_inactive', label: 'Inactive Border', category: 'Accents & Borders', description: 'Unfocused frame border' },

  // Status
  { key: 'error', label: 'Error', category: 'Status Indicators', description: 'Failures, urgent badges' },
  { key: 'warning', label: 'Warning', category: 'Status Indicators', description: 'Attention, warnings' },
  { key: 'success', label: 'Success', category: 'Status Indicators', description: 'Confirmations, active services' },
  { key: 'info', label: 'Info', category: 'Status Indicators', description: 'Notices, telemetry markers' },
];

/**
 * Editor panel for the 14 atomic color tokens defined by the unified theme schema.
 *
 * Categorizes color swatches into backgrounds, typography, accents, and status tiers.
 *
 * @param props - Current color palette state and change handler.
 * @returns Color tokens editing grid.
 */
export const ColorTokensEditor: React.FC<ColorTokensEditorProps> = ({ colors, onChange }) => {
  const handleColorChange = (tokenKey: keyof ThemeColors, hexColorValue: string) => {
    onChange({
      ...colors,
      [tokenKey]: hexColorValue,
    });
  };

  const categories: Array<TokenMeta['category']> = [
    'Backgrounds',
    'Text & Foregrounds',
    'Accents & Borders',
    'Status Indicators',
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border-inactive/40 pb-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground-primary">Color Palette Tokens</h3>
          <p className="text-xs text-foreground-muted">
            14 atomic hexadecimal tokens strictly compiled across Komorebi, YASB, and Flow Launcher.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {categories.map((categoryGroup) => {
          const categoryTokens = TOKEN_DEFINITIONS.filter((tokenItem) => tokenItem.category === categoryGroup);
          return (
            <div key={categoryGroup} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-accent">
                {categoryGroup}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {categoryTokens.map((tokenDefinition) => (
                  <ColorPicker
                    key={tokenDefinition.key}
                    label={tokenDefinition.label}
                    description={tokenDefinition.description}
                    value={colors[tokenDefinition.key]}
                    onChange={(hexColorValue) => handleColorChange(tokenDefinition.key, hexColorValue)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
