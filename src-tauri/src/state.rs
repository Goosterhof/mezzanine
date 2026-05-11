// AppState — what the Mezzanine and the bench-era backend both keep alive.
//
// Two managers coexist during the bench → Mezzanine transition:
//   * `pty_manager` — bench-era ExperimentId-keyed sessions (frontend still
//     consumes these until the frontend cutover lands)
//   * `roster_manager` — Mezzanine-era ScientistId-keyed dispatched
//     sessions (consumed by the new IPC surface; the bench-era frontend
//     does not interact with it)
//
// The bench-era manager and the Mezzanine manager share `lab_root`,
// `distro`, and the underlying chronicle base path. They write to separate
// transcript layouts under that base (per-experiment-per-day for the
// bench era; per-scientist for the Mezzanine era).

use crate::chronicle::ChronicleWriter;
use crate::pty::manager::PtyManager;
use crate::roster::RosterManager;
use parking_lot::RwLock;
use std::path::PathBuf;
use std::sync::Arc;

pub struct AppState {
    pub pty_manager: RwLock<PtyManager>,
    /// The Mezzanine's dispatched-scientist registry. New in Phase 2A.
    pub roster_manager: RwLock<RosterManager>,
    /// The WSL2-side absolute path to the laboratory root — read by the
    /// substrate when composing session specs. Populated at startup
    /// (Phase 1C) and overridden by the first-run wizard (Phase 4A).
    pub lab_root: RwLock<Option<PathBuf>>,
    /// On Windows, the WSL2 distro to bridge into (`wsl.exe -d <distro>`).
    /// On Unix, ignored. Populated at startup; the wizard will let the
    /// investor pick from `wsl.exe --list --quiet` output later.
    pub distro: RwLock<Option<String>>,
    /// Per-process base directory for chronicle transcripts. Phase 2A
    /// points this at `~/.zmuuzn-mezzanine/transcripts/`. Both writer
    /// layouts (bench-era and Mezzanine-era) live under it.
    pub chronicle_base: PathBuf,
    /// The bench-era Chronicle writer. Cloned into every `LivePtySession`.
    /// Paused at construction; the disclosure-ack flow flips it on.
    pub chronicle: Arc<ChronicleWriter>,
}

impl AppState {
    pub fn new(chronicle_base: PathBuf, roster_snapshot_dir: PathBuf) -> Self {
        Self {
            pty_manager: RwLock::new(PtyManager::default()),
            roster_manager: RwLock::new(RosterManager::new(roster_snapshot_dir)),
            lab_root: RwLock::new(None),
            distro: RwLock::new(None),
            chronicle_base: chronicle_base.clone(),
            chronicle: Arc::new(ChronicleWriter::new(chronicle_base)),
        }
    }
}
