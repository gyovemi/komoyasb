# KOMOYASB PERFORMANCE ARCHITECTURE CONTRACT
**Document Version:** 1.0.0  
**Status:** Approved Specification / Swarm Baseline Contract  
**Target Platform:** Windows 11 Build 22621+ (x86_64)  
**Authors:** Principal Windows Systems Performance Architect & Swarm Orchestrator

---

## 1. Executive Summary & Architectural Goals

The **komoyasb** desktop environment integrates several high-performance subsystems on top of Windows 11:
- **Komorebi:** Rust-based tiling window manager using native Win32/DWM APIs and event hooks.
- **YASB Reborn (`amnweb/yasb`):** Python/Qt6 status bar with asynchronous polling widgets, Win32 acrylic/mica backdrops, and CSS styling.
- **Flow Launcher:** WPF/.NET desktop search and execution hub.
- **FluentFlyout:** WinUI 3 modern OSD for media and volume notifications.
- **Windhawk:** Low-level injection runtime modifying Windows Taskbar, notification behavior, and DWM composition attributes.

### Core Problems Addressed
1. **CPU & Battery Overhead:** Indiscriminate polling intervals (1000–2000ms) on telemetry widgets (CPU, memory, network, GPU) trigger excessive scheduler wakeups and prevent CPU package C-states (C8/C10) on modern Intel/AMD laptops.
2. **GPU Render Budget & DWM Composition:** Overly aggressive Acrylic and Mica blur effects alongside high-FPS border redraws during window movement cause GPU compositor latency spikes and micro-stutter during 3D gaming or battery operation.
3. **Declarative Synchronization Gap:** Performance parameters have historically been hardcoded or separated across disconnected configuration files (`komorebi.json`, `config.yaml`, `flow_settings.json`), lacking unified profile management.

### Architectural Solution
This document defines an end-to-end, profile-based and granular performance architecture:
- **Declarative Schema (`performance.json`):** A typed JSON schema defining 4 built-in presets (`ultra-low`, `balanced`, `visual-rich`, `gaming`) with granular override capabilities.
- **Single Source of Truth Token Injection:** Performance tokens (`{{perf.*}}`) injected through the existing Template Engine (`scripts/lib/TemplateEngine.psm1`) and `scripts/sync-theme.ps1` with zero leftover tokens.
- **Isolated Swarm Ownership:** Zero file overlap across 4 dedicated Swarm workers (`@perf-engine`, `@perf-wm-bar`, `@perf-shell-os`, `@perf-ui`).
- **Strict Safety & Rollback:** Fully intercepted by `DryRunContext.psm1`, zero host mutation during verification, and reversible through `uninstall.ps1`.

---

## 2. Unified Performance Configuration Schema (`performance.json`)

The performance system introduces `performance.json` at the repository root and profile runtime state in `themes/.current_perf` (similar to `themes/.current_theme`).

