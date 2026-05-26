// The Holotable's command surface — one read endpoint.
//
// `read_holotable_state` is the only Tauri IPC entry the Holotable needs.
// It mirrors `commands/balcony.rs` exactly: pull `(lab_root, distro)` from
// AppState via `read_lab_state`, fail fast with `ConfigCorrupt` if the
// wizard hasn't run, otherwise launch git + health concurrently and
// aggregate.
//
// The git half is blocking subprocess I/O — it runs on the blocking pool.
// The health half is true async (reqwest/tokio). They run concurrently
// via `tokio::join!`, so the floor's freshness is bounded by the slower
// of the two — which is normally the HTTPS pings (≤5s with timeout).
//
// Refresh model: read-on-open + manual button. No polling. The original
// VS Code holotable ran 10s git scans and 60s health polls; the Mezzanine
// version is pull-only, matching the balcony's dispatched-model voice.

use std::path::PathBuf;

use tauri::State;

use crate::error::{MezzanineError, MezzanineResult};
use crate::holotable::{aggregator, git_state, health_check, DashboardState};
use crate::state::AppState;

#[tauri::command]
pub async fn read_holotable_state(state: State<'_, AppState>) -> MezzanineResult<DashboardState> {
    let (lab_root, distro) = read_lab_state(&state)?;
    let lab_root_for_git = lab_root.clone();
    let distro_for_git = distro.clone();

    // Git reads are blocking subprocess I/O — keep them off the runtime
    // by spawning into the blocking pool. Health pings are true async on
    // reqwest's runtime. tokio::join! waits for both.
    let git_handle = tokio::task::spawn_blocking(move || {
        git_state::read(&lab_root_for_git, distro_for_git.as_deref())
    });
    let health_future = health_check::ping_all();

    let (git_join, health) = tokio::join!(git_handle, health_future);
    let git = git_join.map_err(|e| {
        MezzanineError::WslBridge(format!("holotable git read join failed: {e}"))
    })?;

    Ok(aggregator::build(git, health))
}

fn read_lab_state(state: &State<'_, AppState>) -> MezzanineResult<(PathBuf, Option<String>)> {
    let lab_root = state
        .lab_root
        .read()
        .clone()
        .ok_or(MezzanineError::ConfigCorrupt)?;
    let distro = state.distro.read().clone();
    Ok((lab_root, distro))
}
