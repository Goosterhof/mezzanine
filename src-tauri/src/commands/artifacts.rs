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
use crate::error::{MezzanineError, MezzanineResult};
use crate::host_paths;
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn find_minion_touch(
    state: State<'_, AppState>,
    repo_local_path: String,
    file_path: String,
) -> MezzanineResult<Option<MinionTouch>> {
    let (lab_root, distro) = read_lab_state(&state)?;
    // The bridge invokes `wsl.exe -- bash -lc "cd <dir> && exec git ..."`,
    // so the working dir must be a POSIX-form string the bash inside WSL2
    // can `cd` to. Path::join would inject backslashes on Windows that
    // would survive into the single-quoted shell argument.
    let working_dir = PathBuf::from(host_paths::to_posix_lab_path(&lab_root, &repo_local_path));
    let stdout = tokio::task::spawn_blocking(move || {
        bridge::run_in_lab(
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
        )
    })
    .await
    .map_err(|e| MezzanineError::WslBridge(format!("git log join failed: {e}")))??;
    Ok(minion_touch::parse(&stdout))
}

#[tauri::command]
pub async fn find_chaos_detonations(
    state: State<'_, AppState>,
    file_path: String,
) -> MezzanineResult<Vec<ChaosDetonation>> {
    let (lab_root, distro) = read_lab_state(&state)?;
    let chaos_dir =
        host_paths::resolve_for_std_fs(&lab_root, distro.as_deref(), "documents/chaos-reports");
    // Directory listing + UNC reads are sync; pushing them to the
    // blocking pool keeps the UI thread free.
    let reports = tokio::task::spawn_blocking(move || -> MezzanineResult<Vec<(String, String)>> {
        if !chaos_dir.exists() {
            return Ok(Vec::new());
        }
        read_dir_markdown(&chaos_dir)
    })
    .await
    .map_err(|e| MezzanineError::WslBridge(format!("chaos read join failed: {e}")))??;
    Ok(chaos_detonations::detonations_for(&reports, &file_path))
}

#[tauri::command]
pub async fn find_active_experiment_log(
    state: State<'_, AppState>,
    scope: String,
) -> MezzanineResult<Option<ActiveExperimentLog>> {
    let (lab_root, distro) = read_lab_state(&state)?;
    let logs_dir =
        host_paths::resolve_for_std_fs(&lab_root, distro.as_deref(), "documents/experiment-logs");
    let logs = tokio::task::spawn_blocking(move || -> MezzanineResult<Vec<LogHeader>> {
        if !logs_dir.exists() {
            return Ok(Vec::new());
        }
        read_log_headers(&logs_dir)
    })
    .await
    .map_err(|e| MezzanineError::WslBridge(format!("experiment log read join failed: {e}")))??;
    Ok(active_log::find_active_for_scope(&logs, &scope))
}

fn read_lab_state(state: &State<'_, AppState>) -> MezzanineResult<(PathBuf, Option<String>)> {
    let lab_root = {
        let guard = state.lab_root.read();
        guard.clone().ok_or(MezzanineError::ConfigCorrupt)?
    };
    let distro = state.distro.read().clone();
    Ok((lab_root, distro))
}

fn read_dir_markdown(dir: &std::path::Path) -> MezzanineResult<Vec<(String, String)>> {
    let entries = std::fs::read_dir(dir).map_err(MezzanineError::Io)?;
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(MezzanineError::Io)?;
        let path = entry.path();
        let Some(filename) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !filename.ends_with(".md") {
            continue;
        }
        let content = std::fs::read_to_string(&path).map_err(MezzanineError::Io)?;
        out.push((filename.to_string(), content));
    }
    Ok(out)
}

fn read_log_headers(dir: &std::path::Path) -> MezzanineResult<Vec<LogHeader>> {
    let raw = read_dir_markdown(dir)?;
    Ok(raw
        .into_iter()
        .filter_map(|(name, content)| active_log::parse_header(&name, &content))
        .collect())
}
