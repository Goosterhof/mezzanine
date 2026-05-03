// PtyManager — the Workbench's session registry.
//
// One bench, six potential sessions, three warm slots. The manager owns
// the live sessions and their recency vector; it spawns through the
// substrate, writes through the session's mutexed writer, and kills via
// the shared child Arc. When a fourth experiment is requested, the
// least-recently-focused session is evicted before the new one is
// spawned — its frontend ring buffer survives, but the subprocess does
// not.

use crate::error::WorkbenchError;
use crate::pty::live::LivePtySession;
use crate::pty::session::{ExperimentId, SessionState};
use crate::pty::substrate::SessionSpec;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Runtime};

/// Maximum warm pty sessions held simultaneously. The fourth tab click
/// evicts the least-recently-viewed session — the subprocess is killed
/// (frontend's ring buffer for that experiment is preserved separately).
pub const MAX_WARM_SESSIONS: usize = 3;

#[derive(Default)]
pub struct PtyManager {
    sessions: HashMap<ExperimentId, Arc<LivePtySession>>,
    /// Front of the vec is most-recently-focused. Updated on every
    /// `spawn`, `bump`, and `kill`.
    recency: Vec<ExperimentId>,
}

impl PtyManager {
    /// Spawn a session for `experiment` if none exists; otherwise bump
    /// recency. Returns the new (or existing) state for the experiment.
    /// If the registry is at capacity, the LRU session is evicted first.
    pub fn spawn_or_resume<R: Runtime>(
        &mut self,
        experiment: ExperimentId,
        lab_root: &Path,
        distro: Option<String>,
        app: AppHandle<R>,
    ) -> Result<SessionState, WorkbenchError> {
        if self.sessions.contains_key(&experiment) {
            self.bump_recency(experiment);
            return Ok(SessionState::Awaiting);
        }
        if let Some(victim) = Self::pick_lru_victim(self.sessions.len(), &self.recency) {
            log::info!(
                "Workbench: evicting LRU session — {} bumped off the bench to make room",
                victim.label(),
            );
            self.kill(victim)?;
        }
        let spec = SessionSpec::for_experiment(lab_root, experiment, distro);
        let live = LivePtySession::spawn(&spec, experiment, app)?;
        self.sessions.insert(experiment, Arc::new(live));
        self.bump_recency(experiment);
        Ok(SessionState::Awaiting)
    }

    /// If `sessions_count` would exceed the warm-session cap on the
    /// next spawn, return the experiment to evict. LRU is the back of
    /// the recency vec (front = most-recent). Pure function — extracted
    /// so the tests can exercise the policy without spawning a pty.
    fn pick_lru_victim(sessions_count: usize, recency: &[ExperimentId]) -> Option<ExperimentId> {
        if sessions_count < MAX_WARM_SESSIONS {
            return None;
        }
        recency.last().copied()
    }

    /// Write bytes to the named session's stdin. Returns SessionNotFound
    /// if the session has already been killed or never spawned.
    pub fn write(&self, experiment: ExperimentId, bytes: &[u8]) -> Result<(), WorkbenchError> {
        let session = self
            .sessions
            .get(&experiment)
            .ok_or_else(|| WorkbenchError::SessionNotFound(format!("{experiment:?}")))?;
        session.write(bytes)
    }

    /// Kill the named session. Reader thread observes EOF, harvests the
    /// exit code via `wait()`, and emits `pty-exit`. The session entry
    /// is removed from the registry; the recency vec drops it too.
    pub fn kill(&mut self, experiment: ExperimentId) -> Result<(), WorkbenchError> {
        if let Some(session) = self.sessions.remove(&experiment) {
            session.kill_child();
            self.recency.retain(|&id| id != experiment);
        }
        Ok(())
    }

    /// Snapshot of every experiment's current pulse state — used by the
    /// frontend at startup to render the rail before any sessions exist.
    pub fn snapshot(&self) -> Vec<(ExperimentId, SessionState)> {
        ExperimentId::ALL
            .into_iter()
            .map(|id| {
                let state = if self.sessions.contains_key(&id) {
                    SessionState::Awaiting
                } else {
                    SessionState::Idle
                };
                (id, state)
            })
            .collect()
    }

    pub fn state(&self, experiment: ExperimentId) -> SessionState {
        if self.sessions.contains_key(&experiment) {
            SessionState::Awaiting
        } else {
            SessionState::Idle
        }
    }

    fn bump_recency(&mut self, experiment: ExperimentId) {
        self.recency.retain(|&id| id != experiment);
        self.recency.insert(0, experiment);
    }

    #[cfg(test)]
    pub fn recency(&self) -> &[ExperimentId] {
        &self.recency
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // We test only the recency-tracking logic here. Live spawn tests
    // require a Tauri AppHandle (no Tauri runtime in unit tests) and a
    // running pty pair (covered by the substrate spike). The recency
    // logic itself is pure data manipulation.

    #[test]
    fn bump_recency_inserts_at_front() {
        let mut mgr = PtyManager::default();
        mgr.bump_recency(ExperimentId::Crucible);
        mgr.bump_recency(ExperimentId::Gatekeeper);
        assert_eq!(
            mgr.recency(),
            &[ExperimentId::Gatekeeper, ExperimentId::Crucible],
        );
    }

    #[test]
    fn bump_recency_moves_existing_to_front() {
        let mut mgr = PtyManager::default();
        mgr.bump_recency(ExperimentId::Crucible);
        mgr.bump_recency(ExperimentId::Gatekeeper);
        mgr.bump_recency(ExperimentId::Crucible);
        assert_eq!(
            mgr.recency(),
            &[ExperimentId::Crucible, ExperimentId::Gatekeeper],
        );
    }

    #[test]
    fn write_returns_session_not_found_when_absent() {
        let mgr = PtyManager::default();
        let err = mgr.write(ExperimentId::Crucible, b"hello").unwrap_err();
        match err {
            WorkbenchError::SessionNotFound(label) => {
                assert!(
                    label.contains("Crucible"),
                    "expected experiment in label: {label}"
                );
            }
            other => panic!("expected SessionNotFound, got: {other:?}"),
        }
    }

    #[test]
    fn snapshot_lists_all_six_idle_when_empty() {
        let mgr = PtyManager::default();
        let snap = mgr.snapshot();
        assert_eq!(snap.len(), 6);
        for (_, state) in snap {
            assert_eq!(state, SessionState::Idle);
        }
    }

    // ---- LRU eviction policy ---------------------------------------------

    #[test]
    fn pick_lru_victim_returns_none_below_capacity() {
        let recency = vec![ExperimentId::Crucible, ExperimentId::Gatekeeper];
        assert_eq!(PtyManager::pick_lru_victim(2, &recency), None);
    }

    #[test]
    fn pick_lru_victim_returns_back_of_recency_at_capacity() {
        // recency[0] is most-recent, recency.last() is the LRU.
        let recency = vec![
            ExperimentId::WarTable,   // most recent
            ExperimentId::Crucible,   //
            ExperimentId::Gatekeeper, // LRU
        ];
        assert_eq!(
            PtyManager::pick_lru_victim(3, &recency),
            Some(ExperimentId::Gatekeeper),
        );
    }

    #[test]
    fn pick_lru_victim_returns_none_when_recency_is_empty() {
        // Defensive: should never happen in production (sessions and
        // recency stay in lockstep), but the function should not panic.
        assert_eq!(PtyManager::pick_lru_victim(MAX_WARM_SESSIONS, &[]), None);
    }
}
