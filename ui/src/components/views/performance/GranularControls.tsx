import * as React from 'react';
import { ChevronDown, ChevronRight, Activity, Eye, Sliders, ShieldCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select } from '@/components/ui/select';
import type { PerformanceProfile } from '@/types/ipc';

export interface GranularControlsProps {
  profile: PerformanceProfile;
  onChange: (updatedProfile: PerformanceProfile) => void;
  disabled?: boolean;
}

export const GranularControls: React.FC<GranularControlsProps> = ({
  profile,
  onChange,
  disabled = false,
}) => {
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({
    animations: true,
    blur: true,
    polling: true,
    os: true,
  });

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const updateSub = <S extends keyof PerformanceProfile, K extends keyof PerformanceProfile[S]>(
    section: S,
    field: K,
    value: PerformanceProfile[S][K]
  ) => {
    onChange({
      ...profile,
      [section]: {
        ...profile[section],
        [field]: value,
      },
    });
  };

  const pollingSensors = [
    { label: 'CPU Sensor Polling', key: 'cpu_interval_ms' as const, min: 500, max: 15000, step: 500 },
    { label: 'Memory Sensor Polling', key: 'memory_interval_ms' as const, min: 1000, max: 30000, step: 1000 },
    { label: 'GPU Utilization Polling', key: 'gpu_interval_ms' as const, min: 1000, max: 60000, step: 2000 },
    { label: 'Network Traffic Polling', key: 'traffic_interval_ms' as const, min: 500, max: 15000, step: 500 },
    { label: 'Media Track Polling', key: 'media_interval_ms' as const, min: 1000, max: 10000, step: 1000 },
    { label: 'Clock Widget Refresh', key: 'clock_interval_ms' as const, min: 1000, max: 60000, step: 1000 },
  ];

  return (
    <div className="space-y-4">
      {/* 1. Animations & Frame Rates */}
      <div className="rounded-xl border border-border-inactive/60 bg-background-secondary/40 backdrop-blur overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('animations')}
          className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-background-surface/40 transition-colors cursor-pointer select-none"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground-primary">
                Animations, Easing & Transition Framerates
              </h4>
              <p className="text-xs text-foreground-muted">
                Komorebi window movements, Flow Launcher transitions, and FluentFlyout timeouts
              </p>
            </div>
          </div>
          {openSections.animations ? (
            <ChevronDown className="w-4 h-4 text-foreground-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-foreground-muted" />
          )}
        </button>

        {openSections.animations && (
          <div className="p-5 border-t border-border-inactive/30 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Komorebi Animations */}
            <div className="p-3.5 rounded-lg bg-background-surface/30 border border-border-inactive/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-foreground-primary">Komorebi Animations</div>
                  <div className="text-[10px] text-foreground-muted">Window move & resize transitions</div>
                </div>
                <Switch
                  checked={profile.komorebi.animation_enabled}
                  onChange={(val) => updateSub('komorebi', 'animation_enabled', val)}
                  disabled={disabled}
                />
              </div>

              {profile.komorebi.animation_enabled && (
                <div className="space-y-3 pt-2 border-t border-border-inactive/20">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground-secondary">Duration</span>
                      <span className="font-mono text-accent">{profile.komorebi.animation_duration_ms}ms</span>
                    </div>
                    <Slider
                      value={profile.komorebi.animation_duration_ms}
                      min={50}
                      max={400}
                      step={25}
                      onChange={(val) => updateSub('komorebi', 'animation_duration_ms', val)}
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground-secondary">Framerate Target</span>
                      <span className="font-mono text-accent">{profile.komorebi.animation_fps} FPS</span>
                    </div>
                    <Slider
                      value={profile.komorebi.animation_fps}
                      min={30}
                      max={165}
                      step={15}
                      onChange={(val) => updateSub('komorebi', 'animation_fps', val)}
                      disabled={disabled}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Flow Launcher Animations */}
            <div className="p-3.5 rounded-lg bg-background-surface/30 border border-border-inactive/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-foreground-primary">Flow Launcher Animations</div>
                  <div className="text-[10px] text-foreground-muted">Search popup show/hide motion</div>
                </div>
                <Switch
                  checked={profile.launcher.use_animation}
                  onChange={(val) => updateSub('launcher', 'use_animation', val)}
                  disabled={disabled}
                />
              </div>

              <div className="space-y-1 pt-2 border-t border-border-inactive/20">
                <label className="text-xs text-foreground-secondary">Animation Speed Curve</label>
                <Select
                  value={profile.launcher.animation_speed}
                  options={[
                    { value: 'Slow', label: 'Slow (Gentle easing)' },
                    { value: 'Medium', label: 'Medium (Standard 150ms)' },
                    { value: 'Fast', label: 'Fast (Snappy 75ms)' },
                  ]}
                  onChange={(val) => updateSub('launcher', 'animation_speed', val)}
                  disabled={disabled || !profile.launcher.use_animation}
                />
              </div>
            </div>

            {/* Flyout Transitions */}
            <div className="p-3.5 rounded-lg bg-background-surface/30 border border-border-inactive/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-foreground-primary">Flyout Show/Hide Motion</div>
                  <div className="text-[10px] text-foreground-muted">Media and volume OSD sliding</div>
                </div>
                <Switch
                  checked={profile.flyout.animate_show}
                  onChange={(val) => {
                    onChange({
                      ...profile,
                      flyout: {
                        ...profile.flyout,
                        animate_show: val,
                        animate_hide: val,
                      },
                    });
                  }}
                  disabled={disabled}
                />
              </div>

              <div className="space-y-1 pt-2 border-t border-border-inactive/20">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground-secondary">OSD Duration</span>
                  <span className="font-mono text-accent">{profile.flyout.animation_duration_ms}ms</span>
                </div>
                <Slider
                  value={profile.flyout.animation_duration_ms}
                  min={0}
                  max={400}
                  step={25}
                  onChange={(val) => updateSub('flyout', 'animation_duration_ms', val)}
                  disabled={disabled || !profile.flyout.animate_show}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Visual Blurs & DWM Compositing */}
      <div className="rounded-xl border border-border-inactive/60 bg-background-secondary/40 backdrop-blur overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('blur')}
          className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-background-surface/40 transition-colors cursor-pointer select-none"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground-primary">
                Visual Blurs, Acrylic Backdrops & DWM Composition
              </h4>
              <p className="text-xs text-foreground-muted">
                Status bar blur, taskbar autohide, and desktop window manager materials
              </p>
            </div>
          </div>
          {openSections.blur ? (
            <ChevronDown className="w-4 h-4 text-foreground-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-foreground-muted" />
          )}
        </button>

        {openSections.blur && (
          <div className="p-5 border-t border-border-inactive/30 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="p-3.5 rounded-lg bg-background-surface/30 border border-border-inactive/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-foreground-primary">YASB Status Bar Blur</div>
                  <div className="text-[10px] text-foreground-muted">Hardware backdrop filtering</div>
                </div>
                <Switch
                  checked={profile.yasb.blur_enabled}
                  onChange={(val) => updateSub('yasb', 'blur_enabled', val)}
                  disabled={disabled}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border-inactive/20">
                <div>
                  <div className="text-xs text-foreground-secondary">Use Acrylic Composition</div>
                  <div className="text-[10px] text-foreground-muted">DWM noise texture overlay</div>
                </div>
                <Switch
                  checked={profile.yasb.acrylic_enabled}
                  onChange={(val) => updateSub('yasb', 'acrylic_enabled', val)}
                  disabled={disabled || !profile.yasb.blur_enabled}
                />
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-background-surface/30 border border-border-inactive/30 space-y-2">
              <label className="text-xs font-semibold text-foreground-primary">DWM System Backdrop Material</label>
              <p className="text-[10px] text-foreground-muted">Window frame composition material</p>
              <Select
                value={String(profile.dwm.backdrop_type)}
                options={[
                  { value: '1', label: 'None / Solid Background (Max Perf)' },
                  { value: '2', label: 'Mica (Hardware Efficient)' },
                  { value: '3', label: 'Acrylic (Heavy Blur Effect)' },
                  { value: '4', label: 'Mica Alt (Layered Modern)' },
                ]}
                onChange={(val) => updateSub('dwm', 'backdrop_type', parseInt(val, 10))}
                disabled={disabled}
              />
            </div>

            <div className="p-3.5 rounded-lg bg-background-surface/30 border border-border-inactive/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-foreground-primary">Taskbar Auto-Hide via Windhawk</div>
                  <div className="text-[10px] text-foreground-muted">Reclaims screen pixels for YASB</div>
                </div>
                <Switch
                  checked={profile.dwm.taskbar_autohide_enabled}
                  onChange={(val) => updateSub('dwm', 'taskbar_autohide_enabled', val)}
                  disabled={disabled}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border-inactive/20">
                <div>
                  <div className="text-xs text-foreground-secondary">Reduce Windows Motion</div>
                  <div className="text-[10px] text-foreground-muted">Suppresses DWM desktop motion</div>
                </div>
                <Switch
                  checked={profile.dwm.reduce_motion}
                  onChange={(val) => updateSub('dwm', 'reduce_motion', val)}
                  disabled={disabled}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Telemetry Polling Intervals */}
      <div className="rounded-xl border border-border-inactive/60 bg-background-secondary/40 backdrop-blur overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('polling')}
          className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-background-surface/40 transition-colors cursor-pointer select-none"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground-primary">
                YASB Widget Telemetry Polling Frequencies
              </h4>
              <p className="text-xs text-foreground-muted">
                Control CPU query frequency for hardware sensors, GPU telemetry, and clock widgets
              </p>
            </div>
          </div>
          {openSections.polling ? (
            <ChevronDown className="w-4 h-4 text-foreground-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-foreground-muted" />
          )}
        </button>

        {openSections.polling && (
          <div className="p-5 border-t border-border-inactive/30 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {pollingSensors.map((sensor) => (
              <div key={sensor.key} className="p-3.5 rounded-lg bg-background-surface/30 border border-border-inactive/30 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-foreground-secondary">{sensor.label}</span>
                  <span className="font-mono text-accent">{profile.yasb[sensor.key] / 1000}s</span>
                </div>
                <Slider
                  value={profile.yasb[sensor.key]}
                  min={sensor.min}
                  max={sensor.max}
                  step={sensor.step}
                  onChange={(val) => updateSub('yasb', sensor.key, val)}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. OS Process Management & EcoQoS */}
      <div className="rounded-xl border border-border-inactive/60 bg-background-secondary/40 backdrop-blur overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('os')}
          className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-background-surface/40 transition-colors cursor-pointer select-none"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground-primary">
                OS Process Scheduling, Priority & EcoQoS Throttling
              </h4>
              <p className="text-xs text-foreground-muted">
                Windows Efficiency Mode (EcoQoS) flags and process scheduling tiers
              </p>
            </div>
          </div>
          {openSections.os ? (
            <ChevronDown className="w-4 h-4 text-foreground-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-foreground-muted" />
          )}
        </button>

        {openSections.os && (
          <div className="p-5 border-t border-border-inactive/30 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="p-3.5 rounded-lg bg-background-surface/30 border border-border-inactive/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-foreground-primary">Windows EcoQoS Mode</div>
                  <div className="text-[10px] text-foreground-muted">Forces background efficiency cores</div>
                </div>
                <Switch
                  checked={profile.os.background_eco_qos}
                  onChange={(val) => updateSub('os', 'background_eco_qos', val)}
                  disabled={disabled}
                />
              </div>
              <p className="text-[11px] text-foreground-muted leading-relaxed">
                Applies Win32 SetProcessInformation throttle flags, shifting polling scripts to low-power efficiency cores.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-background-surface/30 border border-border-inactive/30 space-y-2">
              <label className="text-xs font-semibold text-foreground-primary">Komorebi Process Priority</label>
              <p className="text-[10px] text-foreground-muted">OS thread scheduler allocation</p>
              <Select
                value={profile.os.komorebi_priority}
                options={[
                  { value: 'Normal', label: 'Normal (Standard scheduler)' },
                  { value: 'AboveNormal', label: 'Above Normal (Zero input stutter)' },
                  { value: 'High', label: 'High (Dedicated window latency)' },
                ]}
                onChange={(val) => updateSub('os', 'komorebi_priority', val)}
                disabled={disabled}
              />
            </div>

            <div className="p-3.5 rounded-lg bg-background-surface/30 border border-border-inactive/30 space-y-2">
              <label className="text-xs font-semibold text-foreground-primary">YASB Process Priority</label>
              <p className="text-[10px] text-foreground-muted">Status bar background priority</p>
              <Select
                value={profile.os.yasb_priority}
                options={[
                  { value: 'Idle', label: 'Idle (Low power impact)' },
                  { value: 'BelowNormal', label: 'Below Normal (Background safe)' },
                  { value: 'Normal', label: 'Normal (Standard scheduler)' },
                ]}
                onChange={(val) => updateSub('os', 'yasb_priority', val)}
                disabled={disabled}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
