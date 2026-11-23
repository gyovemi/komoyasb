//! Integration tests for template rendering across all 4 performance presets and Tokyo Night themes.

use komoyasb_run::assets::extract_embedded_defaults;
use komoyasb_run::config::RuntimeConfig;
use komoyasb_run::render::{
    expand_computed_tokens, flatten_tokens, render_template, sync_all_templates,
};
use std::collections::HashMap;
use std::fs;
use tempfile::tempdir;

const PRESETS: &[&str] = &["ultra-low", "balanced", "visual-rich", "gaming"];
const THEMES: &[&str] = &["dark", "light"];

#[test]
fn test_render_all_profiles_and_themes_zero_unrendered_tokens() {
    let tmp = tempdir().expect("Failed to create tempdir");
    let state_root = tmp.path();

    // 1. Materialize embedded templates into tempdir
    extract_embedded_defaults(state_root, false)
        .expect("extract_embedded_defaults must succeed");

    for &theme in THEMES {
        for &profile in PRESETS {
            let config = RuntimeConfig::load(Some(theme), Some(profile), Some(state_root))
                .unwrap_or_else(|e| panic!("Failed to load config for theme={theme}, profile={profile}: {e}"));

            let report = sync_all_templates(&config, false, Some(state_root))
                .unwrap_or_else(|e| panic!("sync_all_templates failed for theme={theme}, profile={profile}: {e}"));

            assert_eq!(
                report.errors, 0,
                "Template rendering encountered {} errors for theme={theme}, profile={profile}",
                report.errors
            );
            assert!(
                report.rendered > 0 || report.skipped > 0,
                "No templates were processed for theme={theme}, profile={profile}"
            );

            // Verify rendered files have zero leftover tokens and valid syntax
            let komorebi_json_path = state_root.join("configs").join("komorebi").join("komorebi.json");
            assert!(komorebi_json_path.exists(), "komorebi.json must be rendered");
            let komorebi_content = fs::read_to_string(&komorebi_json_path).expect("read komorebi.json");
            assert_no_unrendered_tokens(&komorebi_content, "komorebi.json", theme, profile);

            // Assert valid JSON
            let _: serde_json::Value = serde_json::from_str(&komorebi_content)
                .unwrap_or_else(|e| panic!("komorebi.json is invalid JSON ({theme}/{profile}): {e}"));

            let whkdrc_path = state_root.join("configs").join("komorebi").join("whkdrc");
            assert!(whkdrc_path.exists(), "whkdrc must be rendered");
            let whkdrc_content = fs::read_to_string(&whkdrc_path).expect("read whkdrc");
            assert_no_unrendered_tokens(&whkdrc_content, "whkdrc", theme, profile);

            let yasb_yaml_path = state_root.join("configs").join("yasb").join("config.yaml");
            assert!(yasb_yaml_path.exists(), "config.yaml must be rendered");
            let yasb_yaml_content = fs::read_to_string(&yasb_yaml_path).expect("read yasb config.yaml");
            assert_no_unrendered_tokens(&yasb_yaml_content, "config.yaml", theme, profile);

            // Assert valid YAML
            let _: serde_yaml::Value = serde_yaml::from_str(&yasb_yaml_content)
                .unwrap_or_else(|e| panic!("yasb config.yaml is invalid YAML ({theme}/{profile}): {e}"));

            let yasb_css_path = state_root.join("configs").join("yasb").join("styles.css");
            assert!(yasb_css_path.exists(), "styles.css must be rendered");
            let yasb_css_content = fs::read_to_string(&yasb_css_path).expect("read yasb styles.css");
            assert_no_unrendered_tokens(&yasb_css_content, "styles.css", theme, profile);

            let flow_settings_path = state_root.join("configs").join("shell").join("flow_settings.json");
            if flow_settings_path.exists() {
                let flow_content = fs::read_to_string(&flow_settings_path).expect("read flow_settings.json");
                assert_no_unrendered_tokens(&flow_content, "flow_settings.json", theme, profile);
                let _: serde_json::Value = serde_json::from_str(&flow_content)
                    .unwrap_or_else(|e| panic!("flow_settings.json is invalid JSON ({theme}/{profile}): {e}"));
            }
        }
    }
}

