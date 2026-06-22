// The Crier's Watch (#00060) — the town-crier relay's home on the balcony.
//
// The Mezzanine is the always-open session the town-crier relay has been
// waiting for. This module holds the two pieces of plumbing that make a
// safe auto-arm possible:
//
//   * `read_token_file` — the safe gate between the config file
//     (`~/.config/zmuuzn/town-crier-token`) and the relay's WSL2-side
//     bash. A missing/empty/unreadable file is `None`, never a panic; the
//     watch panel surfaces the NO TOKEN state and the patrol simply does
//     not arm. The token is read once at `setup()` and stored in
//     `AppState.crier_token`.
//
//   * `CrierWatchState` / `CrierQueueEntry` / `CrierStatus` — the serde
//     shapes the `read_crier_watch_state` command returns. They are the
//     panel's single typed read: the local relay status plus the live bus
//     queue, combined.
//
// The dispatch/recall machinery lives in `commands::crier` — this module
// is the pure, unit-testable substrate underneath it.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::roster::scientist::ScientistId;

/// Lab-root-relative-to-home config path for the crier token. The whole
/// reason for a file (not `~/.bashrc`): `~/.bashrc` is not sourced in the
/// non-interactive `bash -lc` shell the Mezzanine spawns, so a token
/// exported there is empty when the relay starts. A file the Mezzanine
/// reads directly bypasses shell sourcing entirely.
pub const TOKEN_REL_PATH: &str = ".config/zmuuzn/town-crier-token";

/// Resolve the absolute token path under a home directory.
pub fn token_path(home: &Path) -> PathBuf {
    home.join(TOKEN_REL_PATH)
}

/// Read the crier token from `<home>/.config/zmuuzn/town-crier-token`,
/// trimmed. Returns `None` when the file is missing, unreadable, or empty
/// after trimming — never panics, never logs an error (a missing token is
/// "not configured," not a fault). The caller logs a single info line.
pub fn read_token_file(home: &Path) -> Option<String> {
    let path = token_path(home);
    let raw = std::fs::read_to_string(&path).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// The three states the watch panel renders — armed (on patrol), idle
/// (stood down, token present), or token-missing (patrol cannot begin).
/// Rendered in the balcony voice on the panel: ON PATROL / STOOD DOWN /
/// NO TOKEN. Never the control-room generics ARMED / IDLE / ERROR.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CrierStatus {
    Armed,
    Idle,
    TokenMissing,
}

/// One open review request pulled from the bus's `GET /open`. Mirrors the
/// bus's open-request shape; the panel renders one queue row per entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrierQueueEntry {
    pub id: u64,
    pub pr_url: String,
    pub repo: String,
    pub review_count: u32,
}

/// The combined watch state the panel reads on open + manual refresh.
/// `bus_error` and `status` are two different facts and never collapse:
/// a bus that is unreachable while the relay is local-side fine stays
/// `Armed` with a populated `bus_error` and an empty queue.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrierWatchState {
    pub status: CrierStatus,
    pub queue: Vec<CrierQueueEntry>,
    pub last_read_at: Option<String>,
    pub bus_error: Option<String>,
    /// The live crier session id when armed — so a panel that opened AFTER the
    /// session was armed (or in a different frontend lifetime) can bind its
    /// watch-glass terminal to the real PTY instead of rendering ON PATROL over
    /// a dead glass. `None` for the idle / token-missing states.
    pub scientist_id: Option<ScientistId>,
}

impl CrierWatchState {
    /// The token-missing short-circuit — no bus hit, no queue.
    pub fn token_missing() -> Self {
        Self {
            status: CrierStatus::TokenMissing,
            queue: Vec::new(),
            last_read_at: None,
            bus_error: None,
            scientist_id: None,
        }
    }

    /// The stood-down state — token present, no crier session live.
    pub fn idle() -> Self {
        Self {
            status: CrierStatus::Idle,
            queue: Vec::new(),
            last_read_at: None,
            bus_error: None,
            scientist_id: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_home(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mezzanine-crier-test-{}-{}",
            label,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn read_token_file_present_returns_trimmed() {
        let home = temp_home("present");
        let path = token_path(&home);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "  lab-token-abc123\n").unwrap();
        assert_eq!(read_token_file(&home), Some("lab-token-abc123".to_string()));
        std::fs::remove_dir_all(&home).ok();
    }

    #[test]
    fn read_token_file_missing_returns_none() {
        let home = temp_home("missing");
        // The .config/zmuuzn/town-crier-token path was never created.
        assert_eq!(read_token_file(&home), None);
        std::fs::remove_dir_all(&home).ok();
    }

    #[test]
    fn read_token_file_empty_returns_none() {
        let home = temp_home("empty");
        let path = token_path(&home);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "   \n\t  ").unwrap();
        assert_eq!(read_token_file(&home), None);
        std::fs::remove_dir_all(&home).ok();
    }

    #[test]
    fn token_path_lands_under_xdg_config() {
        let p = token_path(Path::new("/home/scientist"));
        assert_eq!(
            p.to_str().unwrap(),
            "/home/scientist/.config/zmuuzn/town-crier-token",
        );
    }

    #[test]
    fn watch_state_token_missing_issues_no_queue() {
        let s = CrierWatchState::token_missing();
        assert_eq!(s.status, CrierStatus::TokenMissing);
        assert!(s.queue.is_empty());
        assert!(s.bus_error.is_none());
    }

    #[test]
    fn crier_status_serializes_kebab_case() {
        assert_eq!(
            serde_json::to_string(&CrierStatus::TokenMissing).unwrap(),
            "\"token-missing\"",
        );
        assert_eq!(
            serde_json::to_string(&CrierStatus::Armed).unwrap(),
            "\"armed\"",
        );
    }

    #[test]
    fn queue_entry_serializes_camel_case() {
        let entry = CrierQueueEntry {
            id: 42,
            pr_url: "https://github.com/Goosterhof/zmuuzn-strava/pull/42".to_string(),
            repo: "zmuuzn-strava".to_string(),
            review_count: 0,
        };
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"prUrl\""));
        assert!(json.contains("\"reviewCount\""));
    }
}
