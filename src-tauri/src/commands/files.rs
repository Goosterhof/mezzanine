// Mission Control file commands — the IPC surface for the three lab reads.
//
// Three reads (vital signs, pending signals, wounds at threshold). Every
// command resolves paths relative to `lab_root` through
// `host_paths::resolve_for_std_fs` so Windows reads cross the WSL2 UNC
// bridge correctly.
//
// All commands are `async` with their sync I/O wrapped in
// `tokio::task::spawn_blocking` — UNC reads on Windows can stall on
// first access, and a sync command on the main thread would freeze the
// webview. The reads return typed payloads parsed by the pure functions
// in `crate::lab`.

use crate::error::{MezzanineError, MezzanineResult};
use crate::host_paths;
use crate::lab::signals::MinionSignal;
use crate::lab::vital_signs::VitalSigns;
use crate::lab::wounds::WoundSummary;
use crate::lab::{signals, vital_signs, wounds};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn read_vital_signs(state: State<'_, AppState>) -> MezzanineResult<VitalSigns> {
    let path = lab_path(&state, "CLAUDE.md")?;
    tokio::task::spawn_blocking(move || -> MezzanineResult<VitalSigns> {
        let content = std::fs::read_to_string(&path).map_err(MezzanineError::Io)?;
        Ok(vital_signs::parse(&content))
    })
    .await
    .map_err(|e| MezzanineError::LabFileRead(format!("vital signs join failed: {e}")))?
}

#[tauri::command]
pub async fn read_inheritance_signals(
    state: State<'_, AppState>,
) -> MezzanineResult<Vec<MinionSignal>> {
    let path = lab_path(&state, "documents/laboratory-pulse.md")?;
    tokio::task::spawn_blocking(move || -> MezzanineResult<Vec<MinionSignal>> {
        if !path.exists() {
            return Ok(Vec::new());
        }
        let content = std::fs::read_to_string(&path).map_err(MezzanineError::Io)?;
        Ok(signals::parse(&content))
    })
    .await
    .map_err(|e| MezzanineError::LabFileRead(format!("inheritance signals join failed: {e}")))?
}

#[tauri::command]
pub async fn read_wounds_at_threshold(
    state: State<'_, AppState>,
) -> MezzanineResult<Vec<WoundSummary>> {
    let dir = lab_path(&state, ".claude/memory/wounds")?;
    tokio::task::spawn_blocking(move || wounds::list(&dir))
        .await
        .map_err(|e| MezzanineError::LabFileRead(format!("wounds list join failed: {e}")))?
}

fn lab_path(state: &State<'_, AppState>, relative: &str) -> MezzanineResult<PathBuf> {
    let lab_root = state
        .lab_root
        .read()
        .clone()
        .ok_or(MezzanineError::ConfigCorrupt)?;
    let distro = state.distro.read().clone();
    Ok(host_paths::resolve_for_std_fs(
        &lab_root,
        distro.as_deref(),
        relative,
    ))
}
