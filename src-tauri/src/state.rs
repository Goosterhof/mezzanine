// AppState — what the Mezzanine keeps alive across IPC calls.
//
// The `roster_manager` is the only session registry now — bench-era
// `pty_manager` was retired alongside the frontend cutover. The state
// holds the chronicle base directory, the pause flag (via `ChronicleWriter`),
// and the two substrate inputs (`lab_root`, `distro`) that the roster
// reads when dispatching a new scientist.

use crate::chronicle::ChronicleWriter;
use crate::roster::RosterManager;
use parking_lot::RwLock;
use std::path::PathBuf;
use std::sync::Arc;

pub struct AppState {
    /// The Mezzanine's dispatched-scientist registry.
    pub roster_manager: RwLock<RosterManager>,
    /// The WSL2-side absolute path to the laboratory root — read by the
    /// substrate when composing session specs. Populated at startup and
    /// overridden by the first-run wizard (Phase 4A).
    pub lab_root: RwLock<Option<PathBuf>>,
    /// On Windows, the WSL2 distro to bridge into (`wsl.exe -d <distro>`).
    /// On Unix, ignored. Populated at startup; the wizard will let the
    /// investor pick from `wsl.exe --list --quiet` output later.
    pub distro: RwLock<Option<String>>,
    /// Per-process base directory for chronicle transcripts.
    /// `~/.zmuuzn-mezzanine/transcripts/` on production; each scientist's
    /// JSONL transcript lives under `<base>/scientists/<id>.jsonl`.
    pub chronicle_base: PathBuf,
    /// The chronicle writer's pause flag holder. The disclosure-ack flow
    /// flips this off so the next dispatched scientist's transcript lands
    /// on disk.
    pub chronicle: Arc<ChronicleWriter>,
}

impl AppState {
    pub fn new(chronicle_base: PathBuf, roster_snapshot_dir: PathBuf) -> Self {
        Self {
            roster_manager: RwLock::new(RosterManager::new(roster_snapshot_dir)),
            lab_root: RwLock::new(None),
            distro: RwLock::new(None),
            chronicle_base: chronicle_base.clone(),
            chronicle: Arc::new(ChronicleWriter::new(chronicle_base)),
        }
    }
}
