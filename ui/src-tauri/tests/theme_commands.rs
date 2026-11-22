mod common;

use std::fs;
use common::*;
use komoyasb_control_center_lib::commands::theme::*;
use komoyasb_control_center_lib::error::AppError;

#[tokio::test]
async fn test_get_themes_discovers_themes_and_excludes_schema() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let themes_result = get_themes(state).await;
    assert!(themes_result.is_ok(), "get_themes failed: {:?}", themes_result.err());
    let themes = themes_result.unwrap();

    // Must find dark and light themes, but NOT theme.schema.json
    assert_eq!(themes.len(), 2);
    let names: Vec<String> = themes.iter().map(|t| t.name.clone()).collect();
    assert!(names.contains(&"Tokyo Night Dark".to_string()));
    assert!(names.contains(&"Tokyo Night Light".to_string()));

    // Active theme is Tokyo Night Dark (from .current_theme)
    let dark_summary = themes.iter().find(|t| t.name == "Tokyo Night Dark").unwrap();
    assert!(dark_summary.is_active);

    let light_summary = themes.iter().find(|t| t.name == "Tokyo Night Light").unwrap();
    assert!(!light_summary.is_active);
}

#[tokio::test]
async fn test_load_theme_by_filename() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let theme = load_theme(state, "dark".to_string()).await.expect("Failed to load dark theme by filename");
    assert_eq!(theme.name, "Tokyo Night Dark");
    assert_eq!(theme.variant, "dark");
    assert_eq!(theme.colors.bg_primary, "#1a1b26");
    assert_eq!(theme.geometry.border_width, 2);
}

#[tokio::test]
async fn test_load_theme_by_display_name() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let theme = load_theme(state, "Tokyo Night Light".to_string()).await.expect("Failed to load light theme by name");
    assert_eq!(theme.name, "Tokyo Night Light");
    assert_eq!(theme.variant, "light");
    assert_eq!(theme.colors.bg_primary, "#e6e9ef");
}

#[tokio::test]
async fn test_load_theme_missing_file_returns_io_error() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let result = load_theme(state, "non_existent_theme_name_12345".to_string()).await;
    assert!(result.is_err());
    match result.unwrap_err() {
        AppError::IoError { message, .. } => {
            assert!(message.contains("non_existent_theme_name_12345"));
        }
        other => panic!("Expected IoError, got {:?}", other),
    }
}

#[tokio::test]
async fn test_load_theme_corrupted_json_returns_parse_error() {
    let repo = setup_test_repo();
    let themes_dir = repo.path().join("themes");
    fs::write(themes_dir.join("corrupted.json"), "{\"name\": \"corrupt\", ").unwrap();

    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let result = load_theme(state, "corrupted".to_string()).await;
    assert!(result.is_err());
    match result.unwrap_err() {
        AppError::ParseError { .. } => {}
        other => panic!("Expected ParseError, got {:?}", other),
    }
}

#[tokio::test]
async fn test_save_theme_atomic_write_and_readback() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let mut theme = load_theme(state.clone(), "dark".to_string()).await.unwrap();
    theme.colors.accent = "#ff007f".to_string();
    theme.geometry.border_radius = 16;

    let save_result = save_theme(state.clone(), theme.clone()).await;
    assert!(save_result.is_ok(), "save_theme failed: {:?}", save_result.err());

    // Read back saved file
    let reloaded = load_theme(state, "dark".to_string()).await.unwrap();
    assert_eq!(reloaded.colors.accent, "#ff007f");
    assert_eq!(reloaded.geometry.border_radius, 16);
}

#[tokio::test]
async fn test_get_active_theme_name_from_marker_and_default_fallback() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    // Initial marker says "Tokyo Night Dark"
    let active_name = get_active_theme_name(state.clone()).await.unwrap();
    assert_eq!(active_name, "Tokyo Night Dark");

    // Remove marker file -> should fall back to "Tokyo Night Dark"
    fs::remove_file(repo.path().join("themes").join(".current_theme")).unwrap();
    let fallback_name = get_active_theme_name(state.clone()).await.unwrap();
    assert_eq!(fallback_name, "Tokyo Night Dark");

    // Empty marker file -> should also fall back to "Tokyo Night Dark"
    fs::write(repo.path().join("themes").join(".current_theme"), "   \n").unwrap();
    let empty_fallback_name = get_active_theme_name(state).await.unwrap();
    assert_eq!(empty_fallback_name, "Tokyo Night Dark");
}

#[tokio::test]
async fn test_set_active_theme_updates_marker_file() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let set_result = set_active_theme(state.clone(), "Tokyo Night Light".to_string()).await;
    assert!(set_result.is_ok());

    let updated_name = get_active_theme_name(state).await.unwrap();
    assert_eq!(updated_name, "Tokyo Night Light");

    // Check file directly
    let marker_content = fs::read_to_string(repo.path().join("themes").join(".current_theme")).unwrap();
    assert_eq!(marker_content.trim(), "Tokyo Night Light");
}

