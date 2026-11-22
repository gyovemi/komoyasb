import * as React from 'react';
import type { KomorebiConfig, KomorebiBorderColours } from '@/types/ipc';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select } from '@/components/ui/select';
import { ColorPicker } from '@/components/ui/color-picker';

export interface KomorebiGeometryEditorProps {
  config: KomorebiConfig;
  onChange: (updated: KomorebiConfig) => void;
}

const BORDER_STYLE_OPTIONS = [
  { value: 'Rounded', label: 'Rounded' },
  { value: 'Square', label: 'Square' },
];

const CROSS_MONITOR_OPTIONS = [
  { value: 'Insert', label: 'Insert (default)' },
  { value: 'Swap', label: 'Swap' },
];

const FOCUS_FOLLOWS_MOUSE_OPTIONS = [
  { value: 'None', label: 'Disabled (None)' },
  { value: 'Komorebi', label: 'Komorebi Native' },
  { value: 'Windows', label: 'Windows System' },
];

const WINDOW_HIDING_OPTIONS = [
  { value: 'Cloak', label: 'Cloak (Recommended Windows 11)' },
  { value: 'Minimize', label: 'Minimize' },
  { value: 'Hide', label: 'Hide (Legacy)' },
];

/**
 * Visual geometry and window behavior editor for Komorebi tiling window manager (`komorebi.json`).
 *
 * Configures outer workspace padding, inter-container padding, border outline dimensions,
 * border colors across window states, mouse focus policies, and Windows 11 cloaking behaviors.
 *
 * @param props - Current Komorebi configuration and change handler.
 * @returns Komorebi geometry settings panel.
 */
