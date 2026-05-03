// LivePtySession — a single experiment's grip on the vise, alive.
//
// Each live session owns:
//   * the pty master end (kept alive so the slave's TTY stays valid)
//   * a Mutex-wrapped writer (for command bar input)
//   * a shared Arc<Mutex<Child>> (so the reader thread can `wait()` on
//     exit while the manager can `kill()` from the outside — both go
//     through the same Mutex, no double-locking)
//   * a clone of the global ChronicleWriter (Phase 2B) so every input
//     and output byte stream is appended to disk as a JSONL turn
//
// The reader thread is spawned at construction. It reads from the master
// in 4 KiB chunks, emits each chunk as a `pty-output` Tauri event, and on
// EOF calls `child.wait()` and emits a `pty-exit` event with the exit
// code. When LivePtySession drops, the master drops, the reader's read()
// returns EOF, and the thread exits cleanly.

use crate::chronicle::{ChronicleWriter, TurnDirection};
use crate::error::{WorkbenchError, WorkbenchResult};
use crate::pty::output::{ExitPayload, OutputPayload};
use crate::pty::session::ExperimentId;
use crate::pty::substrate::{build_command, SessionSpec};
use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime};

/// Default master size for a freshly spawned session. Phase 1C does not
/// yet thread real terminal-size events from the canvas; this approximates
/// the canvas's typical viewport. A `resize` command lands later.
const DEFAULT_PTY_SIZE: PtySize = PtySize {
    rows: 40,
    cols: 132,
    pixel_width: 0,
    pixel_height: 0,
};

pub struct LivePtySession {
    writer: Mutex<Box<dyn Write + Send>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    chronicle: Arc<ChronicleWriter>,
    experiment: ExperimentId,
    // The master is kept alive to keep the TTY pair valid while the slave
    // process holds it. Dropped implicitly when the session drops.
    _master: Mutex<Box<dyn MasterPty + Send>>,
}

impl LivePtySession {
    /// Spawn a pty wrapping the substrate command for `spec`, and start a
    /// reader thread that emits `pty-output` / `pty-exit` events on `app`
    /// and chronicles every chunk through `chronicle`.
    pub fn spawn<R: Runtime>(
        spec: &SessionSpec,
        experiment: ExperimentId,
        chronicle: Arc<ChronicleWriter>,
        app: AppHandle<R>,
    ) -> WorkbenchResult<Self> {
        log::info!(
            "Workbench: tightening the vise on {} — cwd {}",
            experiment.label(),
            spec.working_dir.display(),
        );

        chronicle.begin_session(experiment)?;

        let pty = native_pty_system()
            .openpty(DEFAULT_PTY_SIZE)
            .map_err(|e| WorkbenchError::PtySpawn(format!("openpty failed: {e}")))?;

        let cmd = build_command(spec);
        let child = pty
            .slave
            .spawn_command(cmd)
            .map_err(|e| WorkbenchError::PtySpawn(format!("spawn_command failed: {e}")))?;

        // Drop the slave handle — the child holds it open from its end.
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
        let chronicle_for_reader = chronicle.clone();
        std::thread::spawn(move || {
            run_reader_loop(
                reader,
                experiment,
                child_for_reader,
                chronicle_for_reader,
                app_for_reader,
            );
        });

        Ok(Self {
            writer: Mutex::new(writer),
            child,
            chronicle,
            experiment,
            _master: Mutex::new(pty.master),
        })
    }

    /// Write `bytes` to the pty's stdin and flush. Returns an io error if
    /// the pty has been closed (e.g. claude exited). The same payload is
    /// recorded as an `in` turn in the chronicle before the write — if
    /// the chronicle errors, the write still happens (chronicle failures
    /// must never block the bench).
    pub fn write(&self, bytes: &[u8]) -> WorkbenchResult<()> {
        if let Err(err) = self
            .chronicle
            .record(self.experiment, TurnDirection::In, &decode_chunk(bytes))
        {
            log::warn!(
                "Workbench: chronicle 'in' record dropped for {} — {err}",
                self.experiment.label(),
            );
        }
        let mut w = self.writer.lock();
        w.write_all(bytes)?;
        w.flush()?;
        Ok(())
    }

    /// Send SIGKILL (or platform equivalent) to the wrapped child. The
    /// reader thread will observe EOF, call `wait()`, and emit `pty-exit`.
    /// The chronicle's session entry is closed here so the next spawn
    /// opens a fresh file.
    pub fn kill_child(&self) {
        let mut c = self.child.lock();
        let _ = c.kill();
        if let Err(err) = self.chronicle.end_session(self.experiment) {
            log::warn!(
                "Workbench: chronicle end_session failed for {} — {err}",
                self.experiment.label(),
            );
        }
    }
}

fn run_reader_loop<R: Runtime>(
    mut reader: Box<dyn Read + Send>,
    experiment: ExperimentId,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    chronicle: Arc<ChronicleWriter>,
    app: AppHandle<R>,
) {
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let chunk = decode_chunk(&buf[..n]);
                if let Err(err) = chronicle.record(experiment, TurnDirection::Out, &chunk) {
                    log::warn!(
                        "Workbench: chronicle 'out' record dropped for {} — {err}",
                        experiment.label(),
                    );
                }
                let _ = app.emit("pty-output", OutputPayload { experiment, chunk });
            }
            Err(_) => break,
        }
    }
    // EOF or error — child has either exited or the pty was closed. Wait
    // to harvest the exit code. wait() blocks; if the child is already
    // gone it returns immediately.
    let exit_code = match child.lock().wait() {
        Ok(status) => i32::try_from(status.exit_code()).unwrap_or(-1),
        Err(_) => -1,
    };
    let _ = app.emit(
        "pty-exit",
        ExitPayload {
            experiment,
            exit_code,
        },
    );
}

fn decode_chunk(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).to_string()
}
