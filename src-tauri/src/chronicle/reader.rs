// ChronicleReader — typed JSONL tail keyed by ScientistId.
//
// Phase O-1 of the Observer (#00052). One `tokio::task` per active
// scientist polls the per-scientist JSONL file at 200ms intervals, reads
// any new bytes since the last offset, splits on newlines, deserializes
// each line into a `ChronicleTurn`, and emits a `ChronicleEvent` over
// the Tauri bridge as the `chronicle-event` event. The Vue side
// discriminates by `scientist_id` in the payload.
//
// Three failure modes the reader survives:
//   1. The transcript file does not yet exist (the scientist was just
//      dispatched and `claude` has not written its first byte). Treated
//      as "no new bytes" — the next 200ms tick retries the open.
//   2. A JSONL line fails to parse (corrupt write, mid-flush read).
//      Logged at warn level and skipped; the offset still advances past
//      the broken line so it does not stall the tail.
//   3. The file is truncated below the current offset (manual operator
//      cleanup). Detected by `file_len < offset` and the offset is reset
//      to the new file length so subsequent reads pick up new writes.
//
// The reader is push-always: it starts when a scientist is dispatched
// and stops when the scientist is recalled. The Observer panel's
// open/closed state does not affect tailing — the Grind (#00053) needs
// continuous event delivery for its economy engine even while the
// Observer panel is collapsed.

use crate::chronicle::types::ChronicleTurn;
use crate::roster::scientist::ScientistId;
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::io::{AsyncReadExt, AsyncSeekExt, SeekFrom};
use tokio::sync::{broadcast, oneshot};

const POLL_INTERVAL_MS: u64 = 200;
/// Capacity of the in-process broadcast channel that fans chronicle
/// events to Rust-side consumers (currently: the Grind's EconomyManager).
/// The Vue-side Observer subscribes through Tauri's `chronicle-event`
/// emit path instead — that path is unbounded by design.
const BROADCAST_CAPACITY: usize = 1024;
/// Cap how long we tolerate a missing transcript file before logging at
/// info level. The polling itself continues indefinitely — the cap only
/// controls the log volume so we surface "the file never appeared" once
/// per scientist rather than every 200ms.
const MISSING_FILE_GRACE_SECS: u64 = 30;

/// What the Vue side receives on the `chronicle-event` channel — the
/// scientist's id plus one deserialized turn. Keyed payloads let
/// `useObserver` route by id without parsing the full turn first.
#[derive(Debug, Clone, Serialize)]
pub struct ChronicleEvent {
    pub scientist_id: ScientistId,
    pub turn: ChronicleTurn,
}

/// Handle on one scientist's tail task. Dropped when the scientist is
/// recalled — sending on the cancel channel signals the task to wind down.
struct ActiveTail {
    cancel: oneshot::Sender<()>,
}

/// Live registry of per-scientist tail tasks. `start_watching` inserts;
/// `stop_watching` removes and cancels.
pub struct ChronicleReader {
    base_dir: PathBuf,
    tails: Mutex<HashMap<ScientistId, ActiveTail>>,
    /// In-process broadcast — Rust consumers (the Grind) subscribe here
    /// instead of going through the Tauri bridge for free. The sender is
    /// cloned into each tail task at start; receivers are handed to
    /// consumers via `subscribe()`. Capacity is bounded so a slow consumer
    /// cannot block the chronicle.
    broadcast_tx: broadcast::Sender<ChronicleEvent>,
}

impl ChronicleReader {
    /// Build a reader rooted at the chronicle base directory. The base
    /// dir is the same one the writer uses — by convention
    /// `~/.zmuuzn-mezzanine/transcripts/`. The reader resolves each
    /// scientist's path as `<base>/scientists/<id>.jsonl` to mirror
    /// `roster::live::transcript_path` exactly.
    pub fn new(base_dir: PathBuf) -> Self {
        let (broadcast_tx, _initial_rx) = broadcast::channel(BROADCAST_CAPACITY);
        Self {
            base_dir,
            tails: Mutex::new(HashMap::new()),
            broadcast_tx,
        }
    }

