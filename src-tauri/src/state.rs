// AppState — what the Mezzanine keeps alive across IPC calls.
//
// The `roster_manager` is the only session registry now — bench-era
// `pty_manager` was retired alongside the frontend cutover. The state
// holds the chronicle base directory, the pause flag (via `ChronicleWriter`),
// the two substrate inputs (`lab_root`, `distro`) that the roster reads
// when dispatching a new scientist, the optional `claude_binary` override
// the wizard configures, and the `mezzanine_home` path the wizard module
// uses to persist its own state file beside the roster snapshot.
//
// Phase O-1 of the Observer (#00052) adds `chronicle_reader`: a
// ChronicleReader rooted at the same base directory as the writer. The
// reader starts per-scientist tails on dispatch and stops them on
// recall; `commands::observer` is the IPC surface and
// `commands::roster::recall_scientist` calls `stop_watching` as part of
// recall so a missed frontend stop never leaks a tail task.

use crate::chronicle::{ChronicleReader, ChronicleWriter};
use crate::grind::EconomyManager;
use crate::roster::scientist::ScientistId;
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
    /// Phase O-1: the per-scientist JSONL tail registry. Started on
    /// dispatch (via the frontend's start_watching IPC) and stopped on
    /// recall (via the frontend's stop_watching IPC + the belt-and-
    /// suspenders stop inside `commands::roster::recall_scientist`).
    pub chronicle_reader: Arc<ChronicleReader>,
    /// Arc 3 (#00053) — The Grind's RP grant engine. Holds the per-scientist
    /// chronicle rate limiters and lifecycle dedup sets. Lifecycle events
    /// (dispatch / recall) are reported to this singleton by the
    /// commands::roster command wrappers; chronicle-line events arrive via
    /// the in-process broadcast that `ChronicleReader::subscribe()` returns.
    pub economy: Arc<EconomyManager>,
    /// The Crier's Watch (#00060) — the town-crier lab token, read once at
    /// `setup()` from `~/.config/zmuuzn/town-crier-token`. `None` when the
    /// file is missing, unreadable, or empty after trimming; the patrol is
    /// disarmed in that case and the watch panel surfaces the NO TOKEN
    /// state. Never injected into the relay as `TC_RELAY_TOKEN` — see
    /// `SessionSpec::for_crier`.
    pub crier_token: RwLock<Option<String>>,
    /// The Crier's Watch (#00060) — the id of the currently-armed crier
    /// scientist, or `None` when patrol is stood down. The singleton guard
    /// in `commands::crier::dispatch_crier` tracks it here so a second arm
    /// (the panel's button + the boot auto-arm) does not fork two relay
    /// listeners. Deliberately NOT persisted to `roster.json` — the crier
    /// is re-armed fresh on every launch.
    pub crier_scientist_id: RwLock<Option<ScientistId>>,
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
            chronicle: Arc::new(ChronicleWriter::new(chronicle_base.clone())),
            chronicle_reader: Arc::new(ChronicleReader::new(chronicle_base)),
            economy: Arc::new(EconomyManager::new()),
            crier_token: RwLock::new(None),
            crier_scientist_id: RwLock::new(None),
        }
    }
}
