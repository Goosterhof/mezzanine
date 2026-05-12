// ChronicleWriter — the Mezzanine's pause-aware base-dir holder.
//
// In the bench era this struct also owned per-experiment session tracking
// with daily file rotation. The Mezzanine's chronicle is per-scientist —
// each dispatched scientist's transcript is written inline by
// `roster::live::LiveScientistSession::write`, with its own JSONL append
// at `<base>/scientists/<scientist-id>.jsonl`. The bench-era APIs were
// retired with the frontend cutover; what remains is the writer's role
// as the canonical holder of the chronicle base path and the pause flag
// that the privacy-disclosure ack flips on.

use parking_lot::Mutex;
use std::path::{Path, PathBuf};

pub struct ChronicleWriter {
    base_dir: PathBuf,
    paused: Mutex<bool>,
}

impl ChronicleWriter {
    /// Build a writer rooted at `base_dir` (Phase 2A: typically
    /// `~/.zmuuzn-mezzanine/transcripts/`; bench-era directory is
    /// migrated by `chronicle::migration` on first Mezzanine boot). The
    /// writer starts paused — the disclosure-ack flow flips it to active
    /// once the investor acknowledges the privacy notice.
    pub fn new(base_dir: PathBuf) -> Self {
        Self {
            base_dir,
            paused: Mutex::new(true),
        }
    }

    pub fn base_dir(&self) -> &Path {
        &self.base_dir
    }

    pub fn set_paused(&self, paused: bool) {
        *self.paused.lock() = paused;
    }

    #[cfg(test)]
    pub fn is_paused(&self) -> bool {
        *self.paused.lock()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writer_starts_paused() {
        let w = ChronicleWriter::new(PathBuf::from("/tmp/x"));
        assert!(w.is_paused());
    }

    #[test]
    fn set_paused_toggles_flag() {
        let w = ChronicleWriter::new(PathBuf::from("/tmp/x"));
        w.set_paused(false);
        assert!(!w.is_paused());
        w.set_paused(true);
        assert!(w.is_paused());
    }

    #[test]
    fn base_dir_returns_construction_value() {
        let path = PathBuf::from("/tmp/mezzanine/transcripts");
        let w = ChronicleWriter::new(path.clone());
        assert_eq!(w.base_dir(), path.as_path());
    }

}
