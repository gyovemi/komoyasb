import * as React from 'react';
import { RefreshCw, AlertCircle, ShieldCheck, Check } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

/**
 * Component properties for the persistent shell `StatusBar`.
 */
export interface StatusBarProps {
  /** Whether unsaved configuration modifications exist in memory. */
  isDirty?: boolean;
  /** Whether the application is operating inside an isolated testing sandbox. */
  isSandboxed?: boolean;
  /** Whether a background theme synchronization or dry-run evaluation is actively in progress. */
  isApplying?: boolean;
  /** Callback fired when user triggers dry-run test or full theme synchronization. */
  onApplyAndSync?: (isDryRun: boolean) => void;
  /** Human-readable timestamp string of the last successful theme synchronization. */
  lastSyncTime?: string | null;
  /** Optional class name overrides. */
  className?: string;
}

/**
 * Global shell footer status bar rendering sync readiness, sandbox health, and primary action buttons.
 *
 * @param props - Status bar indicators, sync callbacks, and timing metadata.
 * @returns Rendered application footer bar.
 */
export const StatusBar: React.FC<StatusBarProps> = ({
  isDirty = false,
  isSandboxed = false,
  isApplying = false,
  onApplyAndSync,
  lastSyncTime,
  className,
}) => {
  const isSubmittingRef = React.useRef(false);

  React.useEffect(() => {
    if (!isApplying) {
      isSubmittingRef.current = false;
    }
  }, [isApplying]);

  const handleAction = async (isDryRun: boolean) => {
    if (isSubmittingRef.current || isApplying) return;
    isSubmittingRef.current = true;
    try {
      await onApplyAndSync?.(isDryRun);
    } finally {
      if (!isApplying) {
        isSubmittingRef.current = false;
      }
    }
  };

  return (
    <footer
      className={cn(
        'h-11 w-full bg-background-secondary border-t border-border-inactive/40 px-4 flex items-center justify-between text-xs text-foreground-secondary select-none shrink-0 z-40',
        className
      )}
    >
      <div className="flex items-center gap-3">
        {/* Sandbox Indicator */}
        {isSandboxed ? (
          <div className="flex items-center gap-1.5 text-status-warning">
            <span className="w-2 h-2 rounded-full bg-status-warning animate-ping" />
            <span className="font-medium text-[11px]">Sandbox Mode Active</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-status-success">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="text-[11px] text-foreground-muted">Live System</span>
          </div>
        )}

        <div className="h-3 w-px bg-border-inactive" />

        {/* Dirty State Indicator */}
        {isDirty ? (
          <Badge variant="warning" className="flex items-center gap-1 py-0.5 px-2 text-[10px]">
            <AlertCircle className="w-3 h-3 text-status-warning" />
            Unsaved Changes
          </Badge>
        ) : (
          <div className="flex items-center gap-1 text-[11px] text-foreground-muted">
            <Check className="w-3 h-3 text-status-success" />
            All configs synced
          </div>
        )}

        {lastSyncTime && (
          <>
            <div className="h-3 w-px bg-border-inactive" />
            <span className="text-[10px] text-foreground-muted">Last sync: {lastSyncTime}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={isApplying}
          onClick={() => handleAction(true)}
          className="h-7 text-xs border-border-inactive hover:bg-background-surface cursor-pointer"
        >
          Dry-Run Test
        </Button>

        <Button
          size="sm"
          variant="default"
          disabled={isApplying}
          onClick={() => handleAction(false)}
          className={cn(
            'h-7 text-xs font-semibold gap-1.5 cursor-pointer',
            isDirty ? 'bg-accent text-slate-900 shadow-md animate-pulse' : ''
          )}
        >
          <RefreshCw className={cn('w-3 h-3', isApplying && 'animate-spin')} />
          Apply & Sync Theme
        </Button>
      </div>
    </footer>
  );
};
