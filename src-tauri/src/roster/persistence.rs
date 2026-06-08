// Roster persistence — survive the gadget restart.
//
// RD-3 says scientists outlive a gadget close/open cycle. The pty handles
// themselves do not (they're bound to the gadget's process lifetime), but
// the Scientist records do. On restart, the manager reads this snapshot,
// the scientists reappear on the Roster (their state is honoured but their
// ptys are gone — the investor can recall, redispatch, or just leave the
// record sitting until they decide).

use crate::roster::scientist::Scientist;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RosterSnapshot {
    pub scientists: Vec<Scientist>,
}

impl RosterSnapshot {
    pub fn empty() -> Self {
        Self {
            scientists: Vec::new(),
        }
    }
}

/// Resolve the roster snapshot file location given a Tauri app data dir.
pub fn snapshot_path(base: &Path) -> PathBuf {
    base.join("roster.json")
}

/// Read the snapshot from disk. Returns `Ok(empty)` when the file does not
/// exist (first boot) or when its contents are corrupt — the Mezzanine
/// should never refuse to open because of a bad snapshot. A corrupt
/// snapshot is logged and replaced with an empty roster.
pub fn read_snapshot(base: &Path) -> RosterSnapshot {
    let path = snapshot_path(base);
    let Ok(bytes) = std::fs::read(&path) else {
        return RosterSnapshot::empty();
    };
    match serde_json::from_slice::<RosterSnapshot>(&bytes) {
        Ok(snap) => snap,
        Err(err) => {
            log::warn!(
                "Mezzanine: roster snapshot at {} unreadable ({err}) — starting with an empty Roster",
                path.display(),
            );
            RosterSnapshot::empty()
        }
    }
}

/// Write the snapshot to disk atomically (write to temp file + rename) so
/// a crash mid-write cannot leave a corrupt file. Creates parent directory
/// if needed.
pub fn write_snapshot(base: &Path, snapshot: &RosterSnapshot) -> std::io::Result<()> {
    if let Some(parent) = snapshot_path(base).parent() {
        std::fs::create_dir_all(parent)?;
    }
    let path = snapshot_path(base);
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_vec_pretty(snapshot).map_err(std::io::Error::other)?;
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::roster::target::{ExperimentCodename, Target};

    fn temp_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mezzanine-roster-test-{}-{}",
            suffix,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn read_snapshot_returns_empty_when_file_missing() {
        let dir = temp_dir("missing");
        let snap = read_snapshot(&dir);
        assert_eq!(snap.scientists.len(), 0);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn read_snapshot_returns_empty_when_file_corrupt() {
        let dir = temp_dir("corrupt");
        std::fs::write(snapshot_path(&dir), b"not valid json").unwrap();
        let snap = read_snapshot(&dir);
        assert_eq!(snap.scientists.len(), 0);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_then_read_round_trips_scientists() {
        let dir = temp_dir("roundtrip");
        let s = Scientist::new(
            Target::experiment(ExperimentCodename::Crucible),
            "check phpstan".into(),
        );
        let id = s.id;
        let snap = RosterSnapshot {
            scientists: vec![s],
        };
        write_snapshot(&dir, &snap).unwrap();
        let back = read_snapshot(&dir);
        assert_eq!(back.scientists.len(), 1);
        assert_eq!(back.scientists[0].id, id);
        assert_eq!(back.scientists[0].mission, "check phpstan");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_snapshot_creates_parent_dirs() {
        let dir = temp_dir("nested").join("a").join("b");
        let snap = RosterSnapshot::empty();
        write_snapshot(&dir, &snap).unwrap();
        assert!(snapshot_path(&dir).exists());
        std::fs::remove_dir_all(&dir).ok();
    }
}
