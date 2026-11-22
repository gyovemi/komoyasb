import * as React from 'react';
import type { BackupSnapshot } from '@/types/ipc';
import { systemApi } from '@/lib/ipc';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  History,
  RotateCcw,
  CheckCircle2,
  FolderArchive,
  RefreshCw,
  Calendar,
  AlertTriangle,
} from 'lucide-react';

/**
 * Component properties for the `BackupRestoreModal` dialog.
 */
export interface BackupRestoreModalProps {
  /** Controls modal visibility. */
  isOpen: boolean;
  /** Callback fired to close the modal. */
  onClose: () => void;
  /** Optional callback fired when backup snapshot restore completes successfully. */
  onRestoreSuccess?: () => void;
}

/**
 * Modal dialog for inspecting and restoring snapshot backups of configuration directories.
 *
 * Provides confirmation guard rails and displays list of files preserved within each snapshot.
 *
 * @param props - Modal visibility flags and restoration callbacks.
 * @returns Backup restoration modal portal.
 */
export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  onClose,
  onRestoreSuccess,
}) => {
  const [backupSnapshots, setBackupSnapshots] = React.useState<BackupSnapshot[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = React.useState<boolean>(false);
  const [selectedSnapshot, setSelectedSnapshot] = React.useState<BackupSnapshot | null>(null);
  const [confirmingTimestamp, setConfirmingTimestamp] = React.useState<string | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = React.useState<boolean>(false);
  const [isRestoreSuccess, setIsRestoreSuccess] = React.useState<boolean>(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const fetchBackups = React.useCallback(async () => {
    setIsLoadingBackups(true);
    setErrorMessage(null);
    try {
      const fetchedSnapshots = await systemApi.getBackups();
      setBackupSnapshots(fetchedSnapshots);
      if (fetchedSnapshots.length > 0 && !selectedSnapshot) {
        setSelectedSnapshot(fetchedSnapshots[0]);
      }
    } catch (fetchError: unknown) {
      const displayMessage = fetchError && typeof fetchError === 'object' && 'message' in fetchError
        ? String((fetchError as { message: string }).message)
        : 'Failed to load backup snapshots';
      setErrorMessage(displayMessage);
    } finally {
      setIsLoadingBackups(false);
    }
  }, [selectedSnapshot]);

  React.useEffect(() => {
    if (isOpen) {
      fetchBackups();
    }
  }, [isOpen, fetchBackups]);

  const handleConfirmRestore = async () => {
    if (!confirmingTimestamp) return;
    setIsRestoringBackup(true);
    setErrorMessage(null);
    setIsRestoreSuccess(false);
    try {
      await systemApi.restoreBackup(confirmingTimestamp);
      setIsRestoreSuccess(true);
      setConfirmingTimestamp(null);
      if (onRestoreSuccess) {
        onRestoreSuccess();
      }
      setTimeout(() => {
        setIsRestoreSuccess(false);
      }, 4000);
    } catch (restoreError: unknown) {
      const displayMessage = restoreError && typeof restoreError === 'object' && 'message' in restoreError
        ? String((restoreError as { message: string }).message)
        : 'Failed to restore snapshot';
      setErrorMessage(displayMessage);
    } finally {
      setIsRestoringBackup(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(openState) => !openState && onClose()}
      title={
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-accent" />
          <span>Configuration Backup & Restoration</span>
        </div>
      }
      description="Inspect transactional rollback snapshots taken prior to theme synchronization."
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {errorMessage && (
          <div className="rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error">
            {errorMessage}
          </div>
        )}

        {isRestoreSuccess && (
          <div className="flex items-center gap-2 rounded-md border border-status-success/30 bg-status-success/10 p-3 text-xs text-status-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Configuration snapshot restored successfully. Stack services should be reloaded.</span>
          </div>
        )}

        {isLoadingBackups ? (
          <div className="flex items-center justify-center p-8 text-xs text-foreground-muted">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin text-accent" />
            Loading backup history...
          </div>
        ) : backupSnapshots.length === 0 ? (
          <div className="rounded-lg border border-border-inactive/60 bg-background-surface/30 p-8 text-center text-xs text-foreground-muted">
            <FolderArchive className="mx-auto h-8 w-8 text-foreground-muted mb-2 opacity-50" />
            <p className="font-semibold text-foreground-primary">No Backups Found</p>
            <p className="mt-1">Backups are automatically generated when executing theme synchronizations.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Snapshot List */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              <span className="text-[11px] font-semibold text-foreground-muted uppercase tracking-wider">
                Available Snapshots ({backupSnapshots.length})
              </span>
              <div className="space-y-1.5">
                {backupSnapshots.map((snapshotRecord) => {
                  const isSelected = selectedSnapshot?.timestamp === snapshotRecord.timestamp;
                  return (
                    <button
                      key={snapshotRecord.timestamp}
                      type="button"
                      onClick={() => {
                        setSelectedSnapshot(snapshotRecord);
                        setConfirmingTimestamp(null);
                      }}
                      className={`w-full text-left rounded-lg p-2.5 transition-all text-xs border cursor-pointer ${
                        isSelected
                          ? 'border-accent bg-accent/10 text-foreground-primary'
                          : 'border-border-inactive/60 bg-background-surface/40 hover:bg-background-surface hover:text-foreground-primary text-foreground-secondary'
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono font-medium">
                        <span>{snapshotRecord.timestamp}</span>
                        <span className="text-[10px] text-foreground-muted">
                          {snapshotRecord.files.length} files
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-foreground-muted mt-1">
                        <Calendar className="h-3 w-3" />
                        <span>{snapshotRecord.createdAt}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Snapshot Details & Action */}
            <div className="flex flex-col justify-between rounded-lg border border-border-inactive/60 bg-background-surface/30 p-3.5 text-xs">
              {selectedSnapshot ? (
                <div className="space-y-3">
                  <div>
                    <h5 className="font-semibold text-foreground-primary">Snapshot Archive</h5>
                    <p className="font-mono text-[10px] text-foreground-muted truncate">
                      {selectedSnapshot.directoryPath}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-foreground-muted uppercase">
                      Preserved Configuration Files:
                    </span>
                    <div className="max-h-36 overflow-y-auto rounded border border-border-inactive/40 bg-black/40 p-2 font-mono text-[11px] text-foreground-secondary space-y-1">
                      {selectedSnapshot.files.map((fileEntry, fileIndex) => (
                        <div key={fileIndex} className="truncate">
                          • {fileEntry.original.split(/\\|\//).pop()}
                        </div>
                      ))}
                    </div>
                  </div>

                  {confirmingTimestamp === selectedSnapshot.timestamp ? (
                    <div className="rounded-lg border border-status-warning/40 bg-status-warning/10 p-3 text-xs space-y-2">
                      <div className="flex items-start gap-1.5 text-status-warning font-semibold">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>Confirm Overwrite?</span>
                      </div>
                      <p className="text-[11px] text-foreground-secondary leading-relaxed">
                        Restoring will overwrite current live configuration files with this snapshot.
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={handleConfirmRestore}
                          disabled={isRestoringBackup}
                          className="h-7 text-xs flex-1 cursor-pointer"
                        >
                          {isRestoringBackup ? 'Restoring...' : 'Yes, Restore Snapshot'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmingTimestamp(null)}
                          className="h-7 text-xs cursor-pointer"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmingTimestamp(selectedSnapshot.timestamp)}
                      className="w-full text-xs gap-1.5 mt-2 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-accent" />
                      Rollback to this Snapshot
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-foreground-muted text-xs">
                  Select a snapshot to view details
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-border-inactive/40">
          <Button size="sm" variant="outline" onClick={onClose} className="text-xs cursor-pointer">
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
