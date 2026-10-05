// The Semaphore — the balcony end of the lab's Semaphore mod (2026-10-02).
//
// The Observer used to infer each colleague's activity from raw pty bytes,
// and the inference never matched: every figure on the Long Bench sat idle.
// The lab's `.claude/mods/semaphore/` mod, loaded into the Mad Scientist's
// Claude session, now reports what that session really does (turns, tool
// calls, permission asks, and every minion the Agent tool sends out) as a
// snapshot JSON it overwrites at `MEZZANINE_SEMAPHORE_PATH`.
//
// The substrate exports that path as `<lab>/SNAPSHOT_DIR/<scientist-id>.json`,
// and this watcher reads the same file from the host side (a `\\wsl$\…` UNC
// path on Windows, via `host_paths::resolve_for_std_fs`). It polls the
// file's size and mtime every POLL_INTERVAL_MS and emits `scientist-signal`
// when a newer board arrives. A half-written file fails to parse and is
// simply read again on the next tick; a missing file (a session without the
// mod, the Heretic) emits nothing, so the Observer keeps its old path.
//
// A board already on disk when the watch starts is never emitted. The
// roster survives a restart and the pty does not, so that board belongs to
// a dead session that may never have written `ended`; read as live, it
// would pin the figure. A live session's next write moves the stamp.

use crate::roster::scientist::ScientistId;
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::oneshot;

/// Lab-relative folder the mod writes its boards into (gitignored by the lab).
pub const SNAPSHOT_DIR: &str = ".claude/mods/semaphore/var";

const POLL_INTERVAL_MS: u64 = 200;

/// The lab-relative snapshot path for one scientist.
pub fn snapshot_relative(id: &str) -> String {
    format!("{SNAPSHOT_DIR}/{id}.json")
}

/// What the Vue side receives on `scientist-signal`: whose board, and the
/// board itself as the mod wrote it (schema `v: 1`, see the mod's README).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemaphoreSignal {
    pub scientist_id: ScientistId,
    pub board: serde_json::Value,
}

/// Parses one read of the snapshot. Returns the board and its `at` stamp
/// when it is a v1 board newer than `last_at`; `None` for a partial write,
/// another schema, or a board already emitted. `at` (not `seq`) orders
/// boards, because a reloaded mod restarts its `seq` at zero.
pub fn accept(raw: &str, last_at: Option<u64>) -> Option<(u64, serde_json::Value)> {
    let board: serde_json::Value = serde_json::from_str(raw).ok()?;
    if board.get("v")?.as_u64()? != 1 {
        return None;
    }
    let at = board.get("at")?.as_u64()?;
    if last_at.is_some_and(|last| at <= last) {
        return None;
    }
    Some((at, board))
}

#[derive(Default)]
pub struct SemaphoreWatcher {
    watches: Mutex<HashMap<ScientistId, oneshot::Sender<()>>>,
}

impl SemaphoreWatcher {
    pub fn new() -> Self {
        Self::default()
    }

    /// Begin watching `path` for `scientist_id`'s board. Idempotent.
    pub fn start<R: Runtime>(&self, scientist_id: ScientistId, path: PathBuf, app: AppHandle<R>) {
        let mut watches = self.watches.lock();
        if watches.contains_key(&scientist_id) {
            return;
        }
        let (cancel_tx, cancel_rx) = oneshot::channel();
        watches.insert(scientist_id, cancel_tx);
        tauri::async_runtime::spawn(async move {
            run_watch(scientist_id, path, app, cancel_rx).await;
        });
    }

    /// Stop watching. Idempotent.
    pub fn stop(&self, scientist_id: ScientistId) {
        if let Some(cancel) = self.watches.lock().remove(&scientist_id) {
            let _ = cancel.send(());
        }
    }

    #[cfg(test)]
    pub fn is_watching(&self, scientist_id: ScientistId) -> bool {
        self.watches.lock().contains_key(&scientist_id)
    }
}

/// The file's size and mtime, or `None` while it does not exist.
async fn file_stamp(path: &Path) -> Option<(u64, SystemTime)> {
    let meta = tokio::fs::metadata(path).await.ok()?;
    Some((
        meta.len(),
        meta.modified().unwrap_or(SystemTime::UNIX_EPOCH),
    ))
}

