# Launcher & Shell Subsystem (`src/launcher_shell`)

This subsystem manages the fast application launcher (**Flow Launcher**) and low-level Windows Desktop Window Manager (DWM) shell enhancements (**Windhawk C++ Mods**).

---

## 1. Directory Structure

```text
configs/shell/
â”œâ”€â”€ flow_settings.json.template   # Dynamic Flow Launcher preferences (hotkeys, fonts, effects)
â”œâ”€â”€ flow_theme.fluent.template     # XAML fluent theme resource dictionary for Flow Launcher
â”œâ”€â”€ windhawk_mods/                 # Declarative Windhawk C++ mods
â”‚   â”œâ”€â”€ taskbar-autohide.wh.cpp    # Hooks Explorer to auto-hide / suppress Windows 11 taskbar
â”‚   â”œâ”€â”€ dwm-mica-effects.wh.cpp    # Injects DWM Mica, Acrylic, and dark mode attributes
â”‚   â””â”€â”€ notification-styling.wh.cpp# Hooks toast notifications to harmonize geometry & borders
â”œâ”€â”€ apply-windhawk-mods.ps1        # PowerShell management script for loading/unloading mods
â””â”€â”€ README.md                      # Subsystem documentation
```

---

## 2. Flow Launcher Integration

- **Settings Template (`flow_settings.json.template`)**:
  - Hotkey bound to `Alt + Space` for rapid access.
  - Configures `Mica` window and preview effects.
  - Matches border radius with `{{geometry.border_radius}}` and launcher opacity with `{{opacity.launcher}}`.
  - Sets custom accent color using `{{colors.accent}}` and font family using `{{typography.font_family}}`.
  - Target Path: `%APPDATA%\FlowLauncher\Settings\Settings.json`

- **Fluent Theme Template (`flow_theme.fluent.template`)**:
  - Pure XAML `ResourceDictionary` that consumes theme tokens directly (`{{colors.bg_primary}}`, `{{colors.accent}}`, etc.).
  - Target Path: `%APPDATA%\FlowLauncher\Themes\KomoyasbFluent.xaml`

---

## 3. Windhawk Mods Specification

All mods use documented IDs for deterministic lifecycle management and 100% reversible rollback:

| Mod ID | Source File | Target Process | Description |
| :--- | :--- | :--- | :--- |
| `taskbar-autohide` | `taskbar-autohide.wh.cpp` | `explorer.exe` | Hides primary and secondary taskbars to yield entire display to YASB & Komorebi. Restores taskbar on unload. |
| `dwm-mica-effects` | `dwm-mica-effects.wh.cpp` | `dwm.exe`, `explorer.exe` | Enforces `DwmSetWindowAttribute` (`DWMWA_SYSTEMBACKDROP_TYPE`, `DWMWA_USE_IMMERSIVE_DARK_MODE`, `DWMWA_WINDOW_CORNER_PREFERENCE`). |
| `notification-styling` | `notification-styling.wh.cpp` | `explorer.exe`, `ShellExperienceHost.exe` | Harmonizes toast notification corner radius and opacity. |

---

## 4. Windhawk Management CLI Script (`apply-windhawk-mods.ps1`)

Automates compilation, injection, and rollback with Windhawk's engine CLI (`windhawk-cli.exe`).

### Commands

**Load and apply all mods:**
```powershell
.\apply-windhawk-mods.ps1 -Action Load
```

**Unload / rollback all mods:**
```powershell
.\apply-windhawk-mods.ps1 -Action Unload
```

**Unload a specific mod (e.g., restore taskbar):**
```powershell
.\apply-windhawk-mods.ps1 -Action Unload -ModId taskbar-autohide
```

**Dry run / simulation:**
```powershell
.\apply-windhawk-mods.ps1 -Action Load -DryRun
```

---

## 5. Token Engine Compatibility

All `.template` files strictly comply with `ARCHITECTURE.md`:
- Colors: `{{colors.bg_primary}}`, `{{colors.bg_secondary}}`, `{{colors.bg_surface}}`, `{{colors.fg_primary}}`, `{{colors.fg_secondary}}`, `{{colors.fg_muted}}`, `{{colors.accent}}`, `{{colors.accent_secondary}}`, `{{colors.border_active}}`, `{{colors.border_inactive}}`
- Typography: `{{typography.font_family}}`
- Geometry: `{{geometry.border_radius}}`, `{{geometry.border_width}}`
- Opacity: `{{opacity.launcher}}`

