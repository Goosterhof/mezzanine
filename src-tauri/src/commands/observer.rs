// Observer commands — start / stop the per-scientist chronicle tail.
//
// Phase O-1 of the Observer (#00052). Thin wrappers around
// `ChronicleReader::start_watching` / `stop_watching`. The frontend
// calls `start_watching` immediately after a successful dispatch and
// `stop_watching` when a scientist is recalled. `recall_scientist`
// (commands::roster) also stops the tail in the same write path — the
// double call is idempotent by design (Pattern: belt-and-suspenders, the
// frontend may miss the stop signal in a panel-closed race).
//
// The Grind (#00053) will register the same `chronicle-event` listener
// from its own consumer; the reader is shared infrastructure.

//
// The Semaphore (2026-10-02) rides the same two commands: its watcher reads
// the board the lab's Semaphore mod writes for this scientist. A scientist
// without the mod has no board, and the watcher emits nothing for it.

use crate::host_paths::resolve_for_std_fs;
use crate::roster::scientist::ScientistId;
use crate::semaphore::snapshot_relative;
use crate::state::AppState;
use tauri::{AppHandle, Runtime, State};

#[tauri::command]
pub fn start_watching_scientist<R: Runtime>(
    state: State<'_, AppState>,
    app: AppHandle<R>,
    scientist_id: ScientistId,
) {
    state
        .chronicle_reader
        .start_watching(scientist_id, app.clone());
    let root = state.lab_root.read().clone();
    if let Some(root) = root {
        let distro = state.distro.read().clone();
        let path = resolve_for_std_fs(
            &root,
            distro.as_deref(),
            &snapshot_relative(&scientist_id.to_string()),
        );
        state.semaphore.start(scientist_id, path, app);
    }
}

#[tauri::command]
pub fn stop_watching_scientist(state: State<'_, AppState>, scientist_id: ScientistId) {
    state.chronicle_reader.stop_watching(scientist_id);
    state.semaphore.stop(scientist_id);
}
