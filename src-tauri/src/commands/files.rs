// Mission Control file commands — Phase 2A's IPC surface.
//
// Four reads (vital signs, dispatch, signals, wounds) and one write
// (append a finding to the war-room dispatch). Every command resolves
// paths relative to `lab_root` which the wizard (Phase 4A) will
// configure; today it's seeded from env vars at startup.
//
// The reads return typed payloads parsed by the pure functions in
// `crate::lab`. The write splices a new `### N. Title` block into
// `documents/war-room-dispatch.md` and writes the file back atomically.

use crate::error::{WorkbenchError, WorkbenchResult};
use crate::lab::dispatch::{DispatchFinding, NewDispatchFinding};
use crate::lab::signals::MinionSignal;
use crate::lab::vital_signs::VitalSigns;
use crate::lab::wounds::WoundSummary;
use crate::lab::{dispatch, signals, vital_signs, wounds};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub fn read_vital_signs(state: State<'_, AppState>) -> WorkbenchResult<VitalSigns> {
    let path = lab_path(&state, "CLAUDE.md")?;
    let content = std::fs::read_to_string(&path).map_err(WorkbenchError::Io)?;
    Ok(vital_signs::parse(&content))
}

#[tauri::command]
pub fn read_war_room_dispatch(state: State<'_, AppState>) -> WorkbenchResult<Vec<DispatchFinding>> {
    let path = lab_path(&state, "documents/war-room-dispatch.md")?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path).map_err(WorkbenchError::Io)?;
    Ok(dispatch::parse(&content))
}

#[tauri::command]
pub fn read_inheritance_signals(state: State<'_, AppState>) -> WorkbenchResult<Vec<MinionSignal>> {
    let path = lab_path(&state, "documents/laboratory-pulse.md")?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path).map_err(WorkbenchError::Io)?;
    Ok(signals::parse(&content))
}

#[tauri::command]
pub fn read_wounds_at_threshold(state: State<'_, AppState>) -> WorkbenchResult<Vec<WoundSummary>> {
    let dir = lab_path(&state, ".claude/memory/wounds")?;
    wounds::list(&dir)
}

#[tauri::command]
pub fn write_war_room_dispatch(
    state: State<'_, AppState>,
    finding: NewDispatchFinding,
) -> WorkbenchResult<()> {
    let path = lab_path(&state, "documents/war-room-dispatch.md")?;
    let existing = if path.exists() {
        std::fs::read_to_string(&path).map_err(WorkbenchError::Io)?
    } else {
        "# War Room Dispatch\n".to_string()
    };
    let updated = dispatch::insert_finding(&existing, &finding);
    std::fs::write(&path, updated).map_err(WorkbenchError::Io)?;
    Ok(())
}

fn lab_path(state: &State<'_, AppState>, relative: &str) -> WorkbenchResult<PathBuf> {
    let guard = state.lab_root.read();
    let lab_root = guard.clone().ok_or(WorkbenchError::ConfigCorrupt)?;
    Ok(lab_root.join(relative))
}
