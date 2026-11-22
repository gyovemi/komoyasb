import React from 'react';
import {
  Volume2,
  Sliders,
  SlidersHorizontal,
  Activity,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { EarTrumpetConfig } from '@/types/ipc';

/**
 * Component properties for the `EarTrumpetSettings` configuration panel.
 */
export interface EarTrumpetSettingsProps {
  /** Current EarTrumpet Windows registry settings. */
  config: EarTrumpetConfig;
  /** Callback fired when EarTrumpet settings are modified. */
  onChange: (updatedConfig: EarTrumpetConfig) => void;
}

/**
 * Windows registry configuration form for EarTrumpet per-application volume mixer flyout.
 *
 * Configures peak volume meters, device switching, app icons, and notification tray placement.
 *
 * @param props - Current config state and mutation handler.
 * @returns EarTrumpet configuration grid.
 */
export const EarTrumpetSettings: React.FC<EarTrumpetSettingsProps> = ({ config, onChange }) => {
  const updateSetting = <K extends keyof EarTrumpetConfig>(settingKey: K, settingValue: EarTrumpetConfig[K]) => {
    onChange({
      ...config,
      [settingKey]: settingValue,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">EarTrumpet Windows Audio Integration</h3>
            <p className="text-xs text-zinc-400">
              Manage per-application volume flyout, playback switcher, peak meters, and taskbar notification tray placement.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={config.isPromotedInTray ? 'default' : 'secondary'}>
            {config.isPromotedInTray ? 'Taskbar Promoted' : 'Overflow Tray'}
          </Badge>
        </div>
      </div>

      {/* Registry Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Flyout Behavior */}
        <div className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <Sliders className="w-4 h-4 text-teal-400" />
            <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
              Audio Flyout Features
            </h4>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <div>
                <span className="text-xs font-medium text-zinc-200 block">Show Volume Peak Meter</span>
                <span className="text-[11px] text-zinc-500">Live dynamic audio visualizer bar</span>
              </div>
              <Switch
                checked={config.showVolumePeakMeter}
                onCheckedChange={(isChecked) => updateSetting('showVolumePeakMeter', isChecked)}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <div>
                <span className="text-xs font-medium text-zinc-200 block">Show Playback Devices</span>
                <span className="text-[11px] text-zinc-500">Quick output device switching list</span>
              </div>
              <Switch
                checked={config.showPlaybackDevices}
                onCheckedChange={(isChecked) => updateSetting('showPlaybackDevices', isChecked)}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <div>
                <span className="text-xs font-medium text-zinc-200 block">Show Recording Devices</span>
                <span className="text-[11px] text-zinc-500">Microphone and audio input routing</span>
              </div>
              <Switch
                checked={config.showRecordingDevices}
                onCheckedChange={(isChecked) => updateSetting('showRecordingDevices', isChecked)}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <div>
                <span className="text-xs font-medium text-zinc-200 block">Show Application Icons</span>
                <span className="text-[11px] text-zinc-500">Render process icon beside channel sliders</span>
              </div>
              <Switch
                checked={config.showAppIcons}
                onCheckedChange={(isChecked) => updateSetting('showAppIcons', isChecked)}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <div>
                <span className="text-xs font-medium text-zinc-200 block">Expand All by Default</span>
                <span className="text-[11px] text-zinc-500">Always reveal per-app volume sliders</span>
              </div>
              <Switch
                checked={config.expandAll}
                onCheckedChange={(isChecked) => updateSetting('expandAll', isChecked)}
              />
            </div>
          </div>
        </div>

        {/* Visual Theming & Tray Placement */}
        <div className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <Sparkles className="w-4 h-4 text-teal-400" />
            <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
              Styling & Shell Integration
            </h4>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Theme Mode</label>
              <Select
                value={config.theme}
                options={[
                  { value: 'System', label: 'Match Windows System Theme' },
                  { value: 'Dark', label: 'Forced Dark Mode' },
                  { value: 'Light', label: 'Forced Light Mode' },
                ]}
                onChange={(selectedTheme) => updateSetting('theme', selectedTheme as EarTrumpetConfig['theme'])}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <div>
                <span className="text-xs font-medium text-zinc-200 block">Use Windows Accent Color</span>
                <span className="text-[11px] text-zinc-500">Color volume sliders with system accent</span>
              </div>
              <Switch
                checked={config.useAccentColor}
                onCheckedChange={(isChecked) => updateSetting('useAccentColor', isChecked)}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <div>
                <span className="text-xs font-medium text-zinc-200 block">Promote in Taskbar Notification Area</span>
                <span className="text-[11px] text-zinc-500">Keeps EarTrumpet outside the overflow chevron</span>
              </div>
              <Switch
                checked={config.isPromotedInTray}
                onCheckedChange={(isChecked) => updateSetting('isPromotedInTray', isChecked)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
