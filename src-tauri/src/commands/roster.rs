// Roster Tauri commands — the Mezzanine's IPC surface.
//
// Phase 2A backend swap. The five verbs the Mezzanine frontend will
// consume (when it lands in the follow-up session): dispatch a scientist
// into a target with a mission, recall a scientist by id, list the
// active roster, list the recently-recalled strip, write input to a
// scientist's pty. Resize is also exposed for the xterm.js integration.
//
// Phase O-1 of the Observer (#00052): `recall_scientist` also stops the
// per-scientist chronicle tail. The frontend stops the tail explicitly
// in its recall flow as well — the double call is idempotent by design.
// This belt-and-suspenders stop catches the case where the frontend's
// stop signal is dropped (panel closed in race, IPC reorder).

use crate::error::{MezzanineError, MezzanineResult};
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
) -> MezzanineResult<Scientist> {
    let lab_root = {
        let guard = state.lab_root.read();
        guard.clone().ok_or(MezzanineError::ConfigCorrupt)?
    };
    let distro = state.distro.read().clone();
    let binary = state.claude_binary.read().clone();
    let chronicle_base = state.chronicle_base.clone();
    state.roster_manager.write().dispatch(
        target,
        mission,
        &lab_root,
        distro,
        binary,
        chronicle_base,
        app,
    )
}

#[tauri::command]
pub fn recall_scientist(state: State<'_, AppState>, id: ScientistId) -> MezzanineResult<()> {
    // Belt-and-suspenders: stop the chronicle tail before the manager
    // tears down the live pty. The frontend's recall flow also calls
    // `stop_watching_scientist` directly — both paths are idempotent.
    state.chronicle_reader.stop_watching(id);
    state.roster_manager.write().recall(id)
}

#[tauri::command]
pub fn list_roster(state: State<'_, AppState>) -> MezzanineResult<Vec<Scientist>> {
    Ok(state.roster_manager.read().list())
}

#[tauri::command]
pub fn list_recently_recalled(
    state: State<'_, AppState>,
) -> MezzanineResult<Vec<RecalledScientist>> {
    Ok(state.roster_manager.write().recently_recalled(Utc::now()))
}

#[tauri::command]
pub fn write_to_scientist(
    state: State<'_, AppState>,
    id: ScientistId,
    input: String,
) -> MezzanineResult<()> {
    state.roster_manager.read().write(id, input.as_bytes())
}

#[tauri::command]
pub fn resize_scientist(
    state: State<'_, AppState>,
    id: ScientistId,
    cols: u16,
    rows: u16,
) -> MezzanineResult<()> {
    match state.roster_manager.read().resize(id, cols, rows) {
        Ok(()) => Ok(()),
        // The canvas may emit a resize for a scientist that has just been
        // recalled. Swallow — the row is gone from the active Roster and
        // the resize cannot affect anything.
        Err(MezzanineError::SessionNotFound(_)) => Ok(()),
        Err(other) => Err(other),
    }
}

#[tauri::command]
pub fn transition_scientist(
    state: State<'_, AppState>,
    id: ScientistId,
    next: MissionState,
) -> MezzanineResult<()> {
    state.roster_manager.write().transition(id, next);
    Ok(())
}
