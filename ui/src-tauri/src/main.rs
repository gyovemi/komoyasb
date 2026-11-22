//! Application entry point for Komoyasb Control Center.
//!
//! Configures the Windows subsystem attribute to suppress the console window
//! during release builds and launches the Tauri runtime.

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Main entry point for the desktop control center application.
fn main() {
    komoyasb_control_center_lib::run();
}
