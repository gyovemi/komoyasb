import { describe, it, expect } from 'vitest';
import * as tiling from './index';

describe('features/tiling', () => {
  it('exports tiling components', () => {
    expect(tiling.TilingView).toBeDefined();
    expect(tiling.KomorebiGeometryEditor).toBeDefined();
    expect(tiling.WorkspaceListEditor).toBeDefined();
    expect(tiling.FloatRulesTable).toBeDefined();
    expect(tiling.ShortcutRecorder).toBeDefined();
  });
});
