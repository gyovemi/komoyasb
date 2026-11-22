import * as React from 'react';
import { performanceApi } from '@/lib/ipc';
import type { PerformanceConfig, PerformancePreset, PerformanceProfile } from '@/types/ipc';
import { PresetCards } from './PresetCards';
import { GranularControls } from './GranularControls';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import {
  Gauge,
  Play,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertTriangle,
  Zap,
  SlidersHorizontal,
} from 'lucide-react';

const FALLBACK_CONFIG: PerformanceConfig = {
  active_profile: 'balanced',
  profiles: {
    'ultra-low': {
      komorebi: {
        animation_enabled: false,
        animation_duration_ms: 0,
        animation_fps: 30,
        border_enabled: false,
        border_width: 1,
        border_offset: 0,
        border_style: 'square',
        border_implementation: 'Windows',
        unmanaged_window_operation_behaviour: 'NoOp',
        transparency_enabled: false,
        window_hiding_behaviour: 'Minimize',
      },
      yasb: {
        blur_enabled: false,
        acrylic_enabled: false,
        round_corners: false,
        animation_duration_ms: 0,
        cpu_interval_ms: 10000,
        memory_interval_ms: 15000,
        traffic_interval_ms: 10000,
        media_interval_ms: 5000,
        clock_interval_ms: 5000,
        gpu_interval_ms: 30000,
      },
      dwm: {
        backdrop_type: 1,
        force_dark_mode: true,
        rounded_corners: 1,
        reduce_motion: true,
        taskbar_autohide_enabled: false,
      },
      launcher: {
        use_animation: false,
        animation_speed: 'Fast',
        search_window_effect: 'None',
        shadow_effect: false,
        max_results: 5,
        plugin_cache_max: 50,
      },
      flyout: {
        backdrop: 'None',
        animate_show: false,
        animate_hide: false,
        animation_duration_ms: 0,
        timeout_ms: 2000,
      },
      os: {
        background_eco_qos: true,
        komorebi_priority: 'Normal',
        yasb_priority: 'BelowNormal',
        disable_windows_animations: true,
      },
    },
    balanced: {
      komorebi: {
        animation_enabled: true,
        animation_duration_ms: 150,
        animation_fps: 60,
        border_enabled: true,
        border_width: 2,
        border_offset: 0,
        border_style: 'rounded',
        border_implementation: 'Komorebi',
        unmanaged_window_operation_behaviour: 'Op',
        transparency_enabled: false,
        window_hiding_behaviour: 'Cloak',
      },
      yasb: {
        blur_enabled: true,
        acrylic_enabled: false,
        round_corners: true,
        animation_duration_ms: 150,
        cpu_interval_ms: 2000,
        memory_interval_ms: 4000,
        traffic_interval_ms: 2000,
        media_interval_ms: 1000,
        clock_interval_ms: 1000,
        gpu_interval_ms: 5000,
      },
      dwm: {
        backdrop_type: 2,
        force_dark_mode: true,
        rounded_corners: 2,
        reduce_motion: false,
        taskbar_autohide_enabled: true,
      },
      launcher: {
        use_animation: true,
        animation_speed: 'Medium',
        search_window_effect: 'Mica',
        shadow_effect: true,
        max_results: 8,
        plugin_cache_max: 100,
      },
      flyout: {
        backdrop: 'Mica',
        animate_show: true,
        animate_hide: true,
        animation_duration_ms: 150,
        timeout_ms: 3000,
      },
      os: {
        background_eco_qos: false,
        komorebi_priority: 'Normal',
        yasb_priority: 'Normal',
        disable_windows_animations: false,
      },
    },
    'visual-rich': {
      komorebi: {
        animation_enabled: true,
        animation_duration_ms: 200,
        animation_fps: 120,
        border_enabled: true,
        border_width: 3,
        border_offset: -1,
        border_style: 'rounded',
        border_implementation: 'Komorebi',
        unmanaged_window_operation_behaviour: 'Op',
        transparency_enabled: true,
        window_hiding_behaviour: 'Cloak',
      },
      yasb: {
        blur_enabled: true,
        acrylic_enabled: true,
        round_corners: true,
        animation_duration_ms: 200,
        cpu_interval_ms: 1000,
        memory_interval_ms: 2000,
        traffic_interval_ms: 1000,
        media_interval_ms: 500,
        clock_interval_ms: 1000,
        gpu_interval_ms: 2000,
      },
      dwm: {
        backdrop_type: 3,
        force_dark_mode: true,
        rounded_corners: 2,
        reduce_motion: false,
        taskbar_autohide_enabled: true,
      },
      launcher: {
        use_animation: true,
        animation_speed: 'Slow',
        search_window_effect: 'Acrylic',
        shadow_effect: true,
        max_results: 12,
        plugin_cache_max: 200,
      },
      flyout: {
        backdrop: 'Acrylic',
        animate_show: true,
        animate_hide: true,
        animation_duration_ms: 200,
        timeout_ms: 4000,
      },
      os: {
        background_eco_qos: false,
        komorebi_priority: 'AboveNormal',
        yasb_priority: 'Normal',
        disable_windows_animations: false,
      },
    },
    gaming: {
      komorebi: {
        animation_enabled: false,
        animation_duration_ms: 0,
        animation_fps: 60,
        border_enabled: true,
        border_width: 2,
        border_offset: 0,
        border_style: 'square',
        border_implementation: 'Windows',
        unmanaged_window_operation_behaviour: 'NoOp',
        transparency_enabled: false,
        window_hiding_behaviour: 'Minimize',
      },
      yasb: {
        blur_enabled: false,
        acrylic_enabled: false,
        round_corners: false,
        animation_duration_ms: 0,
        cpu_interval_ms: 30000,
        memory_interval_ms: 30000,
        traffic_interval_ms: 30000,
        media_interval_ms: 30000,
        clock_interval_ms: 10000,
        gpu_interval_ms: 60000,
      },
      dwm: {
        backdrop_type: 1,
        force_dark_mode: true,
        rounded_corners: 1,
        reduce_motion: true,
        taskbar_autohide_enabled: false,
      },
      launcher: {
        use_animation: false,
        animation_speed: 'Fast',
        search_window_effect: 'None',
        shadow_effect: false,
        max_results: 5,
        plugin_cache_max: 50,
      },
      flyout: {
        backdrop: 'None',
        animate_show: false,
        animate_hide: false,
        animation_duration_ms: 0,
        timeout_ms: 1500,
      },
      os: {
        background_eco_qos: false,
        komorebi_priority: 'High',
        yasb_priority: 'Idle',
        disable_windows_animations: true,
      },
    },
  },
};

