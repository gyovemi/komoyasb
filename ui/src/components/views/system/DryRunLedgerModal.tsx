import * as React from 'react';
import type { ExecutionLedger, LedgerAction, FileDiff } from '@/types/ipc';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  FileCode2,
  Trash2,
  Package,
  Cpu,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  Terminal,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Filter,
} from 'lucide-react';

/**
 * Component properties for the `DryRunLedgerModal` execution inspector.
 */
export interface DryRunLedgerModalProps {
  /** Controls modal visibility. */
  open: boolean;
  /** Callback fired when modal open state flips. */
  onOpenChange: (isOpen: boolean) => void;
  /** Full cryptographic dry-run execution ledger and file diff payload. */
  ledger: ExecutionLedger | null;
  /** Optional callback to promote simulated actions to live system execution. */
  onExecuteLive?: () => void;
  /** Whether live promotion execution is actively running. */
  isLoadingLive?: boolean;
}

/**
 * Comprehensive cryptographic dry-run ledger inspection modal.
 *
 * Visualizes simulated file writes, deletions, registry modifications, package installations,
 * and SHA256 checksum comparisons between live system files and shadow sandbox staging.
 *
 * @param props - Ledger data, modal state, and live execution promotion handler.
 * @returns Modal dialog portal for ledger audit.
 */
