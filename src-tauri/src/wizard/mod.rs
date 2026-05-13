// The Mezzanine's first-run wizard — persistence module.
//
// On first boot the investor steps through three questions: where the
// laboratory lives, which `claude` binary the scientists invoke, and the
// chronicle privacy notice. The first two persist here; the third hands
// off to `chronicle::commands::write_chronicle_disclosure_ack`.
//
// Wire shape: one JSON file at `<mezzanine_data_dir>/wizard-state.json`.
// `completed_at` doubles as the "wizard ran once" marker — the frontend
// renders the wizard iff this field is absent.

use crate::error::{MezzanineError, MezzanineResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const WIZARD_STATE_FILENAME: &str = "wizard-state.json";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct WizardState {
    /// RFC3339 timestamp of the investor's final "Open the balcony" press.
    /// `None` until the wizard runs to completion.
    pub completed_at: Option<String>,
    /// WSL2-side absolute path to the laboratory root. The substrate's
    /// `cd` happens inside the bridged bash, so even on Windows this is a
    /// POSIX path — never `C:\Users\...`.
    pub lab_root: Option<String>,
    /// Override for the binary the substrate invokes (default `claude`).
    /// An empty string here is treated as `None` on read so the default
    /// survives.
    pub claude_binary: Option<String>,
}

impl WizardState {
    /// True once the investor has pressed "Open the balcony" at least
    /// once. The frontend tests this on boot via `read_wizard_state` and
    /// suppresses the wizard when set. Production code uses it directly;
    /// kept on `WizardState` (rather than inlined) so the test suite can
    /// assert it independently of the IPC envelope.
    #[cfg(test)]
    pub fn is_complete(&self) -> bool {
        self.completed_at
            .as_deref()
            .map(str::trim)
            .is_some_and(|s| !s.is_empty())
    }

    pub fn resolved_claude_binary(&self) -> Option<String> {
        self.claude_binary
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    }

    pub fn resolved_lab_root(&self) -> Option<PathBuf> {
        self.lab_root
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
    }
}

pub fn state_path(data_dir: &Path) -> PathBuf {
    data_dir.join(WIZARD_STATE_FILENAME)
}

pub fn read(data_dir: &Path) -> WizardState {
    let path = state_path(data_dir);
    let raw = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return WizardState::default(),
    };
    serde_json::from_str::<WizardState>(&raw).unwrap_or_default()
}

pub fn write(data_dir: &Path, state: &WizardState) -> MezzanineResult<()> {
    std::fs::create_dir_all(data_dir).map_err(MezzanineError::Io)?;
    let path = state_path(data_dir);
    let raw = serde_json::to_string_pretty(state).map_err(MezzanineError::Serde)?;
    std::fs::write(&path, raw).map_err(MezzanineError::Io)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mezzanine-wizard-test-{}-{}",
            label,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn read_returns_default_when_file_absent() {
        let dir = temp_dir("absent");
        let state = read(&dir);
        assert_eq!(state, WizardState::default());
        assert!(!state.is_complete());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_then_read_round_trips() {
        let dir = temp_dir("roundtrip");
        let stamp = "2026-05-13T14:00:00Z".to_string();
        let state = WizardState {
            completed_at: Some(stamp.clone()),
            lab_root: Some("/home/scientist/code/zmuuzn".to_string()),
            claude_binary: Some("claude".to_string()),
        };
        write(&dir, &state).unwrap();
        let read_back = read(&dir);
        assert_eq!(read_back, state);
        assert!(read_back.is_complete());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn corrupt_json_falls_back_to_default() {
        let dir = temp_dir("corrupt");
        std::fs::write(state_path(&dir), "{ not json").unwrap();
        let state = read(&dir);
        assert_eq!(state, WizardState::default());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn empty_strings_resolve_as_none() {
        let state = WizardState {
            completed_at: Some(String::new()),
            lab_root: Some("   ".into()),
            claude_binary: Some(String::new()),
        };
        assert!(!state.is_complete());
        assert!(state.resolved_lab_root().is_none());
        assert!(state.resolved_claude_binary().is_none());
    }

    #[test]
    fn resolved_lab_root_returns_pathbuf_when_set() {
        let state = WizardState {
            completed_at: None,
            lab_root: Some("/tmp/lab".into()),
            claude_binary: None,
        };
        assert_eq!(
            state.resolved_lab_root(),
            Some(PathBuf::from("/tmp/lab"))
        );
    }

    #[test]
    fn write_creates_parent_dir() {
        let parent = std::env::temp_dir().join(format!(
            "mezzanine-wizard-parent-{}",
            uuid::Uuid::new_v4()
        ));
        let nested = parent.join("nested");
        // nested does not yet exist
        let state = WizardState {
            completed_at: Some("2026-05-13T14:00:00Z".into()),
            lab_root: None,
            claude_binary: None,
        };
        write(&nested, &state).unwrap();
        assert!(state_path(&nested).exists());
        std::fs::remove_dir_all(&parent).ok();
    }
}
