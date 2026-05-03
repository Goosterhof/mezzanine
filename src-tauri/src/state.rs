// AppState — the workbench drawer.
//
// Everything that needs to outlive a single Tauri command call lives here.
// Phase 1A scaffolded a placeholder PtyManager and the lab_root path;
// Phase 1C populates `lab_root` and `distro` at app startup so the
// substrate has the WSL2 coordinates it needs.

use crate::pty::manager::PtyManager;
use parking_lot::RwLock;
use std::path::PathBuf;

#[derive(Default)]
pub struct AppState {
    pub pty_manager: RwLock<PtyManager>,
    /// The WSL2-side absolute path to the laboratory root — read by the
    /// substrate when composing session specs. Populated at startup
    /// (Phase 1C) and overridden by the first-run wizard (Phase 4A).
    pub lab_root: RwLock<Option<PathBuf>>,
    /// On Windows, the WSL2 distro to bridge into (`wsl.exe -d <distro>`).
    /// On Unix, ignored. Populated at startup; the wizard will let the
    /// investor pick from `wsl.exe --list --quiet` output later.
    pub distro: RwLock<Option<String>>,
}
