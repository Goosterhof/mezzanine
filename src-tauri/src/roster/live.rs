// LiveScientistSession — one dispatched scientist's pty, alive.
//
// Mirrors the bench-era LivePtySession but keyed by ScientistId rather
// than ExperimentId. Two separate event names cross the bridge so the
// frontend (when it lands the Mezzanine slice) can subscribe to scientist
// events without colliding with the bench-era pty events.
//
// Chronicle layout: one JSONL file per scientist at
// `<chronicle_base>/scientists/<scientist-id>.jsonl`. No daily rotation —
// scientists are typically short-lived dispatches that recall closes.
// The transcript stays on disk after recall (the Mezzanine's 5-minute
// recall-strip is a UI affordance; the chronicle is a permanent record).

use crate::error::{WorkbenchError, WorkbenchResult};
use crate::pty::substrate::{build_command, SessionSpec};
use crate::roster::scientist::ScientistId;
use chrono::Utc;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, MasterPty, PtySize};
use serde::Serialize;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime};

const DEFAULT_PTY_SIZE: PtySize = PtySize {
    rows: 40,
    cols: 132,
    pixel_width: 0,
    pixel_height: 0,
};

#[derive(Debug, Clone, Serialize)]
pub struct ScientistOutputPayload {
    pub scientist: ScientistId,
    pub chunk: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScientistExitPayload {
    pub scientist: ScientistId,
    pub exit_code: i32,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TurnDirection {
    In,
    Out,
}

#[derive(Debug, Serialize)]
struct ChronicleTurn<'a> {
    ts: String,
    direction: TurnDirection,
    payload: &'a str,
}

pub struct LiveScientistSession {
    writer: Mutex<Box<dyn Write + Send>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    scientist: ScientistId,
    transcript_path: PathBuf,
}

impl LiveScientistSession {
    /// Spawn a pty wrapping the substrate command for `spec` and start a
    /// reader thread that emits `scientist-output` / `scientist-exit`
    /// events on `app` and appends every chunk to the scientist's
    /// transcript at `<chronicle_base>/scientists/<id>.jsonl`.
    pub fn spawn<R: Runtime>(
        spec: &SessionSpec,
        scientist: ScientistId,
        chronicle_base: PathBuf,
        app: AppHandle<R>,
    ) -> WorkbenchResult<Self> {
        log::info!(
            "Mezzanine: dispatching scientist {scientist} — cwd {}",
            spec.working_dir.display(),
        );

        let transcript_path = transcript_path(&chronicle_base, scientist);
        if let Some(parent) = transcript_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| WorkbenchError::Chronicle(format!("mkdir: {e}")))?;
        }

        let pty = native_pty_system()
            .openpty(DEFAULT_PTY_SIZE)
            .map_err(|e| WorkbenchError::PtySpawn(format!("openpty failed: {e}")))?;

        let cmd = build_command(spec);
        let child = pty
            .slave
            .spawn_command(cmd)
            .map_err(|e| WorkbenchError::PtySpawn(format!("spawn_command failed: {e}")))?;

        drop(pty.slave);

        let writer = pty
            .master
            .take_writer()
            .map_err(|e| WorkbenchError::PtySpawn(format!("take_writer failed: {e}")))?;
        let reader = pty
            .master
            .try_clone_reader()
            .map_err(|e| WorkbenchError::PtySpawn(format!("try_clone_reader failed: {e}")))?;

        let child = Arc::new(Mutex::new(child));
        let child_for_reader = child.clone();
        let app_for_reader = app;
        let transcript_for_reader = transcript_path.clone();
        std::thread::spawn(move || {
            run_reader_loop(
                reader,
                scientist,
                child_for_reader,
                transcript_for_reader,
                app_for_reader,
            );
        });

