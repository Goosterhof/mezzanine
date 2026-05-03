// AppState — the workbench drawer.
//
// Everything that needs to outlive a single Tauri command call lives here.
// Phase 1A scaffolded a placeholder PtyManager and the lab_root path;
// Phase 1C populates `lab_root` and `distro` at app startup; Phase 2B
// adds the shared chronicle writer that records every pty I/O turn.

use crate::chronicle::ChronicleWriter;
use crate::pty::manager::PtyManager;
use parking_lot::RwLock;
use std::path::PathBuf;
use std::sync::Arc;

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
    /// The Chronicle — append-only JSONL transcript writer. Cloned into
    /// every `LivePtySession` so input writes and reader chunks land on
    /// disk. Paused at construction; the disclosure-ack flow flips it on.
    pub chronicle: Arc<ChronicleWriter>,
}

impl AppState {
    pub fn new(chronicle_base: PathBuf) -> Self {
        Self {
            pty_manager: RwLock::new(PtyManager::default()),
            lab_root: RwLock::new(None),
            distro: RwLock::new(None),
            chronicle: Arc::new(ChronicleWriter::new(chronicle_base)),
        }
    }
}
