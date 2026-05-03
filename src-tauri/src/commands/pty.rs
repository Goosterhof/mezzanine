// Pty Tauri commands — the Workbench's IPC surface for live sessions.
//
// Phase 1A shipped read-only state queries (`list_sessions`,
// `session_state`). Phase 1C grows the surface to spawn / write / kill —
// the three verbs the frontend needs to direct a live pty through the
// command bar and the experiment rail.

use crate::error::{WorkbenchError, WorkbenchResult};
use crate::pty::session::{ExperimentId, SessionState};
use crate::state::AppState;
use tauri::{AppHandle, Runtime, State};

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

#[tauri::command]
pub fn spawn_session<R: Runtime>(
    state: State<'_, AppState>,
    app: AppHandle<R>,
    experiment: ExperimentId,
) -> WorkbenchResult<SessionState> {
    let lab_root = {
        let guard = state.lab_root.read();
        guard.clone().ok_or(WorkbenchError::ConfigCorrupt)?
    };
    let distro = state.distro.read().clone();
    state
        .pty_manager
        .write()
        .spawn_or_resume(experiment, &lab_root, distro, app)
}

#[tauri::command]
pub fn write_to_session(
    state: State<'_, AppState>,
    experiment: ExperimentId,
    input: String,
) -> WorkbenchResult<()> {
    state.pty_manager.read().write(experiment, input.as_bytes())
}

#[tauri::command]
pub fn kill_session(state: State<'_, AppState>, experiment: ExperimentId) -> WorkbenchResult<()> {
    state.pty_manager.write().kill(experiment)
}
