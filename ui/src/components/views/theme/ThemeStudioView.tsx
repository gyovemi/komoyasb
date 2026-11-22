import * as React from 'react';
import type { UnifiedTheme, ThemeSummary } from '../../../types/ipc';
import { ColorTokensEditor } from './ColorTokensEditor';
import { TypographyGeometry } from './TypographyGeometry';
import { WallpaperPicker } from './WallpaperPicker';
import { PresetManager } from './PresetManager';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { Palette, Type, Image as ImageIcon, Bookmark } from 'lucide-react';

/**
 * Component properties for the root `ThemeStudioView`.
 */
export interface ThemeStudioViewProps {
  /** Currently loaded unified theme being edited. */
  theme: UnifiedTheme;
  /** List of all saved theme presets on disk. */
  themeSummaries: ThemeSummary[];
  /** Callback fired when in-memory theme values are updated. */
  onThemeChange: (updatedTheme: UnifiedTheme) => void;
  /** Callback fired when a theme preset is loaded from disk. */
  onLoadTheme: (themeName: string) => void;
  /** Callback fired when the active theme is saved to disk. */
  onSaveTheme: (targetTheme: UnifiedTheme) => void;
  /** Callback fired when a theme preset is made the host active theme. */
  onActivateTheme: (themeName: string) => void;
}

/**
 * Primary Theme Studio workbench view providing tabbed sub-editors for colors, geometry, wallpaper, and presets.
 *
 * @param props - Theme states, presets, and mutation callbacks.
 * @returns Complete Theme Studio workbench component.
 */
export const ThemeStudioView: React.FC<ThemeStudioViewProps> = ({
  theme,
  themeSummaries,
  onThemeChange,
  onLoadTheme,
  onSaveTheme,
  onActivateTheme,
}) => {
  const [activeSubTab, setActiveSubTab] = React.useState('colors');

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto max-w-6xl mx-auto">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-inactive/40">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground-primary">
              Theme Studio
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-accent/15 text-accent font-mono font-medium">
              {theme.name} ({theme.variant})
            </span>
          </div>
          <p className="text-xs text-foreground-muted mt-1">
            Single source of truth styling compiled across Komorebi borders, YASB CSS, and Flow Launcher.
          </p>
        </div>
      </div>

      {/* Tabs navigation */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
        <TabsList className="bg-background-surface/80 p-1 border border-border-inactive/40">
          <TabsTrigger value="colors" className="gap-2 text-xs">
            <Palette className="w-3.5 h-3.5 text-accent" />
            Color Tokens (14)
          </TabsTrigger>
          <TabsTrigger value="geometry" className="gap-2 text-xs">
            <Type className="w-3.5 h-3.5 text-accent-secondary" />
            Typography & Geometry
          </TabsTrigger>
          <TabsTrigger value="wallpaper" className="gap-2 text-xs">
            <ImageIcon className="w-3.5 h-3.5 text-status-info" />
            Wallpaper
          </TabsTrigger>
          <TabsTrigger value="presets" className="gap-2 text-xs">
            <Bookmark className="w-3.5 h-3.5 text-status-warning" />
            Presets & Profiles
          </TabsTrigger>
        </TabsList>

        <TabsContent value="colors">
          <div className="rounded-xl border border-border-inactive/50 bg-background-secondary/40 p-5 backdrop-blur-sm">
            <ColorTokensEditor
              colors={theme.colors}
              onChange={(newColors) => onThemeChange({ ...theme, colors: newColors })}
            />
          </div>
        </TabsContent>

        <TabsContent value="geometry">
          <div className="rounded-xl border border-border-inactive/50 bg-background-secondary/40 p-5 backdrop-blur-sm">
            <TypographyGeometry
              typography={theme.typography}
              geometry={theme.geometry}
              opacity={theme.opacity}
              onTypographyChange={(newTypography) => onThemeChange({ ...theme, typography: newTypography })}
              onGeometryChange={(newGeometry) => onThemeChange({ ...theme, geometry: newGeometry })}
              onOpacityChange={(newOpacity) => onThemeChange({ ...theme, opacity: newOpacity })}
            />
          </div>
        </TabsContent>

        <TabsContent value="wallpaper">
          <div className="rounded-xl border border-border-inactive/50 bg-background-secondary/40 p-5 backdrop-blur-sm">
            <WallpaperPicker
              wallpaper={theme.wallpaper}
              onChange={(newWallpaper) => onThemeChange({ ...theme, wallpaper: newWallpaper })}
            />
          </div>
        </TabsContent>

        <TabsContent value="presets">
          <div className="rounded-xl border border-border-inactive/50 bg-background-secondary/40 p-5 backdrop-blur-sm">
            <PresetManager
              currentTheme={theme}
              themeSummaries={themeSummaries}
              onLoadTheme={onLoadTheme}
              onSaveTheme={onSaveTheme}
              onActivateTheme={onActivateTheme}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
