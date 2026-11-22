//! Application library initialization and Tauri command dispatching.
//!
//! Provides the primary runtime configuration for Komoyasb Control Center,
//! registering state singletons and mounting Tauri IPC command handlers.

pub mod error;
pub mod state;
pub mod utils;
pub mod commands;

pub use error::AppError;
pub use state::AppState;

/// Initializes and runs the Tauri desktop application.
///
/// Sets up the primary application state container with asset directory discovery,
/// binds all backend IPC command handlers, and hands control to the Tauri event loop.
///
/// # Panics
///
/// Panics if Tauri builder initialization or the application context fails to launch.
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_state = AppState::new_with_app_handle(Some(app.handle()));
            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Theme commands
            commands::theme::get_themes,
            commands::theme::load_theme,
            commands::theme::save_theme,
            commands::theme::get_active_theme_name,
            commands::theme::set_active_theme,

            // Tiling commands
            commands::tiling::load_komorebi_config,
            commands::tiling::save_komorebi_config,
            commands::tiling::load_float_rules,
            commands::tiling::save_float_rules,
            commands::tiling::load_hotkeys,
            commands::tiling::save_hotkeys,
            commands::tiling::validate_hotkeys,

            // Statusbar commands
            commands::statusbar::load_yasb_config,
            commands::statusbar::save_yasb_config,
            commands::statusbar::load_yasb_css,
            commands::statusbar::save_yasb_css,
            commands::statusbar::load_fluentflyout_config,
            commands::statusbar::save_fluentflyout_config,
            commands::statusbar::get_eartrumpet_config,
            commands::statusbar::set_eartrumpet_config,

            // Mods commands
            commands::mods::load_flow_settings,
            commands::mods::save_flow_settings,
            commands::mods::get_windhawk_mods,
            commands::mods::set_windhawk_mod_state,

            // Performance commands
            commands::performance::get_performance_config,
            commands::performance::set_performance_profile,
            commands::performance::save_performance_config,

            // System commands
            commands::system::check_deployment_status,
            commands::system::run_install_provisioning,
            commands::system::execute_full_dryrun,
            commands::system::get_services_status,
            commands::system::service_action,
            commands::system::apply_sync_theme,
            commands::system::get_backups,
            commands::system::restore_backup,
            commands::system::get_sandbox_state,
            commands::system::get_privilege_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_public_reexports() {
        let err = AppError::validation("test validation error");
        assert!(matches!(err, AppError::ValidationFailed { .. }));

        let state = AppState::new();
        assert!(!state.repo_root.as_os_str().is_empty());
    }
}
