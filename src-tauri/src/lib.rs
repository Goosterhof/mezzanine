// The Workbench — library entry.
//
// Every experiment in this laboratory needs a different combination of CWD,
// shell incantation, and patience for `claude` to wake up. The Workbench
// keeps six of those incantations warm at once, pipes their pty output to a
// single Vue surface, and lets the investor switch between them with a
// click instead of a context-switch.
//
// Phase 1A scope: scaffolding only. Modules exist as stubs that compile;
// the live pty wiring lands in Phase 1C after the portable-pty + wsl.exe
// spike at the start of that phase.

mod chronicle;
mod commands;
mod error;
mod pty;
mod state;

use tauri_plugin_log::{Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::pty::list_sessions,
            commands::pty::session_state,
        ])
        .run(tauri::generate_context!())
        .expect("the Workbench refused to open");
}
