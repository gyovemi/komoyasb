mod common;

use std::fs;
use common::*;
use komoyasb_control_center_lib::commands::system::*;
use komoyasb_control_center_lib::error::AppError;

#[tokio::test]
async fn test_check_deployment_status_sandboxed() {
    let repo = setup_test_repo();
    let sandbox = tempfile::tempdir().unwrap();
    let app_state = create_sandboxed_test_app_state(repo.path().to_path_buf(), sandbox.path().to_path_buf());
    let state = mock_state(&app_state);

    let status = check_deployment_status(state).await.expect("check_deployment_status failed");
    assert!(status.is_deployed);
    assert!(status.komorebi_config_exists);
    assert!(status.yasb_config_exists);
    assert!(status.whkdrc_exists);
    assert!(status.active_services_running);
    assert!(status.missing_tools.is_empty());
}

#[tokio::test]
async fn test_check_deployment_status_non_sandboxed() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let status = check_deployment_status(state).await.expect("check_deployment_status failed");
    // Verify fields are populated without panic
    let _ = status.is_deployed;
    let _ = status.komorebi_config_exists;
}

#[tokio::test]
async fn test_get_sandbox_state_both_modes() {
    let repo = setup_test_repo();

    // 1. Non-sandboxed
    let app_state_live = create_test_app_state(repo.path().to_path_buf());
    let state_live = mock_state(&app_state_live);
    let info_live = get_sandbox_state(state_live).await.unwrap();
    assert!(!info_live.is_sandboxed);
    assert!(info_live.sandbox_path.is_none());
    assert_eq!(info_live.live_working_dir, repo.path().to_string_lossy());

    // 2. Sandboxed
    let sandbox = tempfile::tempdir().unwrap();
    let app_state_sandboxed = create_sandboxed_test_app_state(repo.path().to_path_buf(), sandbox.path().to_path_buf());
    let state_sandboxed = mock_state(&app_state_sandboxed);
    let info_sandboxed = get_sandbox_state(state_sandboxed).await.unwrap();
    assert!(info_sandboxed.is_sandboxed);
    assert_eq!(info_sandboxed.sandbox_path, Some(sandbox.path().to_string_lossy().to_string()));
}

#[tokio::test]
async fn test_get_services_status_sandboxed_and_live() {
    let repo = setup_test_repo();

    // Sandboxed returns simulated active services
    let sandbox = tempfile::tempdir().unwrap();
    let app_state_sandboxed = create_sandboxed_test_app_state(repo.path().to_path_buf(), sandbox.path().to_path_buf());
    let state_sandboxed = mock_state(&app_state_sandboxed);

    let services = get_services_status(state_sandboxed).await.expect("get_services_status failed");
    assert_eq!(services.len(), 4);
    for svc in services {
        assert!(svc.isRunning);
        assert!(svc.pid.is_some());
        assert!(svc.memoryBytes > 0);
    }

    // Live mode queries system telemetry
    let app_state_live = create_test_app_state(repo.path().to_path_buf());
    let state_live = mock_state(&app_state_live);
    let live_services = get_services_status(state_live).await.expect("get_services_status live failed");
    assert_eq!(live_services.len(), 4);
}

#[tokio::test]
async fn test_get_backups_and_restore_backup() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let backups = get_backups(state.clone()).await.expect("get_backups failed");
    assert_eq!(backups.len(), 1);
    assert_eq!(backups[0].timestamp, "20261120_120000");
    assert_eq!(backups[0].files.len(), 1);
    assert_eq!(backups[0].files[0].original, "komorebi.json");

    // Restore existing backup
    let restore_res = restore_backup(state.clone(), "20261120_120000".to_string()).await;
    assert!(restore_res.is_ok(), "restore_backup failed: {:?}", restore_res.err());

    // Restore non-existent backup returns IoError
    let missing_restore = restore_backup(state, "99999999_999999".to_string()).await;
    assert!(missing_restore.is_err());
    match missing_restore.unwrap_err() {
        AppError::IoError { message, .. } => {
            assert!(message.contains("99999999_999999"));
        }
        other => panic!("Expected IoError, got {:?}", other),
    }
}

#[tokio::test]
async fn test_get_backups_empty_when_no_directory() {
    let repo = setup_test_repo();
    let themes_backup = repo.path().join("themes").join(".backups");
    if themes_backup.exists() {
        let _ = fs::remove_dir_all(&themes_backup);
    }
    let legacy_backup = repo.path().join(".backups");
    if legacy_backup.exists() {
        let _ = fs::remove_dir_all(&legacy_backup);
    }

    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let backups = get_backups(state).await.unwrap();
    assert!(backups.is_empty());
}

