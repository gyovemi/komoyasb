import * as React from 'react';
import type { ThemeWallpaper } from '../../../types/ipc';
import { Input } from '../../ui/input';
import { Select } from '../../ui/select';
import { Image as ImageIcon } from 'lucide-react';
import { validatePath } from '../../../lib/validation';

/**
 * Component properties for the `WallpaperPicker` panel.
 */
export interface WallpaperPickerProps {
  /** Current desktop wallpaper path and fit configuration. */
  wallpaper: ThemeWallpaper;
  /** Callback fired when wallpaper source path or scale style changes. */
  onChange: (updatedWallpaper: ThemeWallpaper) => void;
}

const WALLPAPER_STYLES: Array<{ value: ThemeWallpaper['style']; label: string }> = [
  { value: 'Fill', label: 'Fill (Scale & Crop)' },
  { value: 'Fit', label: 'Fit (Letterbox)' },
  { value: 'Stretch', label: 'Stretch (Distort)' },
  { value: 'Tile', label: 'Tile (Pattern)' },
  { value: 'Center', label: 'Center (1:1 Native)' },
  { value: 'Span', label: 'Span (Multi-monitor span)' },
];

/**
 * Configures Windows 11 desktop wallpaper path and presentation style.
 *
 * Provides a responsive preview thumbnail with fallback handling when running
 * outside Tauri asset protocol context.
 *
 * @param props - Active wallpaper state and change handler.
 * @returns Wallpaper configuration card.
 */
export const WallpaperPicker: React.FC<WallpaperPickerProps> = ({ wallpaper, onChange }) => {
  const pathValidation = wallpaper.path && wallpaper.path.trim().length > 0
    ? validatePath(wallpaper.path)
    : { valid: true };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-border-inactive/40 pb-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground-primary">Desktop Wallpaper</h3>
          <p className="text-xs text-foreground-muted">
            Configure system desktop background image and Windows 11 desktop presentation style.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground-secondary">Wallpaper Path</label>
            <div className="flex flex-col gap-1">
              <Input
                value={wallpaper.path}
                onChange={(event) => onChange({ ...wallpaper, path: event.target.value })}
                placeholder="C:\Users\username\Pictures\wallpaper.jpg"
                className={`font-mono text-xs ${!pathValidation.valid ? 'border-status-error' : ''}`}
              />
              {!pathValidation.valid && (
                <span className="text-[11px] text-status-error">{pathValidation.error}</span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground-secondary">Fit / Scale Mode</label>
            <Select
              value={wallpaper.style}
              options={WALLPAPER_STYLES}
              onChange={(selectedStyle) => onChange({ ...wallpaper, style: selectedStyle as ThemeWallpaper['style'] })}
            />
          </div>
        </div>

        {/* Live Wallpaper Preview Thumbnail */}
        <div className="flex flex-col items-center justify-center p-3 rounded-xl border border-border-inactive bg-background-surface/50 aspect-video relative overflow-hidden group">
          {wallpaper.path ? (
            <img
              src={`https://asset.localhost/${wallpaper.path.replace(/\\/g, '/')}`}
              onError={(errorEvent) => {
                // If local image doesn't load via Tauri custom protocol, fallback gracefully
                (errorEvent.target as HTMLElement).style.display = 'none';
              }}
              alt="Wallpaper preview"
              className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
            />
          ) : null}
          <div className="relative z-10 flex flex-col items-center justify-center p-4 text-center bg-background-primary/80 backdrop-blur-sm rounded-lg border border-border-inactive/60">
            <ImageIcon className="w-6 h-6 text-accent mb-1" />
            <span className="text-xs font-medium text-foreground-primary">
              {wallpaper.path ? wallpaper.path.split(/\\|\//).pop() : 'No image specified'}
            </span>
            <span className="text-[10px] text-foreground-muted uppercase tracking-wider mt-0.5">
              Mode: {wallpaper.style}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
