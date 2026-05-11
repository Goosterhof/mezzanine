// Pty Tauri commands — the Workbench's IPC surface for live sessions.
//
// Phase 1A shipped read-only state queries (`list_sessions`,
// `session_state`). Phase 1C grows the surface to spawn / write / kill —
// the three verbs the frontend needs to direct a live pty through the
// command bar and the experiment rail.

use crate::error::{MezzanineError, MezzanineResult};
use crate::pty::session::{ExperimentId, SessionState};
use crate::state::AppState;
use tauri::{AppHandle, Runtime, State};

#[tauri::command]
pub fn list_sessions(
    state: State<'_, AppState>,
) -> MezzanineResult<Vec<(ExperimentId, SessionState)>> {
    Ok(state.pty_manager.read().snapshot())
}

#[tauri::command]
pub fn session_state(
    state: State<'_, AppState>,
    experiment: ExperimentId,
) -> MezzanineResult<SessionState> {
    Ok(state.pty_manager.read().state(experiment))
}

#[tauri::command]
pub fn spawn_session<R: Runtime>(
    state: State<'_, AppState>,
    app: AppHandle<R>,
    experiment: ExperimentId,
) -> MezzanineResult<SessionState> {
    let lab_root = {
        let guard = state.lab_root.read();
        guard.clone().ok_or(MezzanineError::ConfigCorrupt)?
    };
    let distro = state.distro.read().clone();
    let chronicle = state.chronicle.clone();
    state
        .pty_manager
        .write()
        .spawn_or_resume(experiment, &lab_root, distro, chronicle, app)
}

#[tauri::command]
pub fn write_to_session(
    state: State<'_, AppState>,
    experiment: ExperimentId,
    input: String,
) -> MezzanineResult<()> {
    state.pty_manager.read().write(experiment, input.as_bytes())
}

#[tauri::command]
pub fn kill_session(state: State<'_, AppState>, experiment: ExperimentId) -> MezzanineResult<()> {
    state.pty_manager.write().kill(experiment)
}

#[tauri::command]
pub fn resize_session(
    state: State<'_, AppState>,
    experiment: ExperimentId,
    cols: u16,
    rows: u16,
) -> MezzanineResult<()> {
    match state.pty_manager.read().resize(experiment, cols, rows) {
        Ok(()) => Ok(()),
        // The canvas may emit a resize for an experiment whose session
        // was just evicted. Swallow it — the next spawn will pick up
        // the right size from DEFAULT_PTY_SIZE and the next resize.
        Err(MezzanineError::SessionNotFound(_)) => Ok(()),
        Err(other) => Err(other),
    }
}
