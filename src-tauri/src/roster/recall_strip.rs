// RecallStrip — the 5-minute strip below the active Roster.
//
// When a scientist is recalled, their row does not vanish immediately. It
// moves here for 5 minutes — dim, labelled with the recall timestamp,
// non-interactive. This catches misclicks and gives the investor a quick
// visual record of what just left. After the TTL expires, the row drops
// out; the chronicle JSONL on disk is unaffected either way.

use crate::roster::scientist::Scientist;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

pub const RECALL_TTL_MINUTES: i64 = 5;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecalledScientist {
    /// The full Scientist record at the moment of recall — frontend renders
    /// the same row treatment as the active Roster, just dimmed.
    pub scientist: Scientist,
    pub recalled_at: DateTime<Utc>,
}

#[derive(Debug, Default)]
pub struct RecallStrip {
    entries: Vec<RecalledScientist>,
}

impl RecallStrip {
    pub fn new() -> Self {
        Self::default()
    }

    /// Drop a recalled scientist into the strip. Repeated entries for the
    /// same scientist id replace the previous record (defensive — should
    /// not happen in production, but it would be confusing for a row to
    /// appear twice).
    pub fn push(&mut self, scientist: Scientist) {
        self.entries
            .retain(|entry| entry.scientist.id != scientist.id);
        self.entries.push(RecalledScientist {
            scientist,
            recalled_at: Utc::now(),
        });
    }

    /// Active entries — those whose `recalled_at + 5 minutes` is still in
    /// the future relative to `now`. Returns a snapshot Vec so callers can
    /// serialize without holding the lock.
    pub fn active(&self, now: DateTime<Utc>) -> Vec<RecalledScientist> {
        let ttl = Duration::minutes(RECALL_TTL_MINUTES);
        self.entries
            .iter()
            .filter(|entry| now - entry.recalled_at < ttl)
            .cloned()
            .collect()
    }

    /// Drop expired entries in place. Called periodically by the manager
    /// (and on every `active()` invocation as a cheap garbage-collect).
    pub fn evict_expired(&mut self, now: DateTime<Utc>) {
        let ttl = Duration::minutes(RECALL_TTL_MINUTES);
        self.entries.retain(|entry| now - entry.recalled_at < ttl);
    }

    /// Total entries currently in the strip, including expired ones not yet
    /// garbage-collected. Tests use this to assert eviction did its job.
    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.entries.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::roster::target::Target;

    fn fresh_scientist() -> Scientist {
        Scientist::new(Target::LabRoot, "test mission".into())
    }

    #[test]
    fn new_strip_is_empty() {
        let strip = RecallStrip::new();
        assert_eq!(strip.active(Utc::now()).len(), 0);
    }

    #[test]
    fn push_adds_an_entry_active_immediately() {
        let mut strip = RecallStrip::new();
        let s = fresh_scientist();
        let id = s.id;
        strip.push(s);
        let active = strip.active(Utc::now());
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].scientist.id, id);
    }

    #[test]
    fn entry_expires_after_five_minutes() {
        let mut strip = RecallStrip::new();
        strip.push(fresh_scientist());
        let now = Utc::now();
        // Just before TTL — still active
        assert_eq!(strip.active(now + Duration::seconds(299)).len(), 1);
        // Just after TTL — gone
        assert_eq!(strip.active(now + Duration::seconds(301)).len(), 0);
    }

    #[test]
    fn evict_expired_drops_old_entries_in_place() {
        let mut strip = RecallStrip::new();
        strip.push(fresh_scientist());
        assert_eq!(strip.len(), 1);
        strip.evict_expired(Utc::now() + Duration::minutes(6));
        assert_eq!(strip.len(), 0);
    }

    #[test]
    fn evict_expired_preserves_fresh_entries() {
        let mut strip = RecallStrip::new();
        strip.push(fresh_scientist());
        strip.evict_expired(Utc::now() + Duration::seconds(30));
        assert_eq!(strip.len(), 1);
    }

    #[test]
    fn push_replaces_existing_id_instead_of_duplicating() {
        let mut strip = RecallStrip::new();
        let mut s = fresh_scientist();
        let id = s.id;
        strip.push(s.clone());
        // Re-push the same id (e.g. a defensive double-recall) — should
        // replace, not duplicate.
        s.mission = "second push".into();
        strip.push(s);
        assert_eq!(strip.len(), 1);
        let active = strip.active(Utc::now());
        assert_eq!(active[0].scientist.id, id);
        assert_eq!(active[0].scientist.mission, "second push");
    }
}
