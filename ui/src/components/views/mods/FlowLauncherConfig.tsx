import * as React from 'react';
import type { FlowSettings } from '@/types/ipc';
import { modsApi } from '@/lib/ipc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select } from '@/components/ui/select';
import { Command, Sparkles, Sliders, Type, Check, RefreshCw } from 'lucide-react';

const COMMON_FONTS = [
  'JetBrainsMono Nerd Font',
  'Cascadia Code',
  'Fira Code',
  'Segoe UI',
  'Consolas',
  'Hack Nerd Font',
];

const THEME_OPTIONS = [
  { value: 'KomoyasbFluent', label: 'Komoyasb Fluent (Default)' },
  { value: 'Dark', label: 'Dark' },
  { value: 'Light', label: 'Light' },
  { value: 'Dracula', label: 'Dracula' },
  { value: 'Tokyo Night', label: 'Tokyo Night' },
  { value: 'Catppuccin Mocha', label: 'Catppuccin Mocha' },
  { value: 'Nord', label: 'Nord' },
];

const EFFECT_OPTIONS = [
  { value: 'Mica', label: 'Mica (Windows 11)' },
  { value: 'Acrylic', label: 'Acrylic (Blurred)' },
  { value: 'None', label: 'None (Opaque)' },
];

/**
 * Configuration view for Flow Launcher styling, opacity, and hotkey invocation.
 *
 * Reads and serializes Flow Launcher's `Settings.json` payload, providing hotkey recording,
 * backdrop blur effects, border radii, and result count constraints.
 *
 * @returns Flow Launcher configuration panel.
 */
