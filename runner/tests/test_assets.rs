//! Integration tests for embedded asset extraction and integrity in komoyasb-run.

use komoyasb_run::assets::{extract_embedded_defaults, EMBEDDED_CONFIGS, EMBEDDED_PERF, EMBEDDED_THEMES};
use std::fs;
use tempfile::tempdir;

#[test]
fn test_extract_embedded_defaults_creates_all_expected_files() {
    let tmp = tempdir().expect("Failed to create tempdir");
    let target_dir = tmp.path();

    let report = extract_embedded_defaults(target_dir, false)
        .expect("extract_embedded_defaults should succeed");

    assert!(
        report.errors.is_empty(),
        "Extraction reported errors: {:?}",
        report.errors
    );
    assert!(
        !report.written.is_empty(),
        "Expected files to be written, but written list is empty"
    );

    // Verify key configuration templates
    let komorebi_tpl = target_dir.join("configs").join("komorebi").join("komorebi.json.template");
    assert!(komorebi_tpl.exists(), "Missing komorebi.json.template");
    assert!(fs::metadata(&komorebi_tpl).unwrap().len() > 0);

    let whkd_tpl = target_dir.join("configs").join("komorebi").join("whkdrc.template");
    assert!(whkd_tpl.exists(), "Missing whkdrc.template");
    assert!(fs::metadata(&whkd_tpl).unwrap().len() > 0);

    let apps_yaml = target_dir.join("configs").join("komorebi").join("applications.yaml");
    assert!(apps_yaml.exists(), "Missing applications.yaml");
    assert!(fs::metadata(&apps_yaml).unwrap().len() > 0);

    let yasb_cfg_tpl = target_dir.join("configs").join("yasb").join("config.yaml.template");
    assert!(yasb_cfg_tpl.exists(), "Missing config.yaml.template");
    assert!(fs::metadata(&yasb_cfg_tpl).unwrap().len() > 0);

    let yasb_css_tpl = target_dir.join("configs").join("yasb").join("styles.css.template");
    assert!(yasb_css_tpl.exists(), "Missing styles.css.template");
    assert!(fs::metadata(&yasb_css_tpl).unwrap().len() > 0);

    let flow_tpl = target_dir.join("configs").join("shell").join("flow_settings.json.template");
    assert!(flow_tpl.exists(), "Missing flow_settings.json.template");
    assert!(fs::metadata(&flow_tpl).unwrap().len() > 0);

    // Verify themes
    let dark_theme = target_dir.join("themes").join("dark.json");
    assert!(dark_theme.exists(), "Missing dark.json theme");
    let light_theme = target_dir.join("themes").join("light.json");
    assert!(light_theme.exists(), "Missing light.json theme");

    // Verify performance.json
    let perf_json = target_dir.join("performance.json");
    assert!(perf_json.exists(), "Missing performance.json");
    assert!(fs::metadata(&perf_json).unwrap().len() > 0);

    // Verify wallpapers
    let dark_wp = target_dir.join("configs").join("polish").join("wallpapers").join("dark.png");
    assert!(dark_wp.exists(), "Missing dark.png wallpaper");
    let light_wp = target_dir.join("configs").join("polish").join("wallpapers").join("light.png");
    assert!(light_wp.exists(), "Missing light.png wallpaper");
}

#[test]
fn test_extract_no_overwrite_when_not_forced() {
    let tmp = tempdir().expect("Failed to create tempdir");
    let target_dir = tmp.path();

    // First extraction
    let report1 = extract_embedded_defaults(target_dir, false)
        .expect("First extraction should succeed");
    assert!(!report1.written.is_empty());

    let target_theme = target_dir.join("themes").join("dark.json");
    assert!(target_theme.exists());

    // Modify file with custom sentinel
    let sentinel_content = r#"{"name": "custom-modified-user-theme", "sentinel": 12345}"#;
    fs::write(&target_theme, sentinel_content).expect("Failed to write sentinel");

    // Second extraction without force
    let report2 = extract_embedded_defaults(target_dir, false)
        .expect("Second extraction should succeed");

    assert!(
        report2.skipped.contains(&target_theme),
        "Expected themes/dark.json to be skipped, skipped: {:?}",
        report2.skipped
    );

    let content_after = fs::read_to_string(&target_theme).expect("Failed to read theme");
    assert_eq!(
        content_after, sentinel_content,
        "User file was unexpectedly overwritten during non-forced extraction"
    );
}

#[test]
fn test_extract_force_overwrites_existing_files() {
    let tmp = tempdir().expect("Failed to create tempdir");
    let target_dir = tmp.path();

    // First extraction
    extract_embedded_defaults(target_dir, false).expect("First extraction should succeed");

    let target_theme = target_dir.join("themes").join("dark.json");
    let sentinel_content = r#"{"name": "custom-sentinel-to-be-overwritten"}"#;
    fs::write(&target_theme, sentinel_content).expect("Failed to write sentinel");

    // Second extraction WITH force = true
    let report_force = extract_embedded_defaults(target_dir, true)
        .expect("Forced extraction should succeed");

    assert!(
        report_force.written.contains(&target_theme),
        "Expected themes/dark.json to be re-written under force=true"
    );

    let content_after = fs::read_to_string(&target_theme).expect("Failed to read theme");
    assert_ne!(
        content_after, sentinel_content,
        "User file should have been overwritten under force=true"
    );
    assert!(
        content_after.contains("Tokyo Night") || content_after.contains("colors"),
        "Default theme content was not restored"
    );
}

#[test]
fn test_embedded_dir_structures_and_validity() {
    // Assert embedded directories are non-empty
    assert!(
        EMBEDDED_CONFIGS.files().count() > 0 || EMBEDDED_CONFIGS.dirs().count() > 0,
        "EMBEDDED_CONFIGS is empty"
    );
    assert!(
        EMBEDDED_THEMES.files().count() > 0,
        "EMBEDDED_THEMES is empty"
    );
    assert!(
        !EMBEDDED_PERF.is_empty(),
        "EMBEDDED_PERF is empty"
    );

    // Verify performance.json parse
    let perf_val: serde_json::Value = serde_json::from_str(EMBEDDED_PERF)
        .expect("EMBEDDED_PERF should parse as valid JSON");
    assert!(perf_val.get("profiles").is_some());
    assert!(perf_val.get("active_profile").is_some());

    // Verify dark.json parse
    let dark_file = EMBEDDED_THEMES
        .get_file("dark.json")
        .expect("dark.json must exist in EMBEDDED_THEMES");
    let dark_val: serde_json::Value = serde_json::from_slice(dark_file.contents())
        .expect("dark.json must parse as valid JSON");
    assert!(dark_val.get("colors").is_some());

    // Verify light.json parse
    let light_file = EMBEDDED_THEMES
        .get_file("light.json")
        .expect("light.json must exist in EMBEDDED_THEMES");
    let light_val: serde_json::Value = serde_json::from_slice(light_file.contents())
        .expect("light.json must parse as valid JSON");
    assert!(light_val.get("colors").is_some());
}
