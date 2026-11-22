import React from 'react';
import {
  Monitor,
  Layout,
  Sliders,
  Palette,
  Volume2,
  Sun,
  Music,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { FluentFlyoutConfig } from '@/types/ipc';

/**
 * Component properties for the `FluentFlyoutEditor` configuration panel.
 */
export interface FluentFlyoutEditorProps {
  /** Active FluentFlyouts configuration schema. */
  config: FluentFlyoutConfig;
  /** Callback fired when flyout settings or layout metrics are updated. */
  onChange: (updatedConfig: FluentFlyoutConfig) => void;
}

/**
 * Visual configuration editor for Windows 11 FluentFlyouts OSD.
 *
 * Configures placement offsets, safe padding relative to YASB status bar,
 * background composition backdrops (Mica/Acrylic), and module switches.
 *
 * @param props - Current flyout configuration and mutation handler.
 * @returns FluentFlyouts configuration panel.
 */
export const FluentFlyoutEditor: React.FC<FluentFlyoutEditorProps> = ({ config, onChange }) => {
  const updateGeneral = <K extends keyof FluentFlyoutConfig['General']>(
    settingKey: K,
    settingValue: FluentFlyoutConfig['General'][K]
  ) => {
    onChange({
      ...config,
      General: {
        ...config.General,
        [settingKey]: settingValue,
      },
    });
  };

  const updateAppearance = <K extends keyof FluentFlyoutConfig['Appearance']>(
    settingKey: K,
    settingValue: FluentFlyoutConfig['Appearance'][K]
  ) => {
    onChange({
      ...config,
      Appearance: {
        ...config.Appearance,
        [settingKey]: settingValue,
      },
    });
  };

  const updatePlacement = <K extends keyof FluentFlyoutConfig['Placement']>(
    settingKey: K,
    settingValue: FluentFlyoutConfig['Placement'][K]
  ) => {
    onChange({
      ...config,
      Placement: {
        ...config.Placement,
        [settingKey]: settingValue,
      },
    });
  };

  const updateModule = <M extends keyof FluentFlyoutConfig['Modules']>(
    moduleName: M,
    fieldKey: keyof FluentFlyoutConfig['Modules'][M],
    fieldValue: unknown
  ) => {
    onChange({
      ...config,
      Modules: {
        ...config.Modules,
        [moduleName]: {
          ...config.Modules[moduleName],
          [fieldKey]: fieldValue,
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">FluentFlyouts Media & Volume OSD</h3>
            <p className="text-xs text-zinc-400">
              Modern replacement for Windows 11 hardware flyouts (Volume, Brightness, Media, Airplane, Lock Keys).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            Backdrop: {config.Appearance.Backdrop}
          </Badge>
          <Badge variant="secondary" className="font-mono text-xs">
            Alignment: {config.Placement.Alignment}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Placement & YASB Safe Margin */}
        <div className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <Layout className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
              Screen Placement & YASB Collision
            </h4>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Screen Anchor Alignment</label>
              <Select
                value={config.Placement.Alignment}
                options={[
                  { value: 'TopLeft', label: 'Top Left' },
                  { value: 'TopCenter', label: 'Top Center' },
                  { value: 'TopRight', label: 'Top Right' },
                  { value: 'BottomLeft', label: 'Bottom Left' },
                  { value: 'BottomCenter', label: 'Bottom Center' },
                  { value: 'BottomRight', label: 'Bottom Right' },
                ]}
                onChange={(selectedAlignment) => updatePlacement('Alignment', selectedAlignment)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-300">Safe Padding for YASB</span>
                <span className="font-mono text-indigo-400">{config.Placement.SafePaddingYASB}px</span>
              </div>
              <Slider
                value={config.Placement.SafePaddingYASB}
                min={0}
                max={100}
                step={2}
                onChange={(numericPadding) => updatePlacement('SafePaddingYASB', numericPadding)}
              />
              <p className="text-[11px] text-zinc-500">
                Pushes flyout below or above the YASB status bar so elements never overlap.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-300">Vertical Offset (Y)</span>
                <span className="font-mono text-indigo-400">{config.Placement.OffsetY}px</span>
              </div>
              <Slider
                value={config.Placement.OffsetY}
                min={-100}
                max={200}
                step={4}
                onChange={(numericOffset) => updatePlacement('OffsetY', numericOffset)}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <div>
                <span className="text-xs font-medium text-zinc-200 block">Avoid Work Area Overlap</span>
                <span className="text-[11px] text-zinc-500">Respect Komorebi managed tiles</span>
              </div>
              <Switch
                checked={config.Placement.AvoidWorkAreaOverlap}
                onCheckedChange={(isAvoided) => updatePlacement('AvoidWorkAreaOverlap', isAvoided)}
              />
            </div>
          </div>
        </div>

        {/* Visual Appearance & Backdrop */}
        <div className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <Palette className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
              Visual Appearance
            </h4>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Theme Mode</label>
              <Select
                value={config.Appearance.Theme}
                options={[
                  { value: 'dark', label: 'Dark Mode' },
                  { value: 'light', label: 'Light Mode' },
                ]}
                onChange={(selectedTheme) => updateAppearance('Theme', selectedTheme as FluentFlyoutConfig['Appearance']['Theme'])}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Backdrop Composition</label>
              <Select
                value={config.Appearance.Backdrop}
                options={[
                  { value: 'MicaAlt', label: 'Mica Alt (Layered Modern)' },
                  { value: 'Mica', label: 'Mica (Hardware Efficient)' },
                  { value: 'Acrylic', label: 'Acrylic (Heavy Blur)' },
                  { value: 'Default', label: 'Solid Fallback' },
                ]}
                onChange={(selectedBackdrop) => updateAppearance('Backdrop', selectedBackdrop as FluentFlyoutConfig['Appearance']['Backdrop'])}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-300">Corner Radius</span>
                <span className="font-mono text-indigo-400">{config.Appearance.CornerRadius}px</span>
              </div>
              <Slider
                value={config.Appearance.CornerRadius}
                min={0}
                max={24}
                step={2}
                onChange={(numericRadius) => updateAppearance('CornerRadius', numericRadius)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-300">Opacity</span>
                <span className="font-mono text-indigo-400">{Math.round(config.Appearance.Opacity * 100)}%</span>
              </div>
              <Slider
                value={config.Appearance.Opacity}
                min={0.3}
                max={1.0}
                step={0.05}
                onChange={(numericOpacity) => updateAppearance('Opacity', numericOpacity)}
              />
            </div>
          </div>
        </div>

        {/* Modules Toggle */}
        <div className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
              Active OSD Modules
            </h4>
          </div>

          <div className="space-y-3">
            {/* Volume */}
            <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-teal-400" />
                  <span className="text-xs font-medium text-zinc-200">Volume OSD</span>
                </div>
                <Switch
                  checked={config.Modules.Volume.Enabled}
                  onCheckedChange={(isEnabled) => updateModule('Volume', 'Enabled', isEnabled)}
                />
              </div>
              {config.Modules.Volume.Enabled && (
                <div className="pt-2 border-t border-zinc-800/60 space-y-1">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Step Size:</span>
                    <span className="font-mono text-zinc-200">{config.Modules.Volume.StepSize}%</span>
                  </div>
                  <Slider
                    value={config.Modules.Volume.StepSize}
                    min={1}
                    max={10}
                    step={1}
                    onChange={(numericStep) => updateModule('Volume', 'StepSize', numericStep)}
                  />
                </div>
              )}
            </div>

            {/* Brightness */}
            <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-medium text-zinc-200">Brightness OSD</span>
                </div>
                <Switch
                  checked={config.Modules.Brightness.Enabled}
                  onCheckedChange={(isEnabled) => updateModule('Brightness', 'Enabled', isEnabled)}
                />
              </div>
              {config.Modules.Brightness.Enabled && (
                <div className="pt-2 border-t border-zinc-800/60 space-y-1">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Step Size:</span>
                    <span className="font-mono text-zinc-200">{config.Modules.Brightness.StepSize}%</span>
                  </div>
                  <Slider
                    value={config.Modules.Brightness.StepSize}
                    min={1}
                    max={10}
                    step={1}
                    onChange={(numericStep) => updateModule('Brightness', 'StepSize', numericStep)}
                  />
                </div>
              )}
            </div>

            {/* Media */}
            <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-medium text-zinc-200">Media Playback Controls</span>
                </div>
                <Switch
                  checked={config.Modules.Media.Enabled}
                  onCheckedChange={(isEnabled) => updateModule('Media', 'Enabled', isEnabled)}
                />
              </div>
            </div>

            {/* Lock Keys */}
            <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-rose-400" />
                  <span className="text-xs font-medium text-zinc-200">Lock Keys (Caps/Num/Scroll)</span>
                </div>
                <Switch
                  checked={config.Modules.LockKeys.Enabled}
                  onCheckedChange={(isEnabled) => updateModule('LockKeys', 'Enabled', isEnabled)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
