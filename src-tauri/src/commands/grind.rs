// The Grind's Tauri commands — game-state load/save IPC for the Vue
// composable. The economy engine on the Rust side emits `grind-rp-grant`
// events autonomously (no command is needed to fetch them; the Vue side
// subscribes via `listen()`). The game engine state itself — buildings,
// upgrades, theorems, lifetime stats — round-trips through these two
// commands.
//
// `load_grind_state` returns `Option<serde_json::Value>`. On first boot
// (no grind.json on disk yet), `None` is returned and the Vue composable
// hydrates from `gameCore.createGameState()`.

use crate::grind::persistence::{load_game_state, save_game_state, GameStateBlob};
use crate::state::AppState;
use chrono::Utc;
use tauri::State;

#[tauri::command]
pub fn load_grind_state(state: State<'_, AppState>) -> Result<Option<serde_json::Value>, String> {
    let home = &state.mezzanine_home;
    Ok(load_game_state(home)?.map(|blob| blob.state))
}

#[tauri::command]
pub fn save_grind_state(
    state: State<'_, AppState>,
    game_state: serde_json::Value,
) -> Result<(), String> {
    let home = &state.mezzanine_home;
    let blob = GameStateBlob {
        state: game_state,
        saved_at: Some(Utc::now().to_rfc3339()),
    };
    save_game_state(home, &blob)
}
