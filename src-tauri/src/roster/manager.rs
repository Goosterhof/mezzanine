// RosterManager — the Mezzanine's living registry of dispatched scientists.
//
// Owns the live pty handles (Arc<LiveScientistSession>) and the data
// records (Scientist) that mirror them to the frontend. Persists records
// across gadget restarts via the snapshot file. Maintains a 5-minute
// recently-recalled strip for the Mezzanine's "row dims out, then drops"
// post-recall UX.

use crate::error::{MezzanineError, MezzanineResult};
use crate::pty::substrate::SessionSpec;
use crate::roster::live::LiveScientistSession;
use crate::roster::persistence::{read_snapshot, write_snapshot, RosterSnapshot};
use crate::roster::recall_strip::{RecallStrip, RecalledScientist};
use crate::roster::scientist::{MissionState, Scientist, ScientistId};
use crate::roster::target::Target;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Runtime};

pub struct RosterManager {
    /// Live pty sessions keyed by scientist id. Empty on first boot; not
    /// repopulated on restart since ptys are bound to the gadget process
    /// lifetime — only the records survive.
    scientists: HashMap<ScientistId, Arc<LiveScientistSession>>,
    /// Serializable mirror — what the frontend Roster renders.
    records: HashMap<ScientistId, Scientist>,
    /// 5-minute strip below the active Roster — recalled scientists
    /// linger here so misclicks have a recovery window.
    recall_strip: RecallStrip,
    /// Directory where `roster.json` is read and written. Resolved from
    /// the Tauri app data dir at construction.
    snapshot_dir: PathBuf,
}

impl RosterManager {
    /// Construct a fresh manager. Reads `roster.json` from `snapshot_dir`
    /// and seeds the records map — surviving scientists from the previous
    /// run reappear on the Roster (their pty is gone but the record is
    /// honoured; the investor can recall or leave them).
    pub fn new(snapshot_dir: PathBuf) -> Self {
        let snap = read_snapshot(&snapshot_dir);
        let records: HashMap<_, _> = snap
            .scientists
            .into_iter()
            .map(|s| (s.id, s))
            .collect();
        Self {
            scientists: HashMap::new(),
            records,
            recall_strip: RecallStrip::new(),
            snapshot_dir,
        }
    }

    /// Dispatch a fresh scientist into `target` with `mission`. Spawns a
    /// pty in the target's CWD, registers the record, persists. Returns
    /// the created Scientist record (with the freshly-minted id). The
    /// `binary` override threads the wizard's persisted choice down to
    /// the substrate; pass `None` to use the substrate default (`claude`).
    pub fn dispatch<R: Runtime>(
        &mut self,
        target: Target,
        mission: String,
        lab_root: &Path,
        distro: Option<String>,
        binary: Option<String>,
        chronicle_base: PathBuf,
        app: AppHandle<R>,
    ) -> MezzanineResult<Scientist> {
        // Build the spec from the mission BEFORE the string is moved into
        // the Scientist record — the mission doubles as claude's opening
        // prompt (substrate threads it through as a positional arg).
        let spec = SessionSpec::for_target(lab_root, &target, distro, binary, &mission);
        let scientist = Scientist::new(target.clone(), mission);
        let id = scientist.id;
        let live = LiveScientistSession::spawn(&spec, id, chronicle_base, app)?;
        self.scientists.insert(id, Arc::new(live));
        self.records.insert(id, scientist.clone());
        self.persist();
        Ok(scientist)
    }

    /// Recall the scientist by id. Kills the live pty if present, moves
    /// the record into the recall strip, persists. Idempotent on already-
    /// recalled scientists (they're already in the strip).
    pub fn recall(&mut self, id: ScientistId) -> MezzanineResult<()> {
        if let Some(live) = self.scientists.remove(&id) {
            live.kill_child();
        }
        if let Some(record) = self.records.remove(&id) {
            self.recall_strip.push(record);
        }
        self.persist();
        Ok(())
    }

    /// Snapshot of the active roster. Returns owned clones so the caller
    /// can serialize without holding the manager lock.
    pub fn list(&self) -> Vec<Scientist> {
        self.records.values().cloned().collect()
    }

    /// Snapshot of the recently-recalled strip at `now`. Eagerly evicts
    /// expired entries before returning — `now` doubles as the
    /// garbage-collect trigger.
    pub fn recently_recalled(&mut self, now: DateTime<Utc>) -> Vec<RecalledScientist> {
        self.recall_strip.evict_expired(now);
        self.recall_strip.active(now)
    }

    /// Write `bytes` to the named scientist's stdin. SessionNotFound if
    /// the scientist has been recalled or never dispatched.
    pub fn write(&self, id: ScientistId, bytes: &[u8]) -> MezzanineResult<()> {
        let live = self
            .scientists
            .get(&id)
            .ok_or_else(|| MezzanineError::SessionNotFound(format!("{id}")))?;
        live.write(bytes)
    }

    /// Push new terminal dimensions to the named scientist's pty master.
    pub fn resize(&self, id: ScientistId, cols: u16, rows: u16) -> MezzanineResult<()> {
        let live = self
            .scientists
            .get(&id)
            .ok_or_else(|| MezzanineError::SessionNotFound(format!("{id}")))?;
        live.resize(cols, rows)
    }

    /// Transition a scientist's state. Used by the reader-loop / frontend
    /// activity reporters to flip Idle → Working → Awaiting → Done.
    pub fn transition(&mut self, id: ScientistId, state: MissionState) {
        if let Some(s) = self.records.get_mut(&id) {
            s.transition_to(state);
            self.persist();
        }
    }

