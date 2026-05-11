// Scientist — one dispatched agent of the laboratory.
//
// Each Scientist is one claude pty session, dispatched from the Mezzanine
// into a Target with a mission brief. The id is stable for the scientist's
// whole life including across gadget restarts; the state ticks through
// idle / working / awaiting / done / crashed and stamps last_state_change
// so the 1-hour idle-warning has something to key off of.

use crate::roster::target::Target;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ScientistId(pub Uuid);

impl ScientistId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for ScientistId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for ScientistId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MissionState {
    /// Pty alive, claude is waiting for the investor to type next.
    /// The 1-hour idle-warning fires on this state, not the others.
    #[default]
    Idle,
    /// Pty alive, claude is producing output.
    Working,
    /// Pty alive, claude is mid-tool-use or mid-prompt — distinct from Idle
    /// so the rail can render a different pulse without triggering the
    /// idle-warning.
    Awaiting,
    /// Mission completed cleanly — pty exited 0; scientist can be recalled.
    Done,
    /// Pty exited non-zero or the bridge collapsed.
    Crashed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scientist {
    pub id: ScientistId,
    pub target: Target,
    pub mission: String,
    pub state: MissionState,
    pub started_at: DateTime<Utc>,
    /// Last time `state` changed — the 1-hour idle-warning fires when
    /// `state == Idle && now - last_state_change >= Duration::hours(1)`.
    pub last_state_change: DateTime<Utc>,
}

impl Scientist {
    pub fn new(target: Target, mission: String) -> Self {
        let now = Utc::now();
        Self {
            id: ScientistId::new(),
            target,
            mission,
            state: MissionState::default(),
            started_at: now,
            last_state_change: now,
        }
    }

    /// Set state to `next` and stamp `last_state_change` iff `next` differs
    /// from the current state. Idempotent on no-op transitions so the
    /// idle-warning clock is not falsely reset by repeated `Idle` writes.
    pub fn transition_to(&mut self, next: MissionState) {
        if self.state != next {
            self.state = next;
            self.last_state_change = Utc::now();
        }
    }

    /// True if the scientist has held `Idle` for at least one hour. The
    /// Mezzanine's roster row paints the idle-warning treatment when this
    /// trips. Non-blocking — the scientist keeps running.
    pub fn is_idle_warning(&self, now: DateTime<Utc>) -> bool {
        self.state == MissionState::Idle
            && (now - self.last_state_change) >= chrono::Duration::hours(1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::roster::target::Target;

    #[test]
    fn new_scientist_starts_idle_with_timestamps_aligned() {
        let s = Scientist::new(Target::LabRoot, "test".into());
        assert_eq!(s.state, MissionState::Idle);
        assert_eq!(s.started_at, s.last_state_change);
    }

    #[test]
    fn transition_to_advances_state_and_stamp() {
        let mut s = Scientist::new(Target::LabRoot, "m".into());
        let before = s.last_state_change;
        std::thread::sleep(std::time::Duration::from_millis(2));
        s.transition_to(MissionState::Working);
        assert_eq!(s.state, MissionState::Working);
        assert!(s.last_state_change > before);
    }

    #[test]
    fn transition_to_same_state_is_noop() {
        let mut s = Scientist::new(Target::LabRoot, "m".into());
        let before = s.last_state_change;
        std::thread::sleep(std::time::Duration::from_millis(2));
        s.transition_to(MissionState::Idle);
        assert_eq!(s.last_state_change, before);
    }

    #[test]
    fn is_idle_warning_false_when_just_dispatched() {
        let s = Scientist::new(Target::LabRoot, "m".into());
        assert!(!s.is_idle_warning(Utc::now()));
    }

    #[test]
    fn is_idle_warning_true_after_one_hour_idle() {
        let s = Scientist::new(Target::LabRoot, "m".into());
        let future = s.last_state_change + chrono::Duration::minutes(61);
        assert!(s.is_idle_warning(future));
    }

    #[test]
    fn is_idle_warning_false_when_working_even_for_hours() {
        let mut s = Scientist::new(Target::LabRoot, "m".into());
        s.transition_to(MissionState::Working);
        let future = s.last_state_change + chrono::Duration::hours(3);
        assert!(!s.is_idle_warning(future));
    }

    #[test]
    fn scientist_id_serializes_as_bare_uuid_string() {
        let id = ScientistId::new();
        let json = serde_json::to_string(&id).unwrap();
        assert!(json.starts_with('"'));
        assert!(json.ends_with('"'));
        // length: 2 quotes + 36 char uuid
        assert_eq!(json.len(), 38);
    }

    #[test]
    fn scientist_round_trips_through_serde() {
        let original = Scientist::new(
            Target::experiment(crate::roster::target::ExperimentCodename::Crucible),
            "check phpstan".into(),
        );
        let json = serde_json::to_string(&original).unwrap();
        let back: Scientist = serde_json::from_str(&json).unwrap();
        assert_eq!(original.id, back.id);
        assert_eq!(original.target, back.target);
        assert_eq!(original.mission, back.mission);
        assert_eq!(original.state, back.state);
    }
}
