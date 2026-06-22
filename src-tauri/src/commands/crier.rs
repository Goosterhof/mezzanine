// The Crier's Watch command surface (#00060).
//
// Three Tauri commands arm, recall, and read the town-crier relay:
//
//   * `dispatch_crier`     — the idempotent singleton arm. Builds a
//     `SessionSpec::for_crier`, dispatches it through the roster manager,
//     and tracks the resulting id in `AppState.crier_scientist_id`. A
//     second call returns the tracked id WITHOUT spawning — unless the
//     tracked session has been torn down out from under the tracker (e.g.
//     by a floor `[ recall ]` hit-region calling `recall_scientist`
//     directly), in which case the stale id is cleared and a fresh session
//     is armed.
//
//   * `recall_crier`       — recall by the tracked id, then clear the
//     tracker.
//
//   * `read_crier_watch_state` — the panel's single typed read. Resolves
//     the local status from `AppState` (no token → TokenMissing; token but
//     no session → Idle; session live → Armed), then for Armed hits the
//     bus's `GET /open` with a 10s timeout. The bus half degrades
//     gracefully: a timeout or non-200 returns Armed with an empty queue
//     and a `bus_error` string — never an `Err`. Relay status and bus
//     reachability are two different facts.
//
// Unlike the Holotable's `read_lab_state`, this command does NOT hard-error
// when the wizard has not run — a not-ready/not-armed state is a soft
// status variant, not a `ConfigCorrupt` fault.

use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_http::reqwest;

use crate::crier::{CrierQueueEntry, CrierStatus, CrierWatchState};
use crate::error::{MezzanineError, MezzanineResult};
use crate::pty::substrate::SessionSpec;
use crate::roster::scientist::Scientist;
use crate::roster::target::Target;
use crate::state::AppState;

/// The town-crier bus — the same host the relay polls.
const BUS_OPEN_URL: &str = "https://town-crier-mcp.fly.dev/open";

/// The outbound bus read carries a deadline so a wedged network half cannot
/// strand the panel — mirrors the Holotable's per-call HTTP bound.
const BUS_READ_TIMEOUT: Duration = Duration::from_secs(10);

/// Arm the crier — idempotent singleton dispatch. Returns the armed
/// scientist record. Errors only on a missing token (TokenMissing surfaces
/// as a soft state on the frontend, but the dispatch itself returns
/// `ConfigCorrupt` so `armOnBoot` can catch and set the panel state) or on a
/// genuine spawn failure.
#[tauri::command]
pub fn dispatch_crier<R: Runtime>(
    state: State<'_, AppState>,
    app: AppHandle<R>,
) -> MezzanineResult<Scientist> {
    // Singleton guard: if a crier is already tracked AND still live in the
    // roster, return it untouched. A dead-but-tracked id (floor-recall path)
    // is cleared and re-armed fresh — never returned.
    {
        let tracked = *state.crier_scientist_id.read();
        if let Some(id) = tracked {
            let still_live = state
                .roster_manager
                .read()
                .list()
                .iter()
                .any(|s| s.id == id);
            if still_live {
                if let Some(record) = state
                    .roster_manager
                    .read()
                    .list()
                    .into_iter()
                    .find(|s| s.id == id)
                {
                    return Ok(record);
                }
            }
            // Stale tracker — the session was torn down elsewhere. Clear it
            // and fall through to arm a fresh crier.
            *state.crier_scientist_id.write() = None;
        }
    }

    let token = state
        .crier_token
        .read()
        .clone()
        .ok_or(MezzanineError::ConfigCorrupt)?;

    let lab_root = {
        let guard = state.lab_root.read();
        guard.clone().ok_or(MezzanineError::ConfigCorrupt)?
    };
    let distro = state.distro.read().clone();
    let binary = state.claude_binary.read().clone();
    let chronicle_base = state.chronicle_base.clone();

    let spec = SessionSpec::for_crier(&lab_root, distro, binary, &token);
    let scientist = state.roster_manager.write().dispatch_with_spec(
        Target::LabRoot,
        "town-crier relay — laboratory patrol".to_string(),
        spec,
        chronicle_base,
        app,
        // Ephemeral: the crier is never persisted to roster.json — it is
        // re-armed fresh on every launch, so a snapshot entry would be a
        // zombie pointing at a dead pty.
        true,
    )?;
    *state.crier_scientist_id.write() = Some(scientist.id);
    Ok(scientist)
}

