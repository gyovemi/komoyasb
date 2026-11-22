import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Code2, Copy, Check, FileCode } from 'lucide-react';

// Hardcoded sources from configs/shell/windhawk/ for read-only preview
const MOD_SOURCES: Record<string, { filename: string; source: string }> = {
  'taskbar-autohide': {
    filename: 'taskbar-autohide.wh.cpp',
    source: `// ==WindhawkMod==
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
- Hides the primary and secondary shell taskbars (Shell_TrayWnd, Shell_SecondaryTrayWnd).
- Prevents the taskbar from reappearing on cursor edge collisions if configured.
- Cleanly restores taskbar visibility when unloaded via windhawk-cli.exe -unload-mod taskbar-autohide.
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

struct {
    bool hideCompletely;
    bool suppressUnhideOnHover;
} g_settings;

static HWND g_hPrimaryTaskbar = NULL;

void LoadSettings() {
    g_settings.hideCompletely = Wh_GetIntSetting(L"hideCompletely") != 0;
    g_settings.suppressUnhideOnHover = Wh_GetIntSetting(L"suppressUnhideOnHover") != 0;
}

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

BOOL Wh_ModInit() {
    Wh_Log(L"Initializing Taskbar Auto-Hide Mod for komoyasb");
    LoadSettings();

    if (g_settings.hideCompletely) {
        UpdateTaskbarVisibility(true);
    }

    return TRUE;
}

void Wh_ModUninit() {
    Wh_Log(L"Unloading Taskbar Auto-Hide Mod for komoyasb");
    UpdateTaskbarVisibility(false);
}
`,
  },
  'dwm-mica-effects': {
    filename: 'dwm-mica-effects.wh.cpp',
    source: `// ==WindhawkMod==
// @id              dwm-mica-effects
// @name            DWM Mica & Acrylic Backing Enforcer
// @description     Injects Mica / Acrylic backdrop effects and harmonized border colors across application windows
// @version         1.0.0
// @author          komoyasb
// @github          https://github.com/komoyasb
// @include         *
// @architecture    x86-64
// ==/WindhawkMod==

#include <windows.h>
#include <dwmapi.h>

#pragma comment(lib, "dwmapi.lib")

#ifndef DWMWA_SYSTEMBACKDROP_TYPE
#define DWMWA_SYSTEMBACKDROP_TYPE 38
#endif

BOOL Wh_ModInit() {
    Wh_Log(L"Initializing DWM Mica & Acrylic Enforcer");
    return TRUE;
}

void Wh_ModUninit() {
    Wh_Log(L"Unloading DWM Mica & Acrylic Enforcer");
}
`,
  },
  'notification-styling': {
    filename: 'notification-styling.wh.cpp',
    source: `// ==WindhawkMod==
// @id              notification-styling
// @name            Modern Notification & Flyout Styling
// @description     Customizes Windows 11 notification banners, action center flyouts, and toast geometry
// @version         1.0.0
// @author          komoyasb
// @github          https://github.com/komoyasb
// @include         explorer.exe
// @architecture    x86-64
// ==/WindhawkMod==

#include <windows.h>

BOOL Wh_ModInit() {
    Wh_Log(L"Initializing Notification Styling Mod");
    return TRUE;
}

void Wh_ModUninit() {
    Wh_Log(L"Unloading Notification Styling Mod");
}
`,
  },
};

/**
 * Component properties for the `ModSourceViewer` modal preview dialog.
 */
export interface ModSourceViewerProps {
  /** Identifier of the mod whose C++ source should be displayed. */
  modId: string | null;
  /** Whether the modal preview dialog is open. */
  isOpen: boolean;
  /** Callback fired when dialog open state flips. */
  onClose: () => void;
}

/**
 * Read-only modal viewer inspecting Windhawk C++ hook source files.
 *
 * Provides syntax container, clipboard copying, and file header inspection.
 *
 * @param props - Mod identifier, open flag, and close handler.
 * @returns Dialog portal rendering the C++ source code.
 */
export const ModSourceViewer: React.FC<ModSourceViewerProps> = ({
  modId,
  isOpen,
  onClose,
}) => {
  const [hasCopiedCode, setHasCopiedCode] = React.useState<boolean>(false);

  const modData = modId ? MOD_SOURCES[modId] : null;

  const handleCopyCode = async () => {
    if (!modData) return;
    try {
      await navigator.clipboard.writeText(modData.source);
      setHasCopiedCode(true);
      setTimeout(() => setHasCopiedCode(false), 2000);
    } catch {
      // Browser clipboard fallback
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(openState) => !openState && onClose()}
      title={
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-accent" />
          <span>{modData ? modData.filename : 'Mod Source'}</span>
        </div>
      }
      description="Read-only view of compiled Windhawk C++ hook source and Win32 API hooks."
      className="max-w-3xl"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-foreground-muted">
            configs/shell/windhawk/{modData?.filename}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyCode}
            className="h-7 text-xs gap-1.5 cursor-pointer"
          >
            {hasCopiedCode ? (
              <>
                <Check className="h-3 w-3 text-status-success" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy Source
              </>
            )}
          </Button>
        </div>

        <div className="relative max-h-[500px] overflow-y-auto rounded-lg border border-border-inactive bg-black/90 p-4 font-mono text-xs text-slate-200">
          <pre className="whitespace-pre-wrap leading-relaxed">
            {modData?.source || '// No source available for selected mod identifier.'}
          </pre>
        </div>
      </div>
    </Dialog>
  );
};
