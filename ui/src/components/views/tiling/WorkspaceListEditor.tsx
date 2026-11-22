import * as React from 'react';
import type { MonitorDefinition, WorkspaceDefinition } from '@/types/ipc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Monitor,
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  LayoutGrid,
  Columns,
  Rows,
  Maximize2,
  FolderTree,
} from 'lucide-react';

export interface WorkspaceListEditorProps {
  monitors: MonitorDefinition[];
  onChange: (monitors: MonitorDefinition[]) => void;
}

const LAYOUT_OPTIONS = [
  { value: 'BSP', label: 'BSP (Binary Space Partition)' },
  { value: 'Columns', label: 'Columns' },
  { value: 'Rows', label: 'Rows' },
  { value: 'Grid', label: 'Grid' },
  { value: 'Floating', label: 'Floating' },
  { value: 'VerticalStack', label: 'Vertical Stack' },
];

/**
 * Virtual workspace and multi-monitor layout configuration editor.
 *
 * Allows adding, naming, removing, and reordering virtual workspaces per monitor,
 * as well as assigning default tiling layouts (BSP, Columns, Rows, Grid, Floating, VerticalStack).
 *
 * @param props - Display monitors array and change handler.
 * @returns Multi-monitor workspace management panel.
 */
export const WorkspaceListEditor: React.FC<WorkspaceListEditorProps> = ({
  monitors,
  onChange,
}) => {
  const [selectedMonitorIndex, setSelectedMonitorIndex] = React.useState<number>(0);

  const activeMonitor = monitors[selectedMonitorIndex] || monitors[0];

  const handleAddMonitor = () => {
    const newMonitors = [
      ...monitors,
      {
        workspaces: [
          { name: `ws-${monitors.length + 1}`, layout: 'BSP' as const },
        ],
      },
    ];
    onChange(newMonitors);
    setSelectedMonitorIndex(newMonitors.length - 1);
  };

  const handleRemoveMonitor = (idxToRemove: number) => {
    if (monitors.length <= 1) return; // keep at least 1 monitor
    const newMonitors = monitors.filter((_, i) => i !== idxToRemove);
    onChange(newMonitors);
    setSelectedMonitorIndex(Math.max(0, idxToRemove - 1));
  };

  const handleUpdateWorkspaces = (newWorkspaces: WorkspaceDefinition[]) => {
    const newMonitors = [...monitors];
    newMonitors[selectedMonitorIndex] = {
      ...newMonitors[selectedMonitorIndex],
      workspaces: newWorkspaces,
    };
    onChange(newMonitors);
  };

  const handleAddWorkspace = () => {
    if (!activeMonitor) return;
    const count = activeMonitor.workspaces.length + 1;
    const newWs: WorkspaceDefinition = {
      name: `${count}:ws`,
      layout: 'BSP',
    };
    handleUpdateWorkspaces([...activeMonitor.workspaces, newWs]);
  };

  const handleRemoveWorkspace = (idx: number) => {
    if (!activeMonitor || activeMonitor.workspaces.length <= 1) return;
    const updated = activeMonitor.workspaces.filter((_, i) => i !== idx);
    handleUpdateWorkspaces(updated);
  };

  const handleWorkspaceChange = (idx: number, updates: Partial<WorkspaceDefinition>) => {
    if (!activeMonitor) return;
    const updated = activeMonitor.workspaces.map((ws, i) => {
      if (i === idx) {
        return { ...ws, ...updates };
      }
      return ws;
    });
    handleUpdateWorkspaces(updated);
  };

  const handleMoveWorkspace = (idx: number, direction: 'up' | 'down') => {
    if (!activeMonitor) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= activeMonitor.workspaces.length) return;

    const list = [...activeMonitor.workspaces];
    const [moved] = list.splice(idx, 1);
    list.splice(targetIdx, 0, moved);
    handleUpdateWorkspaces(list);
  };

  const getLayoutIcon = (layout: string) => {
    switch (layout) {
      case 'Columns':
        return <Columns className="h-4 w-4 text-accent" />;
      case 'Rows':
        return <Rows className="h-4 w-4 text-accent" />;
      case 'Grid':
        return <LayoutGrid className="h-4 w-4 text-accent" />;
      case 'Floating':
        return <Maximize2 className="h-4 w-4 text-accent" />;
      case 'BSP':
      default:
        return <FolderTree className="h-4 w-4 text-accent" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Monitors Selector Bar */}
      <div className="rounded-xl border border-border-inactive/40 bg-background-secondary/40 p-5 backdrop-blur-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground-primary">Monitors & Displays</h3>
            <p className="text-xs text-foreground-muted">Select a display monitor to configure its workspace assignments.</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddMonitor}
            className="flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Monitor
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          {monitors.map((mon, idx) => {
            const isSelected = idx === selectedMonitorIndex;
            return (
              <div
                key={idx}
                onClick={() => setSelectedMonitorIndex(idx)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                  isSelected
                    ? 'border-accent bg-accent/15 text-accent shadow-sm'
                    : 'border-border-inactive/50 bg-background-surface/40 hover:bg-background-surface text-foreground-secondary'
                }`}
              >
                <Monitor className="h-4 w-4 shrink-0" />
                <span>Display {idx + 1}</span>
                <Badge variant={isSelected ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                  {mon.workspaces.length} ws
                </Badge>
                {monitors.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveMonitor(idx);
                    }}
                    title="Remove Monitor"
                    className="ml-1 p-0.5 text-foreground-muted hover:text-status-error transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Workspaces List for Active Monitor */}
      <div className="rounded-xl border border-border-inactive/40 bg-background-secondary/40 p-5 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground-primary">
              Workspaces on Display {selectedMonitorIndex + 1}
            </h3>
            <p className="text-xs text-foreground-muted">
              Define workspace labels and default tiling layout algorithms.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleAddWorkspace}
            className="flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Workspace
          </Button>
        </div>

        {/* Workspaces visual table/cards */}
        <div className="space-y-2 pt-1">
          {activeMonitor?.workspaces.map((ws, idx) => (
            <div
              key={idx}
              className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-border-inactive/30 bg-background-surface/30 hover:bg-background-surface/60 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="w-5 text-center text-xs font-mono text-foreground-muted">
                  #{idx + 1}
                </span>
                <div className="p-1.5 rounded-md bg-background-secondary border border-border-inactive/30 shrink-0">
                  {getLayoutIcon(ws.layout)}
                </div>
              </div>

              {/* Workspace Name Input */}
              <div className="flex-1 min-w-[140px]">
                <Input
                  value={ws.name}
                  onChange={(e) => handleWorkspaceChange(idx, { name: e.target.value })}
                  placeholder="Workspace Name (e.g. 1:dev)"
                  className="h-8 text-xs font-mono"
                />
              </div>

              {/* Layout Algorithm Select */}
              <div className="w-full sm:w-56">
                <Select
                  value={ws.layout}
                  options={LAYOUT_OPTIONS}
                  onChange={(val) =>
                    handleWorkspaceChange(idx, {
                      layout: val as WorkspaceDefinition['layout'],
                    })
                  }
                  className="text-xs"
                />
              </div>

              {/* Action Buttons: Up, Down, Delete */}
              <div className="flex items-center gap-1 self-end sm:self-center">
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={idx === 0}
                  onClick={() => handleMoveWorkspace(idx, 'up')}
                  className="h-7 w-7 text-foreground-muted hover:text-foreground-primary"
                  title="Move Up"
                >
                  <MoveUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={idx === activeMonitor.workspaces.length - 1}
                  onClick={() => handleMoveWorkspace(idx, 'down')}
                  className="h-7 w-7 text-foreground-muted hover:text-foreground-primary"
                  title="Move Down"
                >
                  <MoveDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={activeMonitor.workspaces.length <= 1}
                  onClick={() => handleRemoveWorkspace(idx)}
                  className="h-7 w-7 text-status-error/70 hover:text-status-error hover:bg-status-error/10"
                  title="Delete Workspace"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}

          {(!activeMonitor || activeMonitor.workspaces.length === 0) && (
            <div className="text-center py-8 text-xs text-foreground-muted">
              No workspaces configured for this display. Click "Add Workspace" above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
