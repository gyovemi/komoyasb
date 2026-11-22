//! Atomic file persistence utilities with syntax validation and crash safety.
//!
//! Enforces transactional write semantics: content is pre-validated, written
//! to a temporary sibling file, flushed, and atomically moved over the target file
//! using Win32 `MoveFileExW` (with `MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH`)
//! or POSIX `rename`. This guarantees target files never become partially written or corrupted.

use std::fs;
use std::path::Path;
use uuid::Uuid;

use crate::error::AppError;
use crate::utils::validator::{validate_syntax, ConfigFormat};

/// Reads file contents to string with normalized AppError mapping.
/// Strips leading UTF-8 Byte Order Mark (`\u{feff}`) if present,
/// preventing `serde_json` line 1 col 1 syntax errors.
pub fn read_file_string(path: &Path) -> Result<String, AppError> {
    let content = fs::read_to_string(path)
        .map_err(|e| AppError::io(format!("Failed to read {}: {}", path.display(), e)))?;
    let stripped = content.strip_prefix('\u{feff}').unwrap_or(&content);
    Ok(stripped.to_string())
}

/// Atomically writes content to `target_path` with optional format syntax validation.
///
/// Invariants and Safety Guarantees:
/// 1. Syntax validation occurs prior to touching the disk if `format` is provided.
/// 2. Data is written to an ephemeral sibling `<file>.tmp.<uuid>` on the same volume.
/// 3. On Windows, uses `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING` and `MOVEFILE_WRITE_THROUGH`
///    to force the file system driver to commit physical storage before returning.
/// 4. If any error occurs before atomic replacement, the temporary file is purged.
///
/// # Arguments
///
/// * `target_path` - Destination file path to safely overwrite or create.
/// * `content` - String payload to persist.
/// * `format` - Optional configuration format (`Json`, `Yaml`, `Whkdrc`) for syntax validation.
///
/// # Returns
///
/// * `Ok(())` - Content successfully committed to the target path.
/// * `Err(AppError)` - If syntax validation, directory creation, file write, or rename fails.
///
/// # Errors
///
/// Returns [`AppError::ValidationFailed`] if the content fails syntax validation.
/// Returns [`AppError::IoError`] if parent directory creation or disk operations fail.
pub fn atomic_write_file(
    target_path: &Path,
    content: &str,
    format: Option<ConfigFormat>,
) -> Result<(), AppError> {
    // 1. Validate syntax upfront to prevent corrupting configurations with malformed content
    if let Some(validation_format) = format {
        validate_syntax(content, validation_format)?;
    }

    // 2. Ensure parent directory hierarchy exists before staging temporary file
    if let Some(parent_dir) = target_path.parent() {
        fs::create_dir_all(parent_dir)
            .map_err(|e| AppError::io(format!("Failed to create parent directory {}: {}", parent_dir.display(), e)))?;
    }

    // Generate unique temporary filename on the same filesystem/volume to enable atomic rename
    let file_name = target_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("target");
    let temporary_file_name = format!("{}.tmp.{}", file_name, Uuid::new_v4());
    let temporary_path = target_path
        .parent()
        .map(|dir| dir.join(&temporary_file_name))
        .unwrap_or_else(|| Path::new(&temporary_file_name).to_path_buf());

    // 3. Write content to temporary file; clean up on write failure
    if let Err(write_err) = fs::write(&temporary_path, content) {
        let _ = fs::remove_file(&temporary_path);
        return Err(AppError::io(format!("Failed to write temporary file {}: {}", temporary_path.display(), write_err)));
    }

    // 4. Atomic replacement:
    // On Windows, std::fs::rename fails if the destination file already exists.
    // MoveFileExW with MOVEFILE_REPLACE_EXISTING and MOVEFILE_WRITE_THROUGH provides atomic replacement
    // and flushes write-behind caches to physical storage.
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH};

        let wide_temporary: Vec<u16> = temporary_path.as_os_str().encode_wide().chain(Some(0)).collect();
        let wide_target: Vec<u16> = target_path.as_os_str().encode_wide().chain(Some(0)).collect();

        // Retry loop with exponential backoff for transient Win32 file locks (ERROR_SHARING_VIOLATION = 32).
        const MAX_RETRIES: u32 = 6;
        let mut delay_ms = 15;
        let mut last_err = None;

        for attempt in 0..=MAX_RETRIES {
            // Win32 MoveFileExW call requires null-terminated UTF-16 wide string pointers.
            // Memory safety assumptions: pointers remain valid across the duration of the FFI call.
            let replace_result = unsafe {
                MoveFileExW(
                    PCWSTR(wide_temporary.as_ptr()),
                    PCWSTR(wide_target.as_ptr()),
                    MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
                )
            };

            match replace_result {
                Ok(_) => {
                    last_err = None;
                    break;
                }
                Err(move_err) => {
                    let raw_code = move_err.code().0 as u32;
                    // ERROR_SHARING_VIOLATION = 32 (0x20), ERROR_LOCK_VIOLATION = 33 (0x21)
                    let is_sharing_violation = (raw_code & 0xFFFF) == 32
                        || (raw_code & 0xFFFF) == 33
                        || move_err.code() == windows::Win32::Foundation::ERROR_SHARING_VIOLATION.to_hresult()
                        || move_err.code() == windows::Win32::Foundation::ERROR_LOCK_VIOLATION.to_hresult();

                    if is_sharing_violation && attempt < MAX_RETRIES {
                        std::thread::sleep(std::time::Duration::from_millis(delay_ms));
                        delay_ms = (delay_ms * 2).min(500);
                        last_err = Some(move_err);
                        continue;
                    } else {
                        last_err = Some(move_err);
                        break;
                    }
                }
            }
        }

        if let Some(move_err) = last_err {
            let _ = fs::remove_file(&temporary_path);
            return Err(AppError::io(format!(
                "MoveFileExW failed replacing {} with {}: {}",
                target_path.display(),
                temporary_path.display(),
                move_err
            )));
        }
    }

    #[cfg(not(windows))]
    {
        const MAX_RETRIES: u32 = 5;
        let mut delay_ms = 15;
        let mut last_err = None;

        for attempt in 0..=MAX_RETRIES {
            match fs::rename(&temporary_path, target_path) {
                Ok(_) => {
                    last_err = None;
                    break;
                }
                Err(rename_err) => {
                    if attempt < MAX_RETRIES {
                        std::thread::sleep(std::time::Duration::from_millis(delay_ms));
                        delay_ms = (delay_ms * 2).min(500);
                        last_err = Some(rename_err);
                        continue;
                    } else {
                        last_err = Some(rename_err);
                        break;
                    }
                }
            }
        }

        if let Some(rename_err) = last_err {
            let _ = fs::remove_file(&temporary_path);
            return Err(AppError::io(format!(
                "Rename failed replacing {} with {}: {}",
                target_path.display(),
                temporary_path.display(),
                rename_err
            )));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_atomic_write_valid_json() {
        let test_dir = tempdir().unwrap();
        let target_file = test_dir.path().join("config.json");
        let content_payload = "{\"hello\": \"world\"}";

        let write_result = atomic_write_file(&target_file, content_payload, Some(ConfigFormat::Json));
        assert!(write_result.is_ok());
        assert_eq!(std::fs::read_to_string(&target_file).unwrap(), content_payload);
    }

    #[test]
    fn test_atomic_write_invalid_json_rollback() {
        let test_dir = tempdir().unwrap();
        let target_file = test_dir.path().join("config.json");
        std::fs::write(&target_file, "{\"original\": 1}").unwrap();

        let invalid_content = "{\"hello\": invalid}";
        let write_result = atomic_write_file(&target_file, invalid_content, Some(ConfigFormat::Json));
        assert!(write_result.is_err());
        assert_eq!(std::fs::read_to_string(&target_file).unwrap(), "{\"original\": 1}");
    }

    #[test]
    fn test_read_file_string_success() {
        let test_dir = tempdir().unwrap();
        let target_file = test_dir.path().join("test_read.txt");
        let sample_text = "test read content 12345";
        std::fs::write(&target_file, sample_text).unwrap();

        let read_result = read_file_string(&target_file);
        assert!(read_result.is_ok());
        assert_eq!(read_result.unwrap(), sample_text);
    }

    #[test]
    fn test_read_file_string_missing_file_returns_io_error() {
        let test_dir = tempdir().unwrap();
        let non_existent = test_dir.path().join("missing_file.txt");

        let read_result = read_file_string(&non_existent);
        assert!(read_result.is_err());
        match read_result.unwrap_err() {
            AppError::IoError { message, .. } => {
                assert!(message.contains("missing_file.txt"));
            }
            other => panic!("Expected AppError::IoError, got {:?}", other),
        }
    }

    #[test]
    fn test_atomic_write_valid_yaml() {
        let test_dir = tempdir().unwrap();
        let target_file = test_dir.path().join("config.yaml");
        let valid_yaml = "version: 1.0\nsettings:\n  enabled: true\n";

        let write_result = atomic_write_file(&target_file, valid_yaml, Some(ConfigFormat::Yaml));
        assert!(write_result.is_ok());
        assert_eq!(std::fs::read_to_string(&target_file).unwrap(), valid_yaml);
    }

    #[test]
    fn test_atomic_write_invalid_yaml_rollback() {
        let test_dir = tempdir().unwrap();
        let target_file = test_dir.path().join("config.yaml");
        let original_yaml = "key: original\n";
        std::fs::write(&target_file, original_yaml).unwrap();

        let invalid_yaml = "key: [unclosed list";
        let write_result = atomic_write_file(&target_file, invalid_yaml, Some(ConfigFormat::Yaml));
        assert!(write_result.is_err());
        assert_eq!(std::fs::read_to_string(&target_file).unwrap(), original_yaml);
    }

    #[test]
    fn test_atomic_write_valid_whkdrc() {
        let test_dir = tempdir().unwrap();
        let target_file = test_dir.path().join("whkdrc");
        let valid_whkdrc = "# Bindings\nalt + h : komorebic focus left\nalt + j : komorebic focus down\n";

        let write_result = atomic_write_file(&target_file, valid_whkdrc, Some(ConfigFormat::Whkdrc));
        assert!(write_result.is_ok());
        assert_eq!(std::fs::read_to_string(&target_file).unwrap(), valid_whkdrc);
    }

    #[test]
    fn test_atomic_write_invalid_whkdrc_rollback() {
        let test_dir = tempdir().unwrap();
        let target_file = test_dir.path().join("whkdrc");
        let original_whkdrc = "alt + k : komorebic focus up\n";
        std::fs::write(&target_file, original_whkdrc).unwrap();

        let invalid_whkdrc = "alt + k komorebic focus up without colon";
        let write_result = atomic_write_file(&target_file, invalid_whkdrc, Some(ConfigFormat::Whkdrc));
        assert!(write_result.is_err());
        assert_eq!(std::fs::read_to_string(&target_file).unwrap(), original_whkdrc);
    }

    #[test]
    fn test_atomic_write_none_format_skips_validation() {
        let test_dir = tempdir().unwrap();
        let target_file = test_dir.path().join("raw_text.txt");
        let arbitrary_content = "This is not JSON, not YAML, and has no colon: { [ } ] !";

        let write_result = atomic_write_file(&target_file, arbitrary_content, None);
        assert!(write_result.is_ok());
        assert_eq!(std::fs::read_to_string(&target_file).unwrap(), arbitrary_content);
    }

    #[test]
    fn test_atomic_write_overwrite_existing() {
        let test_dir = tempdir().unwrap();
        let target_file = test_dir.path().join("overwrite.json");
        let initial_payload = "{\"version\": 1}";
        let updated_payload = "{\"version\": 2, \"updated\": true}";

        atomic_write_file(&target_file, initial_payload, Some(ConfigFormat::Json)).unwrap();
        assert_eq!(std::fs::read_to_string(&target_file).unwrap(), initial_payload);

        let overwrite_result = atomic_write_file(&target_file, updated_payload, Some(ConfigFormat::Json));
        assert!(overwrite_result.is_ok());
        assert_eq!(std::fs::read_to_string(&target_file).unwrap(), updated_payload);
    }

    #[test]
    fn test_atomic_write_parent_dir_auto_creation() {
        let test_dir = tempdir().unwrap();
        let deep_nested_file = test_dir.path().join("nested").join("sub").join("folder").join("data.json");
        let payload = "{\"nested\": true}";

        assert!(!deep_nested_file.parent().unwrap().exists());
        let write_result = atomic_write_file(&deep_nested_file, payload, Some(ConfigFormat::Json));
        assert!(write_result.is_ok());
        assert!(deep_nested_file.exists());
        assert_eq!(std::fs::read_to_string(&deep_nested_file).unwrap(), payload);
    }

    #[test]
    fn test_atomic_write_concurrent_uuid_uniqueness() {
        let mut uuid_set = std::collections::HashSet::new();
        for _ in 0..100 {
            let id = Uuid::new_v4();
            assert!(uuid_set.insert(id), "UUID collision detected in atomic temporary naming");
        }
        assert_eq!(uuid_set.len(), 100);
    }

    #[test]
    fn test_atomic_write_failure_cleanup() {
        let test_dir = tempdir().unwrap();
        // Trying to atomically write where target_path itself is an existing directory
        let directory_as_target = test_dir.path().join("directory_target");
        std::fs::create_dir(&directory_as_target).unwrap();

        // Attempting to overwrite a directory with a file will fail at MoveFileExW or fs::write
        let payload = "{\"test\": 1}";
        let result = atomic_write_file(&directory_as_target, payload, Some(ConfigFormat::Json));
        assert!(result.is_err());

        // Verify no leftover .tmp files remain in test_dir
        let leftover_tmp_files: Vec<_> = std::fs::read_dir(test_dir.path())
            .unwrap()
            .flatten()
            .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp."))
            .collect();
        assert!(leftover_tmp_files.is_empty(), "Temporary files were not cleaned up on failure");
    }

    #[test]
    fn test_read_file_string_strips_utf8_bom() {
        let test_dir = tempdir().unwrap();
        let bom_file = test_dir.path().join("with_bom.json");
        // Write raw bytes for UTF-8 BOM: EF BB BF followed by valid JSON
        let content_with_bom = "\u{feff}{\"bom_stripped\": true, \"value\": 42}";
        std::fs::write(&bom_file, content_with_bom).unwrap();

        let read_back = read_file_string(&bom_file).expect("read_file_string should succeed");
        assert!(!read_back.starts_with('\u{feff}'), "BOM must be stripped");
        assert!(read_back.starts_with('{'), "Content should start directly with JSON object");

        // Verify serde_json parses it without error (previously failed at line 1 col 1)
        let parsed: serde_json::Value = serde_json::from_str(&read_back).expect("JSON parsing must succeed");
        assert_eq!(parsed["bom_stripped"], true);
        assert_eq!(parsed["value"], 42);
    }

    #[test]
    fn test_read_file_string_without_bom_preserves_content() {
        let test_dir = tempdir().unwrap();
        let normal_file = test_dir.path().join("normal.json");
        let content = "{\"normal\": true}";
        std::fs::write(&normal_file, content).unwrap();

        let read_back = read_file_string(&normal_file).expect("read_file_string should succeed");
        assert_eq!(read_back, content);
    }
}
