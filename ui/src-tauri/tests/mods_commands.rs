mod common;

use std::fs;
use common::*;
use komoyasb_control_center_lib::commands::mods::*;
use komoyasb_control_center_lib::error::AppError;

#[tokio::test]
async fn test_load_and_save_flow_settings() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let settings = load_flow_settings(state.clone()).await.expect("load_flow_settings failed");
    assert_eq!(settings.hotkey, "Alt + Space");
    assert_eq!(settings.theme, "KomoyasbFluent");
    assert_eq!(settings.custom_accent_color, "#7aa2f7");
    assert_eq!(settings.border_radius, 8);

    // Modify settings and save
    let mut modified = settings;
    modified.hotkey = "Ctrl + Space".to_string();
    modified.border_radius = 12;
    modified.search_window_effect = "Acrylic".to_string();

    let save_res = save_flow_settings(state.clone(), modified).await;
    assert!(save_res.is_ok(), "save_flow_settings failed: {:?}", save_res.err());

    let reloaded = load_flow_settings(state).await.unwrap();
    assert_eq!(reloaded.hotkey, "Ctrl + Space");
    assert_eq!(reloaded.border_radius, 12);
    assert_eq!(reloaded.search_window_effect, "Acrylic");
}

#[tokio::test]
async fn test_load_flow_settings_missing_file_returns_io_error() {
    let repo = setup_test_repo();
    fs::remove_file(repo.path().join("configs").join("shell").join("flow_settings.json")).unwrap();

    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let result = load_flow_settings(state).await;
    assert!(result.is_err());
    match result.unwrap_err() {
        AppError::IoError { .. } => {}
        other => panic!("Expected IoError, got {:?}", other),
    }
}

#[tokio::test]
async fn test_load_flow_settings_corrupted_json_returns_parse_error() {
    let repo = setup_test_repo();
    fs::write(
        repo.path().join("configs").join("shell").join("flow_settings.json"),
        "invalid json content { [ ",
    ).unwrap();

    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let result = load_flow_settings(state).await;
    assert!(result.is_err());
    match result.unwrap_err() {
        AppError::ParseError { .. } => {}
        other => panic!("Expected ParseError, got {:?}", other),
    }
}

#[tokio::test]
async fn test_get_windhawk_mods_returns_manifest() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let mods = get_windhawk_mods(state).await.expect("get_windhawk_mods failed");
    assert_eq!(mods.len(), 3);

    let ids: Vec<String> = mods.iter().map(|m| m.id.clone()).collect();
    assert!(ids.contains(&"taskbar-autohide".to_string()));
    assert!(ids.contains(&"dwm-mica-effects".to_string()));
    assert!(ids.contains(&"notification-styling".to_string()));

    let taskbar_mod = mods.iter().find(|m| m.id == "taskbar-autohide").unwrap();
    assert_eq!(taskbar_mod.name, "Taskbar Autohide & Instant Unhide");
    assert!(taskbar_mod.is_loaded);
}

#[tokio::test]
async fn test_set_windhawk_mod_state_in_sandbox_simulates_success() {
    let repo = setup_test_repo();
    let sandbox = tempfile::tempdir().unwrap();
    let app_state = create_sandboxed_test_app_state(repo.path().to_path_buf(), sandbox.path().to_path_buf());
    let state = mock_state(&app_state);

    // Enable mod (Action: Load)
    let enable_res = set_windhawk_mod_state(state.clone(), "dwm-mica-effects".to_string(), true).await;
    assert!(enable_res.is_ok(), "set_windhawk_mod_state enable failed: {:?}", enable_res.err());

    // Disable mod (Action: Unload)
    let disable_res = set_windhawk_mod_state(state, "dwm-mica-effects".to_string(), false).await;
    assert!(disable_res.is_ok(), "set_windhawk_mod_state disable failed: {:?}", disable_res.err());
}

#[tokio::test]
async fn test_mods_sandbox_isolation() {
    let repo = setup_test_repo();
    let sandbox = tempfile::tempdir().unwrap();
    let app_state = create_sandboxed_test_app_state(repo.path().to_path_buf(), sandbox.path().to_path_buf());
    let state = mock_state(&app_state);

    let mut settings = load_flow_settings(state.clone()).await.unwrap();
    settings.hotkey = "Win + F".to_string();

    let save_res = save_flow_settings(state, settings).await;
    assert!(save_res.is_ok());

    // Live file unchanged
    let live_content = fs::read_to_string(repo.path().join("configs").join("shell").join("flow_settings.json")).unwrap();
    assert!(!live_content.contains("Win + F"));

    // Shadow sandbox file updated
    let shadow_path = sandbox.path().join("repo").join("configs").join("shell").join("flow_settings.json");
    assert!(shadow_path.exists());
    let shadow_content = fs::read_to_string(shadow_path).unwrap();
    assert!(shadow_content.contains("Win + F"));
}

#[tokio::test]
async fn test_set_windhawk_mod_state_whitelist_enforcement() {
    let repo = setup_test_repo();
    let sandbox = tempfile::tempdir().unwrap();
    let app_state = create_sandboxed_test_app_state(repo.path().to_path_buf(), sandbox.path().to_path_buf());
    let state = mock_state(&app_state);

    // Allowed mods succeed
    assert!(set_windhawk_mod_state(state.clone(), "taskbar-autohide".to_string(), true).await.is_ok());
    assert!(set_windhawk_mod_state(state.clone(), "dwm-mica-effects".to_string(), true).await.is_ok());
    assert!(set_windhawk_mod_state(state.clone(), "notification-styling".to_string(), true).await.is_ok());

    // Disallowed / injected mod IDs fail validation
    let bad_mods = [
        "arbitrary-mod",
        "taskbar-autohide; calc.exe",
        "../../malicious",
        "",
    ];

    for bad in bad_mods {
        let res = set_windhawk_mod_state(state.clone(), bad.to_string(), true).await;
        assert!(res.is_err(), "Expected set_windhawk_mod_state to reject '{}'", bad);
        match res.unwrap_err() {
            AppError::ValidationFailed { .. } => {}
            other => panic!("Expected ValidationFailed for '{}', got {:?}", bad, other),
        }
    }
}
