//! Configuration syntax validation, path containment verification, and parameter sanitization.
//!
//! Validates structured serialization formats before committing them to disk,
//! enforces path confinement within repository and user profile roots,
//! and sanitizes IPC input parameters against path-traversal and injection attacks.

use std::fs;
use std::path::{Component, Path, PathBuf};
use crate::error::AppError;

/// Supported configuration formats for pre-write syntax validation.
pub enum ConfigFormat {
    /// Strict JavaScript Object Notation (`.json`).
    Json,
    /// YAML Ain't Markup Language (`.yaml`, `.yml`).
    Yaml,
    /// Windows Hotkey Daemon binding grammar (`.whkdrc`).
    Whkdrc,
}

/// Validates raw string content against the specified configuration format syntax.
///
/// # Arguments
///
/// * `content` - Raw string content to validate.
/// * `format` - Target [`ConfigFormat`] syntax parser to apply.
///
/// # Returns
///
/// * `Ok(())` - Content conforms to the expected syntax grammar.
/// * `Err(AppError)` - If parsing fails due to malformed syntax.
///
/// # Errors
///
/// Returns [`AppError::ValidationFailed`] with parser diagnostics on failure.
pub fn validate_syntax(content: &str, format: ConfigFormat) -> Result<(), AppError> {
    match format {
        ConfigFormat::Json => {
            serde_json::from_str::<serde_json::Value>(content)
                .map_err(|e| AppError::validation(format!("Invalid JSON syntax: {}", e)))?;
            Ok(())
        }
        ConfigFormat::Yaml => {
            serde_yaml::from_str::<serde_yaml::Value>(content)
                .map_err(|e| AppError::validation(format!("Invalid YAML syntax: {}", e)))?;
            Ok(())
        }
        ConfigFormat::Whkdrc => validate_whkdrc_syntax(content),
    }
}

/// Validates syntax of a Windows Hotkey Daemon (`.whkdrc`) configuration string.
///
/// Checks that each non-comment, non-empty line satisfies the binding grammar:
/// `<modifiers + key> : <command>`
///
/// # Arguments
///
/// * `content` - Multi-line string content of a `.whkdrc` file.
///
/// # Returns
///
/// * `Ok(())` - All hotkey lines conform to WHKD syntax grammar.
/// * `Err(AppError)` - If any non-comment line lacks delimiter or required fields.
///
/// # Errors
///
/// Returns [`AppError::ValidationFailed`] identifying the offending line number and content.
pub fn validate_whkdrc_syntax(content: &str) -> Result<(), AppError> {
    for (line_index, line) in content.lines().enumerate() {
        let trimmed_line = line.trim();
        if trimmed_line.is_empty() || trimmed_line.starts_with('#') {
            continue;
        }

        // Whkd binding format requires: <modifiers + key> : <command>
        let line_parts: Vec<&str> = trimmed_line.splitn(2, ':').collect();
        if line_parts.len() != 2 {
            return Err(AppError::validation(format!(
                "Syntax error in whkdrc at line {}: expected 'modifiers + key : command', found '{}'",
                line_index + 1,
                trimmed_line
            )));
        }

        let key_combination = line_parts[0].trim();
        let target_command = line_parts[1].trim();

        if key_combination.is_empty() {
            return Err(AppError::validation(format!(
                "Syntax error in whkdrc at line {}: empty key combination",
                line_index + 1
            )));
        }

        if target_command.is_empty() {
            return Err(AppError::validation(format!(
                "Syntax error in whkdrc at line {}: empty command",
                line_index + 1
            )));
        }
    }
    Ok(())
}

/// Strips Windows verbatim/extended-length UNC path prefixes (`\\?\` or `\\?\UNC\`).
pub fn strip_unc_prefix(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{}", stripped))
    } else if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        path.to_path_buf()
    }
}

/// Helper to test if `path` starts with `prefix`, respecting Windows case-insensitivity.
fn path_starts_with_case_insensitive(path: &Path, prefix: &Path) -> bool {
    let path_str = path.to_string_lossy().to_lowercase().replace('/', "\\");
    let prefix_str = prefix.to_string_lossy().to_lowercase().replace('/', "\\");
    let prefix_with_sep = if prefix_str.ends_with('\\') {
        prefix_str.clone()
    } else {
        format!("{}\\", prefix_str)
    };
    path_str == prefix_str || path_str.starts_with(&prefix_with_sep)
}

