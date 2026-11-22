# Komorebi Tiling & WHKD Hotkey Manager Module

This module contains the configuration templates and rules for the **Komorebi** tiling window manager and **whkd** (Windows Hotkey Daemon).

## Files Overview

- **`komorebi.json.template`**: The central Komorebi configuration template using mustache tokens (`{{colors.*}}`, `{{geometry.*}}`, `{{opacity.*}}`) compiled by `sync-theme.ps1`.
- **`applications.yaml`**: Komorebi application-specific window rules, including automated floating rules for dialogs, utilities, credential prompts, launchers, and explicit management rules for primary applications.
- **`whkdrc.template`**: Ergonomic, conflict-free hotkey bindings daemon configuration mapping vim-like movements (`Alt+H/J/K/L`), workspace navigation (`Alt+1-9`), multi-monitor switching, and container layout operations.

---

## Token Mapping Reference

When compiled by `sync-theme.ps1`, the following theme tokens are applied into `komorebi.json.template`:

| Token | Meaning / Source | Example Value |
| :--- | :--- | :--- |
| `{{geometry.window_gap}}` | Workspace & container padding | `8` |
| `{{geometry.border_width}}` | Active/inactive window border thickness | `2` |
| `{{colors.border_active}}` | Border color for single focused tiled window | `#7aa2f7` |
| `{{colors.border_inactive}}` | Border color for unfocused windows | `#414868` |
| `{{colors.accent}}` | Monocle border highlight color | `#7aa2f7` |
| `{{colors.accent_secondary}}`| Stack and floating border highlight color | `#bb9af7` |
| `{{opacity.window_unfocused}}`| Alpha transparency for unfocused windows | `0.9` |

---

## Default Workspaces (Deterministic)

### Primary Monitor
1. `1:dev` (BSP)
2. `2:web` (BSP)
3. `3:chat` (Columns)
4. `4:code` (BSP)
5. `5:media` (BSP)
6. `6:docs` (BSP)
7. `7:sys` (BSP)
8. `8:misc` (BSP)
9. `9:float` (Floating)

### Secondary Monitor
10. `10:sec1` (BSP)
11. `11:sec2` (BSP)
12. `12:sec3` (Columns)
13. `13:sec4` (BSP)

---

## Keybinding Cheat Sheet (`whkdrc.template`)

All shortcuts use standard, conflict-free modifiers centered around `Alt`.

### Navigation & Focus (Vim-style)
- `Alt + H / J / K / L`: Focus Left / Down / Up / Right
- `Alt + Shift + H / J / K / L`: Move Window Left / Down / Up / Right
- `Alt + Ctrl + H / J / K / L`: Resize Window Width/Height

### Workspace Controls
- `Alt + 1` .. `Alt + 9`: Focus Workspace 1 through 9
- `Alt + Shift + 1` .. `Alt + Shift + 9`: Move focused window to Workspace 1 through 9
- `Alt + [` / `Alt + ]`: Cycle to previous / next workspace

### Multi-Monitor Controls
- `Alt + O`: Cycle focus to next monitor
- `Alt + Shift + O`: Send active window to next monitor

### Layout & Window States
- `Alt + F`: Toggle floating mode
- `Alt + M`: Toggle monocle (single maximized view inside workspace)
- `Alt + Shift + M`: Toggle native maximization
- `Alt + B`: Toggle BSP layout
- `Alt + C`: Set Columns layout
- `Alt + R`: Set Rows layout
- `Alt + G`: Set Grid layout
- `Alt + X` / `Alt + Y`: Flip layout horizontally / vertically
- `Alt + Enter`: Promote focused window to master container
- `Alt + Q`: Close active window
- `Alt + N`: Minimize active window

### Stacking
- `Alt + S`: Toggle container stacking
- `Alt + ;` / `Alt + ,`: Cycle stack forward / backward

### System & Daemon
- `Alt + P`: Toggle tiling pause/resume
- `Alt + Shift + R`: Reload Komorebi & WHKD configurations
- `Alt + Ctrl + R`: Restart Komorebi daemon
- `Alt + Shift + Enter`: Launch Windows Terminal
- `Alt + E`: Launch File Explorer
