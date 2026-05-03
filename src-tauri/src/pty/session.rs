// PtySession — one experiment's grip on the vise.
//
// Each session is named for the experiment it serves. The CWD is fixed per
// experiment (six experiments, six paths, no config); the binary is always
// `claude`; the wrapper is always `wsl.exe` on Windows. Phase 1A keeps the
// data shape stable so the Phase 1C spike has a target to wire into.

use serde::{Deserialize, Serialize};

/// The six experiments the Workbench knows about. Order matches the left
/// rail's vertical ordering — Gatekeeper first, Horadrim last — and matches
/// the laboratory's chronological order of birth.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExperimentId {
    Gatekeeper,
    WarTable,
    Crucible,
    Parlour,
    Smokestacks,
    Horadrim,
}

impl ExperimentId {
    /// All six experiments in left-rail order.
    pub const ALL: [Self; 6] = [
        Self::Gatekeeper,
        Self::WarTable,
        Self::Crucible,
        Self::Parlour,
        Self::Smokestacks,
        Self::Horadrim,
    ];

    /// The WSL2-side directory the experiment lives in, relative to the lab
    /// root. The Workbench prepends `<lab-root>/` before passing it to
    /// `wsl.exe -- bash -c "cd <full-path> && claude"`.
    pub fn wsl_relative_path(self) -> &'static str {
        match self {
            Self::Gatekeeper => "experiments/zmuuzn-auth",
            Self::WarTable => "experiments/zmuuzn-helldivers",
            Self::Crucible => "experiments/zmuuzn-strava",
            Self::Parlour => "experiments/zmuuzn-parlour",
            Self::Smokestacks => "experiments/zmuuzn-smokestacks",
            Self::Horadrim => "experiments/zmuuzn-horadrim",
        }
    }

    /// The experiment's display label — what shows on the rail tab.
    pub fn label(self) -> &'static str {
        match self {
            Self::Gatekeeper => "The Gatekeeper",
            Self::WarTable => "The War Table",
            Self::Crucible => "The Crucible",
            Self::Parlour => "The Parlour",
            Self::Smokestacks => "The Smokestacks",
            Self::Horadrim => "The Horadrim",
        }
    }
}

/// The session's pulse — what the rail's pulse dot will render.
///
/// Five states cover every meaningful condition; the pulse module on the
/// frontend renders each one with its own animation.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SessionState {
    /// No pty live — never started or evicted by LRU.
    #[default]
    Idle,
    /// Pty alive, claude awaiting investor input.
    Awaiting,
    /// Pty alive, claude actively producing output.
    Working,
    /// Output finished while another tab was foregrounded.
    CompletedUnseen,
    /// Pty exited non-zero or the bridge collapsed.
    Crashed,
}
