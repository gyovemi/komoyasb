mod common;

use std::fs;
use common::*;
use komoyasb_control_center_lib::commands::tiling::*;
use komoyasb_control_center_lib::error::AppError;

#[tokio::test]
async fn test_load_komorebi_config_success() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let config = load_komorebi_config(state).await.expect("load_komorebi_config failed");
    assert_eq!(config.cross_monitor_move_behaviour, "Insert");
    assert_eq!(config.default_workspace_padding, 8);
    assert!(config.border);
    assert_eq!(config.border_colours.single, "#7aa2f7");
    assert_eq!(config.monitors.len(), 1);
    assert_eq!(config.monitors[0].workspaces[0].name, "1:dev");
}

#[tokio::test]
async fn test_load_komorebi_config_missing_file_returns_io_error() {
    let repo = setup_test_repo();
    fs::remove_file(repo.path().join("configs").join("komorebi").join("komorebi.json")).unwrap();

    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let result = load_komorebi_config(state).await;
    assert!(result.is_err());
    match result.unwrap_err() {
        AppError::IoError { .. } => {}
        other => panic!("Expected IoError, got {:?}", other),
    }
}

#[tokio::test]
async fn test_load_komorebi_config_corrupted_json_returns_parse_error() {
    let repo = setup_test_repo();
    fs::write(
        repo.path().join("configs").join("komorebi").join("komorebi.json"),
        "{ corrupted json: ",
    ).unwrap();

    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let result = load_komorebi_config(state).await;
    assert!(result.is_err());
    match result.unwrap_err() {
        AppError::ParseError { .. } => {}
        other => panic!("Expected ParseError, got {:?}", other),
    }
}

#[tokio::test]
async fn test_save_komorebi_config_atomic_write_and_readback() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let mut config = load_komorebi_config(state.clone()).await.unwrap();
    config.default_workspace_padding = 16;
    config.border_width = 4;
    config.border_style = "square".to_string();

    let save_res = save_komorebi_config(state.clone(), config).await;
    assert!(save_res.is_ok(), "save_komorebi_config failed: {:?}", save_res.err());

    let reloaded = load_komorebi_config(state).await.unwrap();
    assert_eq!(reloaded.default_workspace_padding, 16);
    assert_eq!(reloaded.border_width, 4);
    assert_eq!(reloaded.border_style, "square");
}

#[tokio::test]
async fn test_load_and_save_float_rules() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let rules = load_float_rules(state.clone()).await.expect("load_float_rules failed");
    assert_eq!(rules.len(), 2);
    assert_eq!(rules[0].name, "Flow Launcher");
    assert_eq!(rules[0].identifier.id, "Flow.Launcher.exe");
    assert_eq!(rules[0].float, Some(true));

    // Add a new rule and save
    let mut modified_rules = rules;
    modified_rules.push(ApplicationRule {
        name: "Spotify Client".to_string(),
        identifier: ApplicationRuleIdentifier {
            kind: "Exe".to_string(),
            id: "Spotify.exe".to_string(),
            matching_strategy: "Equals".to_string(),
        },
        float: Some(true),
        manage: Some(false),
        transparency: Some(true),
    });

    let save_res = save_float_rules(state.clone(), modified_rules).await;
    assert!(save_res.is_ok());

    let reloaded_rules = load_float_rules(state).await.unwrap();
    assert_eq!(reloaded_rules.len(), 3);
    assert_eq!(reloaded_rules[2].name, "Spotify Client");
}

#[tokio::test]
async fn test_load_float_rules_corrupted_yaml_returns_parse_error() {
    let repo = setup_test_repo();
    fs::write(
        repo.path().join("configs").join("komorebi").join("applications.yaml"),
        "- name: unclosed quote \"",
    ).unwrap();

    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let result = load_float_rules(state).await;
    assert!(result.is_err());
    match result.unwrap_err() {
        AppError::ParseError { .. } => {}
        other => panic!("Expected ParseError, got {:?}", other),
    }
}