/// Recall the crier by the tracked id and clear the tracker. A no-op (no
/// error) when no crier is currently armed.
#[tauri::command]
pub fn recall_crier(state: State<'_, AppState>) -> MezzanineResult<()> {
    let id = { *state.crier_scientist_id.read() };
    if let Some(id) = id {
        state.chronicle_reader.stop_watching(id);
        state.roster_manager.write().recall(id)?;
        *state.crier_scientist_id.write() = None;
    }
    Ok(())
}

/// The bus's `GET /open` wire shape — `{ open: [ { id, pr_url, repo,
/// review_count }, … ] }`. The relay reads the same body (`relay.mjs:117`).
#[derive(Debug, Deserialize)]
struct BusOpenResponse {
    #[serde(default)]
    open: Vec<BusReviewRequest>,
}

#[derive(Debug, Deserialize)]
struct BusReviewRequest {
    #[serde(default)]
    id: u64,
    #[serde(default)]
    pr_url: String,
    #[serde(default)]
    repo: String,
    #[serde(default)]
    review_count: u32,
}

/// Read the combined watch state — local status + (when armed) the live
/// bus queue. Never returns `Err` for a not-ready / not-armed / bus-down
/// state; only an internal serde/build fault would.
#[tauri::command]
pub async fn read_crier_watch_state(
    state: State<'_, AppState>,
) -> MezzanineResult<CrierWatchState> {
    // Resolve the local status from AppState without touching the network.
    let token = state.crier_token.read().clone();
    let armed = state.crier_scientist_id.read().is_some();

    let Some(token) = token else {
        // No token → NO TOKEN, no bus hit.
        return Ok(CrierWatchState::token_missing());
    };

    if !armed {
        // Token present, patrol stood down → STOOD DOWN.
        return Ok(CrierWatchState::idle());
    }

    // Armed → hit the bus for the open queue. The relay status holds
    // regardless of the bus's reachability.
    let now = chrono::Utc::now().to_rfc3339();
    match fetch_open_queue(&token).await {
        Ok(queue) => Ok(CrierWatchState {
            status: CrierStatus::Armed,
            queue,
            last_read_at: Some(now),
            bus_error: None,
        }),
        Err(message) => Ok(CrierWatchState {
            status: CrierStatus::Armed,
            queue: Vec::new(),
            last_read_at: Some(now),
            bus_error: Some(message),
        }),
    }
}

/// Hit `GET /open` with the lab token. Returns the queue on a 200, or an
/// `Err(String)` describing the failure (timeout, non-200, transport,
/// deserialize) — the caller maps that into `bus_error`, never an IPC
/// `Err`.
async fn fetch_open_queue(token: &str) -> Result<Vec<CrierQueueEntry>, String> {
    let client = reqwest::Client::builder()
        .timeout(BUS_READ_TIMEOUT)
        .build()
        .map_err(|err| format!("HTTP client build failed: {err}"))?;

    let response = client
        .get(BUS_OPEN_URL)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|err| {
            if err.is_timeout() {
                format!("GET /open → timeout after {}s", BUS_READ_TIMEOUT.as_secs())
            } else {
                format!("GET /open → {err}")
            }
        })?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("GET /open → HTTP {}", status.as_u16()));
    }

    // Read the body as text and deserialize with serde_json — the
    // plugin's reqwest re-export is not built with the `json` feature, so
    // `.json()` is unavailable. `.text()` + `serde_json::from_str` is the
    // portable path (the Holotable health-check only inspects status, so it
    // never hit this).
    let raw = response
        .text()
        .await
        .map_err(|err| format!("GET /open → body read failed: {err}"))?;
    let body: BusOpenResponse = serde_json::from_str(&raw)
        .map_err(|err| format!("GET /open → malformed body: {err}"))?;

    Ok(body
        .open
        .into_iter()
        .map(|req| CrierQueueEntry {
            id: req.id,
            pr_url: req.pr_url,
            repo: req.repo,
            review_count: req.review_count,
        })
        .collect())
}

// The dispatch singleton-guard logic is exercised through the RosterManager
// test seam — see `roster::manager::tests` for the crier-id lifecycle
// (dispatch_with_spec + the floor-recall-clears-stale-id path). The
// bus-read half is covered by the frontend's IPC-stubbed `useCriersWatch`
// suite — the network call cannot run in a unit test without a live bus.