        Ok(Self {
            writer: Mutex::new(writer),
            child,
            master: Mutex::new(pty.master),
            scientist,
            transcript_path,
        })
    }

    pub fn resize(&self, cols: u16, rows: u16) -> WorkbenchResult<()> {
        let size = PtySize {
            cols,
            rows,
            pixel_width: 0,
            pixel_height: 0,
        };
        self.master
            .lock()
            .resize(size)
            .map_err(|e| WorkbenchError::PtySpawn(format!("resize failed: {e}")))
    }

    /// Write `bytes` to the pty's stdin and flush. Records an `in` turn in
    /// the scientist's transcript before the write — chronicle failures
    /// are logged and ignored (the dispatch must not be blocked by a
    /// transcript I/O error).
    pub fn write(&self, bytes: &[u8]) -> WorkbenchResult<()> {
        let chunk = String::from_utf8_lossy(bytes);
        if let Err(err) = append_turn(&self.transcript_path, TurnDirection::In, &chunk) {
            log::warn!(
                "Mezzanine: chronicle 'in' record dropped for scientist {} — {err}",
                self.scientist,
            );
        }
        let mut w = self.writer.lock();
        w.write_all(bytes)?;
        w.flush()?;
        Ok(())
    }

    /// Kill the wrapped child. The reader thread observes EOF, calls
    /// `wait()` to harvest the exit code, emits `scientist-exit`, and the
    /// transcript file is closed via file-handle drop.
    pub fn kill_child(&self) {
        let mut c = self.child.lock();
        let _ = c.kill();
    }
}

fn run_reader_loop<R: Runtime>(
    mut reader: Box<dyn Read + Send>,
    scientist: ScientistId,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    transcript_path: PathBuf,
    app: AppHandle<R>,
) {
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                if let Err(err) = append_turn(&transcript_path, TurnDirection::Out, &chunk) {
                    log::warn!(
                        "Mezzanine: chronicle 'out' record dropped for scientist {scientist} — {err}",
                    );
                }
                let _ = app.emit(
                    "scientist-output",
                    ScientistOutputPayload {
                        scientist,
                        chunk,
                    },
                );
            }
            Err(_) => break,
        }
    }
    let exit_code = match child.lock().wait() {
        Ok(status) => i32::try_from(status.exit_code()).unwrap_or(-1),
        Err(_) => -1,
    };
    let _ = app.emit(
        "scientist-exit",
        ScientistExitPayload {
            scientist,
            exit_code,
        },
    );
}

/// Path to a scientist's transcript file. Per-scientist single file at
/// `<base>/scientists/<id>.jsonl` — no daily rotation since scientists
/// are typically short-lived dispatches.
pub fn transcript_path(base: &std::path::Path, id: ScientistId) -> PathBuf {
    base.join("scientists").join(format!("{id}.jsonl"))
}

fn append_turn(
    path: &std::path::Path,
    direction: TurnDirection,
    payload: &str,
) -> std::io::Result<()> {
    let turn = ChronicleTurn {
        ts: Utc::now().to_rfc3339(),
        direction,
        payload,
    };
    let line = serde_json::to_string(&turn)
        .map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err))?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    use std::io::Write;
    writeln!(file, "{line}")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mezzanine-scientist-live-test-{}-{}",
            suffix,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn transcript_path_lays_out_per_scientist() {
        let id = ScientistId::new();
        let base = std::path::Path::new("/tmp/.zmuuzn-mezzanine/transcripts");
        let path = transcript_path(base, id);
        assert!(path.starts_with(base));
        assert!(path.to_str().unwrap().contains("scientists"));
        assert!(path.to_str().unwrap().ends_with(&format!("{id}.jsonl")));
    }

    #[test]
    fn append_turn_writes_jsonl_line() {
        let dir = temp_dir("append");
        let path = dir.join("test.jsonl");
        append_turn(&path, TurnDirection::In, "hello").unwrap();
        append_turn(&path, TurnDirection::Out, "world").unwrap();
        let contents = std::fs::read_to_string(&path).unwrap();
        let lines: Vec<&str> = contents.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].contains(r#""direction":"in""#));
        assert!(lines[0].contains(r#""payload":"hello""#));
        assert!(lines[1].contains(r#""direction":"out""#));
        assert!(lines[1].contains(r#""payload":"world""#));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn append_turn_appends_to_existing_file() {
        let dir = temp_dir("append-existing");
        let path = dir.join("test.jsonl");
        std::fs::write(&path, "{\"ts\":\"prior\",\"direction\":\"in\",\"payload\":\"x\"}\n").unwrap();
        append_turn(&path, TurnDirection::Out, "second").unwrap();
        let contents = std::fs::read_to_string(&path).unwrap();
        let lines: Vec<&str> = contents.lines().collect();
        assert_eq!(lines.len(), 2);
        std::fs::remove_dir_all(&dir).ok();
    }
}