export const KomorebiGeometryEditor: React.FC<KomorebiGeometryEditorProps> = ({
  config,
  onChange,
}) => {
  const updateField = <K extends keyof KomorebiConfig>(field: K, updatedValue: KomorebiConfig[K]) => {
    onChange({
      ...config,
      [field]: updatedValue,
    });
  };

  const updateBorderColour = (colorKey: keyof KomorebiBorderColours, hexColor: string) => {
    const existingColours = config.border_colours || {
      single: '#7aa2f7',
      stack: '#bb9af7',
      monocle: '#7aa2f7',
      unfocused: '#292e42',
      floating: '#bb9af7',
    };
    onChange({
      ...config,
      border_colours: {
        ...existingColours,
        [colorKey]: hexColor,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Geometry, Padding & Gaps */}
      <div className="rounded-xl border border-border-inactive/40 bg-background-secondary/40 p-5 backdrop-blur-sm space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground-primary">Window & Container Spacing</h3>
          <p className="text-xs text-foreground-muted">Configure outer workspace margins and inner container gaps (pixels).</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Workspace Padding */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground-secondary">Default Workspace Padding</label>
              <span className="text-xs font-mono text-accent">{config.default_workspace_padding ?? 8} px</span>
            </div>
            <Slider
              min={0}
              max={64}
              step={1}
              value={config.default_workspace_padding ?? 8}
              onChange={(v) => updateField('default_workspace_padding', v)}
            />
          </div>

          {/* Container Padding */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground-secondary">Default Container Padding</label>
              <span className="text-xs font-mono text-accent">{config.default_container_padding ?? 8} px</span>
            </div>
            <Slider
              min={0}
              max={64}
              step={1}
              value={config.default_container_padding ?? 8}
              onChange={(v) => updateField('default_container_padding', v)}
            />
          </div>
        </div>
      </div>

      {/* 2. Border Customization */}
      <div className="rounded-xl border border-border-inactive/40 bg-background-secondary/40 p-5 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground-primary">Active Border Styling</h3>
            <p className="text-xs text-foreground-muted">Manage active window highlight border geometry and corners.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground-muted">Enable Border</span>
            <Switch
              checked={config.border ?? true}
              onCheckedChange={(val) => updateField('border', val)}
            />
          </div>
        </div>

        {config.border !== false && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Border Width */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground-secondary">Border Width</label>
                  <span className="text-xs font-mono text-accent">{config.border_width ?? 2} px</span>
                </div>
                <Slider
                  min={1}
                  max={12}
                  step={1}
                  value={config.border_width ?? 2}
                  onChange={(v) => updateField('border_width', v)}
                />
              </div>

              {/* Border Offset */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground-secondary">Border Offset</label>
                  <span className="text-xs font-mono text-accent">{config.border_offset ?? -1} px</span>
                </div>
                <Slider
                  min={-10}
                  max={10}
                  step={1}
                  value={config.border_offset ?? -1}
                  onChange={(v) => updateField('border_offset', v)}
                />
              </div>

              {/* Border Style */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground-secondary">Corner Style</label>
                <Select
                  value={config.border_style || 'Rounded'}
                  options={BORDER_STYLE_OPTIONS}
                  onChange={(v) => updateField('border_style', v as 'Rounded' | 'Square')}
                />
              </div>
            </div>

            {/* Border Colours */}
            <div className="pt-2">
              <label className="text-xs font-medium text-foreground-secondary mb-2 block">
                Window State Border Colors
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <ColorPicker
                  label="Single Window"
                  description="Normal focused"
                  value={config.border_colours?.single || '#7aa2f7'}
                  onChange={(hex) => updateBorderColour('single', hex)}
                />
                <ColorPicker
                  label="Stack"
                  description="Tabbed container"
                  value={config.border_colours?.stack || '#bb9af7'}
                  onChange={(hex) => updateBorderColour('stack', hex)}
                />
                <ColorPicker
                  label="Monocle"
                  description="Fullscreen mode"
                  value={config.border_colours?.monocle || '#7aa2f7'}
                  onChange={(hex) => updateBorderColour('monocle', hex)}
                />
                <ColorPicker
                  label="Unfocused"
                  description="Inactive border"
                  value={config.border_colours?.unfocused || '#292e42'}
                  onChange={(hex) => updateBorderColour('unfocused', hex)}
                />
                <ColorPicker
                  label="Floating"
                  description="Floating window"
                  value={config.border_colours?.floating || '#bb9af7'}
                  onChange={(hex) => updateBorderColour('floating', hex)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Window Management Behaviors */}
      <div className="rounded-xl border border-border-inactive/40 bg-background-secondary/40 p-5 backdrop-blur-sm space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground-primary">Window Behaviors & Integration</h3>
          <p className="text-xs text-foreground-muted">Configure focus tracking, multi-monitor movement, and desktop transparency.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Cross Monitor Move Behaviour */}
          <div className="space-y-1.5 p-3 rounded-lg bg-background-surface/30 border border-border-inactive/30">
            <label className="text-xs font-medium text-foreground-secondary">Cross Monitor Move Behaviour</label>
            <Select
              value={config.cross_monitor_move_behaviour || 'Insert'}
              options={CROSS_MONITOR_OPTIONS}
              onChange={(v) => updateField('cross_monitor_move_behaviour', v as 'Insert' | 'Swap')}
            />
            <p className="text-[11px] text-foreground-muted">
              Whether windows pushed to another monitor are inserted or swapped with the current focused window.
            </p>
          </div>

          {/* Window Hiding Behaviour */}
          <div className="space-y-1.5 p-3 rounded-lg bg-background-surface/30 border border-border-inactive/30">
            <label className="text-xs font-medium text-foreground-secondary">Window Hiding Behaviour</label>
            <Select
              value={config.window_hiding_behaviour || 'Cloak'}
              options={WINDOW_HIDING_OPTIONS}
              onChange={(v) => updateField('window_hiding_behaviour', v as 'Cloak' | 'Minimize' | 'Hide')}
            />
            <p className="text-[11px] text-foreground-muted">
              Cloak utilizes DWM cloaking for instant glitch-free workspace switching on Windows 11.
            </p>
          </div>

          {/* Focus Follows Mouse */}
          <div className="space-y-1.5 p-3 rounded-lg bg-background-surface/30 border border-border-inactive/30">
            <label className="text-xs font-medium text-foreground-secondary">Focus Follows Mouse</label>
            <Select
              value={config.focus_follows_mouse || 'None'}
              options={FOCUS_FOLLOWS_MOUSE_OPTIONS}
              onChange={(v) =>
                updateField('focus_follows_mouse', v === 'None' ? null : (v as 'Komorebi' | 'Windows'))
              }
            />
            <p className="text-[11px] text-foreground-muted">
              Automatically transfer keyboard focus when the mouse pointer moves over another window.
            </p>
          </div>

          {/* Mouse Follows Focus */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-background-surface/30 border border-border-inactive/30">
            <div className="space-y-0.5 pr-2">
              <label className="text-xs font-medium text-foreground-secondary">Mouse Follows Focus</label>
              <p className="text-[11px] text-foreground-muted">
                Warp mouse cursor to the center of newly focused windows.
              </p>
            </div>
            <Switch
              checked={config.mouse_follows_focus ?? false}
              onCheckedChange={(val) => updateField('mouse_follows_focus', val)}
            />
          </div>
        </div>

        {/* Transparency Section */}
        <div className="p-4 rounded-lg bg-background-surface/30 border border-border-inactive/30 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-foreground-secondary">Window Transparency</span>
              <p className="text-[11px] text-foreground-muted">Apply alpha transparency to managed windows</p>
            </div>
            <Switch
              checked={config.transparency ?? false}
              onCheckedChange={(val) => updateField('transparency', val)}
            />
          </div>

          {config.transparency && (
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground-secondary">Transparency Alpha</span>
                <span className="text-xs font-mono text-accent">
                  {Math.round((config.transparency_alpha ?? 0.85) * 100)}%
                </span>
              </div>
              <Slider
                min={0.2}
                max={1.0}
                step={0.01}
                value={config.transparency_alpha ?? 0.85}
                onChange={(numericVal) => updateField('transparency_alpha', numericVal)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
