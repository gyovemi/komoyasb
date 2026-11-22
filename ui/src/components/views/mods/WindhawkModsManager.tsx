import * as React from 'react';
import type { WindhawkModStatus } from '@/types/ipc';
import { modsApi, systemApi } from '@/lib/ipc';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ModSourceViewer } from './ModSourceViewer';
import {
  Layers,
  Code2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

const FALLBACK_MODS: WindhawkModStatus[] = [
  {
    id: 'taskbar-autohide',
    name: 'Taskbar Auto-Hide & Work Area Enforcer',
    description: 'Forces Windows 11 taskbar to auto-hide or completely yield work area to YASB Reborn and Komorebi',
    sourceFile: 'taskbar-autohide.wh.cpp',
    isLoaded: true,
  },
  {
    id: 'dwm-mica-effects',
    name: 'DWM Mica & Acrylic Backing Enforcer',
    description: 'Injects Mica / Acrylic backdrop effects and harmonized border colors across application windows',
    sourceFile: 'dwm-mica-effects.wh.cpp',
    isLoaded: true,
  },
  {
    id: 'notification-styling',
    name: 'Modern Notification & Flyout Styling',
    description: 'Customizes Windows 11 notification banners, action center flyouts, and toast geometry',
    sourceFile: 'notification-styling.wh.cpp',
    isLoaded: false,
  },
];

/**
 * Management workbench for Windhawk desktop modification modules.
 *
 * Coordinates live injection status, mod toggles, and source code inspection
 * for C++ hooks governing taskbar suppression, DWM Mica styling, and notifications.
 *
 * @returns Windhawk mods management card grid.
 */
export const WindhawkModsManager: React.FC = () => {
  const [modsList, setModsList] = React.useState<WindhawkModStatus[]>(FALLBACK_MODS);
  const [isLoadingMods, setIsLoadingMods] = React.useState<boolean>(false);
  const [isRootless, setIsRootless] = React.useState<boolean>(false);
  const [togglingModId, setTogglingModId] = React.useState<string | null>(null);
  const [activeSourceModId, setActiveSourceModId] = React.useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = React.useState<boolean>(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const fetchMods = React.useCallback(async () => {
    setIsLoadingMods(true);
    setErrorMessage(null);
    try {
      const queriedMods = await modsApi.getWindhawkMods();
      if (queriedMods && queriedMods.length > 0) {
        setModsList(queriedMods);
      }
    } catch {
      // In sandbox/browser environment, fallback to fallback mods
      console.warn('Windhawk mods API unavailable; using default managed definitions');
    } finally {
      setIsLoadingMods(false);
    }
  }, []);

  React.useEffect(() => {
    fetchMods();
    systemApi.getPrivilegeStatus()
      .then((status) => {
        if (status && status.isRootless !== undefined) {
          setIsRootless(status.isRootless);
        }
      })
      .catch(() => {
        // Fallback
      });
  }, [fetchMods]);

  const handleToggle = async (modIdentifier: string, currentActiveStatus: boolean) => {
    const nextActiveStatus = !currentActiveStatus;
    setTogglingModId(modIdentifier);
    setErrorMessage(null);

    // Optimistic UI update
    setModsList((previousMods) =>
      previousMods.map((modRecord) => (modRecord.id === modIdentifier ? { ...modRecord, isLoaded: nextActiveStatus } : modRecord))
    );

    try {
      await modsApi.setWindhawkModState(modIdentifier, nextActiveStatus);
    } catch (toggleError: unknown) {
      // Revert on failure
      setModsList((previousMods) =>
        previousMods.map((modRecord) => (modRecord.id === modIdentifier ? { ...modRecord, isLoaded: currentActiveStatus } : modRecord))
      );
      const displayMessage = toggleError && typeof toggleError === 'object' && 'message' in toggleError
        ? String((toggleError as { message: string }).message)
        : 'Failed to update Windhawk mod state';
      setErrorMessage(displayMessage);
    } finally {
      setTogglingModId(null);
    }
  };

  const handleViewSource = (modIdentifier: string) => {
    setActiveSourceModId(modIdentifier);
    setIsViewerOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header and Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground-primary">Windhawk C++ Shell Hooks</h3>
          <p className="text-xs text-foreground-muted">
            Kernel-level and Explorer.exe hooks compiled and injected via Windhawk CLI runtime.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={fetchMods}
          disabled={isLoadingMods}
          className="h-8 gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoadingMods ? 'animate-spin' : ''}`} />
          Refresh Status
        </Button>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error">
          {errorMessage}
        </div>
      )}

      {isRootless && (
        <div className="flex items-start gap-3 rounded-lg border border-status-warning/40 bg-status-warning/10 p-4 text-xs text-status-warning">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground-primary">Rootless Mode Active (Windhawk C++ Injection Disabled)</p>
            <p className="leading-relaxed text-foreground-secondary">
              Windhawk requires administrator rights to inject hooks. In Rootless Mode, Windhawk mods are disabled and native HKCU StuckRects3 taskbar auto-hide fallback is active.
            </p>
          </div>
        </div>
      )}

      {/* Mods Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {modsList.map((modRecord) => {
          const isToggling = togglingModId === modRecord.id;

          return (
            <div
              key={modRecord.id}
              className={`flex flex-col justify-between rounded-xl border p-5 transition-all ${
                modRecord.isLoaded && !isRootless
                  ? 'border-accent/40 bg-background-surface/50 shadow-sm'
                  : 'border-border-inactive bg-background-surface/20'
              }`}
            >
              <div>
                {/* Status Badge & Switch */}
                <div className="flex items-center justify-between pb-3 border-b border-border-inactive/30">
                  {isRootless ? (
                    <div
                      title="Rootless mode active: Windhawk requires administrator rights. Native HKCU StuckRects3 taskbar auto-hide fallback is active."
                      className="inline-flex"
                    >
                      <Badge
                        variant="warning"
                        className="flex items-center gap-1 text-[11px] bg-status-warning/15 text-status-warning border border-status-warning/30 cursor-help"
                      >
                        <ShieldAlert className="h-3 w-3" />
                        Admin Required (Windhawk Disabled)
                      </Badge>
                    </div>
                  ) : (
                    <Badge
                      variant={modRecord.isLoaded ? 'success' : 'secondary'}
                      className="flex items-center gap-1 text-[11px]"
                    >
                      {modRecord.isLoaded ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          Injected
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3" />
                          Disabled
                        </>
                      )}
                    </Badge>
                  )}

                  <div className="flex items-center gap-2">
                    {isToggling && <RefreshCw className="h-3 w-3 animate-spin text-accent" />}
                    <Switch
                      checked={isRootless ? false : modRecord.isLoaded}
                      onChange={() => handleToggle(modRecord.id, modRecord.isLoaded)}
                      disabled={isToggling || isRootless}
                    />
                  </div>
                </div>

                {/* Mod Meta */}
                <div className="pt-3">
                  <h4 className="text-sm font-semibold text-foreground-primary">{modRecord.name}</h4>
                  <p className="mt-1 text-xs text-foreground-muted leading-relaxed line-clamp-3">
                    {modRecord.description}
                  </p>
                </div>
              </div>

              {/* Source & Details Footer */}
              <div className="mt-4 pt-3 border-t border-border-inactive/30 flex items-center justify-between text-xs">
                <span className="font-mono text-[10px] text-foreground-muted">
                  {modRecord.sourceFile}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleViewSource(modRecord.id)}
                  className="h-7 px-2 text-xs text-accent hover:text-accent/80 gap-1 cursor-pointer"
                >
                  <Code2 className="h-3.5 w-3.5" />
                  View Source
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Notice */}
      <div className="flex items-start gap-3 rounded-lg border border-border-inactive/60 bg-background-secondary/40 p-4 text-xs text-foreground-muted">
        <ShieldCheck className="h-5 w-5 text-accent shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-foreground-primary">Safe Windhawk CLI Orchestration</p>
          <p className="leading-relaxed">
            All mods are compiled locally from pure C++ templates and loaded via standard Windhawk CLI commands.
            Disabling a mod cleanly unloads hooks from explorer.exe without requiring full shell restarts.
          </p>
        </div>
      </div>

      {/* Source Viewer Modal */}
      <ModSourceViewer
        modId={activeSourceModId}
        isOpen={isViewerOpen}
        onClose={() => {
          setIsViewerOpen(false);
          setActiveSourceModId(null);
        }}
      />
    </div>
  );
};
