// AppState — what the Mezzanine keeps alive across IPC calls.
//
// The `roster_manager` is the only session registry now — bench-era
// `pty_manager` was retired alongside the frontend cutover. The state
// holds the chronicle base directory, the pause flag (via `ChronicleWriter`),
// the two substrate inputs (`lab_root`, `distro`) that the roster reads
// when dispatching a new scientist, the optional `claude_binary` override
// the wizard configures, and the `mezzanine_home` path the wizard module
// uses to persist its own state file beside the roster snapshot.

use crate::chronicle::ChronicleWriter;
use crate::roster::RosterManager;
use parking_lot::RwLock;
use std::path::PathBuf;
use std::sync::Arc;

pub struct AppState {
    /// The Mezzanine's dispatched-scientist registry.
    pub roster_manager: RwLock<RosterManager>,
    /// The WSL2-side absolute path to the laboratory root — read by the
    /// substrate when composing session specs. Populated at startup from
    /// the persisted wizard state (or env / default fallback) and
    /// overridden when the investor completes the first-run wizard.
    pub lab_root: RwLock<Option<PathBuf>>,
    /// On Windows, the WSL2 distro to bridge into (`wsl.exe -d <distro>`).
    /// On Unix, ignored. Populated at startup; the wizard does not edit
    /// this — the env-var / Windows default path remains in force.
    pub distro: RwLock<Option<String>>,
    /// Optional override of the binary the substrate invokes. `None` means
    /// the substrate falls back to `"claude"` from PATH (the laboratory's
    /// canonical name). Populated from the persisted wizard state and
    /// updated when the investor completes the wizard.
    pub claude_binary: RwLock<Option<String>>,
    /// Per-process base directory for chronicle transcripts.
    /// `~/.zmuuzn-mezzanine/transcripts/` on production; each scientist's
    /// JSONL transcript lives under `<base>/scientists/<id>.jsonl`.
    pub chronicle_base: PathBuf,
    /// The Mezzanine's data home — `~/.zmuuzn-mezzanine/` on production.
    /// Houses the roster snapshot, the wizard state file, and the
    /// transcripts subdirectory.
    pub mezzanine_home: PathBuf,
    /// The chronicle writer's pause flag holder. The disclosure-ack flow
    /// flips this off so the next dispatched scientist's transcript lands
    /// on disk.
    pub chronicle: Arc<ChronicleWriter>,
}

impl AppState {
    pub fn new(chronicle_base: PathBuf, mezzanine_home: PathBuf) -> Self {
        Self {
            roster_manager: RwLock::new(RosterManager::new(mezzanine_home.clone())),
            lab_root: RwLock::new(None),
            distro: RwLock::new(None),
            claude_binary: RwLock::new(None),
            chronicle_base: chronicle_base.clone(),
            mezzanine_home,
            chronicle: Arc::new(ChronicleWriter::new(chronicle_base)),
        }
    }
}
