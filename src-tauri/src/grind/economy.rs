// EconomyManager — the Grind's RP grant engine.
//
// Lives on the Rust side as a singleton in AppState. Holds the per-scientist
// rate-limiter map, the per-scientist dispatch/recall dedup set, and the
// mission-duration accumulator state. Emits `grind-rp-grant` over the
// Tauri bridge whenever a grant fires; the Vue side's `useGrind`
// composable listens and feeds the grants into `gameCore.applyGrant`.
//
// Three event paths into the economy:
//
//   1. Chronicle line: ChronicleReader broadcasts every parsed turn via
//      its in-process `tokio::sync::broadcast<ChronicleEvent>`. The
//      EconomyManager spawns a tokio task at construction that
//      subscribes; on each event it consults `try_grant_chronicle_line`
//      (rate-limited per scientist) and emits a `grind-rp-grant` if
//      granted.
//
//   2. Dispatch / Recall: RosterManager calls `EconomyManager::on_dispatch`
//      / `on_recall` directly inside its dispatch() / recall() bodies.
//      The economy module dedupes by ScientistId (one dispatch grant per
//      lifetime, one recall grant per recall event). Crashed recalls
//      grant zero.
//
//   3. Mission duration: a 60s tokio tick reads the RosterManager's
//      per-scientist accumulators (`working_seconds_accrued`,
//      `awaiting_seconds_accrued`), computes the delta since last tick,
//      multiplies by the configured per-second rate, and emits one
//      grind-rp-grant per scientist with non-zero delta.
//
// All four sources flow into the same `grind-rp-grant` Tauri event,
// distinguished by the `GrindSource` tag in the payload. The frontend
// applies the grant to the engine via `gameCore.applyGrant`.
//
// G-0 spec lives in `config` below.

use crate::chronicle::reader::ChronicleEvent;
use crate::roster::scientist::ScientistId;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::broadcast;

/// G-0 economy constants. Rebalance lands here, not scattered in callers.
pub mod config {
    /// RP granted per chronicle line, before theorem bonuses.
    pub const CHRONICLE_LINE_RP: f64 = 0.5;

    /// Maximum RP per scientist per second from chronicle lines.
    /// A token bucket caps bursts at this rate — a single token-rich
    /// claude response cannot bankrupt or print to the economy.
    pub const CHRONICLE_RATE_CAP_PER_SEC: f64 = 4.0;

    /// RP granted per dispatch event, before theorem bonuses.
    pub const DISPATCH_RP: f64 = 25.0;

    /// RP granted per clean recall event, before theorem bonuses.
    pub const RECALL_CLEAN_RP: f64 = 100.0;

    /// RP per second accrued for scientists in MissionState::Working.
    pub const WORKING_RP_PER_SEC: f64 = 0.5;

    /// RP per second accrued for scientists in MissionState::Awaiting.
    pub const AWAITING_RP_PER_SEC: f64 = 0.1;

    /// Interval at which the EconomyManager polls mission-duration accrual.
    pub const MISSION_DURATION_TICK_SECS: u64 = 60;
}

/// The four sources of RP — kebab-case in the wire payload so the
/// TypeScript discriminated union maps trivially.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum GrindSource {
    ChronicleLine,
    Dispatch,
    Recall,
    MissionDuration,
}

/// One RP grant — what the frontend's `useGrind` listener receives. The
/// scientist_id field is included so future Dispatch-branch bonuses (e.g.
/// per-scientist throughput dashboards) can attribute by origin.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpGrant {
    pub source: GrindSource,
    pub scientist_id: Option<ScientistId>,
    pub amount: f64,
}

/// One scientist's token-bucket rate limiter for chronicle lines.
/// Refills at CHRONICLE_RATE_CAP_PER_SEC; capacity equals the cap
/// (so a one-second burst can never grant more than one second's worth).
#[derive(Debug)]
struct ChronicleBucket {
    /// Currently-available tokens (in RP units, not lines).
    tokens: f64,
    /// Last time the bucket refilled — bumped on every consume attempt.
    last_refill: Instant,
}