    fn persist(&self) {
        let snap = RosterSnapshot {
            scientists: self.records.values().cloned().collect(),
        };
        if let Err(err) = write_snapshot(&self.snapshot_dir, &snap) {
            log::warn!(
                "Mezzanine: roster snapshot write failed at {} — {err}",
                self.snapshot_dir.display(),
            );
        }
    }

    /// Test helper — insert a record without a live pty. Lets unit tests
    /// exercise the data-mutation logic (recall, list, recently_recalled,
    /// transition) without needing a Tauri AppHandle or a real subprocess.
    #[cfg(test)]
    pub fn insert_record_for_test(&mut self, scientist: Scientist) {
        self.records.insert(scientist.id, scientist);
    }

    /// Test helper — assert the scientist is currently in the active
    /// records map (i.e., not yet recalled).
    #[cfg(test)]
    pub fn has_record(&self, id: ScientistId) -> bool {
        self.records.contains_key(&id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::roster::target::{ExperimentCodename, Target};

    fn temp_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mezzanine-roster-mgr-test-{}-{}",
            suffix,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn fresh_scientist() -> Scientist {
        Scientist::new(
            Target::experiment(ExperimentCodename::Crucible),
            "check phpstan".into(),
        )
    }

    #[test]
    fn new_manager_starts_with_empty_roster() {
        let dir = temp_dir("empty");
        let mgr = RosterManager::new(dir.clone());
        assert!(mgr.list().is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_returns_inserted_records() {
        let dir = temp_dir("list");
        let mut mgr = RosterManager::new(dir.clone());
        mgr.insert_record_for_test(fresh_scientist());
        mgr.insert_record_for_test(fresh_scientist());
        assert_eq!(mgr.list().len(), 2);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn recall_moves_record_to_strip() {
        let dir = temp_dir("recall-strip");
        let mut mgr = RosterManager::new(dir.clone());
        let s = fresh_scientist();
        let id = s.id;
        mgr.insert_record_for_test(s);
        assert!(mgr.has_record(id));
        mgr.recall(id).unwrap();
        assert!(!mgr.has_record(id));
        let strip = mgr.recently_recalled(Utc::now());
        assert_eq!(strip.len(), 1);
        assert_eq!(strip[0].scientist.id, id);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn recall_is_idempotent_on_already_recalled() {
        let dir = temp_dir("idempotent");
        let mut mgr = RosterManager::new(dir.clone());
        let s = fresh_scientist();
        let id = s.id;
        mgr.insert_record_for_test(s);
        mgr.recall(id).unwrap();
        // Second recall: no-op, no error.
        mgr.recall(id).unwrap();
        let strip = mgr.recently_recalled(Utc::now());
        assert_eq!(strip.len(), 1);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn recently_recalled_evicts_after_five_minutes() {
        let dir = temp_dir("ttl");
        let mut mgr = RosterManager::new(dir.clone());
        let s = fresh_scientist();
        let id = s.id;
        mgr.insert_record_for_test(s);
        mgr.recall(id).unwrap();
        let future = Utc::now() + chrono::Duration::minutes(6);
        let strip = mgr.recently_recalled(future);
        assert_eq!(strip.len(), 0);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn multiple_scientists_in_same_target_each_get_distinct_ids() {
        let dir = temp_dir("multi-same-target");
        let mut mgr = RosterManager::new(dir.clone());
        let s1 = fresh_scientist();
        let s2 = fresh_scientist();
        let s3 = fresh_scientist();
        assert_ne!(s1.id, s2.id);
        assert_ne!(s2.id, s3.id);
        assert_ne!(s1.id, s3.id);
        mgr.insert_record_for_test(s1);
        mgr.insert_record_for_test(s2);
        mgr.insert_record_for_test(s3);
        // All three live in the same target — Crucible — and all three are
        // in the active roster.
        let roster = mgr.list();
        assert_eq!(roster.len(), 3);
        assert!(roster
            .iter()
            .all(|s| s.target == Target::experiment(ExperimentCodename::Crucible)));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn transition_advances_state_and_persists() {
        let dir = temp_dir("transition");
        let mut mgr = RosterManager::new(dir.clone());
        let s = fresh_scientist();
        let id = s.id;
        mgr.insert_record_for_test(s);
        mgr.transition(id, MissionState::Working);
        let roster = mgr.list();
        let updated = roster.iter().find(|x| x.id == id).unwrap();
        assert_eq!(updated.state, MissionState::Working);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_returns_session_not_found_when_scientist_absent() {
        let dir = temp_dir("notfound");
        let mgr = RosterManager::new(dir.clone());
        let phantom = ScientistId::new();
        let err = mgr.write(phantom, b"hello").unwrap_err();
        match err {
            MezzanineError::SessionNotFound(label) => {
                assert!(label.contains(&phantom.to_string()));
            }
            other => panic!("expected SessionNotFound, got: {other:?}"),
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn snapshot_survives_manager_drop_and_restart() {
        let dir = temp_dir("survive-restart");
        let id;
        {
            let mut mgr = RosterManager::new(dir.clone());
            let s = fresh_scientist();
            id = s.id;
            mgr.insert_record_for_test(s);
            // Trigger persist by performing a recall-then-skip — actually,
            // insert_record_for_test does not persist. Use a transition
            // which does persist.
            mgr.transition(id, MissionState::Awaiting);
        }
        // Restart — new manager reads from same snapshot_dir.
        let mgr2 = RosterManager::new(dir.clone());
        assert!(mgr2.has_record(id));
        let roster = mgr2.list();
        assert_eq!(roster.len(), 1);
        assert_eq!(roster[0].state, MissionState::Awaiting);
        std::fs::remove_dir_all(&dir).ok();
    }
}
