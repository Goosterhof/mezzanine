// The Chronicle — append-only JSONL transcript writer.
//
// Phase 2A (the Mezzanine reframe) moves the canonical path from
// `~/.zmuuzn-cockpit/` to `~/.zmuuzn-mezzanine/`. On first Mezzanine boot
// the `migration` module performs a one-time copy from the bench-era
// location into the new one; subsequent boots observe the marker file and
// no-op. The bench-era directory is left intact for rollback.
//
// Two writer layouts coexist during the bench → Mezzanine transition:
//
//   1. Bench era (still in use until the frontend cutover):
//      `<base>/<experiment>/<YYYY-MM-DD>-<session-id>.jsonl` — one file
//      per calendar day per experiment, written via `ChronicleWriter`.
//
//   2. Mezzanine era (consumed by the new RosterManager):
//      `<base>/scientists/<scientist-id>.jsonl` — one file per dispatched
//      scientist, written inline by `roster::live::LiveScientistSession`.
//
// One JSONL line per turn in both layouts: `{ts, direction: "in"|"out",
// payload}`. Local-only — never synced, never committed; defensive
// `.gitignore` entries in the lab root and each experiment guard against
// accidental commits if the path ever drifts.

pub mod migration;
pub mod reader;
pub mod writer;

pub use writer::{ChronicleWriter, TurnDirection};
