/**
 * @fileoverview Main Application component for the Komoyasb desktop control center.
 *
 * Coordinates top-level view tabs, active theme synchronization, sandbox status,
 * titlebar drag regions, and status footer actions.
 */

import * as React from 'react';
import type {
  UnifiedTheme,
  ThemeSummary,
  SandboxInfo,
  PrivilegeStatus,
} from './types/ipc';
import { Titlebar } from './components/shell/Titlebar';
import { Navigation, type NavigationTab } from './components/shell/Navigation';
import { StatusBar } from './components/shell/StatusBar';
import { FirstRunBanner } from './components/shell/FirstRunBanner';
import { ThemeStudioView } from './components/views/theme/ThemeStudioView';
import { TilingView } from './components/views/tiling/TilingView';
import { StatusBarView } from './components/views/statusbar/StatusBarView';
import { ModsView } from './components/views/mods/ModsView';
import { PerformanceView } from './components/views/performance/PerformanceView';
import { ServicesView } from './components/views/services/ServicesView';
import { useToast } from './components/ui/toast';
import { ErrorBoundary } from './components/ui/error-boundary';
import { Dialog } from './components/ui/dialog';
import { Button } from './components/ui/button';
import { AlertCircle } from 'lucide-react';
import { themeApi, systemApi } from './lib/ipc';

const DEFAULT_THEME: UnifiedTheme = {
  name: 'dark',
  variant: 'dark',
  colors: {
    bg_primary: '#0f141c',
    bg_secondary: '#1a202c',
    bg_surface: '#232b3b',
    fg_primary: '#f8fafc',
    fg_secondary: '#cbd5e1',
    fg_muted: '#64748b',
    accent: '#38bdf8',
    accent_secondary: '#818cf8',
    border_active: '#38bdf8',
    border_inactive: '#334155',
    error: '#f43f5e',
    warning: '#f59e0b',
    success: '#10b981',
    info: '#0ea5e9',
  },
  typography: {
    font_family: 'Segoe UI Variable Text',
    font_size_sm: '10pt',
    font_size_md: '11pt',
    font_size_lg: '13pt',
  },
  geometry: {
    border_width: 2,
    border_radius: 8,
    window_gap: 8,
    bar_height: 32,
  },
  opacity: {
    bar: 0.9,
    window_unfocused: 0.85,
    flyout: 0.95,
    launcher: 0.95,
  },
  wallpaper: {
    path: '',
    style: 'Fill',
  },
};

/**
 * Root Application shell component.
 *
 * Manages active navigation tabs, theme state hydration via Tauri IPC,
 * CSS custom property bindings on document root, and global alerts.
 *
 * @returns Root application component.
 */