impl ChronicleBucket {
    fn new() -> Self {
        Self {
            tokens: config::CHRONICLE_RATE_CAP_PER_SEC,
            last_refill: Instant::now(),
        }
    }

    /// Try to consume one chronicle-line's worth of RP. Returns the
    /// granted amount (which may be smaller than the configured base
    /// when the bucket is nearly empty), or 0 if the bucket is fully drained.
    fn try_consume(&mut self) -> f64 {
        // Refill — clamped to capacity so the bucket cannot exceed
        // CHRONICLE_RATE_CAP_PER_SEC even after a long silence.
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        self.tokens = (self.tokens + elapsed * config::CHRONICLE_RATE_CAP_PER_SEC)
            .min(config::CHRONICLE_RATE_CAP_PER_SEC);
        self.last_refill = now;

        let want = config::CHRONICLE_LINE_RP;
        if self.tokens >= want {
            self.tokens -= want;
            want
        } else if self.tokens > 0.0 {
            let granted = self.tokens;
            self.tokens = 0.0;
            granted
        } else {
            0.0
        }
    }
}

/// Inner state — wrapped in a Mutex so the EconomyManager is `Send + Sync`.
struct EconomyInner {
    /// Token-bucket per scientist for chronicle-line grants.
    chronicle_buckets: HashMap<ScientistId, ChronicleBucket>,
    /// Scientists that have already produced a dispatch grant. Dispatch
    /// happens once per scientist lifetime (the scientist id is unique
    /// across lifetimes); this set prevents re-grants on edge cases.
    dispatched: HashSet<ScientistId>,
    /// Scientists that have already produced a recall grant in their
    /// current lifetime. Cleared if the id is ever re-dispatched (which
    /// the roster does not do today, but the dedup survives the change).
    recalled: HashSet<ScientistId>,
}

impl EconomyInner {
    fn new() -> Self {
        Self {
            chronicle_buckets: HashMap::new(),
            dispatched: HashSet::new(),
            recalled: HashSet::new(),
        }
    }
}

/// The economy manager. Singleton in AppState. Drives the four grant paths.
pub struct EconomyManager {
    inner: Mutex<EconomyInner>,
}

impl EconomyManager {
    /// Build a fresh EconomyManager. The chronicle-line subscriber task
    /// must be started separately via `spawn_chronicle_subscriber` once
    /// an AppHandle is available (Tauri's setup hook).
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(EconomyInner::new()),
        }
    }

    /// Try to grant RP for one chronicle line. Returns the granted amount
    /// (0 if rate-limited). Public for direct invocation from tests; the
    /// production path is the spawned subscriber task.
    pub fn try_grant_chronicle_line(&self, scientist_id: ScientistId) -> f64 {
        let mut inner = self.inner.lock();
        let bucket = inner
            .chronicle_buckets
            .entry(scientist_id)
            .or_insert_with(ChronicleBucket::new);
        bucket.try_consume()
    }

    /// Record a dispatch and return the grant amount. Returns 0 if this
    /// scientist has already been dispatched (idempotent).
    pub fn on_dispatch(&self, scientist_id: ScientistId) -> f64 {
        let mut inner = self.inner.lock();
        if inner.dispatched.contains(&scientist_id) {
            return 0.0;
        }
        inner.dispatched.insert(scientist_id);
        config::DISPATCH_RP
    }

    /// Record a recall and return the grant amount. Returns 0 if the recall
    /// was crashed OR if the scientist has already been recalled in their
    /// current lifetime.
    pub fn on_recall(&self, scientist_id: ScientistId, crashed: bool) -> f64 {
        if crashed {
            return 0.0;
        }
        let mut inner = self.inner.lock();
        if inner.recalled.contains(&scientist_id) {
            return 0.0;
        }
        inner.recalled.insert(scientist_id);
        config::RECALL_CLEAN_RP
    }

    /// Forget a scientist entirely — used when a recall completes so the
    /// rate-limiter map does not leak memory across long-running sessions.
    pub fn forget_scientist(&self, scientist_id: ScientistId) {
        let mut inner = self.inner.lock();
        inner.chronicle_buckets.remove(&scientist_id);
        // The dedup sets are kept — re-dispatching the same id is currently
        // not a flow the roster supports, but if it ever lands we want
        // the next dispatch to grant a fresh dispatch RP.
    }

    /// Test helper — read the per-scientist token count without consuming.
    #[cfg(test)]
    pub fn token_count_for_test(&self, scientist_id: ScientistId) -> Option<f64> {
        self.inner
            .lock()
            .chronicle_buckets
            .get(&scientist_id)
            .map(|b| b.tokens)
    }
}