export const DryRunLedgerModal: React.FC<DryRunLedgerModalProps> = ({
  open,
  onOpenChange,
  ledger,
  onExecuteLive,
  isLoadingLive = false,
}) => {
  const [activeTab, setActiveTab] = React.useState<'summary' | 'diffs' | 'actions'>('summary');
  const [actionFilter, setActionFilter] = React.useState<string>('all');
  const [expandedDiffs, setExpandedDiffs] = React.useState<Record<string, boolean>>({});

  if (!ledger) return null;

  const toggleDiffExpand = (filePathKey: string) => {
    setExpandedDiffs((previousExpanded) => ({
      ...previousExpanded,
      [filePathKey]: !previousExpanded[filePathKey],
    }));
  };

  const filteredActions = ledger.actions.filter((ledgerEntry: LedgerAction) => {
    if (actionFilter === 'all') return true;
    return ledgerEntry.actionType === actionFilter;
  });

  const getChangeBadgeColor = (changeClassification: string) => {
    switch (changeClassification) {
      case 'Created':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'Modified':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'Deleted':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  const getActionIcon = (actionTypeKey: string) => {
    switch (actionTypeKey) {
      case 'FileWrite':
      case 'DirectoryCreate':
        return <FileCode2 className="h-4 w-4 text-emerald-400" />;
      case 'FileDelete':
        return <Trash2 className="h-4 w-4 text-rose-400" />;
      case 'PackageInstall':
        return <Package className="h-4 w-4 text-sky-400" />;
      case 'ProcessControl':
        return <Cpu className="h-4 w-4 text-indigo-400" />;
      case 'WallpaperApply':
      case 'WindhawkMod':
        return <Layers className="h-4 w-4 text-amber-400" />;
      default:
        return <Terminal className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 text-accent" />
          <span>Execution Ledger & Simulation Diff</span>
        </div>
      }
      description={
        <span className="flex items-center gap-2 text-xs">
          <span>Session: <code className="font-mono text-accent">{ledger.sessionId}</code></span>
          <span>•</span>
          <span>Timestamp: {ledger.timestamp}</span>
        </span>
      }
      className="max-w-4xl max-h-[85vh] flex flex-col"
    >
      <div className="flex-1 flex flex-col overflow-hidden space-y-4">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-border-inactive/40 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('summary')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'summary'
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'text-foreground-secondary hover:text-foreground-primary'
              }`}
            >
              Summary Metrics
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('diffs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'diffs'
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'text-foreground-secondary hover:text-foreground-primary'
              }`}
            >
              File Mutations ({ledger.fileDiffs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('actions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'actions'
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'text-foreground-secondary hover:text-foreground-primary'
              }`}
            >
              Action Ledger ({ledger.actions.length})
            </button>
          </div>

          {activeTab === 'actions' && (
            <div className="flex items-center gap-1 text-xs">
              <Filter className="h-3 w-3 text-foreground-muted" />
              <select
                value={actionFilter}
                onChange={(selectEvent) => setActionFilter(selectEvent.target.value)}
                className="bg-background-surface rounded px-2 py-1 text-xs border border-border-inactive text-foreground-secondary cursor-pointer"
              >
                <option value="all">All Action Types</option>
                <option value="FileWrite">File Writes</option>
                <option value="FileDelete">File Deletions</option>
                <option value="RegistryWrite">Registry Writes</option>
                <option value="PackageInstall">Package Installs</option>
                <option value="ProcessControl">Process Signals</option>
              </select>
            </div>
          )}
        </div>

        {/* Tab 1: Summary */}
        {activeTab === 'summary' && (
          <div className="space-y-4 overflow-y-auto p-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl border border-border-inactive/60 bg-background-surface/30">
                <span className="text-[11px] text-foreground-muted">Total Evaluated Actions</span>
                <p className="text-xl font-bold font-mono text-accent mt-1">{ledger.summary.totalActions}</p>
              </div>
              <div className="p-3 rounded-xl border border-border-inactive/60 bg-background-surface/30">
                <span className="text-[11px] text-foreground-muted">Simulated File Writes</span>
                <p className="text-xl font-bold font-mono text-emerald-400 mt-1">{ledger.summary.filesWritten}</p>
              </div>
              <div className="p-3 rounded-xl border border-border-inactive/60 bg-background-surface/30">
                <span className="text-[11px] text-foreground-muted">Simulated Deletions</span>
                <p className="text-xl font-bold font-mono text-rose-400 mt-1">{ledger.summary.filesDeleted}</p>
              </div>
              <div className="p-3 rounded-xl border border-border-inactive/60 bg-background-surface/30">
                <span className="text-[11px] text-foreground-muted">Registry Writes</span>
                <p className="text-xl font-bold font-mono text-indigo-400 mt-1">{ledger.summary.registryWrites}</p>
              </div>
              <div className="p-3 rounded-xl border border-border-inactive/60 bg-background-surface/30">
                <span className="text-[11px] text-foreground-muted">Packages Simulated</span>
                <p className="text-xl font-bold font-mono text-sky-400 mt-1">{ledger.summary.packagesSimulated}</p>
              </div>
              <div className="p-3 rounded-xl border border-border-inactive/60 bg-background-surface/30">
                <span className="text-[11px] text-foreground-muted">Process Controls</span>
                <p className="text-xl font-bold font-mono text-amber-400 mt-1">{ledger.summary.processesControlled}</p>
              </div>
            </div>

            {ledger.shadowRoot && (
              <div className="p-3.5 rounded-xl border border-border-inactive/60 bg-black/40 space-y-1">
                <span className="text-xs font-semibold text-foreground-primary">Shadow Sandbox Storage Path:</span>
                <p className="font-mono text-xs text-foreground-secondary break-all">{ledger.shadowRoot}</p>
              </div>
            )}

            <div className="p-4 rounded-xl border border-accent/20 bg-accent/5 flex items-start gap-3 text-xs text-foreground-secondary">
              <Info className="h-5 w-5 text-accent shrink-0 mt-0.5" />
              <div className="space-y-1 leading-relaxed">
                <p className="font-semibold text-foreground-primary">Zero Live Host Mutation Guarantee</p>
                <p>
                  Dry-run execution strictly targets shadow isolation trees with SHA256 content hashes verified.
                  No running service processes were killed, registry branches overwritten, or files deleted.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: File Diffs */}
        {activeTab === 'diffs' && (
          <div className="space-y-3 overflow-y-auto max-h-[50vh] pr-1">
            {ledger.fileDiffs.map((diffRecord, diffIndex) => {
              const isExpanded = !!expandedDiffs[diffRecord.targetLivePath];
              return (
                <div
                  key={diffIndex}
                  className="rounded-xl border border-border-inactive/60 bg-background-surface/20 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleDiffExpand(diffRecord.targetLivePath)}
                    className="w-full p-3 flex items-center justify-between text-left hover:bg-background-surface/40 transition-colors cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
                      )}
                      <span className="font-mono text-xs font-medium text-foreground-primary truncate">
                        {diffRecord.targetLivePath}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border uppercase tracking-wider ${getChangeBadgeColor(
                        diffRecord.changeType
                      )}`}
                    >
                      {diffRecord.changeType}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="p-3 border-t border-border-inactive/30 bg-black/40 space-y-2 font-mono text-[11px]">
                      <div>
                        <span className="text-foreground-muted">Shadow Path: </span>
                        <span className="text-foreground-secondary break-all">{diffRecord.targetVirtualPath}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-border-inactive/20">
                        <div>
                          <span className="text-foreground-muted">Original SHA256:</span>
                          <p className="text-[10px] text-foreground-secondary break-all">
                            {diffRecord.originalSha256 || 'None (New file)'}
                          </p>
                        </div>
                        <div>
                          <span className="text-foreground-muted">Shadow SHA256:</span>
                          <p className="text-[10px] text-accent break-all">
                            {diffRecord.shadowSha256 || 'None (Deleted file)'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 3: Action Ledger */}
        {activeTab === 'actions' && (
          <div className="space-y-2 overflow-y-auto max-h-[50vh] pr-1">
            {filteredActions.map((actionRecord) => (
              <div
                key={actionRecord.id}
                className="p-3 rounded-lg border border-border-inactive/40 bg-background-surface/20 flex items-start justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-md bg-background-surface shrink-0">
                    {getActionIcon(actionRecord.actionType)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground-primary">{actionRecord.actionType}</span>
                      <span className="font-mono text-[10px] text-foreground-muted">{actionRecord.timestamp}</span>
                    </div>
                    <p className="font-mono text-[11px] text-foreground-secondary truncate mt-0.5">
                      {actionRecord.target}
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                  {actionRecord.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-3 border-t border-border-inactive/40 flex items-center justify-between">
          <span className="text-xs text-foreground-muted">
            All operations evaluated non-destructively.
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs cursor-pointer"
            >
              Close
            </Button>
            {onExecuteLive && (
              <Button
                variant="default"
                size="sm"
                onClick={onExecuteLive}
                disabled={isLoadingLive}
                className="text-xs bg-accent text-background-primary hover:bg-accent/90 font-semibold cursor-pointer"
              >
                {isLoadingLive ? 'Applying Live...' : 'Promote to Live Execution'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