/// Validates that a path is safe, free of traversal tokens, canonicalizable,
/// and confined within the specified allowed roots.
///
/// Invariants:
/// 1. Rejects paths containing uncanonicalized traversal tokens (`..`) or null bytes.
/// 2. Canonicalizes existing paths and resolves relative paths against allowed roots.
/// 3. Ensures the resolved path resides strictly within at least one root in `allowed_roots`.
///
/// # Arguments
///
/// * `path` - The candidate path to validate.
/// * `allowed_roots` - Slice of root directories permitted for access.
///
/// # Returns
///
/// * `Ok(PathBuf)` - Canonicalized or normalized safe path.
/// * `Err(AppError)` - If path traversal or boundary escape is detected.
///
/// # Errors
///
/// Returns [`AppError::SandboxViolation`] if the path escapes confinement or contains traversal tokens.
pub fn validate_safe_path(path: &Path, allowed_roots: &[PathBuf]) -> Result<PathBuf, AppError> {
    let raw_str = path.to_string_lossy();

    // 1. Explicit traversal token checks
    if raw_str.is_empty() {
        return Err(AppError::sandbox("Path cannot be empty"));
    }

    if raw_str.contains('\0') {
        return Err(AppError::sandbox("Path contains illegal null byte"));
    }

    if raw_str.contains("..") {
        return Err(AppError::sandbox(format!(
            "Path contains uncanonicalized traversal tokens ('..'): {}",
            path.display()
        )));
    }

    for component in path.components() {
        if matches!(component, Component::ParentDir) {
            return Err(AppError::sandbox(format!(
                "Path contains parent directory traversal component ('..'): {}",
                path.display()
            )));
        }
    }

    // 2. Canonicalize or normalize
    let resolved_candidate = if path.exists() {
        if let Ok(canon) = fs::canonicalize(path) {
            strip_unc_prefix(&canon)
        } else {
            strip_unc_prefix(path)
        }
    } else if path.is_relative() {
        // Resolve relative to the primary allowed root if available
        if let Some(primary_root) = allowed_roots.first() {
            primary_root.join(path)
        } else {
            path.to_path_buf()
        }
    } else {
        strip_unc_prefix(path)
    };

    // 3. Allowed roots boundary check
    if !allowed_roots.is_empty() {
        let is_confined = allowed_roots.iter().any(|root| {
            let clean_root = strip_unc_prefix(root);
            path_starts_with_case_insensitive(&resolved_candidate, &clean_root)
        });

        if !is_confined {
            return Err(AppError::sandbox(format!(
                "Security boundary violation: Path '{}' escapes allowed roots: {:?}",
                resolved_candidate.display(),
                allowed_roots
            )));
        }
    }

    Ok(resolved_candidate)
}

/// Resolves standard permissible roots: repo root, ~/.config, AppData, LocalAppData, and sandbox root.
pub fn get_default_allowed_roots(repo_root: &Path) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    // 1. Repo root
    if let Ok(c) = fs::canonicalize(repo_root) {
        roots.push(strip_unc_prefix(&c));
    } else {
        roots.push(strip_unc_prefix(repo_root));
    }

    // 2. ~/.config
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let config_dir = PathBuf::from(&userprofile).join(".config");
        if let Ok(c) = fs::canonicalize(&config_dir) {
            roots.push(strip_unc_prefix(&c));
        } else {
            roots.push(config_dir);
        }
    } else if let Ok(home) = std::env::var("HOME") {
        let config_dir = PathBuf::from(&home).join(".config");
        if let Ok(c) = fs::canonicalize(&config_dir) {
            roots.push(strip_unc_prefix(&c));
        } else {
            roots.push(config_dir);
        }
    }

    // 3. %APPDATA%
    if let Ok(appdata) = std::env::var("APPDATA") {
        let appdata_dir = PathBuf::from(&appdata);
        if let Ok(c) = fs::canonicalize(&appdata_dir) {
            roots.push(strip_unc_prefix(&c));
        } else {
            roots.push(appdata_dir);
        }
    }

    // 4. %LOCALAPPDATA%
    if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
        let localappdata_dir = PathBuf::from(&localappdata);
        if let Ok(c) = fs::canonicalize(&localappdata_dir) {
            roots.push(strip_unc_prefix(&c));
        } else {
            roots.push(localappdata_dir);
        }
    }

    // 5. UI_SANDBOX_DIR (if set)
    if let Ok(sandbox_dir) = std::env::var("UI_SANDBOX_DIR") {
        let s_path = PathBuf::from(&sandbox_dir);
        if let Ok(c) = fs::canonicalize(&s_path) {
            roots.push(strip_unc_prefix(&c));
        } else {
            roots.push(s_path);
        }
    }

    roots
}