async fn run_watch<R: Runtime>(
    scientist_id: ScientistId,
    path: PathBuf,
    app: AppHandle<R>,
    mut cancel: oneshot::Receiver<()>,
) {
    let mut stamp = file_stamp(&path).await;
    let mut last_at: Option<u64> = None;
    loop {
        tokio::select! {
            _ = &mut cancel => return,
            _ = tokio::time::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS)) => {}
        }
        let Some(now_stamp) = file_stamp(&path).await else {
            continue;
        };
        if stamp == Some(now_stamp) {
            continue;
        }
        let Ok(raw) = tokio::fs::read_to_string(&path).await else {
            continue;
        };
        // Only a board that parses moves the stamp: a half-written file is read again.
        let Some((at, board)) = accept(&raw, last_at) else {
            if serde_json::from_str::<serde_json::Value>(&raw).is_ok() {
                stamp = Some(now_stamp);
            }
            continue;
        };
        stamp = Some(now_stamp);
        last_at = Some(at);
        let _ = app.emit(
            "scientist-signal",
            SemaphoreSignal {
                scientist_id,
                board,
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn board(at: u64) -> String {
        format!(
            r#"{{"v":1,"seq":3,"at":{at},"scientist":{{"state":"reading","detail":"Reading a.rs","since":1}},"minions":[],"departed":[]}}"#
        )
    }

    #[test]
    fn snapshot_path_sits_in_the_mods_gitignored_var_folder() {
        assert_eq!(
            snapshot_relative("85a7ed21-46d8-4c75-a4f7-cd2e13f3139d"),
            ".claude/mods/semaphore/var/85a7ed21-46d8-4c75-a4f7-cd2e13f3139d.json"
        );
    }

    #[test]
    fn a_first_v1_board_is_accepted_with_its_stamp() {
        let (at, value) = accept(&board(100), None).expect("accepted");
        assert_eq!(at, 100);
        assert_eq!(value["scientist"]["state"], "reading");
    }

    #[test]
    fn only_a_newer_board_is_accepted_even_when_seq_restarts() {
        assert!(accept(&board(100), Some(100)).is_none());
        assert!(accept(&board(99), Some(100)).is_none());
        assert!(accept(&board(101), Some(100)).is_some());
    }

    #[test]
    fn a_half_written_or_foreign_file_is_not_a_board() {
        assert!(accept(r#"{"v":1,"seq":3,"at":1"#, None).is_none());
        assert!(accept(r#"{"v":2,"at":5}"#, None).is_none());
        assert!(accept(r#"{"v":1}"#, None).is_none());
        assert!(accept("", None).is_none());
    }

    #[test]
    fn the_signal_crosses_the_bridge_in_camel_case() {
        let id = ScientistId::default();
        let json = serde_json::to_value(SemaphoreSignal {
            scientist_id: id,
            board: serde_json::json!({"v": 1}),
        })
        .unwrap();
        assert!(
            json.get("scientistId").is_some(),
            "the Vue side reads scientistId: {json}"
        );
        assert!(json.get("scientist_id").is_none());
    }

    // The general's review of #159: a dead session's last board, already on
    // disk when the watch starts, must not be read as live; the next write
    // (a live session's own board) must be.
    #[tokio::test]
    async fn a_board_left_on_disk_before_the_watch_is_never_emitted() {
        use std::sync::Arc;
        use tauri::test::{mock_app, MockRuntime};
        use tauri::Listener;

        let dir = std::env::temp_dir().join(format!("semaphore-stale-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("board.json");
        std::fs::write(&path, board(100)).unwrap();

        let app = mock_app();
        let app_handle: AppHandle<MockRuntime> = app.handle().clone();
        let heard = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = heard.clone();
        app_handle.listen("scientist-signal", move |event| {
            sink.lock().push(event.payload().to_string());
        });

        let watcher = SemaphoreWatcher::new();
        let id = ScientistId::new();
        watcher.start(id, path.clone(), app_handle);
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        assert!(
            heard.lock().is_empty(),
            "stale board emitted: {:?}",
            heard.lock()
        );

        std::fs::write(&path, board(200)).unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        watcher.stop(id);

        let heard = heard.lock();
        assert_eq!(heard.len(), 1, "{heard:?}");
        assert!(heard[0].contains(r#""at":200"#), "{}", heard[0]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn start_and_stop_are_idempotent() {
        let watcher = SemaphoreWatcher::new();
        let id = ScientistId::default();
        watcher.stop(id);
        assert!(!watcher.is_watching(id));
    }
}