fn assert_no_unrendered_tokens(content: &str, file: &str, theme: &str, profile: &str) {
    if let Some(start) = content.find("{{") {
        let snippet: String = content[start..].chars().take(40).collect();
        panic!(
            "File '{file}' contains unrendered template token '{snippet}...' (theme={theme}, profile={profile})"
        );
    }
    assert!(
        !content.contains("}}"),
        "File '{file}' contains stray '}}' token (theme={theme}, profile={profile})"
    );
}

#[test]
fn test_computed_color_variants_expansion() {
    let mut tokens = HashMap::new();
    tokens.insert("colors.accent".to_string(), "#7aa2f7".to_string());
    tokens.insert("colors.bg".to_string(), "#1a1b26".to_string());

    expand_computed_tokens(&mut tokens);

    // Assert .rgb variant
    assert_eq!(
        tokens.get("colors.accent.rgb"),
        Some(&"rgb(122, 162, 247)".to_string())
    );
    assert_eq!(
        tokens.get("colors.bg.rgb"),
        Some(&"rgb(26, 27, 38)".to_string())
    );

    // Assert alpha variants (5%, 50%, 95%)
    assert_eq!(
        tokens.get("colors.accent_alpha50"),
        Some(&"rgba(122, 162, 247, 0.50)".to_string())
    );
    assert_eq!(
        tokens.get("colors.accent_alpha10"),
        Some(&"rgba(122, 162, 247, 0.10)".to_string())
    );
    assert_eq!(
        tokens.get("colors.bg_alpha80"),
        Some(&"rgba(26, 27, 38, 0.80)".to_string())
    );

    // Assert argb variants
    assert!(
        tokens.contains_key("colors.accent_argb50"),
        "Missing argb50 variant"
    );
    let argb50 = tokens.get("colors.accent_argb50").unwrap();
    assert!(
        argb50.starts_with('#') && argb50.len() == 9,
        "ARGB variant must be 9 characters (#AARRGGBB), got '{argb50}'"
    );
}

#[test]
fn test_json_escaping_in_render_template() {
    let mut tokens = HashMap::new();
    tokens.insert(
        "test.path".to_string(),
        r"C:\Users\User\AppData\komoyasb\test".to_string(),
    );
    tokens.insert("test.quote".to_string(), r#"He said "hello""#.to_string());

    let template = r#"{"path": "{{test.path}}", "quote": "{{test.quote}}"}"#;

    // is_json = true: backslashes and quotes escaped
    let rendered_json = render_template(template, &tokens, true);
    assert_eq!(
        rendered_json,
        r#"{"path": "C:\\Users\\User\\AppData\\komoyasb\\test", "quote": "He said \"hello\""}"#
    );

    // Parse as valid JSON
    let parsed: serde_json::Value = serde_json::from_str(&rendered_json)
        .expect("Rendered output must be valid JSON");
    assert_eq!(
        parsed["path"].as_str().unwrap(),
        r"C:\Users\User\AppData\komoyasb\test"
    );

    // is_json = false: no escaping
    let rendered_raw = render_template(template, &tokens, false);
    assert!(rendered_raw.contains(r"C:\Users\User\AppData\komoyasb\test"));
}

#[test]
fn test_flatten_tokens_preserves_nested_structure() {
    let json: serde_json::Value = serde_json::json!({
        "colors": {
            "primary": "#112233",
            "secondary": "#445566"
        },
        "border": {
            "enabled": true,
            "width": 2
        },
        "name": "Tokyo Night"
    });

    let tokens = flatten_tokens(&json, "");
    assert_eq!(tokens.get("colors.primary"), Some(&"#112233".to_string()));
    assert_eq!(tokens.get("colors.secondary"), Some(&"#445566".to_string()));
    assert_eq!(tokens.get("border.enabled"), Some(&"true".to_string()));
    assert_eq!(tokens.get("border.width"), Some(&"2".to_string()));
    assert_eq!(tokens.get("name"), Some(&"Tokyo Night".to_string()));
}