#[tokio::test]
async fn test_service_action_sandboxed() {
    let repo = setup_test_repo();
    let sandbox = tempfile::tempdir().unwrap();
    let app_state = create_sandboxed_test_app_state(repo.path().to_path_buf(), sandbox.path().to_path_buf());
    let state = mock_state(&app_state);

    for action in [ServiceControlAction::Start, ServiceControlAction::Stop, ServiceControlAction::Restart] {
        let res = service_action(state.clone(), "komorebi".to_string(), action).await;
        assert!(res.is_ok(), "service_action failed: {:?}", res.err());
    }
}

#[tokio::test]
async fn test_apply_sync_theme_dry_run() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let result = apply_sync_theme(state, true).await;
    assert!(result.is_ok(), "apply_sync_theme failed: {:?}", result.err());

    let res = result.unwrap();
    assert_eq!(res.theme_name, "Tokyo Night Dark");
    assert!(res.rendered_files.contains(&"configs/komorebi/komorebi.json".to_string()));
    assert!(res.reloaded_services.contains(&"komorebi".to_string()));
}

#[tokio::test]
async fn test_execute_full_dryrun_sandboxed() {
    let repo = setup_test_repo();
    let sandbox = tempfile::tempdir().unwrap();

    // Stage a mock ledger.json inside the sandbox root so execute_full_dryrun finds it
    let ledger_path = sandbox.path().join("ledger.json");
    let mock_ledger_json = r#"{
      "sessionId": "test-session-123",
      "timestamp": "2026-11-22T08:00:00Z",
      "isDryRun": true,
      "shadowRoot": "C:\\fake\\shadow",
      "summary": {
        "totalActions": 5,
        "filesWritten": 4,
        "filesDeleted": 0,
        "registryWrites": 1,
        "packagesSimulated": 0,
        "processesControlled": 3
      },
      "actions": [
        {
          "id": "act-1",
          "timestamp": "2026-11-22T08:00:01Z",
          "actionType": "FILE_WRITE",
          "target": "configs/komorebi/komorebi.json",
          "status": "SIMULATED",
          "metadata": {}
        }
      ],
      "fileDiffs": [
        {
          "targetVirtualPath": "C:\\fake\\shadow\\komorebi.json",
          "targetLivePath": "C:\\Users\\User\\.config\\komorebi\\komorebi.json",
          "changeType": "MODIFIED",
          "originalSha256": "abc12345",
          "shadowSha256": "def67890",
          "byteSize": 1024
        }
      ]
    }"#;
    fs::write(&ledger_path, mock_ledger_json).unwrap();

    let app_state = create_sandboxed_test_app_state(repo.path().to_path_buf(), sandbox.path().to_path_buf());
    let state = mock_state(&app_state);

    let dryrun_result = execute_full_dryrun(state, Some("Tokyo Night Dark".to_string()), Some(true)).await;
    assert!(dryrun_result.is_ok(), "execute_full_dryrun failed: {:?}", dryrun_result.err());

    let ledger = dryrun_result.unwrap();
    assert_eq!(ledger.session_id, "test-session-123");
    assert!(ledger.is_dry_run);
    assert_eq!(ledger.summary.total_actions, 5);
    assert_eq!(ledger.summary.files_written, 4);
    assert_eq!(ledger.actions.len(), 1);
    assert_eq!(ledger.actions[0].action_type, "FILE_WRITE");
    assert_eq!(ledger.file_diffs.len(), 1);
    assert_eq!(ledger.file_diffs[0].change_type, "MODIFIED");
}

#[tokio::test]
async fn test_get_privilege_status_command() {
    let repo = setup_test_repo();

    // 1. Sandboxed mode always returns isRootless = true, isElevated = false
    let sandbox = tempfile::tempdir().unwrap();
    let app_state_sandboxed = create_sandboxed_test_app_state(repo.path().to_path_buf(), sandbox.path().to_path_buf());
    let state_sandboxed = mock_state(&app_state_sandboxed);
    let priv_sandboxed = get_privilege_status(state_sandboxed).await.unwrap();
    assert!(!priv_sandboxed.is_elevated);
    assert!(priv_sandboxed.is_rootless);

    // 2. Live mode returns valid boolean states without crashing
    let app_state_live = create_test_app_state(repo.path().to_path_buf());
    let state_live = mock_state(&app_state_live);
    let priv_live = get_privilege_status(state_live).await.unwrap();
    assert_eq!(priv_live.is_rootless, !priv_live.is_elevated);
}

#[tokio::test]
async fn test_restore_backup_path_traversal_rejection() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let traversal_timestamps = [
        "../../etc/passwd",
        "..\\..\\Windows\\System32",
        "20261120/../../etc",
        "timestamp\0null",
        "",
        "bad; rm -rf /",
    ];

    for bad in traversal_timestamps {
        let res = restore_backup(state.clone(), bad.to_string()).await;
        assert!(res.is_err(), "Expected restore_backup to reject traversal timestamp: {:?}", bad);
        match res.unwrap_err() {
            AppError::SandboxViolation { .. } | AppError::ValidationFailed { .. } => {}
            other => panic!("Expected SandboxViolation or ValidationFailed for {:?}, got {:?}", bad, other),
        }
    }
}