/// Validates that an identifier name (theme, profile, etc.) contains only safe characters
/// and no path traversal tokens (`..`, `/`, `\`, null bytes).
pub fn validate_safe_name(name: &str) -> Result<(), AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("Name cannot be empty"));
    }

    if trimmed.contains("..") || trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
        return Err(AppError::sandbox(format!(
            "Path traversal or directory separator detected in name: '{}'",
            name
        )));
    }

    if trimmed.len() > 128 {
        return Err(AppError::validation(format!(
            "Name exceeds maximum allowed length of 128 characters: '{}'",
            name
        )));
    }

    if !trimmed.chars().all(|c| c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' || c == '.') {
        return Err(AppError::validation(format!(
            "Name contains invalid characters: '{}'. Only alphanumeric, spaces, dashes, underscores, and dots are permitted.",
            name
        )));
    }

    Ok(())
}

/// Allowed Windhawk mod identifiers.
pub const ALLOWED_MOD_IDS: &[&str] = &[
    "taskbar-autohide",
    "dwm-mica-effects",
    "notification-styling",
];

/// Validates a Windhawk mod identifier against the strict whitelist.
pub fn validate_mod_id(mod_id: &str) -> Result<(), AppError> {
    if ALLOWED_MOD_IDS.contains(&mod_id) {
        Ok(())
    } else {
        Err(AppError::validation(format!(
            "Invalid mod_id '{}'. Allowed values are: {}",
            mod_id,
            ALLOWED_MOD_IDS.join(", ")
        )))
    }
}

/// Allowed performance profile names.
pub const ALLOWED_PROFILES: &[&str] = &[
    "ultra-low",
    "balanced",
    "visual-rich",
    "gaming",
    "custom",
];

/// Validates a performance profile name against the strict whitelist.
pub fn validate_performance_profile(profile: &str) -> Result<(), AppError> {
    if ALLOWED_PROFILES.contains(&profile) {
        Ok(())
    } else {
        Err(AppError::validation(format!(
            "Invalid performance profile '{}'. Allowed values are: {}",
            profile,
            ALLOWED_PROFILES.join(", ")
        )))
    }
}

/// Allowed EarTrumpet theme values.
pub const ALLOWED_EARTRUMPET_THEMES: &[&str] = &["System", "Dark", "Light"];

