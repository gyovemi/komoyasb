import * as React from 'react';
import type { SandboxInfo } from '@/types/ipc';
import { systemApi } from '@/lib/ipc';
import { AlertTriangle, FolderGit2, ShieldAlert } from 'lucide-react';

/**
 * Visual warning banner rendered when the application runs within an isolated test sandbox.
 *
 * Informs the user that modifications, file writes, and process recycling actions
 * are diverted to a virtual sandbox path rather than modifying host files.
 *
 * @returns Sandbox alert banner or null when running in live mode.
 */
export const SandboxToggleBanner: React.FC = () => {
  const [sandboxInfo, setSandboxInfo] = React.useState<SandboxInfo | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    systemApi
      .getSandboxState()
      .then((retrievedInfo) => {
        if (isMounted) setSandboxInfo(retrievedInfo);
      })
      .catch(() => {
        // Fallback / ignore when backend isn't ready
      });
    return () => {
      isMounted = false;
    };
  }, []);

  if (!sandboxInfo?.isSandboxed) {
    return null;
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-status-warning/40 bg-status-warning/10 p-4 text-xs text-foreground-primary">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-status-warning/20 text-status-warning">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-status-warning tracking-wide uppercase text-[11px]">
              Sandbox Mode Active (UI_SANDBOX_DIR)
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-status-warning/20 px-1.5 py-0.5 text-[10px] font-mono text-status-warning">
              <AlertTriangle className="h-3 w-3" /> Isolated Environment
            </span>
          </div>
          <p className="text-foreground-secondary leading-relaxed">
            All writes, configuration edits, backups, and process controls are isolated within the sandbox directory.
            Your host Windows environment will not be modified.
          </p>
          <div className="flex items-center gap-1.5 pt-1 font-mono text-[11px] text-foreground-muted">
            <FolderGit2 className="h-3.5 w-3.5 text-status-warning" />
            <span className="truncate max-w-xl">{sandboxInfo.sandboxPath || 'Isolated virtual directory'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