#[tokio::test]
async fn test_theme_commands_under_sandbox() {
    let repo = setup_test_repo();
    let sandbox = tempfile::tempdir().unwrap();
    let app_state = create_sandboxed_test_app_state(repo.path().to_path_buf(), sandbox.path().to_path_buf());
    let state = mock_state(&app_state);

    // Set active theme under sandbox
    let set_result = set_active_theme(state.clone(), "Sandboxed Theme".to_string()).await;
    assert!(set_result.is_ok());

    // Live repo marker should NOT be modified
    let live_marker = fs::read_to_string(repo.path().join("themes").join(".current_theme")).unwrap();
    assert_eq!(live_marker.trim(), "Tokyo Night Dark");

    // Shadow sandbox marker should be written
    let shadow_marker = sandbox.path().join("repo").join("themes").join(".current_theme");
    assert!(shadow_marker.exists());
    assert_eq!(fs::read_to_string(shadow_marker).unwrap().trim(), "Sandboxed Theme");
}

#[tokio::test]
async fn test_load_theme_path_traversal_rejection() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let traversal_cases = [
        "../../etc/passwd",
        "..\\..\\..\\Windows\\System32\\cmd",
        "theme/../../secret",
        "invalid/path",
        "null\0byte",
    ];

    for case in traversal_cases {
        let result = load_theme(state.clone(), case.to_string()).await;
        assert!(result.is_err(), "Expected load_theme to reject '{}'", case);
        match result.unwrap_err() {
            AppError::SandboxViolation { .. } | AppError::ValidationFailed { .. } => {}
            other => panic!("Expected SandboxViolation or ValidationFailed for '{}', got {:?}", case, other),
        }
    }
}

#[tokio::test]
async fn test_set_active_theme_path_traversal_rejection() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let traversal_cases = [
        "../../etc/passwd",
        "..\\..\\Windows",
        "name; rm -rf /",
    ];

    for case in traversal_cases {
        let result = set_active_theme(state.clone(), case.to_string()).await;
        assert!(result.is_err(), "Expected set_active_theme to reject '{}'", case);
        match result.unwrap_err() {
            AppError::SandboxViolation { .. } | AppError::ValidationFailed { .. } => {}
            other => panic!("Expected SandboxViolation or ValidationFailed for '{}', got {:?}", case, other),
        }
    }
}

#[tokio::test]
async fn test_save_theme_custom_saves_as_slug_without_overwriting_variant() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    // Read original dark.json content to verify it remains untouched
    let original_dark_content = fs::read_to_string(repo.path().join("themes").join("dark.json")).unwrap();

    let mut custom_theme = load_theme(state.clone(), "dark".to_string()).await.unwrap();
    custom_theme.name = "Nordic Frost Dark".to_string();
    custom_theme.variant = "dark".to_string(); // Variant is dark, but name is custom
    custom_theme.colors.bg_primary = "#2e3440".to_string();

    let save_result = save_theme(state.clone(), custom_theme.clone()).await;
    assert!(save_result.is_ok(), "save_theme for custom theme failed: {:?}", save_result.err());

    // BUG-12 verification: Must save to slug file 'nordic-frost-dark.json'
    let slug_file = repo.path().join("themes").join("nordic-frost-dark.json");
    assert!(slug_file.exists(), "Expected slug file 'nordic-frost-dark.json' to exist");

    // BUG-12 verification: Must NOT overwrite base variant file 'dark.json'
    let dark_after = fs::read_to_string(repo.path().join("themes").join("dark.json")).unwrap();
    assert_eq!(dark_after, original_dark_content, "dark.json variant file must not be overwritten by custom theme");

    // Load custom theme back by display name and by slug
    let loaded_by_name = load_theme(state.clone(), "Nordic Frost Dark".to_string()).await.unwrap();
    assert_eq!(loaded_by_name.name, "Nordic Frost Dark");
    assert_eq!(loaded_by_name.colors.bg_primary, "#2e3440");

    let loaded_by_slug = load_theme(state, "nordic-frost-dark".to_string()).await.unwrap();
    assert_eq!(loaded_by_slug.name, "Nordic Frost Dark");
}

#[tokio::test]
async fn test_validate_safe_name_supports_spaces_in_theme_names() {
    use komoyasb_control_center_lib::utils::validator::validate_safe_name;

    let valid_theme_names = [
        "Tokyo Night Dark",
        "Tokyo Night Light",
        "Catppuccin Mocha - High Contrast",
        "Custom Theme 1",
        "Nordic Frost v2.0",
    ];

    for name in valid_theme_names {
        assert!(validate_safe_name(name).is_ok(), "validate_safe_name should accept '{}'", name);
    }

    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    // set_active_theme with spaced name
    let set_res = set_active_theme(state.clone(), "Tokyo Night Dark".to_string()).await;
    assert!(set_res.is_ok());

    let active = get_active_theme_name(state).await.unwrap();
    assert_eq!(active, "Tokyo Night Dark");
}
