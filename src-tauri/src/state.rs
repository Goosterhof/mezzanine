// AppState — the workbench drawer.
//
// Everything that needs to outlive a single Tauri command call lives here.
// Phase 1A: the drawer is mostly empty — a placeholder PtyManager and the
// lab root path. Phase 1C fills it.

use crate::pty::manager::PtyManager;
use parking_lot::RwLock;
use std::path::PathBuf;

#[derive(Default)]
pub struct AppState {
    pub pty_manager: RwLock<PtyManager>,
    pub lab_root: RwLock<Option<PathBuf>>,
}