#[tokio::test]
async fn test_restore_backup_with_manifest_restores_to_original_destination() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let backup_dir = repo.path().join("themes").join(".backups").join("20261122_150000");
    fs::create_dir_all(&backup_dir).unwrap();

    let backup_komorebi = backup_dir.join("komorebi.json.backup");
    fs::write(&backup_komorebi, "{\"restored_komorebi\": true}").unwrap();

    let backup_yasb = backup_dir.join("config.yaml.backup");
    fs::write(&backup_yasb, "restored_yasb: true\n").unwrap();

    let orig_komorebi = repo.path().join("configs").join("komorebi").join("komorebi.json");
    let orig_yasb = repo.path().join("configs").join("yasb").join("config.yaml");

    // Overwrite live targets with garbage before restoration
    fs::write(&orig_komorebi, "{\"garbage\": true}").unwrap();
    fs::write(&orig_yasb, "garbage: true\n").unwrap();

    // Author manifest.json mapping original destinations
    let manifest = serde_json::json!({
        "Timestamp": "20261122_150000",
        "Backups": [
            {
                "Original": orig_komorebi.to_string_lossy().to_string(),
                "Backup": backup_komorebi.to_string_lossy().to_string()
            },
            {
                "Original": orig_yasb.to_string_lossy().to_string(),
                "Backup": backup_yasb.to_string_lossy().to_string()
            }
        ]
    });
    fs::write(backup_dir.join("manifest.json"), serde_json::to_string_pretty(&manifest).unwrap()).unwrap();

    // Execute restore_backup
    let restore_result = restore_backup(state.clone(), "20261122_150000".to_string()).await;
    assert!(restore_result.is_ok(), "restore_backup with manifest failed: {:?}", restore_result.err());

    // Verify files restored to their exact original destinations
    let restored_komorebi_content = fs::read_to_string(&orig_komorebi).unwrap();
    assert!(restored_komorebi_content.contains("\"restored_komorebi\": true"));

    let restored_yasb_content = fs::read_to_string(&orig_yasb).unwrap();
    assert!(restored_yasb_content.contains("restored_yasb: true"));

    // Verify files were NOT dumped into configs/komorebi/ with backup names
    assert!(!repo.path().join("configs").join("komorebi").join("config.yaml.backup").exists());
}

#[tokio::test]
async fn test_restore_backup_manifest_traversal_rejection() {
    let repo = setup_test_repo();
    let app_state = create_test_app_state(repo.path().to_path_buf());
    let state = mock_state(&app_state);

    let backup_dir = repo.path().join("themes").join(".backups").join("20261122_999999");
    fs::create_dir_all(&backup_dir).unwrap();
    let safe_backup = backup_dir.join("safe.json");
    fs::write(&safe_backup, "{}").unwrap();

    // Manifest contains parent directory traversal in Original path
    let bad_manifest = serde_json::json!({
        "Timestamp": "20261122_999999",
        "Backups": [
            {
                "Original": "../../Windows/System32/evil.dll",
                "Backup": safe_backup.to_string_lossy().to_string()
            }
        ]
    });
    fs::write(backup_dir.join("manifest.json"), serde_json::to_string_pretty(&bad_manifest).unwrap()).unwrap();

    let res = restore_backup(state, "20261122_999999".to_string()).await;
    assert!(res.is_err(), "Expected manifest path traversal to be rejected");
    match res.unwrap_err() {
        AppError::SandboxViolation { .. } => {}
        other => panic!("Expected SandboxViolation for manifest traversal, got {:?}", other),
    }
}

#[tokio::test]
async fn test_service_action_supports_bulk_all_and_individual_services() {
    let repo = setup_test_repo();
    let sandbox = tempfile::tempdir().unwrap();
    let app_state = create_sandboxed_test_app_state(repo.path().to_path_buf(), sandbox.path().to_path_buf());
    let state = mock_state(&app_state);

    // Bulk supervisor action with "all"
    let all_res = service_action(state.clone(), "all".to_string(), ServiceControlAction::Restart).await;
    assert!(all_res.is_ok(), "service_action for 'all' failed: {:?}", all_res.err());

    // Individual service actions
    for svc in ["komorebi", "whkd", "yasb", "watchdog"] {
        let res = service_action(state.clone(), svc.to_string(), ServiceControlAction::Start).await;
        assert!(res.is_ok(), "service_action for '{}' failed: {:?}", svc, res.err());
    }

    // Invalid service names rejected by validation
    let bad_res = service_action(state, "../evil_service".to_string(), ServiceControlAction::Restart).await;
    assert!(bad_res.is_err());
}
