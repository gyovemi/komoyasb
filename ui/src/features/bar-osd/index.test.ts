import { describe, it, expect } from 'vitest';
import * as barOsd from './index';

describe('features/bar-osd', () => {
  it('exports statusbar components', () => {
    expect(barOsd.StatusBarView).toBeDefined();
    expect(barOsd.YasbWidgetOrganizer).toBeDefined();
    expect(barOsd.WidgetConfigForm).toBeDefined();
    expect(barOsd.YasbCssEditor).toBeDefined();
    expect(barOsd.FluentFlyoutEditor).toBeDefined();
    expect(barOsd.EarTrumpetSettings).toBeDefined();
  });
});