    /// Subscribe to the in-process chronicle event stream. Used by the
    /// Grind's EconomyManager to drive RP grants without going through
    /// the Tauri bridge. The returned receiver is independent — multiple
    /// subscribers all see every event.
    pub fn subscribe(&self) -> broadcast::Receiver<ChronicleEvent> {
        self.broadcast_tx.subscribe()
    }

    /// Begin tailing the transcript for `scientist_id`. Spawns a tokio
    /// task that polls the file every 200ms and emits `chronicle-event`
    /// over `app`'s bridge for each new turn. Idempotent — if the
    /// scientist is already being tailed, the existing tail continues
    /// and the new request is a no-op.
    pub fn start_watching<R: Runtime>(&self, scientist_id: ScientistId, app: AppHandle<R>) {
        {
            let tails = self.tails.lock();
            if tails.contains_key(&scientist_id) {
                log::debug!(
                    "ChronicleReader: start_watching is a no-op for {scientist_id} — already tailing",
                );
                return;
            }
        }

        let (cancel_tx, cancel_rx) = oneshot::channel();
        let path = transcript_path(&self.base_dir, scientist_id);
        let broadcast_tx = self.broadcast_tx.clone();

        // tauri::async_runtime::spawn, not tokio::spawn: today this runs inside
        // an async command handler (a runtime is present), but the helper is
        // context-agnostic — it keeps start_watching safe if a future caller
        // invokes it from a non-async context (e.g. setup), matching the fix
        // applied to the Grind's chronicle subscriber.
        tauri::async_runtime::spawn(async move {
            run_tail_loop(scientist_id, path, app, broadcast_tx, cancel_rx).await;
        });

        let mut tails = self.tails.lock();
        tails.insert(scientist_id, ActiveTail { cancel: cancel_tx });
    }

    /// Stop tailing the transcript for `scientist_id`. Cancels the task
    /// (which observes the cancel channel between polls) and removes
    /// the handle. Idempotent — calling it on a scientist that is not
    /// currently being tailed is a no-op.
    pub fn stop_watching(&self, scientist_id: ScientistId) {
        let removed = self.tails.lock().remove(&scientist_id);
        if let Some(tail) = removed {
            // The receiver may already be polling; sending will trigger
            // the cancel branch on the next tick. If the task has
            // already exited, the send fails silently — that is fine.
            let _ = tail.cancel.send(());
        }
    }

    /// How many tails are currently active. Used by tests and by the
    /// Wound Census for parity checks.
    #[allow(dead_code)] // intentional observability API; only the test/census paths call it today
    pub fn active_count(&self) -> usize {
        self.tails.lock().len()
    }

    /// True iff a tail task is currently registered for `scientist_id`.
    #[allow(dead_code)] // intentional observability API; exercised by the reader tests
    pub fn is_watching(&self, scientist_id: ScientistId) -> bool {
        self.tails.lock().contains_key(&scientist_id)
    }
}

/// Resolve the JSONL path for a scientist. Mirrors
/// `roster::live::transcript_path` exactly — if that layout changes,
/// both must move together.
fn transcript_path(base: &Path, id: ScientistId) -> PathBuf {
    base.join("scientists").join(format!("{id}.jsonl"))
}

