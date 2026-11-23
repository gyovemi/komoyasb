import * as React from 'react';
import type { ServiceInfo, ServiceControlAction } from '@/types/ipc';
import { systemApi } from '@/lib/ipc';
import { formatBytes, formatUptime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Square,
  RotateCw,
  Cpu,
  HardDrive,
  Clock,
  Layers,
  Terminal,
  Shield,
  Activity,
} from 'lucide-react';

/**
 * Component properties for the `ServiceCard` process monitor.
 */
export interface ServiceCardProps {
  /** Service metadata and runtime metrics. */
  service: ServiceInfo;
  /** Callback fired to trigger status refresh after process state mutation. */
  onRefresh: () => void;
}

/**
 * Interactive card displaying health, PID, CPU, memory, and uptime for a single service.
 *
 * Provides start, stop, and restart controls dispatched via Tauri IPC.
 *
 * @param props - Service telemetry record and refresh handler.
 * @returns Service card element.
 */
export const ServiceCard: React.FC<ServiceCardProps> = ({ service, onRefresh }) => {
  const [activeAction, setActiveAction] = React.useState<ServiceControlAction | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const isMountedRef = React.useRef<boolean>(true);
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const handleAction = async (controlAction: ServiceControlAction) => {
    setActiveAction(controlAction);
    setActionError(null);
    try {
      await systemApi.serviceAction(service.name, controlAction);
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
      // Wait a brief moment before refreshing status
      refreshTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          onRefresh();
        }
      }, 500);
    } catch (actionException: unknown) {
      if (!isMountedRef.current) return;
      const errorMessage = actionException && typeof actionException === 'object' && 'message' in actionException
        ? String((actionException as { message: string }).message)
        : `Failed to ${controlAction} ${service.displayName}`;
      setActionError(errorMessage);
    } finally {
      if (isMountedRef.current) {
        setActiveAction(null);
      }
    }
  };

  const getServiceIcon = () => {
    switch (service.name) {
      case 'komorebi':
        return <Layers className="h-5 w-5 text-accent" />;
      case 'whkd':
        return <Terminal className="h-5 w-5 text-accent-secondary" />;
      case 'yasb':
        return <Activity className="h-5 w-5 text-accent" />;
      case 'watchdog':
        return <Shield className="h-5 w-5 text-status-warning" />;
      default:
        return <Activity className="h-5 w-5 text-foreground-muted" />;
    }
  };

  return (
    <div className="flex flex-col justify-between rounded-xl border border-border-inactive bg-background-surface/50 p-5 transition-all hover:border-accent/30 shadow-sm">
      <div className="space-y-4">
        {/* Top row: Name & Status badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background-primary border border-border-inactive/80">
              {getServiceIcon()}
            </div>
            <div>
              <h4 className="font-semibold text-sm text-foreground-primary">{service.displayName}</h4>
              <p className="font-mono text-[11px] text-foreground-muted">
                {service.isRunning ? (
                  <span>PID: {service.pid ?? 'N/A'}</span>
                ) : (
                  <span>Process inactive</span>
                )}
              </p>
            </div>
          </div>
          <Badge
            variant={service.isRunning ? 'success' : 'secondary'}
            className="capitalize text-xs font-semibold"
          >
            {service.isRunning ? 'Running' : 'Stopped'}
          </Badge>
        </div>

        {/* Action Error Notice */}
        {actionError && (
          <div className="rounded-md border border-status-error/30 bg-status-error/10 p-2.5 text-xs text-status-error">
            {actionError}
          </div>
        )}

        {/* Telemetry Metrics */}
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-background-primary/40 p-3 border border-border-inactive/40 text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[11px] text-foreground-muted">
              <Cpu className="h-3.5 w-3.5" />
              <span>CPU</span>
            </div>
            <p className="font-mono font-medium text-foreground-primary">
              {service.isRunning ? `${service.cpuPercent.toFixed(1)}%` : '0%'}
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[11px] text-foreground-muted">
              <HardDrive className="h-3.5 w-3.5" />
              <span>Memory</span>
            </div>
            <p className="font-mono font-medium text-foreground-primary">
              {service.isRunning ? formatBytes(service.memoryBytes) : '0 MB'}
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[11px] text-foreground-muted">
              <Clock className="h-3.5 w-3.5" />
              <span>Uptime</span>
            </div>
            <p className="font-mono font-medium text-foreground-primary">
              {service.isRunning ? formatUptime(service.uptimeSeconds) : '0s'}
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-5 flex items-center justify-end gap-2 border-t border-border-inactive/40 pt-3">
        {service.isRunning ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAction('restart')}
              disabled={activeAction !== null}
              className="h-8 gap-1.5 text-xs cursor-pointer"
            >
              <RotateCw className={`h-3 w-3 ${activeAction === 'restart' ? 'animate-spin' : ''}`} />
              Restart
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleAction('stop')}
              disabled={activeAction !== null}
              className="h-8 gap-1.5 text-xs cursor-pointer"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop
            </Button>
          </>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={() => handleAction('start')}
            disabled={activeAction !== null}
            className="h-8 gap-1.5 text-xs cursor-pointer"
          >
            <Play className="h-3 w-3 fill-current" />
            Start Service
          </Button>
        )}
      </div>
    </div>
  );
};
