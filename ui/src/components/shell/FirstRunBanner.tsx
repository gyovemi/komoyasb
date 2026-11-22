import * as React from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  Rocket,
  DownloadCloud,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  Loader2,
  X,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { systemApi } from '@/lib/ipc';
import type { DeploymentStatus, InstallLogPayload } from '@/types/ipc';

/**
 * Component properties for the `FirstRunBanner` desktop stack installer.
 */
export interface FirstRunBannerProps {
  /** Optional callback fired when stack provisioning completes successfully. */
  onDeployed?: () => void;
}

/**
 * First-run detection notification banner and modal deployment manager.
 *
 * Verifies host environment readiness via Tauri IPC, streams live PowerShell
 * provisioning logs over Tauri events, and triggers automated setup.
 *
 * @param props - Deployment lifecycle callback.
 * @returns Banner and modal UI elements, or null if system is already provisioned.
 */
export const FirstRunBanner: React.FC<FirstRunBannerProps> = ({ onDeployed }) => {
  const [deploymentStatus, setDeploymentStatus] = React.useState<DeploymentStatus | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = React.useState(true);
  const [isOpenModal, setIsOpenModal] = React.useState(false);
  const [isProvisioningRunning, setIsProvisioningRunning] = React.useState(false);
  const [isDryRunSelected, setIsDryRunSelected] = React.useState(false);
  const [isSkipPackagesSelected, setIsSkipPackagesSelected] = React.useState(false);
  const [isNoAdminSelected, setIsNoAdminSelected] = React.useState(true);
  const [terminalLogs, setTerminalLogs] = React.useState<{ text: string; isError: boolean }[]>([]);
  const [provisionCompleted, setProvisionCompleted] = React.useState<boolean | null>(null);
  const [isDismissed, setIsDismissed] = React.useState(false);

  const logEndRef = React.useRef<HTMLDivElement>(null);
  const isProvisioningRef = React.useRef(false);

  const checkStatus = React.useCallback(async () => {
    try {
      setIsCheckingStatus(true);
      const hostStatus = await systemApi.checkDeploymentStatus();
      setDeploymentStatus(hostStatus);
    } catch {
      // In web dev or sandbox
    } finally {
      setIsCheckingStatus(false);
    }
  }, []);

  React.useEffect(() => {
    checkStatus();
    systemApi.getPrivilegeStatus()
      .then((status) => {
        if (status && status.isRootless !== undefined) {
          setIsNoAdminSelected(status.isRootless);
        }
      })
      .catch(() => {
        // Fallback to default
      });
  }, [checkStatus]);

  // Setup live log event listener from backend with unlisten race-condition guard
  React.useEffect(() => {
    let isCancelled = false;
    let unlisten: (() => void) | undefined;

    try {
      listen<InstallLogPayload>('install-log', (event) => {
        setTerminalLogs((previousLogs) => [...previousLogs, { text: event.payload.line, isError: event.payload.isError }]);
      }).then((unlistenFn) => {
        if (isCancelled) {
          unlistenFn();
        } else {
          unlisten = unlistenFn;
        }
      }).catch(() => {
        // fallback
      });
    } catch {
      // fallback
    }

    return () => {
      isCancelled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // Auto-scroll logs
  React.useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs]);

  const handleStartProvisioning = async () => {
    if (isProvisioningRef.current) return;
    isProvisioningRef.current = true;
    setIsProvisioningRunning(true);
    setTerminalLogs([]);
    setProvisionCompleted(null);

    try {
      const provisioningResult = await systemApi.runInstallProvisioning({
        dryRun: isDryRunSelected,
        skipPackages: isSkipPackagesSelected,
        noAdmin: isNoAdminSelected,
        theme: 'dark',
      });
      setProvisionCompleted(provisioningResult.success);
      if (provisioningResult.success && !isDryRunSelected) {
        checkStatus();
        if (onDeployed) onDeployed();
      }
    } catch (provisioningError: unknown) {
      const errorMessage = (provisioningError as Error).message || String(provisioningError);
      setTerminalLogs((previousLogs) => [...previousLogs, { text: `[ERROR] Execution failure: ${errorMessage}`, isError: true }]);
      setProvisionCompleted(false);
    } finally {
      setIsProvisioningRunning(false);
      isProvisioningRef.current = false;
    }
  };

  // If dismissed or checking or already deployed, don't show the banner
  if (isDismissed || isCheckingStatus || !deploymentStatus || deploymentStatus.isDeployed) {
    return null;
  }

  return (
    <>
      {/* Top Notification Banner */}
      <div className="bg-accent/15 border-b border-accent/30 px-4 py-2.5 flex items-center justify-between text-xs animate-in slide-in-from-top duration-300">
        <div className="flex items-center gap-2.5">
          <div className="p-1 rounded-md bg-accent/20 text-accent">
            <SparklesIcon className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-foreground-primary">
              Fresh Setup Detected:
            </span>{' '}
            <span className="text-foreground-secondary">
              Desktop environment configurations are not yet linked to your user profile.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setIsOpenModal(true)}
            className="h-7 text-xs bg-accent text-background-primary hover:bg-accent/90 font-semibold px-3 flex items-center gap-1.5"
          >
            <Rocket className="w-3.5 h-3.5" />
            Install & Configure Stack
          </Button>
          <button
            onClick={() => setIsDismissed(true)}
            className="p-1 text-foreground-muted hover:text-foreground-primary rounded hover:bg-background-surface/50 cursor-pointer"
            title="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Provisioning Modal with Live Log Output */}
      {isOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-background-secondary border border-border-inactive/60 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-border-inactive/30 flex items-center justify-between bg-background-surface/40">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/15 text-accent border border-accent/20">
                  <Rocket className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground-primary">
                    1-Click Desktop Stack Provisioning
                  </h3>
                  <p className="text-xs text-foreground-muted">
                    Automated installation via winget & template configuration
                  </p>
                </div>
              </div>
              {!isProvisioningRunning && (
                <button
                  onClick={() => setIsOpenModal(false)}
                  className="p-1.5 text-foreground-muted hover:text-foreground-primary rounded-lg hover:bg-background-surface transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              <div className="text-xs text-foreground-secondary leading-relaxed bg-background-primary/50 border border-border-inactive/30 p-3.5 rounded-lg space-y-1.5">
                <div className="font-semibold text-foreground-primary flex items-center gap-1.5">
                  <DownloadCloud className="w-4 h-4 text-accent" />
                  What will be configured:
                </div>
                <ul className="list-disc list-inside space-y-1 pl-1 text-foreground-muted">
                  <li>Komorebi tiling manager & WHKD hotkey daemon profiles</li>
                  <li>YASB modern top status bar widgets & Fluent styles</li>
                  <li>Flow Launcher & FluentFlyout styling templates</li>
                  <li>Detection of installed tools and winget installation of missing packages</li>
                  <li>Safe transactional backups of existing configurations</li>
                </ul>
              </div>

              {/* Toggles */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-background-surface/30 rounded-lg border border-border-inactive/30 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isNoAdminSelected}
                    onChange={(event) => setIsNoAdminSelected(event.target.checked)}
                    disabled={isProvisioningRunning}
                    className="rounded border-border-inactive bg-background-primary accent-accent"
                  />
                  <span className="text-foreground-secondary">-NoAdmin (Rootless Mode)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSkipPackagesSelected}
                    onChange={(event) => setIsSkipPackagesSelected(event.target.checked)}
                    disabled={isProvisioningRunning}
                    className="rounded border-border-inactive bg-background-primary accent-accent"
                  />
                  <span className="text-foreground-secondary">Skip winget packages</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDryRunSelected}
                    onChange={(event) => setIsDryRunSelected(event.target.checked)}
                    disabled={isProvisioningRunning}
                    className="rounded border-border-inactive bg-background-primary accent-accent"
                  />
                  <span className="text-foreground-secondary">Dry-Run Simulation</span>
                </label>
              </div>

              {/* Live Log Terminal Output */}
              {(terminalLogs.length > 0 || isProvisioningRunning) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-foreground-muted">
                    <span className="flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5" />
                      Live Provisioning Terminal Output
                    </span>
                    {isProvisioningRunning && (
                      <span className="flex items-center gap-1 text-accent animate-pulse font-mono">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Running install.ps1...
                      </span>
                    )}
                  </div>
                  <div className="bg-black/80 font-mono text-[11px] p-3 rounded-lg border border-border-inactive/40 h-48 overflow-y-auto space-y-0.5 select-text">
                    {terminalLogs.map((logEntry, index) => (
                      <div
                        key={index}
                        className={logEntry.isError ? 'text-error' : 'text-foreground-secondary'}
                      >
                        {logEntry.text}
                      </div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                </div>
              )}

              {/* Completion status banner */}
              {provisionCompleted !== null && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-center gap-2.5 ${
                    provisionCompleted
                      ? 'bg-status-success/15 border-status-success/30 text-status-success'
                      : 'bg-status-error/15 border-status-error/30 text-status-error'
                  }`}
                >
                  {provisionCompleted ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        Stack provisioning completed successfully! Services and templates are configured.
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Provisioning encountered an error. Check terminal logs above for details.</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-border-inactive/30 flex items-center justify-end gap-2 bg-background-surface/20">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpenModal(false)}
                disabled={isProvisioningRunning}
              >
                {provisionCompleted ? 'Close' : 'Cancel'}
              </Button>
              {!provisionCompleted && (
                <Button
                  size="sm"
                  onClick={handleStartProvisioning}
                  disabled={isProvisioningRunning}
                  className="bg-accent text-background-primary hover:bg-accent/90 font-semibold gap-1.5"
                >
                  {isProvisioningRunning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Provisioning...
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      Start Provisioning
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/**
 * Inline SVG Sparkles icon for setup notification header.
 */
function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}
