mod common;

use std::fs;
use common::*;
use komoyasb_control_center_lib::commands::performance::*;
use komoyasb_control_center_lib::error::AppError;

#[tokio::test]
async fn test_get_performance_config_success() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let config = get_performance_config(state).await.expect("get_performance_config failed");
    assert_eq!(config.active_profile, "balanced");
    assert!(config.profiles.contains_key("balanced"));
}

#[tokio::test]
async fn test_get_performance_config_missing_auto_initializes_defaults() {
    let repo = setup_test_repo();
    fs::remove_file(repo.path().join("performance.json")).unwrap();

    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    // Missing file triggers auto-generation of 4 preset profiles
    let config = get_performance_config(state).await.expect("auto-initialization failed");
    assert_eq!(config.active_profile, "balanced");
    assert_eq!(config.profiles.len(), 4);
    assert!(config.profiles.contains_key("ultra-low"));
    assert!(config.profiles.contains_key("balanced"));
    assert!(config.profiles.contains_key("visual-rich"));
    assert!(config.profiles.contains_key("gaming"));

    // Verify file was written to disk
    assert!(repo.path().join("performance.json").exists());
}

#[tokio::test]
async fn test_get_performance_config_corrupted_json_returns_parse_error() {
    let repo = setup_test_repo();
    fs::write(repo.path().join("performance.json"), "{\"active_profile\": broken").unwrap();

    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let result = get_performance_config(state).await;
    assert!(result.is_err());
    match result.unwrap_err() {
        AppError::ParseError { .. } => {}
        other => panic!("Expected ParseError, got {:?}", other),
    }
}

#[tokio::test]
async fn test_save_performance_config() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let mut config = get_performance_config(state.clone()).await.unwrap();
    config.active_profile = "ultra-low".to_string();

    let save_res = save_performance_config(state.clone(), config).await;
    assert!(save_res.is_ok(), "save_performance_config failed: {:?}", save_res.err());

    let reloaded = get_performance_config(state).await.unwrap();
    assert_eq!(reloaded.active_profile, "ultra-low");
}

#[tokio::test]
async fn test_set_performance_profile_all_presets_under_dryrun() {
    let valid_presets = ["ultra-low", "balanced", "visual-rich", "gaming"];

    for preset in valid_presets {
        let repo = setup_test_repo();
        let app_state = create_test_app_state(repo.path().to_path_buf());
        let state = mock_state(&app_state);

        let apply_result = set_performance_profile(state.clone(), preset.to_string(), true).await;
        assert!(apply_result.is_ok(), "set_performance_profile failed for preset {}: {:?}", preset, apply_result.err());

        let res = apply_result.unwrap();
        assert_eq!(res.theme_name, format!("profile:{}", preset));
        assert!(res.rendered_files.contains(&"configs/komorebi/komorebi.json".to_string()));
        assert!(res.reloaded_services.contains(&"komorebi".to_string()));

        // Check themes/.current_perf was updated
        let perf_marker = fs::read_to_string(repo.path().join("themes").join(".current_perf")).unwrap();
        assert_eq!(perf_marker.trim(), preset);
    }
}

#[tokio::test]
async fn test_set_performance_profile_sandbox_isolation() {
    let repo = setup_test_repo();
    let sandbox = tempfile::tempdir().unwrap();
    let app_state = create_sandboxed_test_app_state(repo.path().to_path_buf(), sandbox.path().to_path_buf());
    let state = mock_state(&app_state);

    let apply_result = set_performance_profile(state, "gaming".to_string(), false).await;
    assert!(apply_result.is_ok());

    // Live marker unchanged
    let live_marker = fs::read_to_string(repo.path().join("themes").join(".current_perf")).unwrap();
    assert_eq!(live_marker.trim(), "balanced");

    // Shadow sandbox marker updated
    let shadow_marker = sandbox.path().join("repo").join("themes").join(".current_perf");
    assert!(shadow_marker.exists());
    assert_eq!(fs::read_to_string(shadow_marker).unwrap().trim(), "gaming");
}

#[tokio::test]
async fn test_set_performance_profile_whitelist_enforcement() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    // Allowed profiles succeed
    for profile in ["ultra-low", "balanced", "visual-rich", "gaming", "custom"] {
        assert!(set_performance_profile(state.clone(), profile.to_string(), true).await.is_ok());
    }

    // Invalid profiles fail validation
    let bad_profiles = [
        "overclock",
        "extreme",
        "balanced; rm -rf /",
        "../../bad_profile",
        "",
    ];

    for bad in bad_profiles {
        let result = set_performance_profile(state.clone(), bad.to_string(), true).await;
        assert!(result.is_err(), "Expected set_performance_profile to reject '{}'", bad);
        match result.unwrap_err() {
            AppError::ValidationFailed { .. } => {}
            other => panic!("Expected ValidationFailed for '{}', got {:?}", bad, other),
        }
    }
}
