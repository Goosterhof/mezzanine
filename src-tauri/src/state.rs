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
    /// The WSL2-side absolute path to the laboratory root — populated by
    /// the first-run wizard (Phase 4A) and read by the substrate when
    /// composing session specs. Stub-tolerated until the wizard lands.
    #[allow(dead_code)]
    pub lab_root: RwLock<Option<PathBuf>>,
}
