// Roster Tauri commands — the Mezzanine's IPC surface.
//
// Phase 2A backend swap. The five verbs the Mezzanine frontend will
// consume (when it lands in the follow-up session): dispatch a scientist
// into a target with a mission, recall a scientist by id, list the
// active roster, list the recently-recalled strip, write input to a
// scientist's pty. Resize is also exposed for the xterm.js integration.

use crate::error::{WorkbenchError, WorkbenchResult};
use crate::roster::recall_strip::RecalledScientist;
use crate::roster::scientist::{MissionState, Scientist, ScientistId};
use crate::roster::target::Target;
use crate::state::AppState;
use chrono::Utc;
use tauri::{AppHandle, Runtime, State};

#[tauri::command]
pub fn dispatch_scientist<R: Runtime>(
    state: State<'_, AppState>,
    app: AppHandle<R>,
    target: Target,
    mission: String,
) -> WorkbenchResult<Scientist> {
    let lab_root = {
        let guard = state.lab_root.read();
        guard.clone().ok_or(WorkbenchError::ConfigCorrupt)?
    };
    let distro = state.distro.read().clone();
    let chronicle_base = state.chronicle_base.clone();
    state.roster_manager.write().dispatch(
        target,
        mission,
        &lab_root,
        distro,
        chronicle_base,
        app,
    )
}

#[tauri::command]
pub fn recall_scientist(state: State<'_, AppState>, id: ScientistId) -> WorkbenchResult<()> {
    state.roster_manager.write().recall(id)
}

#[tauri::command]
pub fn list_roster(state: State<'_, AppState>) -> WorkbenchResult<Vec<Scientist>> {
    Ok(state.roster_manager.read().list())
}

#[tauri::command]
pub fn list_recently_recalled(
    state: State<'_, AppState>,
) -> WorkbenchResult<Vec<RecalledScientist>> {
    Ok(state.roster_manager.write().recently_recalled(Utc::now()))
}

#[tauri::command]
pub fn write_to_scientist(
    state: State<'_, AppState>,
    id: ScientistId,
    input: String,
) -> WorkbenchResult<()> {
    state.roster_manager.read().write(id, input.as_bytes())
}

#[tauri::command]
pub fn resize_scientist(
    state: State<'_, AppState>,
    id: ScientistId,
    cols: u16,
    rows: u16,
) -> WorkbenchResult<()> {
    match state.roster_manager.read().resize(id, cols, rows) {
        Ok(()) => Ok(()),
        // The canvas may emit a resize for a scientist that has just been
        // recalled. Swallow — the row is gone from the active Roster and
        // the resize cannot affect anything.
        Err(WorkbenchError::SessionNotFound(_)) => Ok(()),
        Err(other) => Err(other),
    }
}

#[tauri::command]
pub fn transition_scientist(
    state: State<'_, AppState>,
    id: ScientistId,
    next: MissionState,
) -> WorkbenchResult<()> {
    state.roster_manager.write().transition(id, next);
    Ok(())
}