### 2.1 Complete JSON Schema Definition

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "KomoyasbPerformanceConfig",
  "type": "object",
  "required": ["active_profile", "profiles"],
  "properties": {
    "active_profile": {
      "type": "string",
      "enum": ["ultra-low", "balanced", "visual-rich", "gaming", "custom"]
    },
    "profiles": {
      "type": "object",
      "required": ["ultra-low", "balanced", "visual-rich", "gaming"],
      "properties": {
        "ultra-low": { "$ref": "#/definitions/ProfileDefinition" },
        "balanced": { "$ref": "#/definitions/ProfileDefinition" },
        "visual-rich": { "$ref": "#/definitions/ProfileDefinition" },
        "gaming": { "$ref": "#/definitions/ProfileDefinition" },
        "custom": { "$ref": "#/definitions/ProfileDefinition" }
      }
    }
  },
  "definitions": {
    "ProfileDefinition": {
      "type": "object",
      "required": ["komorebi", "yasb", "dwm", "launcher", "flyout", "os"],
      "properties": {
        "komorebi": {
          "type": "object",
          "required": [
            "animation_enabled",
            "animation_duration_ms",
            "animation_fps",
            "border_enabled",
            "border_width",
            "border_offset",
            "border_style",
            "border_implementation",
            "unmanaged_window_operation_behaviour",
            "transparency_enabled",
            "window_hiding_behaviour"
          ],
          "properties": {
            "animation_enabled": { "type": "boolean" },
            "animation_duration_ms": { "type": "integer", "minimum": 0, "maximum": 1000 },
            "animation_fps": { "type": "integer", "minimum": 15, "maximum": 240 },
            "border_enabled": { "type": "boolean" },
            "border_width": { "type": "integer", "minimum": 0, "maximum": 16 },
            "border_offset": { "type": "integer", "minimum": -5, "maximum": 5 },
            "border_style": { "type": "string", "enum": ["rounded", "square", "system"] },
            "border_implementation": { "type": "string", "enum": ["Komorebi", "Windows"] },
            "unmanaged_window_operation_behaviour": { "type": "string", "enum": ["Op", "NoOp"] },
            "transparency_enabled": { "type": "boolean" },
            "window_hiding_behaviour": { "type": "string", "enum": ["Cloak", "Hide", "Minimize"] }
          }
        },
        "yasb": {
          "type": "object",
          "required": [
            "blur_enabled",
            "acrylic_enabled",
            "round_corners",
            "animation_duration_ms",
            "cpu_interval_ms",
            "memory_interval_ms",
            "traffic_interval_ms",
            "media_interval_ms",
            "clock_interval_ms",
            "gpu_interval_ms"
          ],
          "properties": {
            "blur_enabled": { "type": "boolean" },
            "acrylic_enabled": { "type": "boolean" },
            "round_corners": { "type": "boolean" },
            "animation_duration_ms": { "type": "integer", "minimum": 0, "maximum": 1000 },
            "cpu_interval_ms": { "type": "integer", "minimum": 500, "maximum": 60000 },
            "memory_interval_ms": { "type": "integer", "minimum": 500, "maximum": 60000 },
            "traffic_interval_ms": { "type": "integer", "minimum": 500, "maximum": 60000 },
            "media_interval_ms": { "type": "integer", "minimum": 200, "maximum": 30000 },
            "clock_interval_ms": { "type": "integer", "minimum": 1000, "maximum": 60000 },
            "gpu_interval_ms": { "type": "integer", "minimum": 1000, "maximum": 60000 }
          }
        },
        "dwm": {
          "type": "object",
          "required": [
            "backdrop_type",
            "force_dark_mode",
            "rounded_corners",
            "reduce_motion",
            "taskbar_autohide_enabled"
          ],
          "properties": {
            "backdrop_type": { "type": "integer", "enum": [1, 2, 3, 4], "description": "1=None, 2=Mica, 3=Acrylic, 4=MicaAlt" },
            "force_dark_mode": { "type": "boolean" },
            "rounded_corners": { "type": "integer", "enum": [1, 2, 3], "description": "1=Rectangular, 2=Rounded, 3=SmallRounded" },
            "reduce_motion": { "type": "boolean" },
            "taskbar_autohide_enabled": { "type": "boolean" }
          }
        },
        "launcher": {
          "type": "object",
          "required": [
            "use_animation",
            "animation_speed",
            "search_window_effect",
            "shadow_effect",
            "max_results",
            "plugin_cache_max"
          ],
          "properties": {
            "use_animation": { "type": "boolean" },
            "animation_speed": { "type": "string", "enum": ["Slow", "Medium", "Fast"] },
            "search_window_effect": { "type": "string", "enum": ["None", "Blur", "Acrylic", "Mica"] },
            "shadow_effect": { "type": "boolean" },
            "max_results": { "type": "integer", "minimum": 3, "maximum": 15 },
            "plugin_cache_max": { "type": "integer", "minimum": 10, "maximum": 1000 }
          }
        },
        "flyout": {
          "type": "object",
          "required": [
            "backdrop",
            "animate_show",
            "animate_hide",
            "animation_duration_ms",
            "timeout_ms"
          ],
          "properties": {
            "backdrop": { "type": "string", "enum": ["None", "Mica", "Acrylic", "MicaAlt"] },
            "animate_show": { "type": "boolean" },
            "animate_hide": { "type": "boolean" },
            "animation_duration_ms": { "type": "integer", "minimum": 0, "maximum": 500 },
            "timeout_ms": { "type": "integer", "minimum": 1000, "maximum": 10000 }
          }
        },
        "os": {
          "type": "object",
          "required": [
            "background_eco_qos",
            "komorebi_priority",
            "yasb_priority",
            "disable_windows_animations"
          ],
          "properties": {
            "background_eco_qos": { "type": "boolean", "description": "Enable Win32 PROCESS_POWER_THROTTLING_EXECUTION_SPEED for helper tools" },
            "komorebi_priority": { "type": "string", "enum": ["Normal", "AboveNormal", "High"] },
            "yasb_priority": { "type": "string", "enum": ["Idle", "BelowNormal", "Normal"] },
            "disable_windows_animations": { "type": "boolean", "description": "Toggle Windows SPI_SETCLIENTAREAANIMATION & MinAnimate" }
          }
        }
      }
    }
  }
}
```

---

## 3. The 4 Built-In Performance Presets

| Metric / Dimension | `ultra-low` (Battery / Server) | `balanced` (Default Day-to-Day) | `visual-rich` (Workstation / Demo) | `gaming` (Max FPS / Low Latency) |
| :--- | :--- | :--- | :--- | :--- |
| **Philosophy** | Zero animations, 0% DWM overhead, relaxed polling (5s–10s) | Crisp 60fps animations, standard polling (2s–3s), native Mica | Silky 120fps animations, fast polling (1s), Acrylic blur & shadows | Complete animations pause, DWM borders off or native Win11, zero polling noise |
| **Komorebi Animation** | `false` (0ms, 0 fps) | `true` (150ms, 60 fps) | `true` (250ms, 120 fps) | `false` (0ms, 0 fps) |
| **Komorebi Border** | `border: false` or Windows native | `border: true` (2px, Rounded, Komorebi) | `border: true` (3px, Rounded, Komorebi) | `border: false` (or `Windows` implementation) |
| **Komorebi Unmanaged** | `NoOp` | `Op` | `Op` | `NoOp` (ignore non-game windows) |
| **YASB Bar Blur** | `enabled: false`, `acrylic: false` | `enabled: true`, `acrylic: false` | `enabled: true`, `acrylic: true` | `enabled: false` (solid background) |
| **YASB Telemetry (CPU/Mem/Net)** | `cpu: 10000ms`, `mem: 15000ms`, `net: 10000ms` | `cpu: 2000ms`, `mem: 3000ms`, `net: 2000ms` | `cpu: 1000ms`, `mem: 2000ms`, `net: 1000ms` | `cpu: 30000ms`, `mem: 30000ms`, `net: 30000ms` |
| **YASB GPU Metric** | `30000ms` | `5000ms` | `2000ms` | `disabled` / `60000ms` (no DXGI polling) |
| **YASB Animations** | `0ms` (instant menu popup) | `150ms` | `250ms` | `0ms` |
| **DWM Backdrop (Windhawk)** | `1` (None - standard solid paint) | `2` (Mica - fast hardware compositing) | `3` (Acrylic - heavy blur) | `1` (None - bypass DWM composition effects) |
| **Flow Launcher Effect** | `None`, `UseAnimation: false` | `Mica`, `AnimationSpeed: Fast` | `Acrylic`, `AnimationSpeed: Medium`, `Shadow: true` | `None`, `UseAnimation: false`, `Shadow: false` |
| **FluentFlyout OSD** | `Backdrop: None`, `Animate: false` | `Backdrop: MicaAlt`, `Animate: true` (150ms) | `Backdrop: Acrylic`, `Animate: true` (250ms) | `Backdrop: None`, `Animate: false` (0ms) |
| **OS QoS & Process Priority** | EcoQoS: `true`, Komorebi: `Normal`, YASB: `BelowNormal` | EcoQoS: `false`, Komorebi: `Normal`, YASB: `Normal` | EcoQoS: `false`, Komorebi: `Normal`, YASB: `Normal` | EcoQoS: `false`, Komorebi: `AboveNormal`, YASB: `Idle` |

---

## 4. Exact Token Reference Matrix

When the Theme Engine executes `sync-theme.ps1` and `TemplateEngine.psm1`, it loads `themes/<theme>.json` AND `performance.json` (active profile). The tokens are flattened and prefixed with `perf.`.

| Template Token | Type | Target Configuration | Description |
| :--- | :--- | :--- | :--- |
| `{{perf.komorebi.animation_enabled}}` | `boolean` | `configs/komorebi/komorebi.json.template` | Controls global window movement animations |
| `{{perf.komorebi.animation_duration_ms}}` | `number` | `configs/komorebi/komorebi.json.template` | Animation duration in milliseconds (e.g., 0, 150, 250) |
| `{{perf.komorebi.animation_fps}}` | `number` | `configs/komorebi/komorebi.json.template` | Animation frame rate target (e.g., 30, 60, 120) |
| `{{perf.komorebi.border_enabled}}` | `boolean` | `configs/komorebi/komorebi.json.template` | Window borders master switch (`border: true/false`) |
| `{{perf.komorebi.border_width}}` | `number` | `configs/komorebi/komorebi.json.template` | Window border stroke thickness |
| `{{perf.komorebi.border_offset}}` | `number` | `configs/komorebi/komorebi.json.template` | Window border pixel offset |
| `{{perf.komorebi.border_style}}` | `string` | `configs/komorebi/komorebi.json.template` | `"rounded"`, `"square"`, or `"system"` |
| `{{perf.komorebi.border_implementation}}`| `string` | `configs/komorebi/komorebi.json.template` | `"Komorebi"` or `"Windows"` |
| `{{perf.komorebi.unmanaged_behaviour}}` | `string` | `configs/komorebi/komorebi.json.template` | `"Op"` or `"NoOp"` |
| `{{perf.komorebi.transparency_enabled}}` | `boolean` | `configs/komorebi/komorebi.json.template` | Window alpha transparency toggle |
| `{{perf.yasb.blur_enabled}}` | `boolean` | `configs/yasb/config.yaml.template` | YASB bar `blur_effect.enabled` |
| `{{perf.yasb.acrylic_enabled}}` | `boolean` | `configs/yasb/config.yaml.template` | YASB bar `blur_effect.acrylic` |
| `{{perf.yasb.round_corners}}` | `boolean` | `configs/yasb/config.yaml.template` | YASB bar `blur_effect.round_corners` |
| `{{perf.yasb.animation_duration_ms}}` | `number` | `configs/yasb/config.yaml.template` | YASB menu popup animation duration |
| `{{perf.yasb.cpu_interval_ms}}` | `number` | `configs/yasb/config.yaml.template` | Polling frequency for `yasb.cpu.CpuWidget` |
| `{{perf.yasb.memory_interval_ms}}` | `number` | `configs/yasb/config.yaml.template` | Polling frequency for `yasb.memory.MemoryWidget` |
| `{{perf.yasb.traffic_interval_ms}}` | `number` | `configs/yasb/config.yaml.template` | Polling frequency for `yasb.traffic.TrafficWidget` |
| `{{perf.yasb.transition_duration}}` | `string` | `configs/yasb/styles.css.template` | CSS transition timing (e.g. `0s` or `0.15s ease`) |
| `{{perf.flow.use_animation}}` | `boolean` | `configs/shell/flow_settings.json.template` | Flow Launcher `UseAnimation` toggle |
| `{{perf.flow.animation_speed}}` | `string` | `configs/shell/flow_settings.json.template` | Flow Launcher `AnimationSpeed` (`Fast`/`Medium`/`Slow`) |
| `{{perf.flow.search_window_effect}}` | `string` | `configs/shell/flow_settings.json.template` | Effect: `"None"`, `"Blur"`, `"Acrylic"`, `"Mica"` |
| `{{perf.flow.shadow_effect}}` | `boolean` | `configs/shell/flow_settings.json.template` | Flow Launcher `ShadowEffect` toggle |
| `{{perf.flow.max_results}}` | `number` | `configs/shell/flow_settings.json.template` | `MaxResultsToShow` limiter |
| `{{perf.flyout.backdrop}}` | `string` | `configs/polish/fluentflyout_config.json.template` | Flyout backdrop material |
| `{{perf.flyout.animate_show}}` | `boolean` | `configs/polish/fluentflyout_config.json.template` | OSD animate entrance |
| `{{perf.flyout.animate_hide}}` | `boolean` | `configs/polish/fluentflyout_config.json.template` | OSD animate exit |
| `{{perf.flyout.animation_duration_ms}}`| `number` | `configs/polish/fluentflyout_config.json.template` | Duration for flyout fade/slide |
| `{{perf.flyout.timeout_ms}}` | `number` | `configs/polish/fluentflyout_config.json.template` | Auto-dismiss timeout in ms |

---

## 5. Swarm Worker Ownership Map (Zero File Overlap)

To prevent merge conflicts and coordination stalls across the 4 Swarm subagents, file ownership is strictly partitioned with zero overlapping paths.

```
                    ┌──────────────────────────────────────────────┐
                    │               SWARM COORDINATOR              │
                    └──────────────────────┬───────────────────────┘
                                           │
        ┌──────────────────┬───────────────┴──────────────┬──────────────────┐
        │                  │                              │                  │
        ▼                  ▼                              ▼                  ▼
