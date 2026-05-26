// The Mezzanine — library entry.
//
// Phase 2A reframed the gadget's metaphor from "six benches" to "one
// balcony overlooking the lab floor." The frontend cutover landed: the
// bench-era pty layer is gone, the Mezzanine's dispatched-scientist
// lifecycle is the only session model. Chronicle transcripts live under
// `~/.zmuuzn-mezzanine/transcripts/` (a one-time migration copies the
// bench-era `.zmuuzn-cockpit/` transcripts on first boot — see
// `chronicle::migration`).
//
// Modules:
//   * `pty::substrate` — substrate command builder (wsl.exe on Windows, bash on Unix)
//   * `roster::*`      — dispatched-scientist lifecycle (LiveScientistSession + RosterManager)
//   * `chronicle::*`   — privacy ack flow + bench-era → Mezzanine migration
//   * `lab::*`         — Mission Control file parsers
//   * `drydock::*`     — PR review enrichment
//   * `commands::*`    — Tauri IPC surface
//
// Phase 4A's first-run wizard will replace the env-var fallback for
// lab_root + distro with prompted config; for now the laboratory's
// canonical path is the seed.

mod balcony;
mod chronicle;
mod commands;
mod drydock;
mod error;
mod grind;
mod holotable;
mod host_paths;
mod lab;
mod pty;
mod roster;
mod state;
mod wizard;

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
            // Resolve the Mezzanine's data home (sibling layout under
            // `~/.zmuuzn-mezzanine/`): transcripts go under the
            // `transcripts/` subdir, the roster snapshot sits at the root.
            let mezzanine_home = mezzanine_data_dir(app);
            let chronicle_base = mezzanine_home.join("transcripts");

            // One-time chronicle migration from the bench-era directory.
            // Failure is logged and downgraded — the Mezzanine must open
            // even if the migration cannot run (the bench-era directory
            // is still on disk and accessible).
            if let Some(cockpit) = bench_era_chronicle_dir(app) {
                if let Err(err) = chronicle::migration::migrate_once_from_cockpit(
                    &cockpit,
                    &mezzanine_home,
                ) {
                    log::warn!(
                        "Mezzanine: chronicle migration failed ({err}) — bench-era transcripts \
                         are still at {} and can be migrated manually",
                        cockpit.display(),
                    );
                }
            }

            let app_state = state::AppState::new(chronicle_base, mezzanine_home.clone());
            // Wizard state first — its persisted choices override the
            // env-var / hardcoded defaults. If the wizard never ran, the
            // defaults survive and the wizard renders on first paint.
            let persisted_wizard = wizard::read(&mezzanine_home);
            *app_state.lab_root.write() = Some(
                persisted_wizard
                    .resolved_lab_root()
                    .unwrap_or_else(detect_lab_root),
            );
            *app_state.claude_binary.write() = persisted_wizard.resolved_claude_binary();
            *app_state.distro.write() = detect_distro();
            // If the investor has previously acknowledged the privacy
            // disclosure, unpause the chronicle immediately so the first
            // session starts recording. Until then, the writer is paused
            // and `begin_session` is a no-op.
            if commands::chronicle::disclosure_status_value(&app_state.chronicle).is_some() {
                app_state.chronicle.set_paused(false);
            }
            // Arc 3 of the absorption (#00053). The Grind's economy
            // subscribes to the chronicle broadcast for chronicle-line
            // grants. The subscriber task runs for the gadget's lifetime
            // and exits when the reader's broadcast Sender drops at
            // shutdown.
            let economy_arc = app_state.economy.clone();
            let chronicle_subscriber = app_state.chronicle_reader.subscribe();
            crate::grind::economy::spawn_chronicle_subscriber(
                economy_arc,
                chronicle_subscriber,
                app.handle().clone(),
            );

            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // The Mezzanine's roster surface — dispatch / recall / list /
            // write / resize / transition for dispatched scientists.
            commands::roster::dispatch_scientist,
            commands::roster::recall_scientist,
            commands::roster::list_roster,
            commands::roster::list_recently_recalled,
            commands::roster::write_to_scientist,
            commands::roster::resize_scientist,
            commands::roster::transition_scientist,
            // Mission Control file commands.
            commands::files::read_vital_signs,
            commands::files::read_inheritance_signals,
            commands::files::read_wounds_at_threshold,
            // Balcony — Phase 2B's rail surfaces.
            commands::balcony::read_balcony_signs,
            commands::balcony::list_briefing_templates,
            // Holotable — Arc 1 of the absorption trilogy (experiment log
            // #00051). The floor reads on open and on manual refresh.
            commands::holotable::read_holotable_state,
            // Observer — Arc 2 of the absorption trilogy (experiment log
            // #00052). The chronicle tail starts on dispatch and stops on
            // recall; the Vue side subscribes to "chronicle-event".
            commands::observer::start_watching_scientist,
            commands::observer::stop_watching_scientist,
            // Chronicle privacy disclosure ack flow.
            commands::chronicle::read_chronicle_disclosure,
            commands::chronicle::write_chronicle_disclosure_ack,
            // First-run wizard — three step answers persist atomically.
            commands::wizard::read_wizard_state,
            commands::wizard::read_wizard_detected,
            commands::wizard::complete_wizard,
            // Drydock commands.
            commands::github::gh_auth_status,
            commands::github::list_open_prs,
            commands::github::pull_request_files,
            commands::github::approve_pr,
            commands::github::comment_pr,
            commands::github::request_changes_pr,
            commands::artifacts::find_minion_touch,
            commands::artifacts::find_chaos_detonations,
            commands::artifacts::find_active_experiment_log,
            // The Grind — Arc 3 of the absorption (#00053). Game-state
            // load/save round-trip; the economy's grind-rp-grant events
            // arrive on the Tauri bridge without a command.
            commands::grind::load_grind_state,
            commands::grind::save_grind_state,
        ])
        .run(tauri::generate_context!())
        .expect("the Mezzanine refused to open")
}