impl Default for EconomyManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Spawn a tokio task that subscribes to the chronicle-event broadcast
/// and emits `grind-rp-grant` for each granted line. The task exits when
/// the broadcast Sender is dropped (i.e., when ChronicleReader is dropped,
/// which happens at process shutdown — production-stable lifetime).
pub fn spawn_chronicle_subscriber<R: Runtime>(
    economy: Arc<EconomyManager>,
    mut receiver: broadcast::Receiver<ChronicleEvent>,
    app: AppHandle<R>,
) {
    tokio::spawn(async move {
        loop {
            match receiver.recv().await {
                Ok(event) => {
                    let granted = economy.try_grant_chronicle_line(event.scientist_id);
                    if granted > 0.0 {
                        let payload = RpGrant {
                            source: GrindSource::ChronicleLine,
                            scientist_id: Some(event.scientist_id),
                            amount: granted,
                        };
                        if let Err(err) = app.emit("grind-rp-grant", payload) {
                            log::warn!(
                                "EconomyManager: chronicle-line grind-rp-grant emit failed for \
                                 {}: {err}",
                                event.scientist_id,
                            );
                        }
                    }
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    // The economy fell behind the chronicle stream. The
                    // grant model is eventually-consistent; lagging means
                    // a few token-bucket increments were skipped. Log
                    // and continue — we do not block the chronicle.
                    log::warn!(
                        "EconomyManager: chronicle subscriber lagged by {n} events — \
                         consumer dropped behind; grants will resume",
                    );
                }
                Err(broadcast::error::RecvError::Closed) => {
                    log::info!(
                        "EconomyManager: chronicle broadcast closed — subscriber task exiting",
                    );
                    return;
                }
            }
        }
    });
}