┌───────────────┐  ┌───────────────┐              ┌───────────────┐  ┌───────────────┐
│ @perf-engine  │  │ @perf-wm-bar  │              │ @perf-shell-os│  │   @perf-ui    │
└───────┬───────┘  └───────┬───────┘              └───────┬───────┘  └───────┬───────┘
        │                  │                              │                  │
        │                  │                              │                  │
  • performance.json • komorebi.json.template       • flow_settings.template  • ui/src-tauri/
  • Set-PerfProfile  • config.yaml.template         • fluentflyout.template   • ui/src/
  • sync-theme.ps1   • styles.css.template          • Set-OsPerformance.ps1   • PerformanceTab
  • TemplateEngine   • Get-GpuMetrics.ps1           • Windhawk mods config    • IPC bindings
```

### 5.1 Worker `@perf-engine` (Core Token Engine & Profile State)
- **Role:** Performance Engine Architect
- **Exclusive File Ownership:**
  - `performance.json` (New root configuration with schemas and preset values)
  - `themes/performance.schema.json` (JSON schema for validation)
  - `scripts/Set-PerformanceProfile.ps1` (New CLI switcher script supporting `-Profile`, `-DryRun`, `-WhatIf`)
  - `scripts/lib/TemplateEngine.psm1` (Enhance to ingest both theme and performance tokens without breaking backward compatibility)
  - `scripts/sync-theme.ps1` (Wire performance token loading and pass-through to template renderer)
- **Deliverables:**
  1. Creates `performance.json` with all 4 presets.
  2. Modifies `TemplateEngine.psm1` to merge `$tokens["perf.<category>.<property>"]`.
  3. Implements `scripts/Set-PerformanceProfile.ps1` which sets active profile in `performance.json` and `themes/.current_perf`, then calls `sync-theme.ps1`.

### 5.2 Worker `@perf-wm-bar` (Window Manager & Status Bar Templates)
- **Role:** WM & Bar Performance Engineer
- **Exclusive File Ownership:**
  - `configs/komorebi/komorebi.json.template`
  - `configs/komorebi/komorebi.json`
  - `configs/yasb/config.yaml.template`
  - `configs/yasb/config.yaml`
  - `configs/yasb/styles.css.template`
  - `configs/yasb/styles.css`
  - `configs/yasb/widgets/Get-GpuMetrics.ps1` (Add polling backoff / skip when gaming profile is active)
- **Deliverables:**
  1. Replaces hardcoded animation and border settings in `komorebi.json.template` with `{{perf.komorebi.*}}`.
  2. Replaces hardcoded polling intervals (`cpu`, `memory`, `traffic`, `media`, `power_menu`) in `config.yaml.template` with `{{perf.yasb.*}}`.
  3. Updates `styles.css.template` with parameterized transition durations (`{{perf.yasb.transition_duration}}`).
  4. Updates `Get-GpuMetrics.ps1` with lightweight querying when throttled.

### 5.3 Worker `@perf-shell-os` (Shell Modals, Flyouts & Windows OS QoS Hooks)
- **Role:** Windows Shell & System Performance Engineer
- **Exclusive File Ownership:**
  - `configs/shell/flow_settings.json.template`
  - `configs/shell/flow_settings.json`
  - `configs/polish/fluentflyout_config.json.template`
  - `configs/polish/fluentflyout_config.json`
  - `scripts/Set-OsPerformance.ps1` (New module for safe, reversible Windows visual effects, EcoQoS, and process priority adjustments)
  - `scripts/apply-windhawk-mods.ps1` (Add parameter to toggle backdrop type 1/2/3 dynamically based on profile)
- **Deliverables:**
  1. Binds Flow Launcher animation and effect settings to `{{perf.flow.*}}`.
  2. Binds FluentFlyout backdrop and animation settings to `{{perf.flyout.*}}`.
  3. Implements `Set-OsPerformance.ps1` utilizing native Win32 `SetProcessInformation` (`PROCESS_POWER_THROTTLING_EXECUTION_SPEED`) for background workers and `SetPriorityClass` for `komorebi`/`yasb`. Fully respects `-DryRun`.

### 5.4 Worker `@perf-ui` (Tauri IPC & Performance Frontend Tab)
- **Role:** Tauri & React Desktop Frontend Engineer
- **Exclusive File Ownership:**
  - `ui/src-tauri/src/commands/performance.rs` (New Tauri command module)
  - `ui/src-tauri/src/commands/mod.rs` (Add `pub mod performance;`)
  - `ui/src-tauri/src/lib.rs` (Register performance invoke handlers)
  - `ui/src/types/ipc.ts` (Add Performance TypeScript interfaces)
  - `ui/src/lib/ipc.ts` (Add `performanceApi` invoke wrappers)
  - `ui/src/components/shell/Navigation.tsx` (Add `'performance'` tab with `Gauge` or `Zap` icon)
  - `ui/src/App.tsx` (Wire navigation and view routing)
  - `ui/src/components/views/performance/` (New component directory: `PerformanceView.tsx`, `PresetSelector.tsx`, `GranularSettings.tsx`)
- **Deliverables:**
  1. Rust commands: `get_performance_config`, `set_performance_profile`, `save_performance_config`.
  2. Interactive UI tab with 4 Preset Cards (`ultra-low`, `balanced`, `visual-rich`, `gaming`), visual metric badges (Estimated CPU/GPU impact), and granular sliders for polling intervals.
  3. Seamless dry-run support that interacts with the backend sandbox.

---

## 6. Safety, Rollback & Dry-Run Guarantees

Every performance intervention must adhere to the project's zero-side-effect standards:

### 6.1 Interception via `DryRunContext.psm1`
- When `-DryRun` is active (or `$env:KOMOYASB_DRY_RUN = "1"`), all template renderings target the isolated shadow directory (e.g., `%TEMP%\komoyasb-dryrun-*`).
- `Set-OsPerformance.ps1` MUST call `Invoke-SystemAction -ActionType "ProcessControl" -Target "EcoQoS"` so actions are recorded in the execution ledger and NEVER modify live OS process state during tests.
- Windhawk mod changes in `-DryRun` mode write to the shadow configuration store rather than calling `windhawk-cli.exe`.

### 6.2 100% Rollback via `uninstall.ps1`
- `uninstall.ps1` must be updated to restore default OS process priority classes (Normal) and reset EcoQoS masks to 0 (unthrottled).
- Windhawk mods unloaded via `apply-windhawk-mods.ps1 -Action Unload` inherently restore default Windows 11 DWM compositing and taskbar behaviors.
- Restoring host configs (`komorebi.json`, `config.yaml`, `flow_settings.json`) from backups or removing them leaves standard Windows 11 desktop intact.

---

## 7. Verification & Final QA Gate

Before any branch can be merged, the implementation must pass the following 5-phase automated gate:

```powershell
# Phase 1: PowerShell Syntax and AST Integrity Check
Get-ChildItem -Path scripts, configs -Recurse -Filter "*.ps1" | ForEach-Object {
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$null, [ref]$errors)
    if ($errors) { throw "AST Parse error in $($_.FullName): $errors" }
}

