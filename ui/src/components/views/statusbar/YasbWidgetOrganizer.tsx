import React, { useState } from 'react';
import {
  GripVertical,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Maximize2,
  AppWindow,
  Clock,
  Cpu,
  HardDrive,
  Activity,
  Volume2,
  Menu,
  Power,
  Music,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import type { YasbConfig } from '@/types/ipc';
import { WidgetConfigForm } from './WidgetConfigForm';

export interface YasbWidgetOrganizerProps {
  config: YasbConfig;
  onChange: (updatedConfig: YasbConfig) => void;
}

type Zone = 'left' | 'center' | 'right';

const ZONES: { id: Zone; label: string; color: string }[] = [
  { id: 'left', label: 'Left Zone', color: 'bg-blue-500' },
  { id: 'center', label: 'Center Zone', color: 'bg-purple-500' },
  { id: 'right', label: 'Right Zone', color: 'bg-emerald-500' },
];

const KNOWN_WIDGETS: {
  id: string;
  name: string;
  icon: React.ReactNode;
  defaultType: string;
  defaultOptions: Record<string, unknown>;
}[] = [
  {
    id: 'komorebi_workspaces',
    name: 'Workspaces',
    icon: <AppWindow className="w-4 h-4 text-blue-400" />,
    defaultType: 'komorebi.workspaces.WorkspaceWidget',
    defaultOptions: {
      label_offline: '󰘳 Komorebi Offline',
      label_workspace_btn: '{index}',
      label_workspace_active_btn: '{index}',
      label_workspace_populated_btn: '{index}',
      label_default_name: '{index}',
      label_zero_index: false,
      hide_empty_workspaces: false,
      hide_if_offline: false,
      enable_scroll_switching: true,
      reverse_scroll_direction: false,
      toggle_workspace_layer: { enabled: true, tiling_label: '󱂬 Tiling', floating_label: '󱂭 Floating' },
    },
  },
  {
    id: 'active_window',
    name: 'Active Window',
    icon: <Maximize2 className="w-4 h-4 text-cyan-400" />,
    defaultType: 'yasb.active_window.ActiveWindowWidget',
    defaultOptions: {
      label: '{win[title]}',
      label_alt: '{win[process][name]} ({win[title]})',
      label_no_window: '󰇄 Desktop',
      label_icon: true,
      label_icon_size: 14,
      max_length: 50,
      monitor_exclusive: true,
    },
  },
  {
    id: 'media',
    name: 'Now Playing',
    icon: <Music className="w-4 h-4 text-pink-400" />,
    defaultType: 'yasb.media.MediaWidget',
    defaultOptions: {
      label: '<span>󰎈</span> {title} - {artist}',
      label_alt: '<span>󰎈</span> {title}',
      max_field_size: { label: 32, label_alt: 24 },
      show_thumbnail: false,
      hide_empty: true,
      controls_only: false,
      callbacks: { on_left: 'toggle_media_menu', on_middle: 'play_pause', on_right: 'next_track' },
    },
  },
  {
    id: 'clock',
    name: 'Clock & Calendar',
    icon: <Clock className="w-4 h-4 text-emerald-400" />,
    defaultType: 'yasb.clock.ClockWidget',
    defaultOptions: {
      label: '<span>󰥔</span> {%H:%M}',
      label_alt: '<span>󰃭</span> {%a, %b %d %Y} <span>󰥔</span> {%H:%M:%S}',
      timezones: [],
      calendar: { blur: true, round_corners: true },
    },
  },
  {
    id: 'cpu',
    name: 'CPU Meter',
    icon: <Cpu className="w-4 h-4 text-orange-400" />,
    defaultType: 'yasb.cpu.CpuWidget',
    defaultOptions: {
      label: '<span>󰍛</span> {info[percent][total]}%',
      label_alt: '<span>󰍛</span> {info[freq][current]}MHz',
      update_interval: 2000,
      cpu_thresholds: { low: 25, medium: 60, high: 85 },
    },
  },
  {
    id: 'memory',
    name: 'Memory Meter',
    icon: <HardDrive className="w-4 h-4 text-purple-400" />,
    defaultType: 'yasb.memory.MemoryWidget',
    defaultOptions: {
      label: '<span>󰘚</span> {virtual_mem_percent}%',
      label_alt: '<span>󰘚</span> {virtual_mem_used}/{virtual_mem_total}',
      update_interval: 3000,
      hide_decimal: true,
      memory_thresholds: { low: 40, medium: 70, high: 90 },
    },
  },
  {
    id: 'traffic',
    name: 'Network Traffic',
    icon: <Activity className="w-4 h-4 text-teal-400" />,
    defaultType: 'yasb.traffic.TrafficWidget',
    defaultOptions: {
      label: '<span>󰕒</span> {upload_speed} <span>󰇚</span> {download_speed}',
      label_alt: '<span>󰲝</span> Up: {upload_speed} | Down: {download_speed}',
      update_interval: 2000,
      speed_unit: 'bytes',
      hide_if_offline: false,
      hide_decimal: true,
    },
  },
  {
    id: 'volume',
    name: 'Volume & Audio',
    icon: <Volume2 className="w-4 h-4 text-yellow-400" />,
    defaultType: 'yasb.volume.VolumeWidget',
    defaultOptions: {
      label: '<span>{icon}</span> {level}%',
      label_alt: '<span>{icon}</span> {volume[percent]}%',
      volume_icons: ['󰝟', '󰕿', '󰖀', '󰖀', '󰕾'],
      scroll_step: 2,
      slider_beep: false,
      audio_menu: { blur: true, round_corners: true },
    },
  },
  {
    id: 'systray',
    name: 'System Tray',
    icon: <Menu className="w-4 h-4 text-indigo-400" />,
    defaultType: 'yasb.systray.SystrayWidget',
    defaultOptions: {
      class_name: 'systray',
      label_collapsed: '󰅁',
      label_expanded: '󰅂',
      label_position: 'right',
      icon_size: 16,
      pin_click_modifier: 'alt',
      show_in_popup: true,
      icons_per_row: 5,
    },
  },
  {
    id: 'power_menu',
    name: 'Power Menu',
    icon: <Power className="w-4 h-4 text-red-400" />,
    defaultType: 'yasb.power_menu.PowerMenuWidget',
    defaultOptions: {
      label: '󰐥',
      uptime: true,
      show_user: true,
      menu_style: 'popup',
      popup: { blur: true, round_corners: true },
      animation_duration: 200,
      button_row: 5,
    },
  },
];

export const YasbWidgetOrganizer: React.FC<YasbWidgetOrganizerProps> = ({ config, onChange }) => {
  const [selectedWidget, setSelectedWidget] = useState<string>('komorebi_workspaces');
  const [targetBarName] = useState<string>('main-bar');
  const [showBarSettings, setShowBarSettings] = useState<boolean>(false);

  const currentBar = config?.bars?.[targetBarName] || {
    enabled: true,
    screens: ['*'],
    class_name: 'yasb-bar',
    alignment: { position: 'top', center: false },
    blur_effect: {
      enabled: true,
      acrylic: false,
      dark: true,
      round_corners: true,
      round_corners_type: 'normal',
      border_color: '#292e42',
    },
    window_flags: { always_on_top: false, windows_app_bar: true },
    dimensions: { width: '100%', height: 32 },
    padding: { top: 0, left: 6, bottom: 0, right: 6 },
    widgets: {
      left: ['komorebi_workspaces', 'active_window'],
      center: ['media', 'clock'],
      right: ['cpu', 'memory', 'traffic', 'volume', 'systray', 'power_menu'],
    },
  };

  const updateBar = (newBar: typeof currentBar) => {
    onChange({
      ...config,
      bars: {
        ...config.bars,
        [targetBarName]: newBar,
      },
    });
  };

  const moveWidget = (fromZone: Zone, toZone: Zone, index: number) => {
    if (fromZone === toZone) return;
    const widgetToMove = currentBar.widgets[fromZone][index];
    updateBar({
      ...currentBar,
      widgets: {
        ...currentBar.widgets,
        [fromZone]: currentBar.widgets[fromZone].filter((_, i) => i !== index),
        [toZone]: [...currentBar.widgets[toZone], widgetToMove],
      },
    });
  };

  const reorderWidget = (zone: Zone, index: number, direction: 'up' | 'down') => {
    const list = [...currentBar.widgets[zone]];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const [moved] = list.splice(index, 1);
    list.splice(targetIdx, 0, moved);
    updateBar({
      ...currentBar,
      widgets: { ...currentBar.widgets, [zone]: list },
    });
  };

  const removeWidget = (zone: Zone, index: number) => {
    const widgetId = currentBar.widgets[zone][index];
    updateBar({
      ...currentBar,
      widgets: {
        ...currentBar.widgets,
        [zone]: currentBar.widgets[zone].filter((_, i) => i !== index),
      },
    });
    if (selectedWidget === widgetId) setSelectedWidget('');
  };

  const addWidgetToZone = (widgetId: string, zone: Zone) => {
    if (currentBar.widgets[zone].includes(widgetId)) return;

    const newWidgetsDict = { ...config.widgets };
    if (!newWidgetsDict[widgetId]) {
      const template = KNOWN_WIDGETS.find((w) => w.id === widgetId);
      newWidgetsDict[widgetId] = template
        ? { type: template.defaultType, options: template.defaultOptions }
        : { type: 'yasb.custom.CustomWidget', options: { label: widgetId } };
    }

    onChange({
      ...config,
      bars: {
        ...config.bars,
        [targetBarName]: {
          ...currentBar,
          widgets: { ...currentBar.widgets, [zone]: [...currentBar.widgets[zone], widgetId] },
        },
      },
      widgets: newWidgetsDict,
    });
    setSelectedWidget(widgetId);
  };

  const renderWidgetPill = (widgetId: string, zone: Zone, index: number, total: number) => {
    const known = KNOWN_WIDGETS.find((w) => w.id === widgetId);
    const isSelected = selectedWidget === widgetId;

    return (
      <div
        key={`${zone}-${widgetId}-${index}`}
        onClick={() => setSelectedWidget(widgetId)}
        className={`group flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
          isSelected
            ? 'bg-blue-600/15 border-blue-500/80 text-white shadow-sm shadow-blue-500/10'
            : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/50'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
          <span className="flex-shrink-0">{known?.icon || <Sliders className="w-4 h-4 text-zinc-400" />}</span>
          <span className="text-xs font-medium truncate">{known?.name || widgetId}</span>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            disabled={index === 0}
            onClick={(e) => { e.stopPropagation(); reorderWidget(zone, index, 'up'); }}
            className="p-1 hover:bg-zinc-700/60 rounded text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={(e) => { e.stopPropagation(); reorderWidget(zone, index, 'down'); }}
            className="p-1 hover:bg-zinc-700/60 rounded text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {(['left', 'center', 'right'] as Zone[]).filter((z) => z !== zone).map((targetZ) => (
            <button
              key={targetZ}
              type="button"
              title={`Move to ${targetZ} zone`}
              onClick={(e) => { e.stopPropagation(); moveWidget(zone, targetZ, index); }}
              className="px-1 py-0.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200 uppercase"
            >
              {targetZ[0]}
            </button>
          ))}

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeWidget(zone, index); }}
            className="p-1 hover:bg-red-950/60 rounded text-zinc-500 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">YASB Bar Layout & Zones</h3>
            <p className="text-xs text-zinc-400">
              Drag, order, and position status widgets across Left, Center, and Right zones.
            </p>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={() => setShowBarSettings(!showBarSettings)}>
          {showBarSettings ? 'Hide Bar Geometry' : 'Bar Geometry & Blur'}
        </Button>
      </div>

      {showBarSettings && (
        <div className="p-5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-4">
          <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            Main Bar Physical Geometry & Appearance
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Position</label>
              <Select
                value={currentBar.alignment.position}
                onChange={(pos) => updateBar({ ...currentBar, alignment: { ...currentBar.alignment, position: pos as 'top' | 'bottom' } })}
                options={[{ value: 'top', label: 'Top Edge' }, { value: 'bottom', label: 'Bottom Edge' }]}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Bar Height: {currentBar.dimensions.height}px</label>
              <Slider
                min={24}
                max={60}
                step={2}
                value={currentBar.dimensions.height}
                onChange={(h) => updateBar({ ...currentBar, dimensions: { ...currentBar.dimensions, height: h } })}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Horizontal Padding: {currentBar.padding.left}px</label>
              <Slider
                min={0}
                max={32}
                step={2}
                value={currentBar.padding.left}
                onChange={(p) => updateBar({ ...currentBar, padding: { ...currentBar.padding, left: p, right: p } })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            {[
              { label: 'Acrylic / Blur Effect', checked: currentBar.blur_effect.enabled, onChange: (c: boolean) => updateBar({ ...currentBar, blur_effect: { ...currentBar.blur_effect, enabled: c } }) },
              { label: 'Rounded Bar Corners', checked: currentBar.blur_effect.round_corners, onChange: (c: boolean) => updateBar({ ...currentBar, blur_effect: { ...currentBar.blur_effect, round_corners: c } }) },
              { label: 'Windows App Bar Mode', checked: currentBar.window_flags.windows_app_bar, onChange: (c: boolean) => updateBar({ ...currentBar, window_flags: { ...currentBar.window_flags, windows_app_bar: c } }) },
            ].map((sw, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/40">
                <span className="text-xs text-zinc-300">{sw.label}</span>
                <Switch checked={sw.checked} onCheckedChange={sw.onChange} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3 Zone Visual Organizer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ZONES.map(({ id: zone, label, color }) => {
          const zoneWidgets = currentBar.widgets[zone];
          return (
            <div key={zone} className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex flex-col h-full space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                  <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                    {label} ({zoneWidgets.length})
                  </h4>
                </div>
                <Select
                  value=""
                  placeholder="+ Add Widget"
                  onChange={(val) => { if (val) addWidgetToZone(val, zone); }}
                  options={KNOWN_WIDGETS.filter((w) => !zoneWidgets.includes(w.id)).map((w) => ({ value: w.id, label: w.name }))}
                />
              </div>

              <div className="flex-1 space-y-2 min-h-[140px]">
                {zoneWidgets.length === 0 ? (
                  <p className="text-xs text-zinc-600 text-center py-8">No widgets in {zone} zone</p>
                ) : (
                  zoneWidgets.map((wid, idx) => renderWidgetPill(wid, zone, idx, zoneWidgets.length))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedWidget && (
        <div className="p-6 rounded-xl bg-zinc-900/30 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-400" />
              Widget Properties: <span className="text-blue-400">{selectedWidget}</span>
            </h4>
          </div>

          <WidgetConfigForm widgetName={selectedWidget} config={config} onChange={onChange} />
        </div>
      )}
    </div>
  );
};
export default YasbWidgetOrganizer;