/**
 * Top-level view workbench for hardware optimization profiles and granular performance tuning.
 *
 * Orchestrates preset selection, detailed parameter adjustments, dry-run testing,
 * and live execution via Tauri IPC commands.
 *
 * @returns Rendered performance view panel.
 */
export const PerformanceView: React.FC = () => {
  const [config, setConfig] = React.useState<PerformanceConfig>(FALLBACK_CONFIG);
  const [activeProfileKey, setActiveProfileKey] = React.useState<string>('balanced');
  const [isGranularExpanded, setIsGranularExpanded] = React.useState<boolean>(false);
  const [isApplying, setIsApplying] = React.useState<boolean>(false);
  const [lastApplyLog, setLastApplyLog] = React.useState<string | null>(null);
  const [isDirty, setIsDirty] = React.useState<boolean>(false);
  const { toast } = useToast();

  const loadConfig = React.useCallback(async () => {
    try {
      const remoteConfig = await performanceApi.getPerformanceConfig();
      if (remoteConfig && remoteConfig.profiles) {
        setConfig(remoteConfig);
        setActiveProfileKey(remoteConfig.active_profile || 'balanced');
      }
    } catch {
      // In web fallback or sandbox
    }
  }, []);

  React.useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const activeProfile = config.profiles[activeProfileKey] || config.profiles['balanced'] || FALLBACK_CONFIG.profiles.balanced;

  const handleSelectPreset = (presetIdentifier: PerformancePreset) => {
    setActiveProfileKey(presetIdentifier);
    setConfig((previousConfig) => ({
      ...previousConfig,
      active_profile: presetIdentifier,
    }));
    setIsDirty(true);
  };

  const handleGranularChange = (updatedProfile: PerformanceProfile) => {
    setConfig((previousConfig) => ({
      ...previousConfig,
      profiles: {
        ...previousConfig.profiles,
        [activeProfileKey]: updatedProfile,
      },
    }));
    setIsDirty(true);
  };

  const handleApplyProfile = async (isDryRun: boolean) => {
    setIsApplying(true);
    setLastApplyLog(null);
    try {
      if (isDirty) {
        await performanceApi.savePerformanceConfig(config);
      }
      const applyResult = await performanceApi.setPerformanceProfile(config.active_profile, isDryRun);
      setLastApplyLog(applyResult.outputLog || null);
      if (applyResult.success) {
        setIsDirty(false);
        toast({
          type: 'success',
          title: isDryRun ? 'Dry-Run Validated' : 'Performance Profile Applied',
          message: isDryRun
            ? 'Simulation completed with zero regressions.'
            : `Applied profile "${config.active_profile}". Synced ${applyResult.renderedFiles.length} files. Reloaded: ${applyResult.reloadedServices.join(', ')}.`,
        });
      } else {
        toast({
          type: 'error',
          title: 'Apply Encountered Issues',
          message: applyResult.outputLog || 'Failed to apply performance profile.',
        });
      }
    } catch (applyError: unknown) {
      toast({
        type: 'error',
        title: 'Execution Failed',
        message: (applyError as Error).message || 'Failed to execute performance script.',
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleSaveConfigOnly = async () => {
    try {
      await performanceApi.savePerformanceConfig(config);
      setIsDirty(false);
      toast({
        type: 'success',
        title: 'Configuration Saved',
        message: 'Saved performance configuration to disk.',
      });
    } catch (saveError: unknown) {
      toast({
        type: 'error',
        title: 'Save Failed',
        message: (saveError as Error).message || 'Failed to save configuration.',
      });
    }
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-inactive/40">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent/15 text-accent border border-accent/20">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground-primary">
                Performance Profiles & Resource Tuning
              </h1>
              <p className="text-xs text-foreground-muted mt-0.5">
                Dynamic presets optimizing battery, FPS, telemetry overhead, and DWM composition
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {isDirty && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveConfigOnly}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Save Changes
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            disabled={isApplying}
            onClick={() => handleApplyProfile(true)}
            className="h-8 text-xs gap-1.5 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-accent" />
            Dry-Run Test
          </Button>

          <Button
            size="sm"
            disabled={isApplying}
            onClick={() => handleApplyProfile(false)}
            className="h-8 text-xs bg-accent text-background-primary hover:bg-accent/90 font-semibold gap-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Apply & Sync Profile
          </Button>
        </div>
      </div>

      {/* Preset Cards Selection Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground-primary">
            Optimization Tiers
          </h2>
          <span className="text-xs text-foreground-muted">
            Click any tier to stage configuration
          </span>
        </div>

        <PresetCards
          activeProfile={activeProfileKey}
          onSelectProfile={handleSelectPreset}
          disabled={isApplying}
        />
      </div>

      {/* Granular Controls Toggle Header */}
      <div className="pt-2 border-t border-border-inactive/30">
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-foreground-primary">
              Fine-Grained Parameter Tuning
            </span>
            <span className="text-xs text-foreground-muted">
              ({activeProfileKey} profile)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground-muted">Expand granular settings</span>
            <Switch
              checked={isGranularExpanded}
              onChange={setIsGranularExpanded}
            />
          </div>
        </div>

        {isGranularExpanded && (
          <div className="mt-3">
            <GranularControls
              profile={activeProfile}
              onChange={handleGranularChange}
              disabled={isApplying}
            />
          </div>
        )}
      </div>

      {/* Execution Log Output */}
      {lastApplyLog && (
        <div className="space-y-2 pt-2 border-t border-border-inactive/30">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground-secondary">
            <CheckCircle2 className="w-4 h-4 text-status-success" />
            Execution Output Log
          </div>
          <pre className="bg-black/80 font-mono text-[11px] p-4 rounded-xl border border-border-inactive/40 max-h-48 overflow-y-auto text-foreground-secondary whitespace-pre-wrap select-text">
            {lastApplyLog}
          </pre>
        </div>
      )}
    </div>
  );
};