export const FlowLauncherConfig: React.FC = () => {
  const [flowSettings, setFlowSettings] = React.useState<FlowSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = React.useState<boolean>(true);
  const [isSavingSettings, setIsSavingSettings] = React.useState<boolean>(false);
  const [isSavedSuccess, setIsSavedSuccess] = React.useState<boolean>(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isRecordingHotkey, setIsRecordingHotkey] = React.useState<boolean>(false);

  const fetchSettings = React.useCallback(async () => {
    setIsLoadingSettings(true);
    setErrorMessage(null);
    try {
      const fetchedSettings = await modsApi.loadFlowSettings();
      setFlowSettings(fetchedSettings);
    } catch (fetchError: unknown) {
      const displayMessage = fetchError && typeof fetchError === 'object' && 'message' in fetchError
        ? String((fetchError as { message: string }).message)
        : 'Failed to load Flow Launcher settings';
      setErrorMessage(displayMessage);
    } finally {
      setIsLoadingSettings(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!flowSettings) return;
    setIsSavingSettings(true);
    setErrorMessage(null);
    setIsSavedSuccess(false);
    try {
      await modsApi.saveFlowSettings(flowSettings);
      setIsSavedSuccess(true);
      setTimeout(() => setIsSavedSuccess(false), 3000);
    } catch (saveError: unknown) {
      const displayMessage = saveError && typeof saveError === 'object' && 'message' in saveError
        ? String((saveError as { message: string }).message)
        : 'Failed to save Flow Launcher settings';
      setErrorMessage(displayMessage);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const updateSetting = <K extends keyof FlowSettings>(settingField: K, settingValue: FlowSettings[K]) => {
    if (!flowSettings) return;
    setFlowSettings({
      ...flowSettings,
      [settingField]: settingValue,
    });
  };

  const handleKeyDownRecord = (keyEvent: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isRecordingHotkey) return;
    keyEvent.preventDefault();

    const pressedModifiers: string[] = [];
    if (keyEvent.altKey) pressedModifiers.push('Alt');
    if (keyEvent.ctrlKey) pressedModifiers.push('Ctrl');
    if (keyEvent.shiftKey) pressedModifiers.push('Shift');
    if (keyEvent.metaKey) pressedModifiers.push('Win');

    const keyName = keyEvent.key;
    if (!['Alt', 'Control', 'Shift', 'Meta'].includes(keyName)) {
      const formattedKey = keyName.length === 1 ? keyName.toUpperCase() : keyName;
      const combinedShortcut = [...pressedModifiers, formattedKey].join(' + ');
      updateSetting('Hotkey', combinedShortcut);
      setIsRecordingHotkey(false);
    }
  };

  if (isLoadingSettings) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-foreground-muted">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin text-accent" />
        Loading Flow Launcher settings...
      </div>
    );
  }

  if (errorMessage && !flowSettings) {
    return (
      <div className="rounded-lg border border-status-error/30 bg-status-error/10 p-6 text-sm text-status-error">
        <p className="font-semibold">Error Loading Settings</p>
        <p className="mt-1 text-xs">{errorMessage}</p>
        <Button variant="outline" size="sm" onClick={fetchSettings} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Save Action */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground-primary">Flow Launcher Settings</h3>
          <p className="text-xs text-foreground-muted">
            Configure prompt shortcuts, typography, and Windows 11 fluent backdrop effects.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSavedSuccess && (
            <span className="flex items-center text-xs font-medium text-status-success">
              <Check className="mr-1 h-3.5 w-3.5" />
              Saved successfully
            </span>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSavingSettings || !flowSettings}
            className="h-8 gap-1.5 cursor-pointer"
          >
            {isSavingSettings ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Save Configuration
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error">
          {errorMessage}
        </div>
      )}

      {flowSettings && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* General & Hotkey Card */}
          <div className="space-y-4 rounded-xl border border-border-inactive bg-background-surface/30 p-5">
            <div className="flex items-center gap-2 pb-2 border-b border-border-inactive/40">
              <Command className="h-4 w-4 text-accent" />
              <h4 className="text-sm font-semibold text-foreground-primary">Invocation & Appearance</h4>
            </div>

            {/* Hotkey Recorder */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground-secondary">Global Activation Hotkey</label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={flowSettings.Hotkey || 'Alt + Space'}
                  onKeyDown={handleKeyDownRecord}
                  placeholder="Click Record..."
                  className={`font-mono text-xs ${
                    isRecordingHotkey ? 'border-accent ring-1 ring-accent' : ''
                  }`}
                />
                <Button
                  size="sm"
                  variant={isRecordingHotkey ? 'destructive' : 'outline'}
                  onClick={() => setIsRecordingHotkey(!isRecordingHotkey)}
                  className="shrink-0 text-xs cursor-pointer"
                >
                  {isRecordingHotkey ? 'Press keys...' : 'Record'}
                </Button>
              </div>
              <p className="text-[10px] text-foreground-muted">
                Standard default is Alt + Space. Click record and press desired modifier combo.
              </p>
            </div>

            {/* Theme Preset */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground-secondary">Theme Preset</label>
              <Select
                value={flowSettings.Theme || 'KomoyasbFluent'}
                options={THEME_OPTIONS}
                onChange={(selectedTheme) => updateSetting('Theme', selectedTheme)}
              />
            </div>

            {/* Backdrop Effect */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground-secondary">Window Composition Effect</label>
              <Select
                value={flowSettings.SearchWindowEffect || 'Mica'}
                options={EFFECT_OPTIONS}
                onChange={(selectedEffect) =>
                  updateSetting('SearchWindowEffect', selectedEffect as FlowSettings['SearchWindowEffect'])
                }
              />
              <p className="text-[10px] text-foreground-muted">
                Mica and Acrylic leverage DWM hardware acceleration on Windows 11.
              </p>
            </div>

            {/* Max Results */}
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-foreground-secondary">Max Query Results</span>
                <span className="font-mono text-accent">{flowSettings.MaxResultsToShow ?? 8}</span>
              </div>
              <Slider
                value={flowSettings.MaxResultsToShow ?? 8}
                min={4}
                max={16}
                step={1}
                onChange={(numericResults) => updateSetting('MaxResultsToShow', numericResults)}
              />
            </div>
          </div>

          {/* Typography & Geometry Card */}
          <div className="space-y-4 rounded-xl border border-border-inactive bg-background-surface/30 p-5">
            <div className="flex items-center gap-2 pb-2 border-b border-border-inactive/40">
              <Type className="h-4 w-4 text-accent" />
              <h4 className="text-sm font-semibold text-foreground-primary">Typography & Geometry</h4>
            </div>

            {/* Font Family */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground-secondary">Font Family</label>
              <Input
                value={flowSettings.Font || 'Segoe UI'}
                onChange={(event) => updateSetting('Font', event.target.value)}
                placeholder="e.g. Segoe UI, Cascadia Code"
                className="text-xs"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {COMMON_FONTS.map((fontCandidate) => (
                  <button
                    key={fontCandidate}
                    type="button"
                    onClick={() => updateSetting('Font', fontCandidate)}
                    className="rounded bg-background-surface px-1.5 py-0.5 text-[10px] text-foreground-muted hover:text-foreground-primary cursor-pointer border border-border-inactive/40"
                  >
                    {fontCandidate}
                  </button>
                ))}
              </div>
            </div>

            {/* Corner Radius */}
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-foreground-secondary">Corner Radius</span>
                <span className="font-mono text-accent">{flowSettings.BorderRadius ?? 8}px</span>
              </div>
              <Slider
                value={flowSettings.BorderRadius ?? 8}
                min={0}
                max={24}
                step={1}
                onChange={(numericRadius) => updateSetting('BorderRadius', numericRadius)}
              />
            </div>

            {/* Window Opacity */}
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-foreground-secondary">Window Opacity</span>
                <span className="font-mono text-accent">
                  {Math.round(((flowSettings.Opacity ?? 0.95) <= 1 ? (flowSettings.Opacity ?? 0.95) * 100 : flowSettings.Opacity ?? 95))}%
                </span>
              </div>
              <Slider
                value={
                  (flowSettings.Opacity ?? 0.95) <= 1
                    ? (flowSettings.Opacity ?? 0.95) * 100
                    : flowSettings.Opacity ?? 95
                }
                min={50}
                max={100}
                step={5}
                onChange={(numericPercent) => {
                  const normalizedOpacity = numericPercent / 100;
                  updateSetting('Opacity', normalizedOpacity);
                }}
              />
            </div>

            {/* Windows Accent Color Sync Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-border-inactive/40">
              <div className="space-y-0.5">
                <label className="text-xs font-medium text-foreground-secondary">Sync System Accent</label>
                <p className="text-[10px] text-foreground-muted">Inherit active Windows palette highlight</p>
              </div>
              <Switch
                checked={flowSettings.UseWindowsAccentColor ?? false}
                onChange={(isSynced) => updateSetting('UseWindowsAccentColor', isSynced)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
