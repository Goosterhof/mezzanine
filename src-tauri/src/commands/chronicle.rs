// Chronicle Tauri commands — the privacy-disclosure ack flow.
//
// In the bench era a third command (`read_chronicle_history`) read the
// per-experiment-per-day transcript layout for the History pane. The
// Mezzanine's chronicle is per-scientist, the History pane is retired,
// and the bench-era reader was deleted with the frontend cutover.
// What remains is the disclosure ack contract: read whether the
// investor has acknowledged the chronicle privacy notice, and write the
// ack (which unpauses the writer so the next dispatched scientist's
// transcript lands on disk).

use crate::chronicle::ChronicleWriter;
use crate::error::{MezzanineError, MezzanineResult};
use crate::state::AppState;
use std::path::Path;
use tauri::State;

const DISCLOSURE_FILENAME: &str = ".disclosure-acked";

#[tauri::command]
pub fn read_chronicle_disclosure(state: State<'_, AppState>) -> MezzanineResult<Option<String>> {
    Ok(disclosure_status_value(&state.chronicle))
}

#[tauri::command]
pub fn write_chronicle_disclosure_ack(state: State<'_, AppState>) -> MezzanineResult<String> {
    let stamp = chrono::Utc::now().to_rfc3339();
    let base = state.chronicle.base_dir();
    std::fs::create_dir_all(base).map_err(MezzanineError::Io)?;
    std::fs::write(disclosure_path(base), &stamp).map_err(MezzanineError::Io)?;
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