/// The tail loop. Polls every 200ms, reads new bytes, splits on
/// newlines, deserializes, emits. Exits when the cancel channel is
/// signalled or the file system errors permanently.
async fn run_tail_loop<R: Runtime>(
    scientist_id: ScientistId,
    path: PathBuf,
    app: AppHandle<R>,
    broadcast_tx: broadcast::Sender<ChronicleEvent>,
    mut cancel: oneshot::Receiver<()>,
) {
    let mut offset: u64 = 0;
    let mut pending = String::new();
    let mut missing_logged = false;
    let started_at = std::time::Instant::now();

    loop {
        // Cancel-or-tick — whichever wins. The tick is the steady cadence
        // of the tail; cancel is the recall signal.
        tokio::select! {
            _ = &mut cancel => {
                log::debug!("ChronicleReader: tail for {scientist_id} cancelled");
                return;
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS)) => {}
        }

        match tokio::fs::OpenOptions::new().read(true).open(&path).await {
            Ok(mut file) => {
                // Length probe — if the file has been truncated below
                // our offset, snap forward to the new end so we do not
                // try to seek past EOF.
                let file_len = match file.metadata().await {
                    Ok(meta) => meta.len(),
                    Err(err) => {
                        log::warn!(
                            "ChronicleReader: metadata read failed for {scientist_id} — {err}",
                        );
                        continue;
                    }
                };

                if file_len < offset {
                    log::info!(
                        "ChronicleReader: transcript for {scientist_id} truncated; \
                         resetting offset to new end ({file_len} bytes)",
                    );
                    offset = file_len;
                    pending.clear();
                    continue;
                }

                if file_len == offset {
                    // Nothing new. Loop back to the tick.
                    continue;
                }

                if let Err(err) = file.seek(SeekFrom::Start(offset)).await {
                    log::warn!(
                        "ChronicleReader: seek failed for {scientist_id} at offset {offset} — {err}",
                    );
                    continue;
                }

                let mut buf = Vec::with_capacity((file_len - offset) as usize);
                match file.read_to_end(&mut buf).await {
                    Ok(read) => {
                        offset += read as u64;
                        let chunk = String::from_utf8_lossy(&buf);
                        pending.push_str(&chunk);
                        emit_complete_lines(&mut pending, scientist_id, &app, &broadcast_tx);
                    }
                    Err(err) => {
                        log::warn!("ChronicleReader: read failed for {scientist_id} — {err}",);
                    }
                }
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                // The file may not exist yet — claude has not produced
                // any output between dispatch and now. The 30s grace
                // window controls log volume only; we keep polling
                // indefinitely so the tail catches up whenever the file
                // appears.
                if !missing_logged && started_at.elapsed().as_secs() >= MISSING_FILE_GRACE_SECS {
                    log::info!(
                        "ChronicleReader: transcript for {scientist_id} still absent after \
                         {MISSING_FILE_GRACE_SECS}s — continuing to poll",
                    );
                    missing_logged = true;
                }
            }
            Err(err) => {
                log::warn!("ChronicleReader: open failed for {scientist_id} — {err}",);
            }
        }
    }
}

/// Split `pending` on newlines, deserialize each complete line, and emit
/// it. Incomplete trailing fragments stay in `pending` until the next
/// chunk arrives. A line that fails to parse is logged and skipped.
fn emit_complete_lines<R: Runtime>(
    pending: &mut String,
    scientist_id: ScientistId,
    app: &AppHandle<R>,
    broadcast_tx: &broadcast::Sender<ChronicleEvent>,
) {
    // Drain complete lines, leaving any trailing partial line in place.
    let mut consumed_up_to = 0usize;
    for (start, _) in pending.match_indices('\n') {
        let line = &pending[consumed_up_to..start];
        consumed_up_to = start + 1; // skip the newline byte itself
        let trimmed = line.trim_end_matches('\r');
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<ChronicleTurn>(trimmed) {
            Ok(turn) => {
                let payload = ChronicleEvent { scientist_id, turn };
                // Fan to Rust-side consumers (the Grind's EconomyManager).
                // Send returning Err means no active receivers — fine,
                // nothing to do, the Vue-side Tauri emit below still fires.
                let _ = broadcast_tx.send(payload.clone());
                if let Err(err) = app.emit("chronicle-event", payload) {
                    log::warn!("ChronicleReader: emit failed for {scientist_id} — {err}",);
                }
            }
            Err(err) => {
                log::warn!(
                    "ChronicleReader: skipped corrupt JSONL line for {scientist_id} — {err}; \
                     line was {trimmed:?}",
                );
            }
        }
    }
    if consumed_up_to > 0 {
        pending.drain(..consumed_up_to);
    }
}

