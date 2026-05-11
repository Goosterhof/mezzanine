// Artifact-enrichment commands — the Drydock's three lab-context fields.
//
// Each command shells through the WSL2 bridge (`drydock::bridge`) to read
// from the laboratory's disk, then hands the captured output to a pure
// parser. The frontend invokes one of these per file in a PR diff (with
// reasonable concurrency on the Vue side); the bridge is fast enough
// (sub-100ms per call on WSL2) that running 30–50 of them on panel open
// is fine.

use crate::drydock::{
    active_log::{self, ActiveExperimentLog, LogHeader},
    bridge,
    chaos_detonations::{self, ChaosDetonation},
    minion_touch::{self, MinionTouch},
};
use crate::error::{WorkbenchError, WorkbenchResult};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub fn find_minion_touch(
    state: State<'_, AppState>,
    repo_local_path: String,
    file_path: String,
) -> WorkbenchResult<Option<MinionTouch>> {
    let (lab_root, distro) = read_lab_state(&state)?;
    let working_dir = lab_root.join(&repo_local_path);
    let stdout = bridge::run_in_lab(
        &working_dir,
        "git",
        &[
            "log",
            "-z",
            "--follow",
            "--format=%H|%an|%aI|%s",
            "--max-count=200",
            "--",
            &file_path,
        ],
        distro.as_deref(),
    )?;
    Ok(minion_touch::parse(&stdout))
}

#[tauri::command]
pub fn find_chaos_detonations(
    state: State<'_, AppState>,
    file_path: String,
) -> WorkbenchResult<Vec<ChaosDetonation>> {
    let (lab_root, _distro) = read_lab_state(&state)?;
    let chaos_dir = lab_root.join("documents/chaos-reports");
    if !chaos_dir.exists() {
        return Ok(Vec::new());
    }
    let reports = read_dir_markdown(&chaos_dir)?;
    Ok(chaos_detonations::detonations_for(&reports, &file_path))
}

#[tauri::command]
pub fn find_active_experiment_log(
    state: State<'_, AppState>,
    scope: String,
) -> WorkbenchResult<Option<ActiveExperimentLog>> {
    let (lab_root, _distro) = read_lab_state(&state)?;
    let logs_dir = lab_root.join("documents/experiment-logs");
    if !logs_dir.exists() {
        return Ok(None);
    }
    let logs = read_log_headers(&logs_dir)?;
    Ok(active_log::find_active_for_scope(&logs, &scope))
}

fn read_lab_state(state: &State<'_, AppState>) -> WorkbenchResult<(PathBuf, Option<String>)> {
    let lab_root = {
        let guard = state.lab_root.read();
        guard.clone().ok_or(WorkbenchError::ConfigCorrupt)?
    };
    let distro = state.distro.read().clone();
    Ok((lab_root, distro))
}

fn read_dir_markdown(dir: &std::path::Path) -> WorkbenchResult<Vec<(String, String)>> {
    let entries = std::fs::read_dir(dir).map_err(WorkbenchError::Io)?;
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(WorkbenchError::Io)?;
        let path = entry.path();
        let Some(filename) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !filename.ends_with(".md") {
            continue;
        }
        let content = std::fs::read_to_string(&path).map_err(WorkbenchError::Io)?;
        out.push((filename.to_string(), content));
    }
    Ok(out)
}

fn read_log_headers(dir: &std::path::Path) -> WorkbenchResult<Vec<LogHeader>> {
    let raw = read_dir_markdown(dir)?;
    Ok(raw
        .into_iter()
        .filter_map(|(name, content)| active_log::parse_header(&name, &content))
        .collect())
}