# Phase 2: Multi-Profile Rendering & Leftover Token Scan
$profiles = @("ultra-low", "balanced", "visual-rich", "gaming")
foreach ($p in $profiles) {
    .\scripts\Set-PerformanceProfile.ps1 -Profile $p -DryRun
    # Assert zero unrendered {{perf.*}} or {{...}} tokens across rendered files
    $renderedFiles = Get-ChildItem -Path configs -Recurse -Include "*.json", "*.yaml", "*.css"
    foreach ($file in $renderedFiles) {
        $matches = Select-String -Path $file.FullName -Pattern '\{\{([a-zA-Z0-9_\.]+)\}\}'
        if ($matches) {
            throw "Found unresolved token in $($file.FullName) under profile $p: $($matches.Line)"
        }
    }
}

# Phase 3: Full Dry-Run & Host Zero-Mutation Integrity Test
.\scripts\Test-FullDryRun.ps1

# Phase 4: Frontend Type Checking & Build
cd ui
npx tsc --noEmit
npm run build
cd ..

# Phase 5: Rust Tauri Compilation & Unit Tests
cd ui/src-tauri
cargo check
cargo test
cd ../..
```

---

## 8. Swarm Orchestration Directives

When launching the Swarm, each agent will receive their explicit brief:
1. **Worker `@perf-engine`**: Implement `performance.json`, `performance.schema.json`, `scripts/Set-PerformanceProfile.ps1`, and wire token expansion into `TemplateEngine.psm1` / `sync-theme.ps1`.
2. **Worker `@perf-wm-bar`**: Update `komorebi.json.template`, `config.yaml.template`, `styles.css.template`, and `Get-GpuMetrics.ps1`.
3. **Worker `@perf-shell-os`**: Update `flow_settings.json.template`, `fluentflyout_config.json.template`, `apply-windhawk-mods.ps1`, and create `scripts/Set-OsPerformance.ps1`.
4. **Worker `@perf-ui`**: Implement Tauri IPC commands in `ui/src-tauri/` and build the `Performance` tab in `ui/src/`.
