import { describe, it, expect } from 'vitest';
import * as shellServices from './index';

describe('features/shell-services', () => {
  it('exports mods and services components', () => {
    expect(shellServices.ModsView).toBeDefined();
    expect(shellServices.FlowLauncherConfig).toBeDefined();
    expect(shellServices.WindhawkModsManager).toBeDefined();
    expect(shellServices.ModSourceViewer).toBeDefined();
    expect(shellServices.ServicesView).toBeDefined();
    expect(shellServices.ServiceCard).toBeDefined();
    expect(shellServices.SyncApplyPanel).toBeDefined();
    expect(shellServices.BackupRestoreModal).toBeDefined();
    expect(shellServices.SandboxToggleBanner).toBeDefined();
  });
});
