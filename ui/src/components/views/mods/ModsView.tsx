import * as React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FlowLauncherConfig } from './FlowLauncherConfig';
import { WindhawkModsManager } from './WindhawkModsManager';
import { Command, Layers, Sparkles } from 'lucide-react';

/**
 * Top-level view container managing Flow Launcher configuration and Windhawk shell mods.
 *
 * Combines rapid application launcher settings with low-level Windows Explorer
 * hook injection management under unified tabbed navigation.
 *
 * @returns Mods & Launcher workbench view.
 */
export const ModsView: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      <div className="rounded-xl border border-border-inactive bg-gradient-to-r from-background-surface/80 via-background-surface/40 to-background-primary p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 border border-accent/20 text-accent">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground-primary">
              Launcher & Windhawk Shell Mods
            </h2>
            <p className="text-xs text-foreground-muted mt-0.5">
              Customize Flow Launcher geometry & hotkeys, and orchestrate low-level Windhawk C++ mods for seamless desktop shell integration.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="flow">
        <TabsList className="mb-6">
          <TabsTrigger value="flow" className="flex items-center gap-2">
            <Command className="h-4 w-4" />
            <span>Flow Launcher</span>
          </TabsTrigger>
          <TabsTrigger value="windhawk" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            <span>Windhawk Mods</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flow">
          <FlowLauncherConfig />
        </TabsContent>

        <TabsContent value="windhawk">
          <WindhawkModsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ModsView;