/// Validates EarTrumpet theme against the whitelist to prevent registry file injection.
pub fn validate_eartrumpet_theme(theme: &str) -> Result<(), AppError> {
    if ALLOWED_EARTRUMPET_THEMES.contains(&theme) {
        Ok(())
    } else {
        Err(AppError::validation(format!(
            "Invalid EarTrumpet theme '{}'. Allowed values are: 'System', 'Dark', 'Light'",
            theme
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_json_validation() {
        assert!(validate_syntax("{\"test\": true}", ConfigFormat::Json).is_ok());
        assert!(validate_syntax("{\"test\": true,", ConfigFormat::Json).is_err());
    }

    #[test]
    fn test_json_validation_empty_string_fails() {
        let result = validate_syntax("", ConfigFormat::Json);
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::ValidationFailed { message, .. } => {
                assert!(message.contains("Invalid JSON syntax"));
            }
            other => panic!("Expected ValidationFailed, got {:?}", other),
        }
    }

    #[test]
    fn test_json_validation_array_and_primitives() {
        assert!(validate_syntax("[1, 2, 3, true, null]", ConfigFormat::Json).is_ok());
        assert!(validate_syntax("\"just a string\"", ConfigFormat::Json).is_ok());
        assert!(validate_syntax("42", ConfigFormat::Json).is_ok());
        assert!(validate_syntax("{\"key\": [1, {\"inner\": true}]}", ConfigFormat::Json).is_ok());
    }

    #[test]
    fn test_yaml_validation() {
        assert!(validate_syntax("test: true\nkey: val", ConfigFormat::Yaml).is_ok());
        assert!(validate_syntax("test: [unclosed", ConfigFormat::Yaml).is_err());
    }

    #[test]
    fn test_yaml_validation_unterminated_and_invalid() {
        let unterminated_quote = "title: \"unterminated string";
        let result = validate_syntax(unterminated_quote, ConfigFormat::Yaml);
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::ValidationFailed { message, .. } => {
                assert!(message.contains("Invalid YAML syntax"));
            }
            other => panic!("Expected ValidationFailed, got {:?}", other),
        }

        let bad_indentation = "parent:\nchild: true\n  bad_indent: 1";
        assert!(validate_syntax(bad_indentation, ConfigFormat::Yaml).is_err());
    }

    #[test]
    fn test_yaml_validation_empty_and_comments() {
        assert!(validate_syntax("", ConfigFormat::Yaml).is_ok());
        assert!(validate_syntax("# Only comments in YAML\n# line 2", ConfigFormat::Yaml).is_ok());
    }

    #[test]
    fn test_whkdrc_validation() {
        let valid_bindings = "# Comment\nalt + h : komorebic focus left\n\nalt + 1 : komorebic focus-workspace 0";
        assert!(validate_syntax(valid_bindings, ConfigFormat::Whkdrc).is_ok());

        let invalid_missing_delimiter = "alt + h komorebic focus left";
        assert!(validate_syntax(invalid_missing_delimiter, ConfigFormat::Whkdrc).is_err());

        let invalid_empty_command = "alt + h : ";
        assert!(validate_syntax(invalid_empty_command, ConfigFormat::Whkdrc).is_err());
    }

    #[test]
    fn test_whkdrc_validation_empty_content_passes() {
        assert!(validate_syntax("", ConfigFormat::Whkdrc).is_ok());
        assert!(validate_syntax("   \n\t\n  ", ConfigFormat::Whkdrc).is_ok());
    }

    #[test]
    fn test_whkdrc_validation_comment_only_passes() {
        let comment_content = "# First comment\n# Second comment\n   # Indented comment";
        assert!(validate_syntax(comment_content, ConfigFormat::Whkdrc).is_ok());
    }

    #[test]
    fn test_whkdrc_validation_mixed_comments_blank_lines_and_bindings() {
        let mixed = r#"
# Navigation
alt + h : komorebic focus left
alt + j : komorebic focus down

# Workspaces
alt + 1 : komorebic focus-workspace 0

# Window Management
alt + shift + enter : komorebic toggle-monocle
"#;
        assert!(validate_syntax(mixed, ConfigFormat::Whkdrc).is_ok());
    }

    #[test]
    fn test_whkdrc_validation_empty_key_combination() {
        let missing_key = " : komorebic focus left";
        let result = validate_syntax(missing_key, ConfigFormat::Whkdrc);
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::ValidationFailed { message, .. } => {
                assert!(message.contains("empty key combination"));
                assert!(message.contains("line 1"));
            }
            other => panic!("Expected ValidationFailed, got {:?}", other),
        }
    }

    #[test]
    fn test_whkdrc_validation_empty_command_diagnostics() {
        let empty_cmd = "ctrl + alt + del : ";
        let result = validate_syntax(empty_cmd, ConfigFormat::Whkdrc);
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::ValidationFailed { message, .. } => {
                assert!(message.contains("empty command"));
                assert!(message.contains("line 1"));
            }
            other => panic!("Expected ValidationFailed, got {:?}", other),
        }
    }

    #[test]
    fn test_whkdrc_validation_line_number_reported_accurately() {
        let content = "# Line 1\n# Line 2\nalt + h : komorebic focus left\ncorrupted line 4 with no colon\n";
        let result = validate_syntax(content, ConfigFormat::Whkdrc);
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::ValidationFailed { message, .. } => {
                assert!(message.contains("line 4"));
                assert!(message.contains("corrupted line 4 with no colon"));
            }
            other => panic!("Expected ValidationFailed, got {:?}", other),
        }
    }

    #[test]
    fn test_validate_safe_path_valid_within_root() {
        let temp = tempdir().unwrap();
        let root = temp.path().to_path_buf();
        let safe_file = root.join("themes").join("dark.json");
        fs::create_dir_all(safe_file.parent().unwrap()).unwrap();
        fs::write(&safe_file, "{}").unwrap();

        let allowed = vec![root.clone()];
        let validated = validate_safe_path(&safe_file, &allowed);
        assert!(validated.is_ok());
    }

    #[test]
    fn test_validate_safe_path_rejects_traversal_tokens() {
        let temp = tempdir().unwrap();
        let root = temp.path().to_path_buf();
        let allowed = vec![root];

        let traversal_linux = PathBuf::from("../../etc/passwd");
        assert!(validate_safe_path(&traversal_linux, &allowed).is_err());

        let traversal_win = PathBuf::from("..\\..\\..\\Windows\\System32\\malicious.dll");
        assert!(validate_safe_path(&traversal_win, &allowed).is_err());

        let embedded_traversal = PathBuf::from("themes/../../etc/shadow");
        assert!(validate_safe_path(&embedded_traversal, &allowed).is_err());
    }

    #[test]
    fn test_validate_safe_path_rejects_outside_roots() {
        let temp1 = tempdir().unwrap();
        let temp2 = tempdir().unwrap();
        let allowed = vec![temp1.path().to_path_buf()];

        let outside_file = temp2.path().join("secret.txt");
        fs::write(&outside_file, "secret").unwrap();

        let result = validate_safe_path(&outside_file, &allowed);
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::SandboxViolation { message, .. } => {
                assert!(message.contains("escapes allowed roots"));
            }
            other => panic!("Expected SandboxViolation, got {:?}", other),
        }
    }

    #[test]
    fn test_validate_safe_name() {
        assert!(validate_safe_name("Tokyo Night Dark").is_ok());
        assert!(validate_safe_name("balanced-2").is_ok());
        assert!(validate_safe_name("dark_theme.v1").is_ok());

        assert!(validate_safe_name("../traversal").is_err());
        assert!(validate_safe_name("..\\traversal").is_err());
        assert!(validate_safe_name("").is_err());
        assert!(validate_safe_name("evil;rm -rf /").is_err());
        assert!(validate_safe_name("null\0byte").is_err());
    }

    #[test]
    fn test_validate_mod_id() {
        assert!(validate_mod_id("taskbar-autohide").is_ok());
        assert!(validate_mod_id("dwm-mica-effects").is_ok());
        assert!(validate_mod_id("notification-styling").is_ok());

        assert!(validate_mod_id("invalid-mod").is_err());
        assert!(validate_mod_id("taskbar-autohide; calc.exe").is_err());
    }

    #[test]
    fn test_validate_performance_profile() {
        assert!(validate_performance_profile("ultra-low").is_ok());
        assert!(validate_performance_profile("balanced").is_ok());
        assert!(validate_performance_profile("visual-rich").is_ok());
        assert!(validate_performance_profile("gaming").is_ok());
        assert!(validate_performance_profile("custom").is_ok());

        assert!(validate_performance_profile("extreme-overclock").is_err());
        assert!(validate_performance_profile("profile & dir").is_err());
    }

    #[test]
    fn test_validate_eartrumpet_theme() {
        assert!(validate_eartrumpet_theme("System").is_ok());
        assert!(validate_eartrumpet_theme("Dark").is_ok());
        assert!(validate_eartrumpet_theme("Light").is_ok());

        assert!(validate_eartrumpet_theme("Dark\"\r\n\"Injected\"=dword:1").is_err());
        assert!(validate_eartrumpet_theme("Custom").is_err());
    }
}
