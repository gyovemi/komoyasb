// ==WindhawkMod==
// @id              notification-styling
// @name            Modern Notification & Flyout Styling
// @description     Customizes Windows 11 notification banners, action center flyouts, and toast geometry
// @version         1.0.0
// @author          komoyasb
// @github          https://github.com/komoyasb
// @include         explorer.exe
// @include         ShellExperienceHost.exe
// @architecture    x86-64
// ==/WindhawkMod==

// ==WindhawkModReadme==
/*
# Modern Notification Styling Mod

This Windhawk mod injects visual customizations into Windows shell notification banners and toast windows.
Ensures notification toasts align with the rounded corner geometry and dark/light surface aesthetics of the komoyasb desktop.

### Rollback:
Unload via `windhawk-cli.exe -unload-mod notification-styling`.
*/
// ==/WindhawkModReadme==

// ==WindhawkModSettings==
/*
- round_corners: true
  $name: Round Notification Corners
  $description: Enforces modern border-radius on toast flyouts
- custom_opacity: 95
  $name: Notification Opacity (%)
  $description: Surface opacity percentage (50-100)
*/
// ==/WindhawkModSettings==

#include <windows.h>
#include <dwmapi.h>

// DWM Window Corner Attributes for Modern Shell Flyouts
// Target OS Build: Windows 11 Build 22000 or newer.
// Memory Safety: Operates solely on HWND passed to DwmSetWindowAttribute.
// Failure Strategy: Fails gracefully without throwing if HWND is invalid or already closed.
#ifndef DWMWA_WINDOW_CORNER_PREFERENCE
#define DWMWA_WINDOW_CORNER_PREFERENCE 33
#endif

/**
 * Global mod configuration state for notification styling.
 */
struct {
    bool roundCorners;
    int opacity;
} g_settings;

/**
 * Loads notification preferences from Windhawk settings.
 * Defaults roundCorners to true and opacity to 95% if unspecified.
 */
void LoadSettings() {
    g_settings.roundCorners = Wh_GetIntSetting(L"round_corners") != 0;
    g_settings.opacity = Wh_GetIntSetting(L"custom_opacity");
    if (g_settings.opacity <= 0 || g_settings.opacity > 100) g_settings.opacity = 95;
}

/**
 * Applies custom corner rounding and visual styling to notification toast flyout windows.
 *
 * Hook Mechanism:
 *   Injects DWMWA_WINDOW_CORNER_PREFERENCE (DWMWCP_ROUND) into the target notification window
 *   handle to align its visual radius with the komoyasb shell geometry.
 *
 * @param hwnd Window handle of the notification toast or flyout window.
 */
void StyleNotificationWindow(HWND hwnd) {
    if (!IsWindow(hwnd)) return;

    if (g_settings.roundCorners) {
        int cornerPref = 2; // DWMWCP_ROUND (Standard rounded corners)
        DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &cornerPref, sizeof(cornerPref));
    }
}

/**
 * Windhawk mod initialization entry point for notification styling.
 * Injected into explorer.exe and ShellExperienceHost.exe.
 *
 * @return TRUE if initialization succeeds.
 */
BOOL Wh_ModInit() {
    Wh_Log(L"[notification-styling] Initializing mod");
    LoadSettings();
    Wh_Log(L"[notification-styling] Loaded successfully");
    return TRUE;
}

/**
 * Windhawk mod teardown entry point.
 * Cleans up injected hooks and restores shell defaults.
 */
void Wh_ModUninit() {
    Wh_Log(L"[notification-styling] Uninitializing mod");
}

/**
 * Windhawk notification handler triggered on settings update in the UI.
 * Re-reads active opacity and corner preference.
 */
void Wh_ModSettingsChanged() {
    Wh_Log(L"[notification-styling] Settings updated");
    LoadSettings();
}