/// The WSL2-side absolute path to the laboratory root.
///
/// `MEZZANINE_LAB_ROOT` overrides; the default is the investor's canonical
/// laboratory location. The first-run wizard (Phase 4A) will replace this
/// with prompted config.
fn detect_lab_root() -> PathBuf {
    if let Ok(env_root) = std::env::var("MEZZANINE_LAB_ROOT") {
        return PathBuf::from(env_root);
    }
    PathBuf::from("/home/goosterhof/code/zmuuzn")
}

/// The WSL2 distro name to bridge into via `wsl.exe -d <distro>`.
///
/// `MEZZANINE_WSL_DISTRO` overrides. On Unix this is ignored by the
/// substrate; on Windows the default is `Ubuntu` (the laboratory's
/// canonical distro). The first-run wizard will enumerate distros via
/// `wsl.exe --list --quiet` and let the investor pick.
fn detect_distro() -> Option<String> {
    if let Ok(env_distro) = std::env::var("MEZZANINE_WSL_DISTRO") {
        return Some(env_distro);
    }
    if cfg!(windows) {
        Some("Ubuntu".to_string())
    } else {
        None
    }
}

/// The Mezzanine's data home — `<home>/.zmuuzn-mezzanine/` on Linux,
/// `%USERPROFILE%\.zmuuzn-mezzanine\` on Windows.
/// `MEZZANINE_DATA_BASE` overrides for tests that don't want to pollute
/// the user's home directory.
fn mezzanine_data_dir<R: tauri::Runtime, M: Manager<R>>(app: &M) -> PathBuf {
    if let Ok(env_path) = std::env::var("MEZZANINE_DATA_BASE") {
        return PathBuf::from(env_path);
    }
    match app.path().home_dir() {
        Ok(home) => home.join(".zmuuzn-mezzanine"),
        Err(err) => {
            log::warn!(
                "Mezzanine: home_dir resolution failed ({err}) — falling back to current directory",
            );
            PathBuf::from(".")
        }
    }
}

/// The bench-era chronicle directory — `<home>/.zmuuzn-cockpit/` if the
/// path can be resolved. Returns `None` if the home directory cannot be
/// resolved (the migration is then a no-op).
fn bench_era_chronicle_dir<R: tauri::Runtime, M: Manager<R>>(app: &M) -> Option<PathBuf> {
    app.path().home_dir().ok().map(|home| home.join(".zmuuzn-cockpit"))
}
