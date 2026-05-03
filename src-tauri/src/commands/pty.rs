// Pty Tauri commands — the Workbench's status surface.
//
// Phase 1A: read-only state queries. The frontend can render the rail and
// pulse dots against a real backend, even though no pty is live yet.
// Phase 1C adds spawn / write / kill commands.

use crate::error::WorkbenchResult;
use crate::pty::session::{ExperimentId, SessionState};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn list_sessions(
    state: State<'_, AppState>,
) -> WorkbenchResult<Vec<(ExperimentId, SessionState)>> {
    Ok(state.pty_manager.read().snapshot())
}

#[tauri::command]
pub fn session_state(
    state: State<'_, AppState>,
    experiment: ExperimentId,
) -> WorkbenchResult<SessionState> {
    Ok(state.pty_manager.read().state(experiment))
}
