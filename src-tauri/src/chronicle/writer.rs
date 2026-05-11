// ChronicleWriter — the bench's stenographer.
//
// One writer instance per app, shared as `Arc<ChronicleWriter>`. It owns
// a per-experiment `ActiveChronicle` (session id, current local date,
// open file handle) and rotates the file when the local calendar day
// crosses midnight. The writer is paused at construction; `set_paused`
// is flipped to `false` once the investor acknowledges the privacy
// disclosure.

use crate::error::{MezzanineError, MezzanineResult};
use crate::pty::session::ExperimentId;
use chrono::{DateTime, Local, NaiveDate, Utc};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TurnDirection {
    In,
    Out,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChronicleTurn {
    pub ts: DateTime<Utc>,
    pub direction: TurnDirection,
    pub payload: String,
}

struct ActiveChronicle {
    session_id: Uuid,
    current_date: NaiveDate,
    file: BufWriter<File>,
}

pub struct ChronicleWriter {
    base_dir: PathBuf,
    sessions: Mutex<HashMap<ExperimentId, ActiveChronicle>>,
    paused: Mutex<bool>,
}

impl ChronicleWriter {
    /// Build a writer rooted at `base_dir` (Phase 2A: typically
    /// `~/.zmuuzn-mezzanine/transcripts/`; bench-era directory is
    /// migrated by `chronicle::migration` on first Mezzanine boot). The
    /// writer starts paused — the disclosure-ack flow flips it to active
    /// once the investor acknowledges the privacy notice.
    pub fn new(base_dir: PathBuf) -> Self {
        Self {
            base_dir,
            sessions: Mutex::new(HashMap::new()),
            paused: Mutex::new(true),
        }
    }

    pub fn base_dir(&self) -> &Path {
        &self.base_dir
    }

    pub fn set_paused(&self, paused: bool) {
        *self.paused.lock() = paused;
    }

    pub fn is_paused(&self) -> bool {
        *self.paused.lock()
    }

    /// Open a fresh chronicle file for `experiment`. Returns the new
    /// session id. Existing entries are closed (BufWriter dropped) before
    /// the new file is opened. While paused this is a no-op that returns
    /// a fresh uuid the manager can still hold for traceability.
    pub fn begin_session(&self, experiment: ExperimentId) -> MezzanineResult<Uuid> {
        let session_id = Uuid::new_v4();
        if self.is_paused() {
            return Ok(session_id);
        }
        let date = Local::now().date_naive();
        let path = transcript_path(&self.base_dir, experiment, date, session_id);
        let file = open_append(&path)?;
        let active = ActiveChronicle {
            session_id,
            current_date: date,
            file,
        };
        let mut guard = self.sessions.lock();
        guard.insert(experiment, active);
        Ok(session_id)
    }

    /// Append a JSONL turn to the live chronicle for `experiment`. If the
    /// local calendar day has rolled over since the last record, the
    /// underlying file is rotated to `<new-date>-<session-id>.jsonl`
    /// before the line is written. Records made while the writer is
    /// paused are dropped silently.
    pub fn record(
        &self,
        experiment: ExperimentId,
        direction: TurnDirection,
        payload: &str,
    ) -> MezzanineResult<()> {
        if self.is_paused() {
            return Ok(());
        }
        let now_local = Local::now();
        let now_date = now_local.date_naive();
        let now_utc = now_local.with_timezone(&Utc);
        let mut guard = self.sessions.lock();
        let Some(entry) = guard.get_mut(&experiment) else {
            return Ok(()); // No active session for this experiment.
        };
        if entry.current_date != now_date {
            let path = transcript_path(&self.base_dir, experiment, now_date, entry.session_id);
            entry.file = open_append(&path)?;
            entry.current_date = now_date;
        }
        let turn = ChronicleTurn {
            ts: now_utc,
            direction,
            payload: payload.to_string(),
        };
        let line = serde_json::to_string(&turn)?;
        entry.file.write_all(line.as_bytes())?;
        entry.file.write_all(b"\n")?;
        entry.file.flush()?;
        Ok(())
    }

    /// Drop the file handle for `experiment` so its writes are flushed
    /// and the next `begin_session` opens a fresh file. Called from
    /// PtyManager::kill when a session ends.
    pub fn end_session(&self, experiment: ExperimentId) -> MezzanineResult<()> {
        let mut guard = self.sessions.lock();
        if let Some(mut entry) = guard.remove(&experiment) {
            entry.file.flush()?;
        }
        Ok(())
    }
}

fn open_append(path: &Path) -> MezzanineResult<BufWriter<File>> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(MezzanineError::Io)?;
    }
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(MezzanineError::Io)?;
    Ok(BufWriter::new(file))
}