#[tokio::test]
async fn test_load_and_save_hotkeys() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let hotkeys = load_hotkeys(state.clone()).await.expect("load_hotkeys failed");
    assert_eq!(hotkeys.len(), 3);
    assert_eq!(hotkeys[0].key, "h");
    assert_eq!(hotkeys[0].modifiers, vec!["alt"]);
    assert_eq!(hotkeys[0].command, "komorebic focus left");
    assert_eq!(hotkeys[0].category, "navigation");

    assert_eq!(hotkeys[2].key, "1");
    assert_eq!(hotkeys[2].category, "workspace");

    // Save with an added binding
    let mut modified_hotkeys = hotkeys;
    modified_hotkeys.push(HotkeyBinding {
        id: "binding-new".to_string(),
        raw_comment: Some("Focus up".to_string()),
        modifiers: vec!["alt".to_string()],
        key: "k".to_string(),
        command: "komorebic focus up".to_string(),
        category: "navigation".to_string(),
    });

    let save_res = save_hotkeys(state.clone(), modified_hotkeys).await;
    assert!(save_res.is_ok());

    let reloaded = load_hotkeys(state).await.unwrap();
    assert_eq!(reloaded.len(), 4);
    assert_eq!(reloaded[3].key, "k");
    assert_eq!(reloaded[3].command, "komorebic focus up");
}

#[tokio::test]
async fn test_validate_hotkeys_clean_and_duplicate_conflicts() {
    // 1. Clean list without duplicates
    let clean_hotkeys = vec![
        HotkeyBinding {
            id: "1".to_string(),
            raw_comment: None,
            modifiers: vec!["alt".to_string()],
            key: "h".to_string(),
            command: "focus left".to_string(),
            category: "navigation".to_string(),
        },
        HotkeyBinding {
            id: "2".to_string(),
            raw_comment: None,
            modifiers: vec!["alt".to_string()],
            key: "j".to_string(),
            command: "focus down".to_string(),
            category: "navigation".to_string(),
        },
    ];
    let conflicts = validate_hotkeys(clean_hotkeys).await.unwrap();
    assert!(conflicts.is_empty(), "Expected zero conflicts for distinct bindings");

    // 2. Duplicate combination
    let duplicate_hotkeys = vec![
        HotkeyBinding {
            id: "1".to_string(),
            raw_comment: None,
            modifiers: vec!["alt".to_string(), "ctrl".to_string()],
            key: "h".to_string(),
            command: "action 1".to_string(),
            category: "navigation".to_string(),
        },
        HotkeyBinding {
            id: "2".to_string(),
            raw_comment: None,
            // reversed modifier order should still be detected as conflict
            modifiers: vec!["ctrl".to_string(), "alt".to_string()],
            key: "H".to_string(), // case-insensitive key
            command: "action 2".to_string(),
            category: "system".to_string(),
        },
    ];
    let detected = validate_hotkeys(duplicate_hotkeys).await.unwrap();
    assert_eq!(detected.len(), 1, "Expected 1 conflict detected");
    assert_eq!(detected[0].reason, "DUPLICATE_BINDING");
    assert_eq!(detected[0].binding_a.id, "1");
    assert_eq!(detected[0].binding_b.id, "2");
}

#[tokio::test]
async fn test_tiling_commands_sandbox_redirection() {
    let repo = setup_test_repo();
    let sandbox = tempfile::tempdir().unwrap();
    let app_state = create_sandboxed_test_app_state(repo.path().to_path_buf(), sandbox.path().to_path_buf());
    let state = mock_state(&app_state);

    let mut config = load_komorebi_config(state.clone()).await.unwrap();
    config.default_workspace_padding = 99;

    let save_res = save_komorebi_config(state, config).await;
    assert!(save_res.is_ok());

    // Original live file remains unchanged
    let live_content = fs::read_to_string(repo.path().join("configs").join("komorebi").join("komorebi.json")).unwrap();
    assert!(!live_content.contains("99"));

    // Shadow sandbox file has new value
    let shadow_path = sandbox.path().join("repo").join("configs").join("komorebi").join("komorebi.json");
    assert!(shadow_path.exists());
    let shadow_content = fs::read_to_string(shadow_path).unwrap();
    assert!(shadow_content.contains("99"));
}
