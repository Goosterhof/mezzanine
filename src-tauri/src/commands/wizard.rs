// Wizard Tauri commands — the IPC surface for the first-run wizard.
//
// Two reads (the persisted state, the detected fallbacks) and one write
// (atomic submission of all three step answers at the end of step 3).
// The disclosure ack is its own command in `chronicle.rs`; the frontend
// dispatches both in sequence when the investor opens the balcony.

use crate::error::MezzanineResult;
use crate::state::AppState;
use crate::wizard::{self, WizardState};
use chrono::Utc;
use std::path::PathBuf;
use tauri::State;

/// Detected defaults the wizard pre-fills on first paint. These mirror
/// what `detect_lab_root` / `detect_claude_binary` would seed at startup
/// when no persisted state exists — the investor sees a working
/// configuration and only edits if the defaults are wrong.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WizardDetected {
    pub lab_root: String,
    pub claude_binary: String,
    pub host_platform: String,
}

#[tauri::command]
pub fn read_wizard_state(state: State<'_, AppState>) -> MezzanineResult<WizardState> {
    Ok(wizard::read(&state.mezzanine_home))
}

#[tauri::command]
pub fn read_wizard_detected(state: State<'_, AppState>) -> WizardDetected {
    let lab_root = state
        .lab_root
        .read()
        .clone()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let claude_binary = state
        .claude_binary
        .read()
        .clone()
        .unwrap_or_else(|| "claude".to_string());
    let host_platform = if cfg!(windows) {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else {
        "unix".to_string()
    };
    WizardDetected {
        lab_root,
        claude_binary,
        host_platform,
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WizardSubmission {
    pub lab_root: String,
    pub claude_binary: Option<String>,
}

#[tauri::command]
pub fn complete_wizard(
    state: State<'_, AppState>,
    submission: WizardSubmission,
) -> MezzanineResult<WizardState> {
    let trimmed_lab = submission.lab_root.trim().to_string();
    let trimmed_binary = submission
        .claude_binary
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    let persisted = WizardState {
        completed_at: Some(Utc::now().to_rfc3339()),
        lab_root: Some(trimmed_lab.clone()),
        claude_binary: trimmed_binary.clone(),
    };
    wizard::write(&state.mezzanine_home, &persisted)?;

    // Apply the choices to live state so the very next dispatch reflects
    // them — no gadget restart needed.
    if !trimmed_lab.is_empty() {
        *state.lab_root.write() = Some(PathBuf::from(trimmed_lab));
    }
    *state.claude_binary.write() = trimmed_binary;

    Ok(persisted)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn submission_payload_deserialises_from_camel_case() {
        let raw = r#"{"labRoot":"/tmp/lab","claudeBinary":"claude"}"#;
        let parsed: WizardSubmission = serde_json::from_str(raw).unwrap();
        assert_eq!(parsed.lab_root, "/tmp/lab");
        assert_eq!(parsed.claude_binary.as_deref(), Some("claude"));
    }

    #[test]
    fn submission_accepts_missing_binary() {
        let raw = r#"{"labRoot":"/tmp/lab"}"#;
        let parsed: WizardSubmission = serde_json::from_str(raw).unwrap();
        assert_eq!(parsed.lab_root, "/tmp/lab");
        assert!(parsed.claude_binary.is_none());
    }
}
