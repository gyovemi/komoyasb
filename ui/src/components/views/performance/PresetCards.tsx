import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { BatteryCharging, Cpu, Sparkles, Gamepad2, Check, ArrowRight } from 'lucide-react';
import type { PerformancePreset } from '@/types/ipc';

/**
 * Structural specification for a performance tier summary card.
 */
export interface PresetCardInfo {
  /** Identifier matching `PerformancePreset` tier. */
  id: PerformancePreset;
  /** Display title for the optimization tier. */
  title: string;
  /** Subtitle tagline describing typical deployment target. */
  tagline: string;
  /** High-level description of tuning rules applied by this preset. */
  description: string;
  /** Lucide icon representing the tier archetype. */
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind accent text and border classes. */
  accentColor: string;
  /** Gradient background glow applied when tier is active. */
  bgGlow: string;
  /** Benchmark metrics summary. */
  metrics: {
    cpuImpact: 'Near 0%' | 'Low (~1%)' | 'Moderate (~3%)' | 'Minimal (0.2%)';
    gpuImpact: 'None (DWM Native)' | 'Low (Mica)' | 'High (Acrylic)' | 'Zero (Bypassed)';
    pollingInterval: '5s – 15s' | '1s – 3s' | '0.5s – 2s' | '30s – 60s';
    animations: 'Disabled (0ms)' | 'Smooth 60fps' | 'Lush 120fps' | 'Disabled (0ms)';
  };
  /** Hardware or workflow recommendation. */
  recommendedFor: string;
}

export const PRESET_CARDS: PresetCardInfo[] = [
  {
    id: 'ultra-low',
    title: 'Ultra-Low',
    tagline: 'Battery Saver & Server',
    description: 'Zero animations, unmanaged window bypass, 0% DWM composition overhead, and relaxed 10–15s telemetry polling.',
    icon: BatteryCharging,
    accentColor: 'text-emerald-400 border-emerald-500/40 hover:border-emerald-500/80',
    bgGlow: 'from-emerald-500/10 to-transparent',
    metrics: {
      cpuImpact: 'Near 0%',
      gpuImpact: 'None (DWM Native)',
      pollingInterval: '5s – 15s',
      animations: 'Disabled (0ms)',
    },
    recommendedFor: 'Laptops on battery, VMs, and older CPUs',
  },
  {
    id: 'balanced',
    title: 'Balanced',
    tagline: 'Default Day-to-Day',
    description: 'Crisp 60fps animations, 150ms transitions, hardware Mica compositing, and standard 2–3s telemetry intervals.',
    icon: Cpu,
    accentColor: 'text-sky-400 border-sky-500/40 hover:border-sky-500/80',
    bgGlow: 'from-sky-500/10 to-transparent',
    metrics: {
      cpuImpact: 'Low (~1%)',
      gpuImpact: 'Low (Mica)',
      pollingInterval: '1s – 3s',
      animations: 'Smooth 60fps',
    },
    recommendedFor: 'Everyday desktop use and modern ultrabooks',
  },
  {
    id: 'visual-rich',
    title: 'Visual-Rich',
    tagline: 'Workstation & Demo',
    description: 'Silky 120fps animations, full Acrylic blur & drop shadows, 3px borders, and responsive sub-second telemetry widgets.',
    icon: Sparkles,
    accentColor: 'text-purple-400 border-purple-500/40 hover:border-purple-500/80',
    bgGlow: 'from-purple-500/10 to-transparent',
    metrics: {
      cpuImpact: 'Moderate (~3%)',
      gpuImpact: 'High (Acrylic)',
      pollingInterval: '0.5s – 2s',
      animations: 'Lush 120fps',
    },
    recommendedFor: 'High-end multi-monitor workstations and demos',
  },
  {
    id: 'gaming',
    title: 'Gaming',
    tagline: 'Max FPS & Zero Latency',
    description: 'Complete compositor pause, DWM effects disabled, DXGI telemetry suspended, and elevated Komorebi process priority.',
    icon: Gamepad2,
    accentColor: 'text-rose-400 border-rose-500/40 hover:border-rose-500/80',
    bgGlow: 'from-rose-500/10 to-transparent',
    metrics: {
      cpuImpact: 'Minimal (0.2%)',
      gpuImpact: 'Zero (Bypassed)',
      pollingInterval: '30s – 60s',
      animations: 'Disabled (0ms)',
    },
    recommendedFor: 'Esports, competitive 3D gaming, and VR workloads',
  },
];

