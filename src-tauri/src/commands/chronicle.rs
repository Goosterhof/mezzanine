// Chronicle Tauri commands — Phase 2B's IPC surface for the History
// pane and the privacy disclosure flow.
//
// Three commands:
//   * `read_chronicle_history(experiment, days)` — reads the last N days
//     of the experiment's chronicle files and returns the parsed turns.
//   * `read_chronicle_disclosure` — returns the ISO date the investor
//     first acknowledged the chronicle privacy notice, or null.
//   * `write_chronicle_disclosure_ack` — records today's date as the
//     ack and unpauses the chronicle writer so the next pty turn lands
//     on disk.

use crate::chronicle::reader::{history, DEFAULT_HISTORY_DAYS};
use crate::chronicle::writer::ChronicleTurn;
use crate::chronicle::ChronicleWriter;
use crate::error::{WorkbenchError, WorkbenchResult};
use crate::pty::session::ExperimentId;
use crate::state::AppState;
use std::path::Path;
use tauri::State;

const DISCLOSURE_FILENAME: &str = ".disclosure-acked";

#[tauri::command]
pub fn read_chronicle_history(
    state: State<'_, AppState>,
    experiment: ExperimentId,
    days: Option<i64>,
) -> WorkbenchResult<Vec<ChronicleTurn>> {
    let days_back = days.unwrap_or(DEFAULT_HISTORY_DAYS).max(0);
    history(state.chronicle.base_dir(), experiment, days_back)
}

#[tauri::command]
pub fn read_chronicle_disclosure(state: State<'_, AppState>) -> WorkbenchResult<Option<String>> {
    Ok(disclosure_status_value(&state.chronicle))
}

#[tauri::command]
pub fn write_chronicle_disclosure_ack(state: State<'_, AppState>) -> WorkbenchResult<String> {
    let stamp = chrono::Utc::now().to_rfc3339();
    let base = state.chronicle.base_dir();
    std::fs::create_dir_all(base).map_err(WorkbenchError::Io)?;
    std::fs::write(disclosure_path(base), &stamp).map_err(WorkbenchError::Io)?;
    state.chronicle.set_paused(false);
    Ok(stamp)
}

/// Read the disclosure ack file beside the chronicle base directory.
/// Returns `None` if the file is missing or unreadable — the frontend
/// then renders the one-time disclosure modal.
pub(crate) fn disclosure_status_value(chronicle: &ChronicleWriter) -> Option<String> {
    let path = disclosure_path(chronicle.base_dir());
    std::fs::read_to_string(path).ok().and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn disclosure_path(base: &Path) -> std::path::PathBuf {
    base.join(DISCLOSURE_FILENAME)
}
