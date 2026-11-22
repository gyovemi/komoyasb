import * as React from 'react';
import type { ApplyResult } from '@/types/ipc';
import { systemApi } from '@/lib/ipc';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog } from '@/components/ui/dialog';
import {
  Sparkles,
  RefreshCw,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  FileCheck,
} from 'lucide-react';

/**
 * Workbench control panel for compiling theme templates and synchronizing desktop services.
 *
 * Supports non-destructive DryRun mode and displays output logs within an inspection modal.
 *
 * @returns Sync & apply toolbar card.
 */
export const SyncApplyPanel: React.FC = () => {
  const [isDryRunSelected, setIsDryRunSelected] = React.useState<boolean>(false);
  const [isApplyingSync, setIsApplyingSync] = React.useState<boolean>(false);
  const [applyResult, setApplyResult] = React.useState<ApplyResult | null>(null);
  const [isLogOpen, setIsLogOpen] = React.useState<boolean>(false);
  const [hasCopiedLog, setHasCopiedLog] = React.useState<boolean>(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const isSubmittingRef = React.useRef(false);

  const handleApplySync = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsApplyingSync(true);
    setErrorMessage(null);
    try {
      const syncResult = await systemApi.applySyncTheme(isDryRunSelected);
      setApplyResult(syncResult);
      setIsLogOpen(true);
    } catch (syncError: unknown) {
      const displayMessage = syncError && typeof syncError === 'object' && 'message' in syncError
        ? String((syncError as { message: string }).message)
        : 'Failed to apply & sync theme';
      setErrorMessage(displayMessage);
    } finally {
      setIsApplyingSync(false);
      isSubmittingRef.current = false;
    }
  };

  const handleCopyLog = () => {
    if (applyResult?.outputLog) {
      navigator.clipboard.writeText(applyResult.outputLog);
      setHasCopiedLog(true);
      setTimeout(() => setHasCopiedLog(false), 2000);
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border-inactive bg-background-surface/40 p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h4 className="text-sm font-semibold text-foreground-primary">Compile, Sync & Reload Stack</h4>
          </div>
          <p className="text-xs text-foreground-muted leading-relaxed">
            Renders all configuration templates (Komorebi, YASB, whkd, Flow Launcher, Flyouts) using active theme tokens and notifies daemons.
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {/* Dry Run Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground-secondary font-medium">Dry Run</span>
            <Switch checked={isDryRunSelected} onChange={(isChecked) => setIsDryRunSelected(isChecked)} />
          </div>

          {/* Sync Button */}
          <Button
            variant="default"
            size="sm"
            onClick={handleApplySync}
            disabled={isApplyingSync}
            className="text-xs px-4 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isApplyingSync ? 'animate-spin' : ''}`} />
            {isApplyingSync ? 'Applying...' : isDryRunSelected ? 'Simulate Sync' : 'Apply & Sync'}
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error">
          {errorMessage}
        </div>
      )}

      {/* Sync Output Modal */}
      <Dialog
        open={isLogOpen}
        onOpenChange={setIsLogOpen}
        title={
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-accent" />
            <span>Theme Synchronization Results</span>
          </div>
        }
        description={
          isDryRunSelected
            ? 'Dry Run Simulation - No system files were modified.'
            : 'Live Apply Complete - Configurations rendered and active services notified.'
        }
        className="max-w-2xl"
      >
        <div className="space-y-4">
          {applyResult && (
            <>
              {/* Summary Badges */}
              <div className="flex flex-wrap gap-2 text-xs">
                <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium ${
                  applyResult.success
                    ? 'bg-status-success/15 text-status-success border border-status-success/30'
                    : 'bg-status-error/15 text-status-error border border-status-error/30'
                }`}>
                  {applyResult.success ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5" />
                  )}
                  <span>Status: {applyResult.success ? 'Success' : 'Encountered Issues'}</span>
                </div>

                <div className="flex items-center gap-1.5 rounded-lg border border-border-inactive bg-background-surface px-2.5 py-1 text-foreground-secondary">
                  <FileCheck className="h-3.5 w-3.5 text-accent" />
                  <span>{applyResult.renderedFiles.length} Files Rendered</span>
                </div>

                <div className="flex items-center gap-1.5 rounded-lg border border-border-inactive bg-background-surface px-2.5 py-1 text-foreground-secondary">
                  <RefreshCw className="h-3.5 w-3.5 text-accent-secondary" />
                  <span>{applyResult.reloadedServices.length} Services Reloaded</span>
                </div>
              </div>

              {/* Rendered Files Breakdown */}
              {applyResult.renderedFiles.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-foreground-muted uppercase tracking-wider">
                    Rendered Configurations:
                  </span>
                  <div className="rounded-lg border border-border-inactive/60 bg-black/60 p-2 text-xs font-mono max-h-24 overflow-y-auto space-y-0.5">
                    {applyResult.renderedFiles.map((renderedPath, fileIndex) => (
                      <div key={fileIndex} className="text-foreground-secondary truncate">
                        • {renderedPath}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Console Output Log */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-foreground-muted uppercase tracking-wider">
                    Console Logs:
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCopyLog}
                    className="h-6 text-[10px] gap-1 px-2 cursor-pointer"
                  >
                    {hasCopiedLog ? <Check className="h-3 w-3 text-status-success" /> : <Copy className="h-3 w-3" />}
                    {hasCopiedLog ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="relative max-h-48 overflow-y-auto rounded-lg border border-border-inactive bg-black/90 p-3 font-mono text-xs text-slate-300">
                  <pre className="whitespace-pre-wrap">{applyResult.outputLog || 'No log output provided.'}</pre>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={() => setIsLogOpen(false)} className="text-xs cursor-pointer">
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
};
