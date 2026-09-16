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
use tauri::State;
use tauri_plugin_http::reqwest;

use crate::crier::{CrierQueueEntry, CrierStatus, CrierWatchState};
use crate::error::MezzanineResult;
use crate::state::AppState;

/// The town-crier bus — the same host the relay polls.
const BUS_OPEN_URL: &str = "https://town-crier-mcp.fly.dev/open";

/// The outbound bus read carries a deadline so a wedged network half cannot
/// strand the panel — mirrors the Holotable's per-call HTTP bound.
const BUS_READ_TIMEOUT: Duration = Duration::from_secs(10);

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

#[tauri::command]
pub async fn read_crier_watch_state(
    state: State<'_, AppState>,
) -> MezzanineResult<CrierWatchState> {
    // Resolve the local status from AppState without touching the network.
    let token = state.crier_token.read().clone();
    let scientist_id = *state.crier_scientist_id.read();

    let Some(token) = token else {
        // No token → NO TOKEN, no bus hit.
        return Ok(CrierWatchState::token_missing());
    };

    if scientist_id.is_none() {
        // Token present, patrol stood down → STOOD DOWN.
        return Ok(CrierWatchState::idle());
    }

    // Armed → hit the bus for the open queue. The relay status holds
    // regardless of the bus's reachability. The tracked session id rides back
    // so the frontend can bind the glass even if it never ran `arm()` itself.
    let now = chrono::Utc::now().to_rfc3339();
    match fetch_open_queue(&token).await {
        Ok(queue) => Ok(CrierWatchState {
            status: CrierStatus::Armed,
            queue,
            last_read_at: Some(now),
            bus_error: None,
            scientist_id,
        }),
        Err(message) => Ok(CrierWatchState {
            status: CrierStatus::Armed,
            queue: Vec::new(),
            last_read_at: Some(now),
            bus_error: Some(message),
            scientist_id,
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
    let body: BusOpenResponse =
        serde_json::from_str(&raw).map_err(|err| format!("GET /open → malformed body: {err}"))?;

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
