import * as React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, ShieldAlert, Shield } from 'lucide-react';
import { Badge } from '../ui/badge';
import { systemApi } from '../../lib/ipc';

/**
 * Component properties for the customized Windows 11 Fluent `Titlebar`.
 */
export interface TitlebarProps {
  /** Indicates whether the application is currently running in an isolated test sandbox. */
  isSandboxed?: boolean;
  /** Filesystem path to the sandbox directory on disk, if active. */
  sandboxPath?: string | null;
  /** Indicates whether running in rootless (non-admin / standard user) mode. */
  isRootless?: boolean;
}

/**
 * Frameless titlebar component integrating Windows 11 window controls and sandbox status badges.
 *
 * Utilizes Tauri's `data-tauri-drag-region` attribute for OS-native window dragging
 * while maintaining responsive geometry and action button isolation.
 *
 * @param props - Sandbox state flags and path metadata.
 * @returns Rendered header element for the application window frame.
 */
export const Titlebar: React.FC<TitlebarProps> = ({ isSandboxed, sandboxPath, isRootless: propIsRootless }) => {
  const [internalIsRootless, setInternalIsRootless] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (propIsRootless === undefined) {
      systemApi.getPrivilegeStatus()
        .then((status) => {
          if (status && status.isRootless !== undefined) {
            setInternalIsRootless(status.isRootless);
          }
        })
        .catch(() => {
          // Non-tauri or fallback context
        });
    }
  }, [propIsRootless]);

  const effectiveIsRootless = propIsRootless !== undefined ? propIsRootless : internalIsRootless;
  const showRootlessBadge = effectiveIsRootless || isSandboxed;

  const handleMinimize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    } catch {
      // Browser fallback or non-tauri context
    }
  };

  const handleMaximize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
    } catch {
      // Browser fallback
    }
  };

  const handleClose = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch {
      // Browser fallback
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="h-10 w-full flex items-center justify-between px-3 bg-background-primary/80 backdrop-blur-md border-b border-border-inactive/40 select-none z-50 shrink-0"
    >
      <div className="flex items-center gap-2.5 pointer-events-none" data-tauri-drag-region>
        <div className="w-3.5 h-3.5 rounded-full bg-accent/20 border border-accent flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        </div>
        <span className="text-xs font-semibold tracking-wider uppercase text-foreground-primary">
          Komoyasb <span className="text-accent font-normal lowercase text-[11px]">control center</span>
        </span>

        {showRootlessBadge && (
          <Badge
            variant="secondary"
            className="flex items-center gap-1 py-0.5 px-2 text-[10px] uppercase font-bold tracking-wider bg-accent/15 text-accent border border-accent/30"
          >
            <Shield className="w-3 h-3 text-accent" />
            Rootless Mode
          </Badge>
        )}

        {isSandboxed && (
          <Badge
            variant="warning"
            className="flex items-center gap-1 py-0.5 px-2 text-[10px] uppercase font-bold tracking-wider"
          >
            <ShieldAlert className="w-3 h-3 text-status-warning" />
            Sandbox Active {sandboxPath ? `(${sandboxPath})` : ''}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleMinimize}
          className="h-7 w-9 flex items-center justify-center text-foreground-muted hover:text-foreground-primary hover:bg-background-surface rounded transition-colors"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          className="h-7 w-9 flex items-center justify-center text-foreground-muted hover:text-foreground-primary hover:bg-background-surface rounded transition-colors"
          title="Maximize"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="h-7 w-9 flex items-center justify-center text-foreground-muted hover:text-white hover:bg-status-error rounded transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
