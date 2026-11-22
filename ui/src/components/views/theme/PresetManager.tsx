import * as React from 'react';
import type { ThemeSummary, UnifiedTheme } from '../../../types/ipc';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Dialog } from '../../ui/dialog';
import { Save, Plus, Moon, Sun, Check } from 'lucide-react';
import { validateThemeName } from '../../../lib/validation';

/**
 * Component properties for the `PresetManager` theme switcher.
 */
export interface PresetManagerProps {
  /** Currently loaded in-memory unified theme. */
  currentTheme: UnifiedTheme;
  /** Catalog of available theme presets found on disk. */
  themeSummaries: ThemeSummary[];
  /** Callback to load a theme preset by name from disk into memory. */
  onLoadTheme: (themeName: string) => void;
  /** Callback to persist a unified theme specification to its JSON file. */
  onSaveTheme: (targetTheme: UnifiedTheme) => void;
  /** Callback to activate a theme preset as the active desktop theme. */
  onActivateTheme: (themeName: string) => void;
}

/**
 * Preset manager card grid for saving, cloning, loading, and activating themes.
 *
 * @param props - Current theme, available preset summaries, and persistence callbacks.
 * @returns Preset management view with modal creation dialog.
 */
export const PresetManager: React.FC<PresetManagerProps> = ({
  currentTheme,
  themeSummaries,
  onLoadTheme,
  onSaveTheme,
  onActivateTheme,
}) => {
  const [isNewDialogOpen, setIsNewDialogOpen] = React.useState(false);
  const [newThemeName, setNewThemeName] = React.useState('');
  const [newVariant, setNewVariant] = React.useState<'dark' | 'light'>('dark');

  const normalizedName = newThemeName.trim().toLowerCase().replace(/\s+/g, '-');
  const validation = newThemeName.trim() ? validateThemeName(normalizedName) : { valid: false };

  const handleCreateNew = () => {
    if (!validation.valid) return;
    const clonedTheme: UnifiedTheme = {
      ...currentTheme,
      name: normalizedName,
      variant: newVariant,
    };
    onSaveTheme(clonedTheme);
    setIsNewDialogOpen(false);
    setNewThemeName('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-inactive/40 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground-primary">Theme Presets</h3>
          <p className="text-xs text-foreground-muted">
            Manage your dark & light themes, save custom configurations, or switch active presets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsNewDialogOpen(true)}
            className="gap-1.5 h-8 text-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Preset
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => onSaveTheme(currentTheme)}
            className="gap-1.5 h-8 text-xs cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            Save Changes
          </Button>
        </div>
      </div>

      {/* Preset List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {themeSummaries.map((summary) => {
          const isSelected = currentTheme.name.toLowerCase() === summary.name.toLowerCase();
          return (
            <div
              key={summary.name}
              className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                isSelected
                  ? 'bg-background-surface border-border-active shadow-md ring-1 ring-border-active/40'
                  : 'bg-background-surface/40 border-border-inactive/40 hover:border-border-inactive'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`p-1.5 rounded-lg ${
                      summary.variant === 'dark'
                        ? 'bg-indigo-500/10 text-indigo-400'
                        : 'bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {summary.variant === 'dark' ? (
                      <Moon className="w-4 h-4" />
                    ) : (
                      <Sun className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold capitalize text-foreground-primary">
                      {summary.name}
                    </h4>
                    <span className="text-[10px] text-foreground-muted font-mono">
                      {summary.path}
                    </span>
                  </div>
                </div>

                {summary.isActive ? (
                  <Badge variant="success" className="text-[10px] py-0.5 px-2">
                    Active
                  </Badge>
                ) : isSelected ? (
                  <Badge variant="outline" className="text-[10px] py-0.5 px-2">
                    Loaded
                  </Badge>
                ) : null}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-border-inactive/30">
                {!isSelected && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onLoadTheme(summary.name)}
                    className="flex-1 h-7 text-xs cursor-pointer"
                  >
                    Load into Editor
                  </Button>
                )}
                {!summary.isActive && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => onActivateTheme(summary.name)}
                    className="flex-1 h-7 text-xs gap-1 cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    Set Active
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New Preset Dialog */}
      <Dialog
        open={isNewDialogOpen}
        onOpenChange={setIsNewDialogOpen}
        title="Create New Theme Preset"
        description="Clone the current theme configuration into a new named JSON preset."
      >
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground-secondary">Preset Name</label>
            <Input
              value={newThemeName}
              onChange={(event) => setNewThemeName(event.target.value)}
              placeholder="e.g. nord-frost, catppuccin-mocha"
              className={`text-xs font-mono ${newThemeName.trim() && !validation.valid ? 'border-status-error' : ''}`}
            />
            {newThemeName.trim() && !validation.valid && (
              <span className="text-[11px] text-status-error block">{validation.error}</span>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground-secondary">Base Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={newVariant === 'dark' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNewVariant('dark')}
                className="gap-2 cursor-pointer"
              >
                <Moon className="w-3.5 h-3.5" />
                Dark Variant
              </Button>
              <Button
                type="button"
                variant={newVariant === 'light' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNewVariant('light')}
                className="gap-2 cursor-pointer"
              >
                <Sun className="w-3.5 h-3.5" />
                Light Variant
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border-inactive/40">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsNewDialogOpen(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleCreateNew}
              disabled={!validation.valid}
              className="cursor-pointer"
            >
              Create Preset
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
