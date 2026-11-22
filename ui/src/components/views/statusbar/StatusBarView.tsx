import React, { useState, useEffect } from 'react';
import {
  Sliders,
  FileCode,
  Layers,
  Volume2,
  Save,
  RotateCcw,
  Sparkles,
  Check,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { statusBarApi } from '@/lib/ipc';
import type { YasbConfig, FluentFlyoutConfig, EarTrumpetConfig } from '@/types/ipc';

import { YasbWidgetOrganizer } from './YasbWidgetOrganizer';
import { YasbCssEditor } from './YasbCssEditor';
import { FluentFlyoutEditor } from './FluentFlyoutEditor';
import { EarTrumpetSettings } from './EarTrumpetSettings';

/**
 * Top-level status bar and media OSD workbench view.
 *
 * Coordinates multi-tab sub-editors for YASB three-zone widget layouts, custom styles.css,
 * FluentFlyout hardware OSD placement, and EarTrumpet audio volume mixer settings.
 *
 * @returns Status Bar & OSD workbench component.
 */
export const StatusBarView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('yasb-layout');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Data states
  const [yasbConfig, setYasbConfig] = useState<YasbConfig | null>(null);
  const [yasbCss, setYasbCss] = useState<string>('');
  const [fluentFlyoutConfig, setFluentFlyoutConfig] = useState<FluentFlyoutConfig | null>(null);
  const [earTrumpetConfig, setEarTrumpetConfig] = useState<EarTrumpetConfig | null>(null);

  // Load all status bar configs
  const loadAll = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const [loadedYasb, loadedCss, loadedFluent, loadedEarTrumpet] = await Promise.all([
        statusBarApi.loadYasbConfig(),
        statusBarApi.loadYasbCss(),
        statusBarApi.loadFluentFlyoutConfig(),
        statusBarApi.getEarTrumpetConfig(),
      ]);

      setYasbConfig(loadedYasb);
      setYasbCss(loadedCss);
      setFluentFlyoutConfig(loadedFluent);
      setEarTrumpetConfig(loadedEarTrumpet);
      setIsDirty(false);
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err !== null && 'message' in err
          ? (err as { message: string }).message
          : 'Failed to load statusbar configuration.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveAll = async () => {
    try {
      setSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const promises: Promise<void>[] = [];

      if (yasbConfig) {
        promises.push(statusBarApi.saveYasbConfig(yasbConfig));
      }
      if (yasbCss) {
        promises.push(statusBarApi.saveYasbCss(yasbCss));
      }
      if (fluentFlyoutConfig) {
        promises.push(statusBarApi.saveFluentFlyoutConfig(fluentFlyoutConfig));
      }
      if (earTrumpetConfig) {
        promises.push(statusBarApi.setEarTrumpetConfig(earTrumpetConfig));
      }

      await Promise.all(promises);

      setSuccessMessage('Status Bar & OSD configurations saved successfully!');
      setIsDirty(false);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err !== null && 'message' in err
          ? (err as { message: string }).message
          : 'Failed to save configuration changes.';
      setErrorMessage(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] space-y-4">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-zinc-400">Loading status bar & OSD configurations...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      {/* Top Banner & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight text-white">Status Bar & Media OSD</h2>
            {isDirty && (
              <Badge variant="warning" className="text-xs">
                Unsaved Changes
              </Badge>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            YASB Reborn top bar, modular widgets, custom CSS styling, FluentFlyout animations, and EarTrumpet audio flyout.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAll}
            disabled={saving}
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Reload
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleSaveAll}
            disabled={saving || !isDirty}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            Save Configuration
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-emerald-200 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-zinc-900/80 border border-zinc-800 p-1 rounded-xl">
          <TabsTrigger value="yasb-layout" className="flex items-center gap-2 text-xs">
            <Sliders className="w-3.5 h-3.5" />
            <span>YASB Widgets & Layout</span>
          </TabsTrigger>
          <TabsTrigger value="yasb-css" className="flex items-center gap-2 text-xs">
            <FileCode className="w-3.5 h-3.5" />
            <span>Custom CSS (styles.css)</span>
          </TabsTrigger>
          <TabsTrigger value="fluent-flyout" className="flex items-center gap-2 text-xs">
            <Layers className="w-3.5 h-3.5" />
            <span>FluentFlyout OSD</span>
          </TabsTrigger>
          <TabsTrigger value="eartrumpet" className="flex items-center gap-2 text-xs">
            <Volume2 className="w-3.5 h-3.5" />
            <span>EarTrumpet Audio</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: YASB Widget Organizer */}
        <TabsContent value="yasb-layout" className="outline-none">
          {yasbConfig ? (
            <YasbWidgetOrganizer
              config={yasbConfig}
              onChange={(updated) => {
                setYasbConfig(updated);
                setIsDirty(true);
              }}
            />
          ) : (
            <div className="p-8 text-center text-zinc-500 text-sm">
              No YASB bar configuration loaded.
            </div>
          )}
        </TabsContent>

        {/* Tab 2: YASB CSS Editor */}
        <TabsContent value="yasb-css" className="outline-none">
          <YasbCssEditor
            css={yasbCss}
            onChange={(newCss) => {
              setYasbCss(newCss);
              setIsDirty(true);
            }}
          />
        </TabsContent>

        {/* Tab 3: FluentFlyout Editor */}
        <TabsContent value="fluent-flyout" className="outline-none">
          {fluentFlyoutConfig ? (
            <FluentFlyoutEditor
              config={fluentFlyoutConfig}
              onChange={(newConfig) => {
                setFluentFlyoutConfig(newConfig);
                setIsDirty(true);
              }}
            />
          ) : (
            <div className="p-8 text-center text-zinc-500 text-sm">
              No FluentFlyout configuration loaded.
            </div>
          )}
        </TabsContent>

        {/* Tab 4: EarTrumpet Settings */}
        <TabsContent value="eartrumpet" className="outline-none">
          {earTrumpetConfig ? (
            <EarTrumpetSettings
              config={earTrumpetConfig}
              onChange={(newConfig) => {
                setEarTrumpetConfig(newConfig);
                setIsDirty(true);
              }}
            />
          ) : (
            <div className="p-8 text-center text-zinc-500 text-sm">
              No EarTrumpet configuration loaded.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
export default StatusBarView;
