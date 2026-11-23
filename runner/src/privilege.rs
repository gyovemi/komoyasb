//! Privilege detection, rootless-mode degradation, and HKCU startup management.

use std::path::PathBuf;

use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::Security::{
    GetTokenInformation, OpenProcessToken, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
};
use windows::Win32::System::Registry::{
    RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegSetValueExW, HKEY_CURRENT_USER, KEY_SET_VALUE,
    KEY_QUERY_VALUE, REG_SZ,
};
use windows::Win32::System::Threading::GetCurrentProcess;
use windows::core::PCWSTR;

use crate::config::RunnerError;

// ---------------------------------------------------------------------------
// Elevation
// ---------------------------------------------------------------------------

/// Returns `true` if the calling process holds a full administrator token.
///
/// Uses `OpenProcessToken` + `GetTokenInformation(TokenElevation)` via Win32.
pub fn is_elevated() -> bool {
    unsafe { is_elevated_impl() }
}

unsafe fn is_elevated_impl() -> bool {
    let mut token = HANDLE::default();
    if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
        return false;
    }
    let _guard = HandleGuard(token);

    let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
    let mut returned_len = 0u32;
    let size = std::mem::size_of::<TOKEN_ELEVATION>() as u32;

    if GetTokenInformation(
        token,
        TokenElevation,
        Some(&mut elevation as *mut _ as *mut _),
        size,
        &mut returned_len,
    )
    .is_err()
    {
        return false;
    }

    elevation.TokenIsElevated != 0
}

/// RAII wrapper to close a Win32 HANDLE on drop.
struct HandleGuard(HANDLE);
impl Drop for HandleGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

// ---------------------------------------------------------------------------
// Rootless-mode gate
// ---------------------------------------------------------------------------

/// Returns `true` when the runner should operate in rootless (user-only) mode.
///
/// Rootless mode is active when `--no-admin` is passed **or** when the process
/// is not running as an administrator.  In this mode:
/// - Machine-wide modifications (Windhawk kernel patches, etc.) are skipped.
/// - All file paths are scoped to `%APPDATA%` / the current-user profile.
pub fn is_rootless(no_admin_flag: bool) -> bool {
    no_admin_flag || !is_elevated()
}

// ---------------------------------------------------------------------------
// HKCU startup registration
// ---------------------------------------------------------------------------

const STARTUP_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const STARTUP_VALUE: &str = "komoyasb-run";

/// Adds `komoyasb-run.exe` to `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
/// so that it launches automatically at Windows login (current user only).
pub fn register_hkcu_startup() -> Result<(), RunnerError> {
    let exe_path = current_exe_path()?;
    let path_str = exe_path
        .to_str()
        .ok_or_else(|| RunnerError::Other("exe path is not valid UTF-8".into()))?;

    unsafe { reg_set_string(STARTUP_KEY, STARTUP_VALUE, path_str) }
}

/// Removes `komoyasb-run.exe` from `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
pub fn unregister_hkcu_startup() -> Result<(), RunnerError> {
    unsafe { reg_delete_value(STARTUP_KEY, STARTUP_VALUE) }
}

// ---------------------------------------------------------------------------
// Win32 registry helpers
// ---------------------------------------------------------------------------

unsafe fn reg_set_string(subkey: &str, value_name: &str, data: &str) -> Result<(), RunnerError> {
    let subkey_w = to_wide(subkey);
    let value_w = to_wide(value_name);
    let data_bytes: Vec<u8> = data
        .encode_utf16()
        .flat_map(|c| c.to_le_bytes())
        .chain([0u8, 0u8]) // null terminator
        .collect();

    let mut hkey = windows::Win32::System::Registry::HKEY::default();
    RegOpenKeyExW(
        HKEY_CURRENT_USER,
        PCWSTR(subkey_w.as_ptr()),
        0,
        KEY_SET_VALUE,
        &mut hkey,
    )
    .map_err(|e| RunnerError::Other(format!("RegOpenKeyExW failed: {e}")))?;

    let _guard = RegKeyGuard(hkey);

    RegSetValueExW(
        hkey,
        PCWSTR(value_w.as_ptr()),
        0,
        REG_SZ,
        Some(&data_bytes),
    )
    .map_err(|e| RunnerError::Other(format!("RegSetValueExW failed: {e}")))?;

    Ok(())
}

unsafe fn reg_delete_value(subkey: &str, value_name: &str) -> Result<(), RunnerError> {
    let subkey_w = to_wide(subkey);
    let value_w = to_wide(value_name);

    let mut hkey = windows::Win32::System::Registry::HKEY::default();
    let open_res = RegOpenKeyExW(
        HKEY_CURRENT_USER,
        PCWSTR(subkey_w.as_ptr()),
        0,
        KEY_SET_VALUE | KEY_QUERY_VALUE,
        &mut hkey,
    );

    if let Err(e) = open_res {
        // If the key doesn't exist, treat unregister as success.
        let code = e.code().0 as u32;
        if code == 0x80070002
        /* ERROR_FILE_NOT_FOUND */
        {
            return Ok(());
        }
        return Err(RunnerError::Other(format!("RegOpenKeyExW failed: {e}")));
    }

    let _guard = RegKeyGuard(hkey);

    RegDeleteValueW(hkey, PCWSTR(value_w.as_ptr()))
        .map_err(|e| RunnerError::Other(format!("RegDeleteValueW failed: {e}")))?;

    Ok(())
}

/// RAII wrapper to close a registry HKEY on drop.
struct RegKeyGuard(windows::Win32::System::Registry::HKEY);
impl Drop for RegKeyGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = RegCloseKey(self.0);
        }
    }
}

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

fn current_exe_path() -> Result<PathBuf, RunnerError> {
    std::env::current_exe()
        .map_err(|e| RunnerError::Other(format!("could not resolve current exe path: {e}")))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_elevated_returns_bool() {
        // Should not panic; just verify it returns a bool.
        let _elevated: bool = is_elevated();
    }

    #[test]
    fn test_is_rootless_no_admin_flag() {
        // When --no-admin is set, rootless is always true regardless of elevation.
        assert!(is_rootless(true));
    }

    #[test]
    fn test_is_rootless_respects_elevation_when_flag_false() {
        // When no_admin is false, rootless == !is_elevated().
        let expected = !is_elevated();
        assert_eq!(is_rootless(false), expected);
    }

    #[test]
    fn test_to_wide_null_terminated() {
        let wide = to_wide("abc");
        assert_eq!(wide.last(), Some(&0u16));
        assert_eq!(wide.len(), 4); // 'a', 'b', 'c', '\0'
    }

    #[test]
    fn test_current_exe_path() {
        let path = current_exe_path().unwrap();
        assert!(path.exists(), "current exe should exist: {}", path.display());
    }
}
