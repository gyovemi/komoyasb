import * as React from 'react';
import type { ThemeGeometry, ThemeOpacity, ThemeTypography } from '../../../types/ipc';
import { Input } from '../../ui/input';
import { Slider } from '../../ui/slider';
import { Select } from '../../ui/select';

/**
 * Component properties for the `TypographyGeometry` editor panel.
 */
export interface TypographyGeometryProps {
  /** Active typography specifications. */
  typography: ThemeTypography;
  /** Active border, gap, and height dimensions. */
  geometry: ThemeGeometry;
  /** Surface and window opacity alpha levels. */
  opacity: ThemeOpacity;
  /** Callback fired when font family or sizes are altered. */
  onTypographyChange: (updatedTypography: ThemeTypography) => void;
  /** Callback fired when geometric layout metrics are altered. */
  onGeometryChange: (updatedGeometry: ThemeGeometry) => void;
  /** Callback fired when transparency alpha values are altered. */
  onOpacityChange: (updatedOpacity: ThemeOpacity) => void;
}

const FONT_PRESETS = [
  { value: 'Segoe UI Variable Text', label: 'Segoe UI Variable Text (Windows 11)' },
  { value: 'Cascadia Code', label: 'Cascadia Code' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono' },
  { value: 'Fira Code', label: 'Fira Code' },
  { value: 'Inter', label: 'Inter' },
];

/**
 * Visual controls for tuning desktop typography, container geometry, and layer opacities.
 *
 * Configures font scales, border widths, window gaps, status bar heights,
 * and alpha composition levels across Komorebi, YASB, and FluentFlyouts.
 *
 * @param props - Typography, geometry, and opacity states with corresponding change handlers.
 * @returns Typography, geometry, and opacity settings section.
 */
export const TypographyGeometry: React.FC<TypographyGeometryProps> = ({
  typography,
  geometry,
  opacity,
  onTypographyChange,
  onGeometryChange,
  onOpacityChange,
}) => {
  return (
    <div className="space-y-6">
      {/* Typography */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground-primary border-b border-border-inactive/40 pb-2">
          Typography
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground-secondary">Font Family</label>
            <Select
              value={typography.font_family}
              options={FONT_PRESETS}
              onChange={(selectedFont) => onTypographyChange({ ...typography, font_family: selectedFont })}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground-secondary">Small</label>
              <Input
                value={typography.font_size_sm}
                onChange={(event) =>
                  onTypographyChange({ ...typography, font_size_sm: event.target.value })
                }
                placeholder="10pt"
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground-secondary">Medium</label>
              <Input
                value={typography.font_size_md}
                onChange={(event) =>
                  onTypographyChange({ ...typography, font_size_md: event.target.value })
                }
                placeholder="11pt"
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground-secondary">Large</label>
              <Input
                value={typography.font_size_lg}
                onChange={(event) =>
                  onTypographyChange({ ...typography, font_size_lg: event.target.value })
                }
                placeholder="13pt"
                className="text-xs font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Geometry */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground-primary border-b border-border-inactive/40 pb-2">
          Window & Bar Geometry
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 rounded-lg bg-background-surface/40 border border-border-inactive/40 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-foreground-secondary">Border Width</span>
              <span className="font-mono text-accent">{geometry.border_width}px</span>
            </div>
            <Slider
              value={geometry.border_width}
              min={0}
              max={12}
              step={1}
              onChange={(numericWidth) => onGeometryChange({ ...geometry, border_width: Math.round(numericWidth) })}
            />
          </div>

          <div className="p-3 rounded-lg bg-background-surface/40 border border-border-inactive/40 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-foreground-secondary">Border Radius</span>
              <span className="font-mono text-accent">{geometry.border_radius}px</span>
            </div>
            <Slider
              value={geometry.border_radius}
              min={0}
              max={24}
              step={1}
              onChange={(numericRadius) => onGeometryChange({ ...geometry, border_radius: Math.round(numericRadius) })}
            />
          </div>

          <div className="p-3 rounded-lg bg-background-surface/40 border border-border-inactive/40 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-foreground-secondary">Window Gap</span>
              <span className="font-mono text-accent">{geometry.window_gap}px</span>
            </div>
            <Slider
              value={geometry.window_gap}
              min={0}
              max={32}
              step={1}
              onChange={(numericGap) => onGeometryChange({ ...geometry, window_gap: Math.round(numericGap) })}
            />
          </div>

          <div className="p-3 rounded-lg bg-background-surface/40 border border-border-inactive/40 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-foreground-secondary">Bar Height</span>
              <span className="font-mono text-accent">{geometry.bar_height}px</span>
            </div>
            <Slider
              value={geometry.bar_height}
              min={20}
              max={64}
              step={2}
              onChange={(numericHeight) => onGeometryChange({ ...geometry, bar_height: Math.round(numericHeight) })}
            />
          </div>
        </div>
      </div>

      {/* Opacity */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground-primary border-b border-border-inactive/40 pb-2">
          Surface Opacities & Blurs
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 rounded-lg bg-background-surface/40 border border-border-inactive/40 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-foreground-secondary">YASB Bar</span>
              <span className="font-mono text-accent">{Math.round(opacity.bar * 100)}%</span>
            </div>
            <Slider
              value={opacity.bar}
              min={0.1}
              max={1.0}
              step={0.05}
              onChange={(numericAlpha) => onOpacityChange({ ...opacity, bar: Number(numericAlpha.toFixed(2)) })}
            />
          </div>

          <div className="p-3 rounded-lg bg-background-surface/40 border border-border-inactive/40 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-foreground-secondary">Unfocused Window</span>
              <span className="font-mono text-accent">
                {Math.round(opacity.window_unfocused * 100)}%
              </span>
            </div>
            <Slider
              value={opacity.window_unfocused}
              min={0.2}
              max={1.0}
              step={0.05}
              onChange={(numericAlpha) =>
                onOpacityChange({ ...opacity, window_unfocused: Number(numericAlpha.toFixed(2)) })
              }
            />
          </div>

          <div className="p-3 rounded-lg bg-background-surface/40 border border-border-inactive/40 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-foreground-secondary">Fluent Flyout</span>
              <span className="font-mono text-accent">{Math.round(opacity.flyout * 100)}%</span>
            </div>
            <Slider
              value={opacity.flyout}
              min={0.2}
              max={1.0}
              step={0.05}
              onChange={(numericAlpha) => onOpacityChange({ ...opacity, flyout: Number(numericAlpha.toFixed(2)) })}
            />
          </div>

          <div className="p-3 rounded-lg bg-background-surface/40 border border-border-inactive/40 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-foreground-secondary">Flow Launcher</span>
              <span className="font-mono text-accent">{Math.round(opacity.launcher * 100)}%</span>
            </div>
            <Slider
              value={opacity.launcher}
              min={0.2}
              max={1.0}
              step={0.05}
              onChange={(numericAlpha) => onOpacityChange({ ...opacity, launcher: Number(numericAlpha.toFixed(2)) })}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
