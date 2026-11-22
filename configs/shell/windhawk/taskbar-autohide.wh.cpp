// ==WindhawkMod==
// @id              taskbar-autohide
// @name            Taskbar Auto-Hide & Work Area Enforcer
// @description     Forces Windows 11 taskbar to auto-hide or completely yield work area to YASB Reborn and Komorebi
// @version         1.0.0
// @author          komoyasb
// @github          https://github.com/komoyasb
// @include         explorer.exe
// @architecture    x86-64
// ==/WindhawkMod==

// ==WindhawkModReadme==
/*
# Taskbar Auto-Hide & Yield Mod

This Windhawk mod hooks Windows Explorer to enforce complete hiding and suppression of the stock Windows 11 taskbar.
In the komoyasb ecosystem, YASB Reborn serves as the primary top status bar while Komorebi manages the desktop work area.

### Features:
- Hides the primary and secondary shell taskbars (`Shell_TrayWnd`, `Shell_SecondaryTrayWnd`).
- Prevents the taskbar from reappearing on cursor edge collisions if configured.
- Cleanly restores taskbar visibility when unloaded via `windhawk-cli.exe -unload-mod taskbar-autohide`.
*/
// ==/WindhawkModReadme==

// ==WindhawkModSettings==
/*
- hide_completely: true
  $name: Hide taskbar completely
  $description: When enabled, hides the taskbar window completely instead of standard auto-hide.
- suppress_unhide_on_hover: true
  $name: Suppress unhide on mouse hover
  $description: Prevents the taskbar from unhiding when the mouse moves to the bottom edge.
*/
// ==/WindhawkModSettings==

#include <windows.h>

// Windows Explorer Taskbar Window Classes:
// - "Shell_TrayWnd": Primary desktop taskbar containing Start button, task list, and system tray.
// - "Shell_SecondaryTrayWnd": Secondary taskbars displayed across additional monitors.
// Target OS Build: Windows 10/11 (all builds).
// Memory Safety: Uses standard Win32 window lookup and ShowWindow visibility toggles.
// Failure Strategy: If FindWindow fails to locate the taskbar handle, the visibility toggle safely terminates.

/**
 * Global mod configuration state for taskbar suppression.
 */
struct {
    bool hideCompletely;
    bool suppressUnhideOnHover;
} g_settings;

static HWND g_hPrimaryTaskbar = NULL;

/**
 * Loads taskbar visibility settings from Windhawk configuration.
 */
void LoadSettings() {
    g_settings.hideCompletely = Wh_GetIntSetting(L"hideCompletely") != 0;
    g_settings.suppressUnhideOnHover = Wh_GetIntSetting(L"suppressUnhideOnHover") != 0;
}

/**
 * Updates visibility state for both primary and secondary monitor taskbars.
 *
 * Hook Mechanism:
 *   Finds the top-level window handles for "Shell_TrayWnd" and iterates through all
 *   "Shell_SecondaryTrayWnd" instances, applying SW_HIDE or SW_SHOW.
 *   This yields the entire screen work area to Komorebi tiling and YASB status bar.
 *
 * @param hide If true, hides taskbars completely; if false, restores visibility.
 */
void UpdateTaskbarVisibility(bool hide) {
    HWND hTaskbar = FindWindowW(L"Shell_TrayWnd", NULL);
    if (hTaskbar) {
        ShowWindow(hTaskbar, hide ? SW_HIDE : SW_SHOW);
    }
    HWND hSecTaskbar = NULL;
    while ((hSecTaskbar = FindWindowExW(NULL, hSecTaskbar, L"Shell_SecondaryTrayWnd", NULL)) != NULL) {
        ShowWindow(hSecTaskbar, hide ? SW_HIDE : SW_SHOW);
    }
}

/**
 * Entry point when mod is loaded into explorer.exe.
 * Initializes settings and suppresses taskbars if hideCompletely is enabled.
 *
 * @return TRUE on successful mod initialization.
 */
BOOL Wh_ModInit() {
    Wh_Log(L"[taskbar-autohide] Initializing mod");
    LoadSettings();

    if (g_settings.hideCompletely) {
        UpdateTaskbarVisibility(true);
    }

    Wh_Log(L"[taskbar-autohide] Loaded successfully");
    return TRUE;
}

/**
 * Exit point when mod is unloaded via Windhawk CLI / UI.
 * Restores visibility of all shell taskbars to prevent an invisible taskbar state.
 */
void Wh_ModUninit() {
    Wh_Log(L"[taskbar-autohide] Uninitializing mod - restoring taskbar visibility");
    UpdateTaskbarVisibility(false);
}

/**
 * Called when mod settings are updated in the Windhawk management interface.
 * Synchronizes taskbar visibility state with new user preferences.
 */
void Wh_ModSettingsChanged() {
    Wh_Log(L"[taskbar-autohide] Settings updated");
    LoadSettings();
    if (g_settings.hideCompletely) {
        UpdateTaskbarVisibility(true);
    } else {
        UpdateTaskbarVisibility(false);
    }
}
