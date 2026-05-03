// The Workbench — library entry.
//
// Every experiment in this laboratory needs a different combination of CWD,
// shell incantation, and patience for `claude` to wake up. The Workbench
// keeps six of those incantations warm at once, pipes their pty output to a
// single Vue surface, and lets the investor switch between them with a
// click instead of a context-switch.
//
// Phase 1C wires the live pty layer:
//   * `pty/substrate.rs` — cross-platform `bash` (Unix) / `wsl.exe` bridge
//   * `pty/live.rs`       — one live session: master, writer, reader thread
//   * `pty/manager.rs`    — registry + recency, spawn/write/kill
//   * `commands/pty.rs`   — Tauri commands the frontend invokes
//
// Phase 4A's first-run wizard will replace the env-var fallback for
// lab_root + distro with prompted config; for now the laboratory's
// canonical path is the seed.

mod chronicle;
mod commands;
mod error;
mod pty;
mod state;

use std::path::PathBuf;
use tauri_plugin_log::{Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = state::AppState::default();
    *app_state.lab_root.write() = Some(detect_lab_root());
    *app_state.distro.write() = detect_distro();

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
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::pty::list_sessions,
            commands::pty::session_state,
            commands::pty::spawn_session,
            commands::pty::write_to_session,
            commands::pty::kill_session,
        ])
        .run(tauri::generate_context!())
        .expect("the Workbench refused to open");
}

/// The WSL2-side absolute path to the laboratory root.
///
/// `WORKBENCH_LAB_ROOT` overrides; the default is the investor's canonical
/// laboratory location. The first-run wizard (Phase 4A) will replace this
/// with prompted config.
fn detect_lab_root() -> PathBuf {
    if let Ok(env_root) = std::env::var("WORKBENCH_LAB_ROOT") {
        return PathBuf::from(env_root);
    }
    PathBuf::from("/home/goosterhof/code/zmuuzn")
}

/// The WSL2 distro name to bridge into via `wsl.exe -d <distro>`.
///
/// `WORKBENCH_WSL_DISTRO` overrides. On Unix this is ignored by the
/// substrate; on Windows the default is `Ubuntu` (the laboratory's
/// canonical distro). The first-run wizard will enumerate distros via
/// `wsl.exe --list --quiet` and let the investor pick.
fn detect_distro() -> Option<String> {
    if let Ok(env_distro) = std::env::var("WORKBENCH_WSL_DISTRO") {
        return Some(env_distro);
    }
    if cfg!(windows) {
        Some("Ubuntu".to_string())
    } else {
        None
    }
}
