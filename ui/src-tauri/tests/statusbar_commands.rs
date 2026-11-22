mod common;

use std::fs;
use common::*;
use komoyasb_control_center_lib::commands::statusbar::*;
use komoyasb_control_center_lib::error::AppError;

#[tokio::test]
async fn test_load_and_save_yasb_config() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let config = load_yasb_config(state.clone()).await.expect("load_yasb_config failed");
    assert!(config.watch_stylesheet);
    assert!(config.watch_config);
    assert!(config.bars.contains_key("main-bar"));
    let bar = &config.bars["main-bar"];
    assert_eq!(bar.dimensions.height, 32);
    assert_eq!(bar.alignment.position, "top");

    // Modify and save
    let mut modified = config;
    let main_bar = modified.bars.get_mut("main-bar").unwrap();
    main_bar.dimensions.height = 40;
    main_bar.blur_effect.acrylic = true;

    let save_res = save_yasb_config(state.clone(), modified).await;
    assert!(save_res.is_ok(), "save_yasb_config failed: {:?}", save_res.err());

    let reloaded = load_yasb_config(state).await.unwrap();
    assert_eq!(reloaded.bars["main-bar"].dimensions.height, 40);
    assert!(reloaded.bars["main-bar"].blur_effect.acrylic);
}

#[tokio::test]
async fn test_load_yasb_config_missing_file_returns_io_error() {
    let repo = setup_test_repo();
    fs::remove_file(repo.path().join("configs").join("yasb").join("config.yaml")).unwrap();

    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let result = load_yasb_config(state).await;
    assert!(result.is_err());
    match result.unwrap_err() {
        AppError::IoError { .. } => {}
        other => panic!("Expected IoError, got {:?}", other),
    }
}

#[tokio::test]
async fn test_load_yasb_config_corrupted_yaml_returns_parse_error() {
    let repo = setup_test_repo();
    fs::write(
        repo.path().join("configs").join("yasb").join("config.yaml"),
        "bars: [broken yaml: ",
    ).unwrap();

    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let result = load_yasb_config(state).await;
    assert!(result.is_err());
    match result.unwrap_err() {
        AppError::ParseError { .. } => {}
        other => panic!("Expected ParseError, got {:?}", other),
    }
}

#[tokio::test]
async fn test_load_and_save_yasb_css() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let initial_css = load_yasb_css(state.clone()).await.expect("load_yasb_css failed");
    assert!(initial_css.contains("JetBrainsMono Nerd Font"));

    let new_css = ".yasb-bar { background-color: #000000; color: #ffffff; }\n";
    let save_res = save_yasb_css(state.clone(), new_css.to_string()).await;
    assert!(save_res.is_ok());

    let reloaded_css = load_yasb_css(state).await.unwrap();
    assert_eq!(reloaded_css, new_css);
}

#[tokio::test]
async fn test_load_and_save_fluentflyout_config() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let config = load_fluentflyout_config(state.clone()).await.expect("load_fluentflyout_config failed");
    assert_eq!(config.appearance.backdrop, "MicaAlt");
    assert_eq!(config.modules.volume.step_size, 2);
    assert!(config.modules.volume.show_mute_indicator);

    // Modify and save
    let mut modified = config;
    modified.appearance.backdrop = "Acrylic".to_string();
    modified.modules.volume.step_size = 5;

    let save_res = save_fluentflyout_config(state.clone(), modified).await;
    assert!(save_res.is_ok());

    let reloaded = load_fluentflyout_config(state).await.unwrap();
    assert_eq!(reloaded.appearance.backdrop, "Acrylic");
    assert_eq!(reloaded.modules.volume.step_size, 5);
}

#[tokio::test]
async fn test_load_fluentflyout_missing_returns_io_error() {
    let repo = setup_test_repo();
    fs::remove_file(repo.path().join("configs").join("polish").join("fluentflyout_config.json")).unwrap();

    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let result = load_fluentflyout_config(state).await;
    assert!(result.is_err());
    match result.unwrap_err() {
        AppError::IoError { .. } => {}
        other => panic!("Expected IoError, got {:?}", other),
    }
}

#[tokio::test]
async fn test_get_and_set_eartrumpet_config() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let config = get_eartrumpet_config(state.clone()).await.expect("get_eartrumpet_config failed");
    assert!(config.has_migrated);
    assert!(config.use_accent_color);
    assert_eq!(config.theme, "System");

    // Modify and write back
    let updated_config = EarTrumpetConfig {
        has_migrated: true,
        use_accent_color: false,
        theme: "Dark".to_string(),
        show_volume_peak_meter: true,
        show_playback_devices: true,
        show_recording_devices: true,
        show_app_icons: true,
        expand_all: true,
        is_promoted_in_tray: true,
    };

    let set_res = set_eartrumpet_config(state.clone(), updated_config).await;
    assert!(set_res.is_ok());

    let reloaded = get_eartrumpet_config(state).await.unwrap();
    assert_eq!(reloaded.theme, "Dark");
    assert!(!reloaded.use_accent_color);
    assert!(reloaded.expand_all);
}

#[tokio::test]
async fn test_get_eartrumpet_config_missing_file_fallback() {
    let repo = setup_test_repo();
    fs::remove_file(repo.path().join("configs").join("polish").join("eartrumpet_settings.reg")).unwrap();

    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let config = get_eartrumpet_config(state).await.unwrap();
    // Must return safe defaults without error
    assert!(config.has_migrated);
    assert_eq!(config.theme, "System");
    assert!(!config.expand_all);
}

#[tokio::test]
async fn test_statusbar_sandbox_isolation() {
    let repo = setup_test_repo();
    let sandbox = tempfile::tempdir().unwrap();
    let app_state = create_sandboxed_test_app_state(repo.path().to_path_buf(), sandbox.path().to_path_buf());
    let state = mock_state(&app_state);

    let save_css_res = save_yasb_css(state, "/* sandboxed css */".to_string()).await;
    assert!(save_css_res.is_ok());

    // Live file untouched
    let live_css = fs::read_to_string(repo.path().join("configs").join("yasb").join("styles.css")).unwrap();
    assert!(!live_css.contains("sandboxed css"));

    // Shadow sandbox updated
    let shadow_css = sandbox.path().join("repo").join("configs").join("yasb").join("styles.css");
    assert!(shadow_css.exists());
    assert!(fs::read_to_string(shadow_css).unwrap().contains("sandboxed css"));
}

#[tokio::test]
async fn test_set_eartrumpet_config_injection_rejection() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let base_config = get_eartrumpet_config(state.clone()).await.unwrap();

    // Allowed themes succeed
    for theme in ["System", "Dark", "Light"] {
        let mut cfg = base_config.clone();
        cfg.theme = theme.to_string();
        assert!(set_eartrumpet_config(state.clone(), cfg).await.is_ok());
    }

    // Malicious injection payloads fail validation
    let malicious_themes = [
        "Dark\"\r\n\"InjectedKey\"=dword:00000001\r\n",
        "System\n[HKEY_LOCAL_MACHINE\\Software\\Evil]",
        "CustomTheme",
        "",
        "../../bad",
    ];

    for bad in malicious_themes {
        let mut cfg = base_config.clone();
        cfg.theme = bad.to_string();
        let res = set_eartrumpet_config(state.clone(), cfg).await;
        assert!(res.is_err(), "Expected set_eartrumpet_config to reject malicious theme: {:?}", bad);
        match res.unwrap_err() {
            AppError::ValidationFailed { .. } => {}
            other => panic!("Expected ValidationFailed for {:?}, got {:?}", bad, other),
        }
    }
}