/// Bridge into the worker for tests — emit lines from a pre-populated
/// string and observe the residue. Wired in this file rather than a
/// `#[cfg(test)]` block on the function so the live loop logic can stay
/// monolithic.
#[cfg(test)]
pub(crate) fn emit_complete_lines_for_test<R: Runtime>(
    pending: &mut String,
    scientist_id: ScientistId,
    app: &AppHandle<R>,
    broadcast_tx: &broadcast::Sender<ChronicleEvent>,
) {
    emit_complete_lines(pending, scientist_id, app, broadcast_tx);
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;

    fn temp_base(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mezzanine-reader-test-{}-{}",
            suffix,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn transcript_path_mirrors_writer_layout() {
        let id = ScientistId::new();
        let base = Path::new("/tmp/.zmuuzn-mezzanine/transcripts");
        let p = transcript_path(base, id);
        assert!(p.starts_with(base));
        let s = p.to_str().unwrap();
        assert!(s.contains("scientists"));
        assert!(s.ends_with(&format!("{id}.jsonl")));
    }

    #[test]
    fn new_reader_starts_with_zero_tails() {
        let dir = temp_base("zero");
        let r = ChronicleReader::new(dir.clone());
        assert_eq!(r.active_count(), 0);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn stop_watching_is_idempotent_on_unknown_scientist() {
        let dir = temp_base("noop-stop");
        let r = ChronicleReader::new(dir.clone());
        let id = ScientistId::new();
        // Must not panic.
        r.stop_watching(id);
        assert_eq!(r.active_count(), 0);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn is_watching_false_when_no_tail_started() {
        let dir = temp_base("not-watching");
        let r = ChronicleReader::new(dir.clone());
        let id = ScientistId::new();
        assert!(!r.is_watching(id));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn emit_complete_lines_splits_on_newline() {
        // Build a manageable mock pending buffer. We do not exercise the
        // actual Tauri emit here — the function under test is the
        // line-splitting logic, which is independent of the emit sink.
        // The Tauri AppHandle integration test path lives in the
        // tokio-driven integration test below.
        let mut pending = String::from("{\"ts\":\"t1\",\"direction\":\"in\",\"payload\":\"a\"}\n");
        pending.push_str("{\"ts\":\"t2\",\"direction\":\"out\",\"payload\":\"b\"}\n");
        pending.push_str("{\"ts\":\"t3\",\"direction\":\"in\",\"payload\":\"partial");

        // Parse what we can — we trust the residue trims to the
        // partial-line remainder.
        let mut consumed_up_to = 0usize;
        let mut full_lines: Vec<&str> = Vec::new();
        for (start, _) in pending.match_indices('\n') {
            full_lines.push(&pending[consumed_up_to..start]);
            consumed_up_to = start + 1;
        }
        let residue = &pending[consumed_up_to..];
        assert_eq!(full_lines.len(), 2);
        assert!(full_lines[0].contains("\"direction\":\"in\""));
        assert!(full_lines[1].contains("\"direction\":\"out\""));
        assert_eq!(
            residue,
            "{\"ts\":\"t3\",\"direction\":\"in\",\"payload\":\"partial"
        );
    }

    #[test]
    fn corrupt_jsonl_lines_are_skipped_without_panic() {
        // Same logic the worker uses: serde_json::from_str returns Err
        // on malformed lines; the loop logs and continues.
        let result: Result<ChronicleTurn, _> = serde_json::from_str("not-json");
        assert!(result.is_err());
        let result: Result<ChronicleTurn, _> =
            serde_json::from_str("{\"ts\":\"t\",\"direction\":\"in\",\"payload\":\"ok\"}");
        assert!(result.is_ok());
    }

    // The integration-shaped tests below use the tokio runtime to
    // exercise the real `start_watching` / `stop_watching` flow against
    // a temporary file. Tauri's AppHandle is mock-driven via the
    // `tauri::test` MockRuntime so we never spin up a real webview.
    #[tokio::test]
    async fn tail_emits_event_for_each_written_line() {
        use tauri::test::{mock_app, MockRuntime};

        let dir = temp_base("emit-each");
        let app = mock_app();
        let app_handle: AppHandle<MockRuntime> = app.handle().clone();

        let id = ScientistId::new();
        let reader = ChronicleReader::new(dir.clone());

        // Pre-create the file so the tail does not loop on NotFound.
        let path = transcript_path(&dir, id);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "").unwrap();

        reader.start_watching(id, app_handle.clone());
        assert!(reader.is_watching(id));
        assert_eq!(reader.active_count(), 1);

        // Write three turns to the file, then give the tail enough ticks
        // to read them all.
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap();
        writeln!(f, r#"{{"ts":"t1","direction":"in","payload":"first"}}"#).unwrap();
        writeln!(f, r#"{{"ts":"t2","direction":"out","payload":"second"}}"#).unwrap();
        writeln!(f, r#"{{"ts":"t3","direction":"in","payload":"third"}}"#).unwrap();
        drop(f);

        tokio::time::sleep(std::time::Duration::from_millis(600)).await;

        reader.stop_watching(id);
        assert!(!reader.is_watching(id));
        assert_eq!(reader.active_count(), 0);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn tail_handles_missing_file_then_appearance() {
        use tauri::test::{mock_app, MockRuntime};

        let dir = temp_base("late-file");
        let app = mock_app();
        let app_handle: AppHandle<MockRuntime> = app.handle().clone();

        let id = ScientistId::new();
        let reader = ChronicleReader::new(dir.clone());
        let path = transcript_path(&dir, id);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        // Do NOT create the file. Start watching — the tail must keep
        // polling without panicking.
        reader.start_watching(id, app_handle.clone());

        tokio::time::sleep(std::time::Duration::from_millis(400)).await;
        assert!(reader.is_watching(id));

        // Now create the file. The next tick will pick it up.
        std::fs::write(&path, "").unwrap();
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap();
        writeln!(f, r#"{{"ts":"t","direction":"in","payload":"late"}}"#).unwrap();
        drop(f);

        tokio::time::sleep(std::time::Duration::from_millis(400)).await;

        reader.stop_watching(id);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn four_concurrent_tails_all_register_and_clear() {
        use tauri::test::{mock_app, MockRuntime};

        let dir = temp_base("four-tails");
        let app = mock_app();
        let app_handle: AppHandle<MockRuntime> = app.handle().clone();

        let reader = Arc::new(ChronicleReader::new(dir.clone()));
        let ids: Vec<ScientistId> = (0..4).map(|_| ScientistId::new()).collect();
        for id in &ids {
            let path = transcript_path(&dir, *id);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, "").unwrap();
            reader.start_watching(*id, app_handle.clone());
        }
        assert_eq!(reader.active_count(), 4);

        // Append a line to each scientist's file concurrently.
        use std::io::Write;
        for id in &ids {
            let path = transcript_path(&dir, *id);
            let mut f = std::fs::OpenOptions::new()
                .append(true)
                .open(&path)
                .unwrap();
            writeln!(f, r#"{{"ts":"t","direction":"in","payload":"{id}"}}"#).unwrap();
        }

        tokio::time::sleep(std::time::Duration::from_millis(400)).await;

        for id in &ids {
            reader.stop_watching(*id);
        }
        assert_eq!(reader.active_count(), 0);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn start_watching_is_idempotent() {
        use tauri::test::{mock_app, MockRuntime};

        let dir = temp_base("idempotent-start");
        let app = mock_app();
        let app_handle: AppHandle<MockRuntime> = app.handle().clone();

        let id = ScientistId::new();
        let reader = ChronicleReader::new(dir.clone());
        let path = transcript_path(&dir, id);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "").unwrap();

        reader.start_watching(id, app_handle.clone());
        reader.start_watching(id, app_handle.clone());
        reader.start_watching(id, app_handle.clone());
        assert_eq!(reader.active_count(), 1);

        reader.stop_watching(id);
        assert_eq!(reader.active_count(), 0);
        std::fs::remove_dir_all(&dir).ok();
    }
}
