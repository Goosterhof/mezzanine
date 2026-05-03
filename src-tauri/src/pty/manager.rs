// PtyManager — the Workbench's session registry.
//
// Phase 1A scaffold: holds the shape of the registry and the LRU policy
// without spawning a real pty. Phase 1C replaces the placeholder with
// portable-pty backed sessions after the wsl.exe substrate spike passes.

use crate::pty::session::{ExperimentId, SessionState};
use std::collections::HashMap;

/// Maximum warm pty sessions held simultaneously. The fourth tab click
/// evicts the least-recently-viewed session — its output ring buffer
/// survives, but the subprocess is killed.
///
/// Currently unused — the constant lands ahead of the LRU eviction logic
/// it will guard. Phase 1C's manager upgrade reaches for it.
#[allow(dead_code)]
pub const MAX_WARM_SESSIONS: usize = 3;

#[derive(Default)]
pub struct PtyManager {
    /// Per-experiment current state. Phase 1C replaces this with a richer
    /// struct holding the actual `portable_pty::Child` and read/write halves.
    states: HashMap<ExperimentId, SessionState>,
}

impl PtyManager {
    pub fn state(&self, id: ExperimentId) -> SessionState {
        self.states.get(&id).copied().unwrap_or_default()
    }

    pub fn snapshot(&self) -> Vec<(ExperimentId, SessionState)> {
        ExperimentId::ALL
            .into_iter()
            .map(|id| (id, self.state(id)))
            .collect()
    }
}
