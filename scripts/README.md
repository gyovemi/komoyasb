# Core Engine & Lifecycle Management

This subsystem provides the unified orchestrator, provisioning pipeline, template rendering engine, process supervisor, and 1-command complete rollback mechanism for the **komoyasb** Windows 11 tiling and desktop environment.

---

## Architecture Overview

```
scripts/
â”œâ”€â”€ helpers/
â”‚   â”œâ”€â”€ Environment.psm1      # System detection, winget integration, backup routines
â”‚   â””â”€â”€ TemplateEngine.psm1   # Mustache token parser & color/opacity math engine
â”œâ”€â”€ install.ps1               # Detect-first provisioner & config deployer
â”œâ”€â”€ uninstall.ps1             # 1-command transactional rollback & cleanup
â”œâ”€â”€ sync-theme.ps1            # Token compiler (theme.json -> runtime configs)
â”œâ”€â”€ watchdog.ps1              # Process monitor & restart loop supervisor
â””â”€â”€ README.md                 # Subsystem documentation
```

---

## Scripts & Usage

### 1. Unified Provisioner (`install.ps1`)
Runs detect-first provisioning using winget and native commands, establishes timestamped backups of existing configs under `themes/.backups/<timestamp>`, renders active theme templates, and configures runtime files.

```powershell
# Standard installation (Tokyo Night Dark)
.\src\core\install.ps1

# With Windhawk mod injection enabled
.\src\core\install.ps1 -Theme dark -ApplyWindhawk

# Dry-run / What-If verification
.\src\core\install.ps1 -DryRun
```

### 2. Transactional Rollback Engine (`uninstall.ps1`)
Safely stops all managed processes (`komorebi`, `whkd`, `yasb`), unloads Windhawk mods (restoring the Windows taskbar and DWM composition), restores original files from the latest backup manifest, and removes generated artifacts.

```powershell
# Complete 1-command rollback
.\src\core\uninstall.ps1

# Dry-run preview of rollback
.\src\core\uninstall.ps1 -DryRun

# Rollback and uninstall winget packages
.\src\core\uninstall.ps1 -RemovePackages
```

### 3. Unified Theme Compiler (`sync-theme.ps1`)
Reads a theme definition from `themes/<name>.json` (validated against `themes/theme.schema.json`), dynamically generates alpha and rgb token variants, and compiles all `*.template` files into their active configuration files.

```powershell
# Compile Tokyo Night Dark
.\src\core\sync-theme.ps1 -Theme dark

# Compile Tokyo Night Light
.\src\core\sync-theme.ps1 -Theme light
```

Supported tokens include:
- `{{colors.<key>}}` (e.g. `{{colors.accent}}`)
- `{{colors.<key>_alpha<pct>}}` (e.g. `{{colors.accent_alpha80}}` -> `rgba(122, 162, 247, 0.80)`)
- `{{typography.<key>}}` (e.g. `{{typography.font_family}}`)
- `{{geometry.<key>}}` (e.g. `{{geometry.border_radius}}`)
- `{{opacity.<key>}}` (e.g. `{{opacity.bar}}`)
- `{{wallpaper.path}}` (Absolute normalized path)

### 4. Process Supervisor & Watchdog (`watchdog.ps1`)
Supervises `komorebi`, `whkd`, and `yasb` with staged startup ordering, readiness checks (such as `komorebic ping`), and automated restart recovery with exponential backoff thresholds (max 3 restarts per 60 seconds) to prevent crash loops.

```powershell
# Launch full desktop stack
.\src\core\watchdog.ps1 -Action Start

# Check current status of managed processes
.\src\core\watchdog.ps1 -Action Status

# Run supervisor watchdog loop
.\src\core\watchdog.ps1 -Action Monitor

# Gracefully stop the stack
.\src\core\watchdog.ps1 -Action Stop
```

