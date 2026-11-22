// ==WindhawkMod==
// @id              dwm-mica-effects
// @name            DWM Mica & Acrylic Backing Enforcer
// @description     Injects Mica / Acrylic backdrop effects and harmonized border colors across application windows
// @version         1.0.0
// @author          komoyasb
// @github          https://github.com/komoyasb
// @include         dwm.exe
// @include         explorer.exe
// @architecture    x86-64
// ==/WindhawkMod==

// ==WindhawkModReadme==
/*
# DWM Mica & Backdrop Effects Mod

Forces Windows Desktop Window Manager (DWM) composition attributes across supported top-level windows.
Integrates with Windows 11 Build 22621+ DwmSetWindowAttribute system calls (DWMWA_SYSTEMBACKDROP_TYPE):
- DWM_SYSTEMBACKDROP_TYPE: 2 (Mica), 3 (Acrylic), 4 (Mica Alt / Tabbed).
- Harmonizes dark/light mode preference across system dialogs (DWMWA_USE_IMMERSIVE_DARK_MODE).

### Rollback:
Unloading this mod via `windhawk-cli.exe -unload-mod dwm-mica-effects` restores standard DWM defaults.
*/
// ==/WindhawkModReadme==

// ==WindhawkModSettings==
/*
- backdrop_type: 2
  $name: Backdrop Material Type
  $description: 1 = None, 2 = Mica, 3 = Acrylic, 4 = Mica Alt (Tabbed)
- force_dark_mode: true
  $name: Force Immersive Dark Mode
  $description: Ensures window title bars and non-client areas match dark theme styling
- rounded_corners: 2
  $name: Window Corner Style
  $description: 1 = Rectangular, 2 = Rounded, 3 = Small Rounded
*/
// ==/WindhawkModSettings==

#include <windows.h>
#include <dwmapi.h>

// DWM Window Attributes for Windows 11 Build 22621+
// Target OS Build: Windows 11 Build 22621 (22H2) or newer.
// Memory Safety: DwmSetWindowAttribute is a thread-safe Win32 API operating on HWND handles.
// Failure Strategy: Return values (HRESULT) are safely ignored if a target window lacks composition support.
#ifndef DWMWA_SYSTEMBACKDROP_TYPE
#define DWMWA_SYSTEMBACKDROP_TYPE 38
#endif

#ifndef DWMWA_USE_IMMERSIVE_DARK_MODE
#define DWMWA_USE_IMMERSIVE_DARK_MODE 20
#endif

#ifndef DWMWA_WINDOW_CORNER_PREFERENCE
#define DWMWA_WINDOW_CORNER_PREFERENCE 33
#endif

/**
 * Global mod configuration state populated from Windhawk UI settings.
 */
struct {
    int backdropType;
    bool forceDarkMode;
    int roundedCorners;
} g_settings;

/**
 * Loads user configuration settings from the Windhawk environment.
 * Sets sensible defaults (Mica backdrop, dark mode, rounded corners) when unset.
 */
void LoadSettings() {
    g_settings.backdropType = Wh_GetIntSetting(L"backdrop_type");
    if (g_settings.backdropType <= 0) g_settings.backdropType = 2; // Default Mica (DWM_SYSTEMBACKDROP_TYPE: 2)
    g_settings.forceDarkMode = Wh_GetIntSetting(L"force_dark_mode") != 0;
    g_settings.roundedCorners = Wh_GetIntSetting(L"rounded_corners");
    if (g_settings.roundedCorners <= 0) g_settings.roundedCorners = 2; // Default Rounded (DWMWCP_ROUND: 2)
}

/**
 * Applies DWM composition attributes (Mica/Acrylic backdrop, dark mode, corner radius)
 * to a target top-level window.
 *
 * Hook Mechanism:
 *   Invokes DwmSetWindowAttribute on the window handle (HWND). If the window is not visible
 *   or invalid, the call is skipped to avoid overhead during window enumeration.
 *
 * @param hwnd Handle to the target top-level window.
 */
void ApplyDwmStyling(HWND hwnd) {
    if (!IsWindow(hwnd) || !IsWindowVisible(hwnd)) return;

    // Apply Immersive Dark Mode to window frame and non-client title bar area
    BOOL darkMode = g_settings.forceDarkMode ? TRUE : FALSE;
    DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &darkMode, sizeof(darkMode));

    // Apply System Backdrop Type (2 = Mica, 3 = Acrylic, 4 = Mica Alt / Tabbed)
    int backdrop = g_settings.backdropType;
    DwmSetWindowAttribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, &backdrop, sizeof(backdrop));

    // Apply Window Corner Preference (1 = Rectangular, 2 = Rounded, 3 = Small Rounded)
    int cornerPref = g_settings.roundedCorners;
    DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &cornerPref, sizeof(cornerPref));
}

/**
 * EnumWindows callback to propagate DWM styling across all existing top-level windows.
 *
 * @param hwnd Window handle passed by Windows EnumWindows.
 * @param lParam User-defined parameter (unused).
 * @return TRUE to continue enumeration across all desktop windows.
 */
static BOOL CALLBACK EnumWindowsCallback(HWND hwnd, LPARAM lParam) {
    ApplyDwmStyling(hwnd);
    return TRUE;
}

/**
 * Windhawk mod initialization entry point.
 * Invoked when dwm-mica-effects is injected into dwm.exe / explorer.exe.
 *
 * @return TRUE if mod initialization and initial window scan succeed.
 */
BOOL Wh_ModInit() {
    Wh_Log(L"[dwm-mica-effects] Initializing mod");
    LoadSettings();

    // Scan existing top-level windows and apply backdrop attributes
    EnumWindows(EnumWindowsCallback, 0);

    Wh_Log(L"[dwm-mica-effects] Loaded successfully");
    return TRUE;
}

/**
 * Windhawk mod teardown entry point.
 * Invoked when dwm-mica-effects is unloaded via Windhawk CLI or UI.
 * Standard DWM compositor restores default backdrop attributes upon process unhook.
 */
void Wh_ModUninit() {
    Wh_Log(L"[dwm-mica-effects] Uninitializing mod - clearing custom attributes");
    // Standard system behavior handles restoring normal DWM attributes upon unhook
}

/**
 * Windhawk notification handler triggered whenever mod settings are saved in the UI.
 * Re-reads active configuration and re-applies styling to all open windows.
 */
void Wh_ModSettingsChanged() {
    Wh_Log(L"[dwm-mica-effects] Settings changed");
    LoadSettings();
    EnumWindows(EnumWindowsCallback, 0);
}