/// Build the per-day transcript path for `experiment`. Pure function so
/// the layout is unit-testable without touching the filesystem.
pub(crate) fn transcript_path(
    base_dir: &Path,
    experiment: ExperimentId,
    date: NaiveDate,
    session_id: Uuid,
) -> PathBuf {
    base_dir.join(experiment_dir(experiment)).join(format!(
        "{}-{}.jsonl",
        date.format("%Y-%m-%d"),
        session_id
    ))
}

pub(crate) fn experiment_dir(experiment: ExperimentId) -> &'static str {
    // Kebab-case so the directory name matches the JSON wire form the
    // frontend already uses. Avoids ad-hoc remapping at read time.
    match experiment {
        ExperimentId::Gatekeeper => "gatekeeper",
        ExperimentId::WarTable => "war-table",
        ExperimentId::Crucible => "crucible",
        ExperimentId::Parlour => "parlour",
        ExperimentId::Smokestacks => "smokestacks",
        ExperimentId::Horadrim => "horadrim",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tempdir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("workbench-chronicle-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn transcript_path_lays_out_per_experiment_per_day() {
        let id = Uuid::nil();
        let path = transcript_path(
            Path::new("/tmp/transcripts"),
            ExperimentId::Crucible,
            NaiveDate::from_ymd_opt(2026, 5, 4).unwrap(),
            id,
        );
        assert!(path.ends_with("crucible/2026-05-04-00000000-0000-0000-0000-000000000000.jsonl"));
    }

    #[test]
    fn experiment_dir_uses_kebab_case() {
        assert_eq!(experiment_dir(ExperimentId::WarTable), "war-table");
        assert_eq!(experiment_dir(ExperimentId::Crucible), "crucible");
    }

    #[test]
    fn paused_writer_swallows_records_without_io() {
        let base = tempdir();
        let writer = ChronicleWriter::new(base.clone());
        // Writer is paused by construction; begin_session is a no-op for I/O.
        let _id = writer.begin_session(ExperimentId::Crucible).unwrap();
        writer
            .record(ExperimentId::Crucible, TurnDirection::In, "phpstan\n")
            .unwrap();
        // No file should have been written.
        assert!(!base.join("crucible").exists());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn unpaused_writer_appends_jsonl_per_turn() {
        let base = tempdir();
        let writer = ChronicleWriter::new(base.clone());
        writer.set_paused(false);
        let session_id = writer.begin_session(ExperimentId::Crucible).unwrap();
        writer
            .record(ExperimentId::Crucible, TurnDirection::In, "phpstan\n")
            .unwrap();
        writer
            .record(ExperimentId::Crucible, TurnDirection::Out, "ok\n")
            .unwrap();
        writer.end_session(ExperimentId::Crucible).unwrap();

        let date = Local::now().date_naive();
        let path = transcript_path(&base, ExperimentId::Crucible, date, session_id);
        let body = std::fs::read_to_string(&path).unwrap();
        let lines: Vec<&str> = body.lines().collect();
        assert_eq!(lines.len(), 2);
        let first: ChronicleTurn = serde_json::from_str(lines[0]).unwrap();
        let second: ChronicleTurn = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(first.direction, TurnDirection::In);
        assert_eq!(first.payload, "phpstan\n");
        assert_eq!(second.direction, TurnDirection::Out);
        assert_eq!(second.payload, "ok\n");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn end_session_drops_handle_so_next_begin_opens_fresh_file() {
        let base = tempdir();
        let writer = ChronicleWriter::new(base.clone());
        writer.set_paused(false);
        let id_a = writer.begin_session(ExperimentId::Parlour).unwrap();
        writer
            .record(ExperimentId::Parlour, TurnDirection::In, "a\n")
            .unwrap();
        writer.end_session(ExperimentId::Parlour).unwrap();

        let id_b = writer.begin_session(ExperimentId::Parlour).unwrap();
        assert_ne!(id_a, id_b);
        writer
            .record(ExperimentId::Parlour, TurnDirection::In, "b\n")
            .unwrap();
        writer.end_session(ExperimentId::Parlour).unwrap();

        let dir = base.join("parlour");
        let entries: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(
            entries.len(),
            2,
            "two chronicle files expected — one per session"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn record_without_active_session_is_silent_noop() {
        let base = tempdir();
        let writer = ChronicleWriter::new(base.clone());
        writer.set_paused(false);
        // No begin_session — record should not error and should not create files.
        writer
            .record(ExperimentId::Horadrim, TurnDirection::Out, "drift\n")
            .unwrap();
        assert!(!base.join("horadrim").exists());
        let _ = std::fs::remove_dir_all(&base);
    }
}
