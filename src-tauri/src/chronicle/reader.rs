// Chronicle reader — replays the last N days of an experiment's
// transcripts. The History pane (Phase 2B) calls this to render a
// scrollable read-only feed of past turns.
//
// Files are named `<YYYY-MM-DD>-<session-id>.jsonl`. The reader walks the
// experiment's directory, keeps files whose date prefix is within the
// requested window, sorts them oldest-first, and concatenates the parsed
// turns in order. Malformed lines are skipped with a single warn-log so a
// single corrupted entry doesn't blank the pane.

use crate::chronicle::writer::{experiment_dir, ChronicleTurn};
use crate::error::{WorkbenchError, WorkbenchResult};
use crate::pty::session::ExperimentId;
use chrono::{Duration, Local, NaiveDate};
use std::path::Path;

pub const DEFAULT_HISTORY_DAYS: i64 = 7;

/// Read every chronicle turn for `experiment` whose file date is within
/// `days_back` calendar days of today (local). Returns an empty vec when
/// the experiment directory is missing.
pub fn history(
    base_dir: &Path,
    experiment: ExperimentId,
    days_back: i64,
) -> WorkbenchResult<Vec<ChronicleTurn>> {
    let exp_dir = base_dir.join(experiment_dir(experiment));
    if !exp_dir.exists() {
        return Ok(Vec::new());
    }
    let today = Local::now().date_naive();
    let earliest = today - Duration::days(days_back.max(0));

    let mut files: Vec<(NaiveDate, std::path::PathBuf)> = Vec::new();
    for entry in std::fs::read_dir(&exp_dir).map_err(WorkbenchError::Io)? {
        let entry = entry.map_err(WorkbenchError::Io)?;
        let metadata = entry.metadata().map_err(WorkbenchError::Io)?;
        if !metadata.is_file() {
            continue;
        }
        let filename = entry.file_name().to_string_lossy().to_string();
        let Some(date) = parse_date_prefix(&filename) else {
            continue;
        };
        if date < earliest {
            continue;
        }
        files.push((date, entry.path()));
    }
    files.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

    let mut turns: Vec<ChronicleTurn> = Vec::new();
    for (_, path) in files {
        let body = std::fs::read_to_string(&path).map_err(WorkbenchError::Io)?;
        for (line_no, line) in body.lines().enumerate() {
            if line.trim().is_empty() {
                continue;
            }
            match serde_json::from_str::<ChronicleTurn>(line) {
                Ok(turn) => turns.push(turn),
                Err(err) => {
                    log::warn!(
                        "Workbench: skipping malformed chronicle line — {}:{} ({})",
                        path.display(),
                        line_no + 1,
                        err,
                    );
                }
            }
        }
    }
    Ok(turns)
}

fn parse_date_prefix(filename: &str) -> Option<NaiveDate> {
    if filename.len() < 10 {
        return None;
    }
    if !filename.ends_with(".jsonl") {
        return None;
    }
    NaiveDate::parse_from_str(&filename[..10], "%Y-%m-%d").ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chronicle::writer::{ChronicleWriter, TurnDirection};
    use uuid::Uuid;

    fn tempdir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("workbench-chronicle-rd-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn parse_date_prefix_extracts_iso_date() {
        let date = parse_date_prefix("2026-05-04-abc.jsonl").unwrap();
        assert_eq!(date, NaiveDate::from_ymd_opt(2026, 5, 4).unwrap());
    }

    #[test]
    fn parse_date_prefix_rejects_non_jsonl_files() {
        assert!(parse_date_prefix("2026-05-04-readme.txt").is_none());
        assert!(parse_date_prefix("not-a-date.jsonl").is_none());
        assert!(parse_date_prefix("short.jsonl").is_none());
    }

    #[test]
    fn history_returns_empty_when_directory_missing() {
        let base = tempdir();
        let turns = history(&base, ExperimentId::Crucible, 7).unwrap();
        assert!(turns.is_empty());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn history_replays_today_in_recorded_order() {
        let base = tempdir();
        let writer = ChronicleWriter::new(base.clone());
        writer.set_paused(false);
        writer.begin_session(ExperimentId::Crucible).unwrap();
        writer
            .record(ExperimentId::Crucible, TurnDirection::In, "phpstan\n")
            .unwrap();
        writer
            .record(ExperimentId::Crucible, TurnDirection::Out, "ok\n")
            .unwrap();
        writer.end_session(ExperimentId::Crucible).unwrap();

        let turns = history(&base, ExperimentId::Crucible, 7).unwrap();
        assert_eq!(turns.len(), 2);
        assert_eq!(turns[0].direction, TurnDirection::In);
        assert_eq!(turns[1].direction, TurnDirection::Out);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn history_skips_malformed_lines_without_failing() {
        let base = tempdir();
        let exp_dir = base.join("parlour");
        std::fs::create_dir_all(&exp_dir).unwrap();
        let today = Local::now().date_naive().format("%Y-%m-%d").to_string();
        let path = exp_dir.join(format!("{today}-{}.jsonl", Uuid::new_v4()));
        let body = "{\"ts\":\"2026-05-04T00:00:00Z\",\"direction\":\"in\",\"payload\":\"good\"}\n\
            {not valid json\n\
            {\"ts\":\"2026-05-04T00:00:01Z\",\"direction\":\"out\",\"payload\":\"also good\"}\n";
        std::fs::write(&path, body).unwrap();

        let turns = history(&base, ExperimentId::Parlour, 7).unwrap();
        assert_eq!(
            turns.len(),
            2,
            "malformed line must be skipped, not abort the read"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn history_filters_out_files_older_than_window() {
        let base = tempdir();
        let exp_dir = base.join("smokestacks");
        std::fs::create_dir_all(&exp_dir).unwrap();
        // A file from 30 days ago — should be excluded with a 7-day window.
        let stale_date = Local::now().date_naive() - Duration::days(30);
        let stale = exp_dir.join(format!(
            "{}-{}.jsonl",
            stale_date.format("%Y-%m-%d"),
            Uuid::new_v4()
        ));
        std::fs::write(
            &stale,
            "{\"ts\":\"2026-04-01T00:00:00Z\",\"direction\":\"in\",\"payload\":\"old\"}\n",
        )
        .unwrap();

        let turns = history(&base, ExperimentId::Smokestacks, 7).unwrap();
        assert!(turns.is_empty());
        let _ = std::fs::remove_dir_all(&base);
    }
}
