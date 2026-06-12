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
use std::time::Duration;

use tauri::State;

use crate::error::{MezzanineError, MezzanineResult};
use crate::holotable::git_state::LabGitState;
use crate::holotable::{aggregator, git_state, health_check, DashboardState};
use crate::state::AppState;

// The git half crosses the WSL2 bridge via `wsl.exe -- bash -lc "… git …"`,
// and `Command::output()` there has no natural deadline. A cold distro, a
// held `index.lock`, or git stalling on a credential prompt would block the
// subprocess indefinitely — and `tokio::join!` would then wait on it
// forever, stranding the floor's "reading the floor…" spinner with the
// Refresh button disabled and no recovery. Bounding the git half guarantees
// the command always returns: on timeout the floor degrades to health-only
// (the rings still render) instead of hanging the panel. The health half is
// already bounded by its own 5s per-ping timeout.
const GIT_READ_TIMEOUT: Duration = Duration::from_secs(20);

#[tauri::command]
pub async fn read_holotable_state(state: State<'_, AppState>) -> MezzanineResult<DashboardState> {
    let (lab_root, distro) = read_lab_state(&state)?;
    let lab_root_for_git = lab_root.clone();
    let distro_for_git = distro.clone();

    // Git reads are blocking subprocess I/O — keep them off the runtime
    // by spawning into the blocking pool. Health pings are true async on
    // reqwest's runtime. tokio::join! waits for both; the git half carries a
    // deadline so a wedged bridge cannot wedge the floor.
    let git_handle = tokio::task::spawn_blocking(move || {
        git_state::read(&lab_root_for_git, distro_for_git.as_deref())
    });
    let git_with_deadline = tokio::time::timeout(GIT_READ_TIMEOUT, git_handle);
    let health_future = health_check::ping_all();

    let (git_result, health) = tokio::join!(git_with_deadline, health_future);
    let git = match git_result {
        Ok(Ok(state)) => state,
        Ok(Err(join_err)) => {
            return Err(MezzanineError::WslBridge(format!(
                "holotable git read join failed: {join_err}"
            )))
        }
        Err(_elapsed) => {
            log::warn!(
                "Holotable: git read exceeded {}s — WSL2 may be cold or git is blocked; rendering the floor from health pings only",
                GIT_READ_TIMEOUT.as_secs()
            );
            LabGitState::default()
        }
    };

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