export function App() {
  const [activeTab, setActiveTab] = React.useState<NavigationTab>('theme');
  const [theme, setTheme] = React.useState<UnifiedTheme>(DEFAULT_THEME);
  const [themeSummaries, setThemeSummaries] = React.useState<ThemeSummary[]>([
    { name: 'dark', variant: 'dark', path: 'themes/dark.json', isActive: true },
    { name: 'light', variant: 'light', path: 'themes/light.json', isActive: false },
  ]);
  const [sandboxInfo, setSandboxInfo] = React.useState<SandboxInfo>({
    isSandboxed: false,
    sandboxPath: null,
    liveWorkingDir: '',
  });
  const [privilegeStatus, setPrivilegeStatus] = React.useState<PrivilegeStatus>({
    isElevated: true,
    isRootless: false,
  });
  const [isDirty, setIsDirty] = React.useState(false);
  const [isApplying, setIsApplying] = React.useState(false);
  const [lastSyncTime, setLastSyncTime] = React.useState<string | null>(null);
  const [pendingTab, setPendingTab] = React.useState<NavigationTab | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = React.useState(false);

  const { toast } = useToast();

  // Load initial state
  React.useEffect(() => {
    async function init() {
      try {
        const sandbox = await systemApi.getSandboxState();
        setSandboxInfo(sandbox);
      } catch {
        // Tauri not ready or running in browser
      }

      try {
        const priv = await systemApi.getPrivilegeStatus();
        setPrivilegeStatus(priv);
      } catch {
        // Fallback to default privilege
      }

      try {
        const summaries = await themeApi.getThemes();
        if (summaries && summaries.length > 0) {
          setThemeSummaries(summaries);
        }
        const activeName = await themeApi.getActiveThemeName();
        if (activeName) {
          const loaded = await themeApi.loadTheme(activeName);
          setTheme(loaded);
        }
      } catch {
        // Fallback to defaults
      }
    }

    init();
  }, []);

  // Update root CSS custom properties when theme colors change
  React.useEffect(() => {
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([colorKey, colorHexValue]) => {
      root.style.setProperty(`--color-${colorKey.replace(/_/g, '-')}`, colorHexValue);
    });
    root.style.setProperty('--radius', `${theme.geometry.border_radius}px`);
  }, [theme]);

  const handleThemeChange = (newTheme: UnifiedTheme) => {
    setTheme(newTheme);
    setIsDirty(true);
  };

  const handleLoadTheme = async (themeName: string) => {
    try {
      const loaded = await themeApi.loadTheme(themeName);
      setTheme(loaded);
      setIsDirty(false);
      toast({
        type: 'info',
        title: 'Theme Loaded',
        message: `Switched to preset "${themeName}".`,
      });
    } catch (loadError: unknown) {
      toast({
        type: 'error',
        title: 'Load Failed',
        message: (loadError as Error).message || 'Failed to load theme preset.',
      });
    }
  };

  const handleSaveTheme = async (targetThemeToSave: UnifiedTheme) => {
    try {
      await themeApi.saveTheme(targetThemeToSave);
      setIsDirty(false);
      // Refresh summaries
      const summaries = await themeApi.getThemes();
      setThemeSummaries(summaries);
      toast({
        type: 'success',
        title: 'Theme Saved',
        message: `Preset "${targetThemeToSave.name}" successfully saved.`,
      });
    } catch (saveError: unknown) {
      toast({
        type: 'error',
        title: 'Save Failed',
        message: (saveError as Error).message || 'Failed to write theme configuration.',
      });
    }
  };

  const handleActivateTheme = async (themeNameToActivate: string) => {
    try {
      await themeApi.setActiveTheme(themeNameToActivate);
      const summaries = await themeApi.getThemes();
      setThemeSummaries(summaries);
      toast({
        type: 'success',
        title: 'Active Preset Set',
        message: `"${themeNameToActivate}" is now the active system theme.`,
      });
    } catch (activationError: unknown) {
      toast({
        type: 'error',
        title: 'Activation Failed',
        message: (activationError as Error).message || 'Could not set active theme.',
      });
    }
  };

  const handleApplyAndSync = async (isDryRun: boolean) => {
    setIsApplying(true);
    try {
      const result = await systemApi.applySyncTheme(isDryRun);
      if (result.success) {
        setIsDirty(false);
        setLastSyncTime(new Date().toLocaleTimeString());
        toast({
          type: 'success',
          title: isDryRun ? 'Dry-Run Validated' : 'Theme Applied & Synced',
          message: isDryRun
            ? 'Validation clean! All templates parsed without conflict.'
            : `Theme rendered to ${result.renderedFiles.length} files. Services reloaded: ${result.reloadedServices.join(', ') || 'None'}.`,
        });
      } else {
        toast({
          type: 'error',
          title: 'Sync Encountered Issues',
          message: result.outputLog || 'Failed to compile or reload services.',
        });
      }
    } catch (syncError: unknown) {
      toast({
        type: 'error',
        title: 'Apply Failed',
        message: (syncError as Error).message || 'Error executing theme synchronization.',
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleTabChange = (nextTab: NavigationTab) => {
    if (nextTab === activeTab) return;
    if (isDirty) {
      setPendingTab(nextTab);
      setShowUnsavedDialog(true);
      return;
    }
    setActiveTab(nextTab);
  };

  const handleConfirmDiscard = () => {
    if (pendingTab) {
      setActiveTab(pendingTab);
      setIsDirty(false);
      setPendingTab(null);
    }
    setShowUnsavedDialog(false);
  };

  const handleCancelDiscard = () => {
    setPendingTab(null);
    setShowUnsavedDialog(false);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background-primary text-foreground-primary">
      {/* Windows 11 Titlebar */}
      <Titlebar
        isSandboxed={sandboxInfo.isSandboxed}
        sandboxPath={sandboxInfo.sandboxPath}
        isRootless={privilegeStatus.isRootless}
      />

      {/* First-Run Desktop Stack Provisioning Banner */}
      <FirstRunBanner />

      {/* Main Body with Sidebar Navigation */}
      <div className="flex flex-1 overflow-hidden">
        <Navigation activeTab={activeTab} onTabChange={handleTabChange} />

        <main className="flex-1 overflow-y-auto bg-background-primary">
          {activeTab === 'theme' && (
            <ErrorBoundary viewName="Theme Studio">
              <ThemeStudioView
                theme={theme}
                themeSummaries={themeSummaries}
                onThemeChange={handleThemeChange}
                onLoadTheme={handleLoadTheme}
                onSaveTheme={handleSaveTheme}
                onActivateTheme={handleActivateTheme}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'tiling' && (
            <ErrorBoundary viewName="Tiling & Hotkeys">
              <TilingView />
            </ErrorBoundary>
          )}

          {activeTab === 'statusbar' && (
            <ErrorBoundary viewName="Status Bar & OSD">
              <StatusBarView />
            </ErrorBoundary>
          )}

          {activeTab === 'mods' && (
            <ErrorBoundary viewName="Mods & Shell Extensions">
              <ModsView />
            </ErrorBoundary>
          )}

          {activeTab === 'performance' && (
            <ErrorBoundary viewName="Performance Optimizer">
              <PerformanceView />
            </ErrorBoundary>
          )}

          {activeTab === 'services' && (
            <ErrorBoundary viewName="Services & Backups">
              <ServicesView />
            </ErrorBoundary>
          )}
        </main>
      </div>

      {/* Global Status Bar */}
      <StatusBar
        isDirty={isDirty}
        isSandboxed={sandboxInfo.isSandboxed}
        isApplying={isApplying}
        onApplyAndSync={handleApplyAndSync}
        lastSyncTime={lastSyncTime}
      />

      {/* Unsaved Changes Confirmation Modal */}
      <Dialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        title={
          <div className="flex items-center gap-2 text-status-warning">
            <AlertCircle className="w-5 h-5 text-status-warning" />
            <span>Unsaved Changes</span>
          </div>
        }
        description="You have unsaved modifications in the active theme. Are you sure you want to discard them and leave this view?"
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-foreground-secondary leading-relaxed">
            Unsaved changes will be discarded if you navigate to another view without saving or applying.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelDiscard}
              className="text-xs cursor-pointer"
            >
              Stay on Tab
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDiscard}
              className="text-xs cursor-pointer"
            >
              Discard & Switch
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default App;