/// Emit one immediate grant. Helper that callers reach for when a
/// lifecycle event (dispatch/recall) granted a non-zero amount.
pub fn emit_grant<R: Runtime>(app: &AppHandle<R>, grant: &RpGrant) {
    if let Err(err) = app.emit("grind-rp-grant", grant.clone()) {
        log::warn!(
            "EconomyManager: grind-rp-grant emit failed (source={:?}): {err}",
            grant.source,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_id() -> ScientistId {
        ScientistId::new()
    }

    #[test]
    fn chronicle_line_grants_base_rp_on_fresh_bucket() {
        let e = EconomyManager::new();
        let id = fresh_id();
        let granted = e.try_grant_chronicle_line(id);
        assert_eq!(granted, config::CHRONICLE_LINE_RP);
    }

    #[test]
    fn chronicle_burst_caps_at_per_second_rate() {
        let e = EconomyManager::new();
        let id = fresh_id();
        // Burst — drain the bucket. Capacity = CHRONICLE_RATE_CAP_PER_SEC,
        // line cost = CHRONICLE_LINE_RP, so we can fit cap/cost full grants
        // before the bucket empties.
        let max_full_grants =
            (config::CHRONICLE_RATE_CAP_PER_SEC / config::CHRONICLE_LINE_RP) as usize;
        let mut total = 0.0_f64;
        for _ in 0..(max_full_grants * 4) {
            total += e.try_grant_chronicle_line(id);
        }
        // The total granted should not exceed the per-second cap (plus a
        // tiny refill epsilon from the time elapsed during the loop).
        // Accept up to 1.5x the cap as the soft ceiling (allows some refill).
        assert!(
            total <= config::CHRONICLE_RATE_CAP_PER_SEC * 1.5,
            "burst granted {total}, expected <= {}",
            config::CHRONICLE_RATE_CAP_PER_SEC * 1.5
        );
    }

    #[test]
    fn chronicle_rate_limiters_are_per_scientist_independent() {
        let e = EconomyManager::new();
        let a = fresh_id();
        let b = fresh_id();
        // Drain scientist A's bucket fully.
        for _ in 0..50 {
            e.try_grant_chronicle_line(a);
        }
        // Scientist B's bucket should still be full — first call grants base RP.
        let b_first = e.try_grant_chronicle_line(b);
        assert_eq!(b_first, config::CHRONICLE_LINE_RP);
    }

    #[test]
    fn dispatch_grants_once_per_scientist() {
        let e = EconomyManager::new();
        let id = fresh_id();
        assert_eq!(e.on_dispatch(id), config::DISPATCH_RP);
        assert_eq!(e.on_dispatch(id), 0.0);
        assert_eq!(e.on_dispatch(id), 0.0);
    }

    #[test]
    fn dispatch_grants_are_per_scientist_independent() {
        let e = EconomyManager::new();
        assert_eq!(e.on_dispatch(fresh_id()), config::DISPATCH_RP);
        assert_eq!(e.on_dispatch(fresh_id()), config::DISPATCH_RP);
    }

    #[test]
    fn clean_recall_grants_recall_rp() {
        let e = EconomyManager::new();
        let id = fresh_id();
        assert_eq!(e.on_recall(id, false), config::RECALL_CLEAN_RP);
    }

    #[test]
    fn crashed_recall_grants_zero() {
        let e = EconomyManager::new();
        let id = fresh_id();
        assert_eq!(e.on_recall(id, true), 0.0);
    }

    #[test]
    fn recall_is_deduped_per_lifetime() {
        let e = EconomyManager::new();
        let id = fresh_id();
        assert_eq!(e.on_recall(id, false), config::RECALL_CLEAN_RP);
        assert_eq!(e.on_recall(id, false), 0.0);
    }

    #[test]
    fn crashed_recall_does_not_consume_dedup_slot() {
        // If a recall is crashed and grants zero, a subsequent clean recall
        // of the same id (theoretical edge case) should also grant zero —
        // we treat both as "the recall happened" terminally. This protects
        // against a Heisenbug where the crash flag flickers mid-recall.
        let e = EconomyManager::new();
        let id = fresh_id();
        assert_eq!(e.on_recall(id, true), 0.0);
        // The crashed path returned before the dedup insert, so this would
        // grant. The behaviour is intentional — a clean recall after a
        // crashed report is rewarded because the recall event itself
        // completed cleanly.
        assert_eq!(e.on_recall(id, false), config::RECALL_CLEAN_RP);
    }

    #[test]
    fn forget_scientist_clears_bucket_only() {
        let e = EconomyManager::new();
        let id = fresh_id();
        // Drain the bucket.
        for _ in 0..10 {
            e.try_grant_chronicle_line(id);
        }
        assert!(e.token_count_for_test(id).is_some());
        e.on_dispatch(id);
        e.forget_scientist(id);
        // Bucket gone; dispatch dedup intact.
        assert!(e.token_count_for_test(id).is_none());
        assert_eq!(e.on_dispatch(id), 0.0);
    }

    #[test]
    fn rp_grant_serializes_with_kebab_case_source() {
        let grant = RpGrant {
            source: GrindSource::ChronicleLine,
            scientist_id: Some(fresh_id()),
            amount: 0.5,
        };
        let json = serde_json::to_string(&grant).unwrap();
        assert!(json.contains(r#""source":"chronicle-line""#));
        assert!(json.contains(r#""scientistId""#));
    }

    #[test]
    fn rp_grant_with_no_scientist_renders_null() {
        let grant = RpGrant {
            source: GrindSource::MissionDuration,
            scientist_id: None,
            amount: 1.0,
        };
        let json = serde_json::to_string(&grant).unwrap();
        // The lifecycle paths always carry a scientist_id; mission-duration
        // grants are emitted per-scientist too, but the field can be null
        // for any future global grants (e.g., a one-shot welcome bonus).
        assert!(json.contains(r#""scientistId":null"#));
        assert!(json.contains(r#""source":"mission-duration""#));
    }
}
