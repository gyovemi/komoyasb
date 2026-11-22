import * as React from 'react';
import type {
  KomorebiConfig,
  ApplicationRule,
  HotkeyBinding,
  AppError,
} from '@/types/ipc';
import { tilingApi } from '@/lib/ipc';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { KomorebiGeometryEditor } from './KomorebiGeometryEditor';
import { WorkspaceListEditor } from './WorkspaceListEditor';
import { FloatRulesTable } from './FloatRulesTable';
import { ShortcutRecorder } from './ShortcutRecorder';
import {
  Layout,
  Sliders,
  Monitor,
  Layers,
  Keyboard,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

/**
 * Top-level Komorebi tiling and WHKD hotkey workbench view.
 *
 * Coordinates multi-tab sub-editors for Komorebi padding and geometry, virtual workspace layouts,
 * application floating override rules (`applications.yaml`), and keyboard shortcuts (`.whkdrc`).
 *
 * @returns Tiling & WHKD workbench panel.
 */
export const TilingView: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState<string>('geometry');

  // Loading & error states
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  // Dirty state tracking
  const [isDirty, setIsDirty] = React.useState(false);

  // Working data copies
  const [komorebiConfig, setKomorebiConfig] = React.useState<KomorebiConfig>({
    cross_monitor_move_behaviour: 'Insert',
    default_workspace_padding: 8,
    default_container_padding: 8,
    border: true,
    border_width: 2,
    border_offset: -1,
    border_style: 'Rounded',
    border_colours: {
      single: '#7aa2f7',
      stack: '#bb9af7',
      monocle: '#7aa2f7',
      unfocused: '#292e42',
      floating: '#bb9af7',
    },
    mouse_follows_focus: false,
    focus_follows_mouse: 'Komorebi',
    transparency: false,
    transparency_alpha: 0.85,
    window_hiding_behaviour: 'Cloak',
    workspaces_per_monitor: true,
    monitors: [
      {
        workspaces: [
          { name: '1:dev', layout: 'BSP' },
          { name: '2:web', layout: 'BSP' },
          { name: '3:chat', layout: 'Columns' },
          { name: '4:code', layout: 'BSP' },
        ],
      },
    ],
  });

  const [floatRules, setFloatRules] = React.useState<ApplicationRule[]>([]);
  const [hotkeys, setHotkeys] = React.useState<HotkeyBinding[]>([]);

  // Initial load
  const loadAll = React.useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [loadedConfig, loadedRules, loadedHotkeys] = await Promise.all([
        tilingApi.loadKomorebiConfig().catch((err: AppError) => {
          console.warn('Failed loading komorebi config via IPC:', err);
          return null;
        }),
        tilingApi.loadFloatRules().catch((err: AppError) => {
          console.warn('Failed loading float rules via IPC:', err);
          return null;
        }),
        tilingApi.loadHotkeys().catch((err: AppError) => {
          console.warn('Failed loading hotkeys via IPC:', err);
          return null;
        }),
      ]);

      if (loadedConfig) setKomorebiConfig(loadedConfig);
      if (loadedRules) setFloatRules(loadedRules);
      if (loadedHotkeys) setHotkeys(loadedHotkeys);

      setIsDirty(false);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load tiling and hotkey configurations.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Save handler
  const handleSaveAll = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      await Promise.all([
        tilingApi.saveKomorebiConfig(komorebiConfig),
        tilingApi.saveFloatRules(floatRules),
        tilingApi.saveHotkeys(hotkeys),
      ]);

      setIsDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      const appErr = err as AppError;
      setErrorMessage(
        appErr?.message || 'Error occurred while saving configurations to disk.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfigChange = (updated: KomorebiConfig) => {
    setKomorebiConfig(updated);
    setIsDirty(true);
  };

  const handleMonitorsChange = (updatedMonitors: KomorebiConfig['monitors']) => {
    setKomorebiConfig((prev) => ({
      ...prev,
      monitors: updatedMonitors,
    }));
    setIsDirty(true);
  };

  const handleFloatRulesChange = (updatedRules: ApplicationRule[]) => {
    setFloatRules(updatedRules);
    setIsDirty(true);
  };

  const handleHotkeysChange = (updatedHotkeys: HotkeyBinding[]) => {
    setHotkeys(updatedHotkeys);
    setIsDirty(true);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-foreground-muted">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <span className="text-xs">Loading Komorebi & Keybind configurations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-inactive/30 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Layout className="h-5 w-5 text-accent" />
            <h1 className="text-lg font-bold tracking-tight text-foreground-primary">
              Tiling & Hotkey Center
            </h1>
            {isDirty && (
              <Badge variant="warning" className="text-[10px] animate-pulse">
                Unsaved Changes
              </Badge>
            )}
          </div>
          <p className="text-xs text-foreground-muted mt-1">
            Manage Komorebi window manager layout geometry, workspace rules, application overrides, and whkd hotkeys.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAll}
            disabled={isSaving}
            className="flex items-center gap-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleSaveAll}
            disabled={isSaving || !isDirty}
            className="flex items-center gap-1.5 text-xs shadow-md"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Notifications / Feedback */}
      {errorMessage && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-status-error/40 bg-status-error/10 text-status-error text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-status-success/40 bg-status-success/10 text-status-success text-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Configurations successfully saved! Reload Komorebi & whkd to apply.</span>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-11 p-1 bg-background-surface/60 border border-border-inactive/30 rounded-xl mb-6">
          <TabsTrigger value="geometry" className="flex items-center gap-2 text-xs">
            <Sliders className="h-3.5 w-3.5" />
            <span>Geometry & Borders</span>
          </TabsTrigger>
          <TabsTrigger value="workspaces" className="flex items-center gap-2 text-xs">
            <Monitor className="h-3.5 w-3.5" />
            <span>Workspaces & Displays</span>
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex items-center gap-2 text-xs">
            <Layers className="h-3.5 w-3.5" />
            <span>Float Rules ({floatRules.length})</span>
          </TabsTrigger>
          <TabsTrigger value="shortcuts" className="flex items-center gap-2 text-xs">
            <Keyboard className="h-3.5 w-3.5" />
            <span>Hotkeys ({hotkeys.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Layout & Geometry */}
        <TabsContent value="geometry">
          <KomorebiGeometryEditor
            config={komorebiConfig}
            onChange={handleConfigChange}
          />
        </TabsContent>

        {/* Tab 2: Workspaces & Monitors */}
        <TabsContent value="workspaces">
          <WorkspaceListEditor
            monitors={komorebiConfig.monitors || []}
            onChange={handleMonitorsChange}
          />
        </TabsContent>

        {/* Tab 3: Application Float Rules */}
        <TabsContent value="rules">
          <FloatRulesTable
            rules={floatRules}
            onChange={handleFloatRulesChange}
          />
        </TabsContent>

        {/* Tab 4: Hotkey Shortcuts */}
        <TabsContent value="shortcuts">
          <ShortcutRecorder
            hotkeys={hotkeys}
            onChange={handleHotkeysChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
