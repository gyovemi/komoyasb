# Media, Audio OSD & Wallpaper Subsystem (`src/media_osd`)

Provides native audio OSD, per-app volume management, and wallpaper synchronization for the KomoYASB desktop environment.

## Components

1. **FluentFlyout (`fluentflyout_config.json.template`)**
   - High-performance, modern replacement for default Windows volume/brightness/media OSDs.
   - Clean top/bottom bar awareness configured via `Placement.OffsetY: {{geometry.bar_height}}` and `SafePaddingYASB: {{geometry.bar_height}}` to prevent collision with YASB status bar.
   - Fully tokenized theme styling (`{{colors.bg_primary}}`, `{{colors.accent}}`, `{{geometry.border_radius}}`, `{{opacity.flyout}}`, etc.).
   - Target configuration path: `%LOCALAPPDATA%\Packages\*FluentFlyout*\LocalState\settings.json`.

2. **EarTrumpet (`eartrumpet_settings.reg`)**
   - Per-application audio mixer and device switcher replacing legacy Windows volume tray.
   - Pre-configured registry entries ensuring accent color sync, minimal startup delay, and promoted tray icon visibility.
   - Imported during provisioning / theme synchronization.

3. **Wallpaper Synchronization (`sync-wallpaper.ps1`)**
   - Zero-bloat native Win32 API implementation using `SystemParametersInfoW(SPI_SETDESKWALLPAPER)`.
   - Modifies `HKCU:\Control Panel\Desktop` registry values (`WallpaperStyle`, `TileWallpaper`) and triggers instant shell refresh (`SPIF_UPDATEINIFILE | SPIF_SENDCHANGE`).
   - Supports `-DryRun` and `-WhatIf` simulation modes without altering host state.
   - Supported styles: `Fill`, `Fit`, `Stretch`, `Tile`, `Center`, `Span`.

4. **Assets (`assets/wallpapers/`)**
   - Generated high-resolution dual-tone wallpapers matching the design language:
     - `dark.png` (Tokyo Night Dark palette `#1a1b26` / `#7aa2f7`)
     - `light.png` (Tokyo Night Light palette `#e1e2e7` / `#34548a`)

## Usage Examples

### Wallpaper Synchronization
```powershell
# Dry run check
.\sync-wallpaper.ps1 -DryRun

# Set specific wallpaper with Fill style
.\sync-wallpaper.ps1 -Path "assets\wallpapers\dark.png" -Style Fill

# Set light wallpaper centered
.\sync-wallpaper.ps1 -Path "assets\wallpapers\light.png" -Style Center
```

### Registry Application
```powershell
reg import .\eartrumpet_settings.reg
```

## Winget Package Identification
- **EarTrumpet**: `File-New-Project.EarTrumpet` (winget source)
- **FluentFlyout**: `9N45NSM4TNBP` (Microsoft Store source via winget)

## Prohibitions
- ModernFlyouts and MicaForEveryone are strictly prohibited due to deprecation and stability issues on Windows 11 24H2+.
