//! Read-only projection of the exact tube-bound Codex thread. The interactive
//! CLI remains the session owner; this process never starts/resumes a thread.
mod protocol;

pub use protocol::{ChatPage, ChatReader};

use crate::error::{MezzanineError, MezzanineResult};
use crate::roster::scientist::{Colleague, ScientistId};
use crate::state::AppState;
use parking_lot::Mutex;
use serde_json::Value;
use std::sync::Arc;
use tauri::State;

/// Never wait for the reader's bounded I/O or child shutdown on the UI thread.
/// Recall targets one UUID so its delayed cleanup cannot retire a new bench.
pub fn retire_reader(
    reader: Arc<Mutex<Option<ChatReader>>>,
    scientist: Option<ScientistId>,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let retired = {
            let mut slot = reader.lock();
            if scientist.is_none()
                || slot
                    .as_ref()
                    .is_some_and(|r| scientist.is_some_and(|id| r.belongs_to(id)))
            {
                slot.take()
            } else {
                None
            }
        };
        drop(retired);
    })
}

fn verify_binding(rows: &Value, scientist: ScientistId, thread: &str) -> MezzanineResult<()> {
    uuid::Uuid::parse_str(thread)
        .map_err(|_| MezzanineError::Chronicle("Invalid Heretic thread ID".into()))?;
    let valid = rows.as_array().is_some_and(|rows| {
        rows.iter().any(|row| {
            row["id"].as_str() == Some(scientist.to_string().as_str())
                && row["identity"] == "heretic"
                && row["thread"].as_str() == Some(thread)
                && matches!(row["delivery"].as_str(), Some("queue" | "error"))
        })
    });
    if !valid {
        return Err(MezzanineError::Chronicle(
            "The Heretic's current Speaking Tube has not attached to this conversation.".into(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn read_heretic_chat(
    state: State<'_, AppState>,
    scientist_id: ScientistId,
    thread_id: String,
    cursor: Option<String>,
) -> MezzanineResult<ChatPage> {
    let current = state
        .roster_manager
        .read()
        .list()
        .into_iter()
        .any(|s| s.id == scientist_id && s.colleague == Some(Colleague::Heretic))
        && state.roster_manager.read().is_live(scientist_id);
    if !current {
        return Err(MezzanineError::SessionNotFound(scientist_id.to_string()));
    }
    if cursor.as_ref().is_some_and(|s| s.len() > 4096) {
        return Err(MezzanineError::Chronicle(
            "Conversation cursor is too long".into(),
        ));
    }
    let root = state
        .lab_root
        .read()
        .clone()
        .ok_or(MezzanineError::ConfigCorrupt)?;
    let distro = state.distro.read().clone();
    let reader = state.heretic_reader.clone();
    let roster = state.roster_manager.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut slot = reader.lock();
        // A queued read must not recreate its child after recall/window shutdown.
        // Those paths retire the PTY before clearing this reader slot.
        if !roster.read().is_live(scientist_id) {
            return Err(MezzanineError::SessionNotFound(scientist_id.to_string()));
        }
        let matches = slot
            .as_ref()
            .is_some_and(|r| r.matches(scientist_id, &thread_id));
        if !matches {
            // Validate the exact roster connection once before binding. A tube
            // connection cannot switch threads; replacing the bench changes its UUID.
            let rows = crate::drydock::bridge::run_in_lab(
                &root,
                "timeout",
                &[
                    "5",
                    "node",
                    "gadgets/speaking-tube/src/tube.mjs",
                    "connections",
                    "--identity",
                    "heretic",
                    "--database",
                    "gadgets/speaking-tube/var/mailbox.sqlite",
                ],
                distro.as_deref(),
            )?;
            verify_binding(&serde_json::from_str(&rows)?, scientist_id, &thread_id)?;
            *slot = None;
            *slot = Some(ChatReader::spawn(
                &root,
                distro.as_deref(),
                scientist_id,
                &thread_id,
            )?);
        }
        let result = slot.as_mut().expect("reader initialized").page(cursor);
        if result.is_err() {
            *slot = None;
        }
        result
    })
    .await
    .map_err(|e| MezzanineError::Chronicle(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn retirement_returns_while_a_read_holds_the_lock() {
        let slot = Arc::new(Mutex::new(None));
        let held = slot.lock();
        // This call must return before `held` is released. Waiting for the
        // worker below also verifies that retirement eventually completes.
        let cleanup = retire_reader(slot.clone(), None);
        drop(held);
        tauri::async_runtime::block_on(cleanup).unwrap();
    }

    #[test]
    fn binding_requires_exact_scientist_identity_and_thread() {
        let id = ScientistId::new();
        let thread = uuid::Uuid::new_v4().to_string();
        let rows = json!([{"id":id,"identity":"heretic","thread":thread,"delivery":"queue"}]);
        assert!(verify_binding(&rows, id, &thread).is_ok());
        assert!(verify_binding(&rows, ScientistId::new(), &thread).is_err());
        assert!(verify_binding(&rows, id, &uuid::Uuid::new_v4().to_string()).is_err());
        for (key, value) in [
            ("identity", "mad-scientist"),
            ("delivery", "closed"),
            ("delivery", "disconnected"),
        ] {
            let mut changed = rows.clone();
            changed[0][key] = value.into();
            assert!(verify_binding(&changed, id, &thread).is_err());
        }
    }
}