/**
 * Component properties for the `PresetCards` selector grid.
 */
export interface PresetCardsProps {
  /** Currently active performance profile key. */
  activeProfile: string;
  /** Callback triggered when user clicks a performance preset card. */
  onSelectProfile: (selectedProfile: PerformancePreset) => void;
  /** Whether controls are disabled during active application or provisioning. */
  disabled?: boolean;
}

/**
 * Interactive performance profile preset selection cards.
 *
 * Provides visual switching between ultra-low, balanced, visual-rich,
 * and gaming optimization tiers with hardware capability metrics.
 *
 * @param props - Component properties and change handlers.
 * @returns JSX element representing the profile preset grid.
 */
export const PresetCards: React.FC<PresetCardsProps> = ({
  activeProfile,
  onSelectProfile,
  disabled = false,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {PRESET_CARDS.map((presetItem) => {
        const PresetIcon = presetItem.icon;
        const isPresetActive = activeProfile === presetItem.id;

        return (
          <div
            key={presetItem.id}
            onClick={() => !disabled && onSelectProfile(presetItem.id)}
            className={cn(
              'relative flex flex-col justify-between p-4 rounded-xl border transition-all duration-200 cursor-pointer bg-background-secondary/70 backdrop-blur select-none group',
              isPresetActive
                ? cn('ring-2 ring-accent border-accent/80 shadow-lg shadow-accent/10 bg-gradient-to-b', presetItem.bgGlow)
                : cn('border-border-inactive/60 hover:bg-background-surface/80', presetItem.accentColor),
              disabled && 'opacity-60 cursor-not-allowed pointer-events-none'
            )}
          >
            {/* Top row: Icon + Active Status Badge */}
            <div className="flex items-start justify-between mb-3">
              <div
                className={cn(
                  'p-2.5 rounded-lg border transition-transform duration-200 group-hover:scale-105',
                  isPresetActive
                    ? 'bg-accent/20 border-accent/40 text-accent'
                    : 'bg-background-surface border-border-inactive text-foreground-secondary'
                )}
              >
                <PresetIcon className="w-5 h-5" />
              </div>

              {isPresetActive ? (
                <Badge variant="success" className="gap-1 px-2.5 py-0.5 text-[11px] font-medium tracking-wide">
                  <Check className="w-3 h-3 stroke-[3]" />
                  Active
                </Badge>
              ) : (
                <span className="text-[11px] text-foreground-muted group-hover:text-foreground-secondary flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  Select <ArrowRight className="w-3 h-3" />
                </span>
              )}
            </div>

            {/* Header info */}
            <div className="mb-3">
              <h3 className="font-semibold text-base text-foreground-primary flex items-center gap-1.5">
                {presetItem.title}
              </h3>
              <p className="text-xs font-medium text-foreground-muted mt-0.5">
                {presetItem.tagline}
              </p>
              <p className="text-[11px] text-foreground-secondary/80 mt-2 line-clamp-3 leading-relaxed">
                {presetItem.description}
              </p>
            </div>

            {/* Resource Consumption Specs */}
            <div className="mt-auto pt-3 border-t border-border-inactive/30 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-foreground-muted">CPU Impact</span>
                <span className="font-mono font-medium text-foreground-primary">{presetItem.metrics.cpuImpact}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-foreground-muted">DWM / GPU</span>
                <span className="font-mono font-medium text-foreground-primary">{presetItem.metrics.gpuImpact}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-foreground-muted">Polling Rates</span>
                <span className="font-mono font-medium text-foreground-primary">{presetItem.metrics.pollingInterval}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-foreground-muted">Animations</span>
                <span className="font-mono font-medium text-foreground-primary">{presetItem.metrics.animations}</span>
              </div>
            </div>

            {/* Recommended Target Footer */}
            <div className="mt-3 pt-2 text-[10px] text-foreground-muted/90 italic border-t border-dashed border-border-inactive/20 truncate">
              Target: {presetItem.recommendedFor}
            </div>
          </div>
        );
      })}
    </div>
  );
};
