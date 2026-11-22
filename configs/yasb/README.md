# Komoyasb Status Bar Subsystem (YASB Reborn)

This directory contains the status bar templates, custom widget providers, and stylesheets for **YASB Reborn (v2.0.8+)**, configured for deep integration with **Komorebi Window Manager** and the unified theme engine.

---

## Directory Structure

```text
configs/yasb/
â”œâ”€â”€ config.yaml.template      # Main YASB Reborn status bar template
â”œâ”€â”€ styles.css.template       # Status bar stylesheet template with token bindings
â”œâ”€â”€ custom_widgets/           # External custom script widgets
â”‚   â”œâ”€â”€ Get-GpuMetrics.ps1    # GPU load & temperature sensor (JSON output)
â”‚   â””â”€â”€ Get-KomorebiStatus.ps1# Komorebi IPC state collector
â””â”€â”€ README.md                 # Subsystem documentation
```

---

## Architecture & Design Principles

1. **YASB Reborn v2 Schema Alignment**:
   - Uses the modern `bars:` root mapping with screen selector `screens: ["*"]`.
   - Utilizes `widgets:` definitions specifying explicit widget types such as `komorebi.workspaces.WorkspaceWidget`, `yasb.active_window.ActiveWindowWidget`, `yasb.media.MediaWidget`, `yasb.clock.ClockWidget`, `yasb.cpu.CpuWidget`, `yasb.memory.MemoryWidget`, `yasb.traffic.TrafficWidget`, `yasb.volume.VolumeWidget`, `yasb.systray.SystrayWidget`, and `yasb.power_menu.PowerMenuWidget`.
   - Window flags specify `windows_app_bar: true` to reserve desktop work area margins synchronously on startup, preventing overlap with tiled Komorebi windows.

2. **Unified Mustache Token Engine**:
   - All colors and styling are parameterized using `{{<category>.<key>}}` syntax resolved by `scripts/sync-theme.ps1`.
   - Color tokens: `{{colors.bg_primary}}`, `{{colors.bg_secondary}}`, `{{colors.bg_surface}}`, `{{colors.fg_primary}}`, `{{colors.fg_secondary}}`, `{{colors.fg_muted}}`, `{{colors.accent}}`, `{{colors.accent_secondary}}`, `{{colors.border_active}}`, `{{colors.border_inactive}}`, `{{colors.error}}`, `{{colors.warning}}`, `{{colors.success}}`, `{{colors.info}}`.
   - Computed alpha tokens: `{{colors.bg_primary_alpha85}}`, `{{colors.bg_secondary_alpha80}}`, `{{colors.bg_surface_alpha80}}`.
   - Geometry & Typography tokens: `{{typography.font_family}}`, `{{typography.font_size_sm}}`, `{{typography.font_size_md}}`, `{{typography.font_size_lg}}`, `{{geometry.border_radius}}`, `{{geometry.border_width}}`, `{{geometry.bar_height}}`.

3. **Zero Layout Jitter**:
   - Fixed heights matching `{{geometry.bar_height}}px` on `.yasb-bar`.
   - Dedicated minimum button widths and explicit padding on workspace selectors.
   - Text truncation rules (`max_length: 50` on active window, `max_field_size` on media metadata) prevent bar resize jumps when switching windows or media tracks.
   - Tabular, monospaced iconography powered by **JetBrainsMono Nerd Font** (e.g., `ó°˜³`, `ó°›`, `ó°˜š`, `ó°•’`, `ó°‡š`, `ó°¥`).

4. **Integration with Komorebi**:
   - `komorebi_workspaces` natively tracks active, populated, and empty workspaces.
   - Mouse scroll switching is enabled over workspace buttons.
   - Includes workspace layer indicator toggle button (`ó±‚¬ Tiling` / `ó±‚­ Floating`).

---

## Compiling and Deploying

The templates are automatically rendered into runtime configuration files by running:
```powershell
pwsh scripts/sync-theme.ps1 -Theme dark
```
This generates:
- Workspace targets: `configs/yasb/config.yaml` & `configs/yasb/styles.css`
- Runtime targets: `~/.config/yasb/config.yaml` & `~/.config/yasb/styles.css`

