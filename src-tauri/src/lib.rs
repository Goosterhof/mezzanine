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
// Phase 2A wires Mission Control file reads + Compose Dispatch write.
//
// Phase 2B wires the Chronicle:
//   * `chronicle/writer.rs` — append-only JSONL with daily rotation
//   * `chronicle/reader.rs` — last-N-days replay for the History pane
//   * `commands/chronicle.rs` — read_chronicle_history + disclosure ack
//
// Phase 3A wires the Drydock:
//   * `drydock/repo_registry.rs` — canonical list of 12 lab repos
//   * `drydock/bridge.rs`        — non-pty subprocess via WSL2 bridge
//   * `drydock/minion_touch.rs`  — parse git log for minion-stamped commits
//   * `drydock/chaos_detonations.rs` — scan chaos-reports for filename hits
//   * `drydock/active_log.rs`    — find IN PROGRESS/PLANNING log by scope
//   * `commands/github.rs`       — `gh` enumeration + review actions
//   * `commands/artifacts.rs`    — the three enrichment readers
//
// Phase 4A's first-run wizard will replace the env-var fallback for
// lab_root + distro with prompted config; for now the laboratory's
// canonical path is the seed.

mod chronicle;
mod commands;
mod drydock;
mod error;
mod lab;
mod pty;
mod state;

use std::path::PathBuf;
use tauri::Manager;
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
        .setup(|app| {
            let chronicle_base = chronicle_base_dir(app);
            let app_state = state::AppState::new(chronicle_base);
            *app_state.lab_root.write() = Some(detect_lab_root());
            *app_state.distro.write() = detect_distro();
            // If the investor has previously acknowledged the privacy
            // disclosure, unpause the chronicle immediately so the first
            // session starts recording. Until then, the writer is paused
            // and `begin_session` is a no-op.
            if commands::chronicle::disclosure_status_value(&app_state.chronicle).is_some() {
                app_state.chronicle.set_paused(false);
            }
            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pty::list_sessions,
            commands::pty::session_state,
            commands::pty::spawn_session,
            commands::pty::write_to_session,
            commands::pty::kill_session,
            commands::pty::resize_session,
            commands::files::read_vital_signs,
            commands::files::read_war_room_dispatch,
            commands::files::read_inheritance_signals,
            commands::files::read_wounds_at_threshold,
            commands::files::write_war_room_dispatch,
            commands::chronicle::read_chronicle_history,
            commands::chronicle::read_chronicle_disclosure,
            commands::chronicle::write_chronicle_disclosure_ack,
            commands::github::gh_auth_status,
            commands::github::list_open_prs,
            commands::github::pull_request_files,
            commands::github::approve_pr,
            commands::github::comment_pr,
            commands::github::request_changes_pr,
            commands::artifacts::find_minion_touch,
            commands::artifacts::find_chaos_detonations,
            commands::artifacts::find_active_experiment_log,
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

/// `~/.zmuuzn-cockpit/transcripts/` (Linux) or
/// `%USERPROFILE%\.zmuuzn-cockpit\transcripts\` (Windows). Resolved via
/// Tauri's `path()` resolver so the value is correct on every platform.
/// `WORKBENCH_CHRONICLE_BASE` overrides for tests that don't want to
/// pollute the user's home directory.
fn chronicle_base_dir<R: tauri::Runtime, M: Manager<R>>(app: &M) -> PathBuf {
    if let Ok(env_path) = std::env::var("WORKBENCH_CHRONICLE_BASE") {
        return PathBuf::from(env_path);
    }
    match app.path().home_dir() {
        Ok(home) => home.join(".zmuuzn-cockpit").join("transcripts"),
        Err(err) => {
            log::warn!(
                "Workbench: home_dir resolution failed ({err}) — chronicle disabled \
                 until WORKBENCH_CHRONICLE_BASE is set",
            );
            PathBuf::from(".")
        }
    }
}
