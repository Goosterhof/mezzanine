// The Grind's game-state snapshot — plain std::fs + serde_json, sibling
// to roster.json at `<mezzanine_home>/grind.json`.
//
// The frontend owns the canonical `GameState` shape (TypeScript engine in
// `src/grind/gameCore.ts` is the source of truth for all fields). On the
// Rust side we store the blob as `serde_json::Value` — the engine evolves
// independently and we do not want to thread every field through Rust
// types. The Vue composable round-trips the blob via load/save IPC.
//
// First-boot behaviour: if `grind.json` does not exist, return `None` and
// let the frontend hydrate from `gameCore.createGameState()`. The first
// save call writes the file; subsequent loads find it. No panic, no
// empty screen — the Mezzanine never opens onto a blank floor.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// The grind.json wire shape. The `state` field is opaque to Rust —
/// `serde_json::Value` lets the TypeScript engine own the schema.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameStateBlob {
    /// The full engine state — see `src/grind/gameCore.ts` for the canonical shape.
    pub state: serde_json::Value,
    /// When this blob was written, ISO-8601 in UTC. Diagnostic only.
    #[serde(default)]
    pub saved_at: Option<String>,
}

fn snapshot_path(mezzanine_home: &Path) -> std::path::PathBuf {
    mezzanine_home.join("grind.json")
}

/// Read the saved game state. Returns `Ok(None)` if no file exists yet —
/// callers hydrate from the engine's default on first boot.
pub fn load_game_state(mezzanine_home: &Path) -> Result<Option<GameStateBlob>, String> {
    let path = snapshot_path(mezzanine_home);
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str::<GameStateBlob>(&text)
            .map(Some)
            .map_err(|e| {
                format!(
                    "the grind.json blob at {} could not be parsed: {e}",
                    path.display()
                )
            }),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!(
            "the grind.json blob at {} could not be read: {err}",
            path.display()
        )),
    }
}

/// Write the game state snapshot. Creates the parent directory if needed.
/// Atomic on Unix via tmp-then-rename; on Windows the rename is best-effort.
pub fn save_game_state(mezzanine_home: &Path, blob: &GameStateBlob) -> Result<(), String> {
    if !mezzanine_home.exists() {
        fs::create_dir_all(mezzanine_home).map_err(|e| {
            format!(
                "the grind could not create {}: {e}",
                mezzanine_home.display()
            )
        })?;
    }
    let path = snapshot_path(mezzanine_home);
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(blob)
        .map_err(|e| format!("the grind could not serialize the game state: {e}"))?;
    fs::write(&tmp, text)
        .map_err(|e| format!("the grind could not write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, &path).map_err(|e| {
        format!(
            "the grind could not rotate {} into {}: {e}",
            tmp.display(),
            path.display()
        )
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_home(suffix: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mezzanine-grind-persist-test-{}-{}",
            suffix,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn load_returns_none_when_file_missing() {
        let home = temp_home("missing");
        assert!(load_game_state(&home).unwrap().is_none());
        std::fs::remove_dir_all(&home).ok();
    }

    #[test]
    fn save_then_load_round_trips() {
        let home = temp_home("roundtrip");
        let blob = GameStateBlob {
            state: serde_json::json!({"rp": 1234, "buildings": {"notebook": 3}}),
            saved_at: Some("2026-05-26T12:00:00Z".to_string()),
        };
        save_game_state(&home, &blob).unwrap();
        let loaded = load_game_state(&home).unwrap().unwrap();
        assert_eq!(loaded.state["rp"], 1234);
        assert_eq!(loaded.state["buildings"]["notebook"], 3);
        assert_eq!(loaded.saved_at.as_deref(), Some("2026-05-26T12:00:00Z"));
        std::fs::remove_dir_all(&home).ok();
    }

    #[test]
    fn save_creates_parent_directory_when_missing() {
        let parent = temp_home("nested-parent");
        let nested = parent.join("nope-yet");
        let blob = GameStateBlob {
            state: serde_json::json!({"rp": 0}),
            saved_at: None,
        };
        save_game_state(&nested, &blob).unwrap();
        assert!(nested.join("grind.json").exists());
        std::fs::remove_dir_all(&parent).ok();
    }

    #[test]
    fn load_surfaces_parse_errors_with_path_context() {
        let home = temp_home("corrupt");
        std::fs::write(home.join("grind.json"), "this is not json").unwrap();
        let err = load_game_state(&home).unwrap_err();
        assert!(err.contains("could not be parsed"));
        std::fs::remove_dir_all(&home).ok();
    }
}
