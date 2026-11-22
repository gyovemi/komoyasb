import React, { useState } from 'react';
import {
  Code,
  Layers,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { YasbConfig } from '@/types/ipc';
import { CompactField, FieldDef } from './WidgetFieldHelpers';

export interface WidgetConfigFormProps {
  widgetName: string;
  config: YasbConfig;
  onChange: (updatedConfig: YasbConfig) => void;
}

const WIDGET_FIELD_TABLES: Record<string, { inputs?: FieldDef[]; switches?: FieldDef[]; sliders?: FieldDef[] }> = {
  komorebi_workspaces: {
    inputs: [
      { key: 'label_offline', label: 'Offline Label', type: 'text', placeholder: '󰘳 Komorebi Offline' },
      { key: 'label_workspace_btn', label: 'Default Button Label', type: 'text', placeholder: '{index}' },
      { key: 'label_workspace_active_btn', label: 'Active Workspace Button', type: 'text', placeholder: '{index}' },
      { key: 'label_workspace_populated_btn', label: 'Populated Workspace Button', type: 'text', placeholder: '{index}' },
    ],
    switches: [
      { key: 'label_zero_index', label: '0-Indexed Numbers', type: 'switch' },
      { key: 'hide_empty_workspaces', label: 'Hide Empty Workspaces', type: 'switch' },
      { key: 'enable_scroll_switching', label: 'Enable Mouse Scroll Switching', type: 'switch' },
      { key: 'hide_if_offline', label: 'Hide Bar When Offline', type: 'switch' },
    ],
  },
  active_window: {
    inputs: [
      { key: 'label', label: 'Title Format', type: 'text', placeholder: '{win[title]}' },
      { key: 'label_alt', label: 'Alternative Label', type: 'text', placeholder: '{win[process][name]} ({win[title]})' },
      { key: 'label_no_window', label: 'Empty Desktop Label', type: 'text', placeholder: '󰇄 Desktop' },
    ],
    sliders: [
      { key: 'max_length', label: 'Max Title Length', type: 'slider', min: 10, max: 120, step: 5, unit: ' chars' },
    ],
    switches: [
      { key: 'label_icon', label: 'Show Application Icon', type: 'switch' },
      { key: 'monitor_exclusive', label: 'Monitor Exclusive', type: 'switch' },
    ],
  },
  media: {
    inputs: [
      { key: 'label', label: 'Display Label', type: 'text', placeholder: '<span>󰎈</span> {title} - {artist}' },
      { key: 'label_alt', label: 'Alternative Label', type: 'text', placeholder: '<span>󰎈</span> {title}' },
    ],
    switches: [
      { key: 'hide_empty', label: 'Hide If Stopped', type: 'switch' },
      { key: 'show_thumbnail', label: 'Show Album Art', type: 'switch' },
      { key: 'controls_only', label: 'Controls Only', type: 'switch' },
    ],
  },
  clock: {
    inputs: [
      { key: 'label', label: 'Time Format', type: 'text', placeholder: '<span>󰥔</span> {%H:%M}', hint: 'Standard strftime tokens (%H, %M, %S, %p)' },
      { key: 'label_alt', label: 'Expanded Date Format', type: 'text', placeholder: '<span>󰃭</span> {%a, %b %d %Y} <span>󰥔</span> {%H:%M:%S}' },
    ],
  },
  cpu: {
    inputs: [
      { key: 'label', label: 'Primary Template', type: 'text' },
      { key: 'label_alt', label: 'Alternative Template', type: 'text' },
    ],
    sliders: [
      { key: 'update_interval', label: 'Polling Interval', type: 'slider', min: 500, max: 10000, step: 250, unit: 'ms' },
    ],
  },
  memory: {
    inputs: [
      { key: 'label', label: 'Primary Template', type: 'text' },
      { key: 'label_alt', label: 'Alternative Template', type: 'text' },
    ],
    sliders: [
      { key: 'update_interval', label: 'Polling Interval', type: 'slider', min: 500, max: 10000, step: 250, unit: 'ms' },
    ],
  },
  traffic: {
    inputs: [
      { key: 'label', label: 'Primary Template', type: 'text' },
      { key: 'label_alt', label: 'Alternative Template', type: 'text' },
    ],
    sliders: [
      { key: 'update_interval', label: 'Polling Interval', type: 'slider', min: 500, max: 10000, step: 250, unit: 'ms' },
    ],
  },
  volume: {
    inputs: [
      { key: 'label', label: 'Label Format', type: 'text', placeholder: '<span>{icon}</span> {level}%' },
    ],
    sliders: [
      { key: 'scroll_step', label: 'Scroll Step Size (%)', type: 'slider', min: 1, max: 10, step: 1, unit: '%' },
    ],
    switches: [
      { key: 'slider_beep', label: 'Audio Feedback Beep on Scroll', type: 'switch' },
    ],
  },
  systray: {
    inputs: [
      { key: 'label_collapsed', label: 'Collapsed Chevron', type: 'text' },
      { key: 'label_expanded', label: 'Expanded Chevron', type: 'text' },
    ],
    sliders: [
      { key: 'icon_size', label: 'Icon Size', type: 'slider', min: 12, max: 28, step: 2, unit: 'px' },
    ],
    switches: [
      { key: 'show_in_popup', label: 'Overflow into Flyout Popup', type: 'switch' },
    ],
  },
  power_menu: {
    inputs: [
      { key: 'label', label: 'Menu Trigger Icon', type: 'text' },
    ],
    sliders: [
      { key: 'button_row', label: 'Buttons Per Row', type: 'slider', min: 3, max: 6, step: 1 },
    ],
    switches: [
      { key: 'uptime', label: 'Show System Uptime', type: 'switch' },
      { key: 'show_user', label: 'Show User Avatar / Name', type: 'switch' },
    ],
  },
};

export const WidgetConfigForm: React.FC<WidgetConfigFormProps> = ({
  widgetName,
  config,
  onChange,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const widgetData = config.widgets[widgetName];

  if (!widgetData) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/40 rounded-xl border border-dashed border-zinc-700/60 text-zinc-400">
        <Info className="w-8 h-8 text-zinc-500 mb-2" />
        <p className="text-sm">No configuration definition found for widget "{widgetName}".</p>
      </div>
    );
  }

  const { type, options } = widgetData;

  const updateOption = (key: string, value: unknown) => {
    onChange({
      ...config,
      widgets: {
        ...config.widgets,
        [widgetName]: { ...widgetData, options: { ...options, [key]: value } },
      },
    });
  };

  const updateNestedOption = (parentKey: string, key: string, value: unknown) => {
    const parentObj = (options[parentKey] as Record<string, unknown>) || {};
    updateOption(parentKey, { ...parentObj, [key]: value });
  };

  const fieldTable = WIDGET_FIELD_TABLES[widgetName];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 bg-zinc-900/60 rounded-xl border border-zinc-800 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-zinc-100">{widgetName}</h3>
            <Badge variant="outline" className="font-mono text-xs">{type}</Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Configure display templates, callbacks, polling intervals, and custom options.
          </p>
        </div>
      </div>

      {fieldTable && (
        <div className="space-y-4">
          {fieldTable.inputs && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fieldTable.inputs.map((f) => (
                <CompactField
                  key={f.key}
                  field={f}
                  value={options[f.key]}
                  onChange={(val) => updateOption(f.key, val)}
                />
              ))}
            </div>
          )}

          {fieldTable.sliders && (
            <div className="space-y-4">
              {fieldTable.sliders.map((f) => (
                <CompactField
                  key={f.key}
                  field={f}
                  value={options[f.key]}
                  onChange={(val) => updateOption(f.key, val)}
                />
              ))}
            </div>
          )}

          {fieldTable.switches && (
            <div className={`grid grid-cols-1 ${fieldTable.switches.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-3 pt-2`}>
              {fieldTable.switches.map((f) => (
                <CompactField
                  key={f.key}
                  field={f}
                  value={options[f.key]}
                  onChange={(val) => updateOption(f.key, val)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Special nested panels */}
      {widgetName === 'komorebi_workspaces' && (
        <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-3">
          <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            Workspace Layer Indicator
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Tiling Mode Label</label>
              <Input
                value={((options.toggle_workspace_layer as Record<string, unknown>)?.tiling_label as string) || ''}
                onChange={(e) => updateNestedOption('toggle_workspace_layer', 'tiling_label', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Floating Mode Label</label>
              <Input
                value={((options.toggle_workspace_layer as Record<string, unknown>)?.floating_label as string) || ''}
                onChange={(e) => updateNestedOption('toggle_workspace_layer', 'floating_label', e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {widgetName === 'clock' && (
        <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-3">
          <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Calendar Popup Settings</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/40">
              <span className="text-xs text-zinc-300">Backdrop Blur</span>
              <Switch
                checked={Boolean((options.calendar as Record<string, unknown>)?.blur)}
                onCheckedChange={(checked) => updateNestedOption('calendar', 'blur', checked)}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/40">
              <span className="text-xs text-zinc-300">Rounded Corners</span>
              <Switch
                checked={Boolean((options.calendar as Record<string, unknown>)?.round_corners)}
                onCheckedChange={(checked) => updateNestedOption('calendar', 'round_corners', checked)}
              />
            </div>
          </div>
        </div>
      )}

      {widgetName === 'traffic' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <CompactField
            field={{
              key: 'speed_unit',
              label: 'Speed Unit',
              type: 'select',
              options: [
                { value: 'bytes', label: 'Bytes / KB / MB' },
                { value: 'bits', label: 'Bits / Kbps / Mbps' },
              ],
            }}
            value={(options.speed_unit as string) || 'bytes'}
            onChange={(val) => updateOption('speed_unit', val)}
          />
          <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/40 border border-zinc-800 self-end">
            <span className="text-xs text-zinc-300">Hide Decimals</span>
            <Switch
              checked={Boolean(options.hide_decimal)}
              onCheckedChange={(checked) => updateOption('hide_decimal', checked)}
            />
          </div>
        </div>
      )}

      {/* Advanced Raw JSON Editor */}
      <div className="pt-2 border-t border-zinc-800">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Code className="w-3.5 h-3.5" />
          <span>Advanced Raw Options</span>
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showAdvanced && (
          <div className="mt-3">
            <textarea
              className="w-full h-44 bg-zinc-950 font-mono text-xs text-zinc-200 p-3 rounded-lg border border-zinc-800 focus:outline-none focus:border-blue-500/80"
              value={JSON.stringify(options, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  onChange({
                    ...config,
                    widgets: {
                      ...config.widgets,
                      [widgetName]: { ...widgetData, options: parsed },
                    },
                  });
                } catch {
                  // Keep typing in textarea
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
export default WidgetConfigForm;
