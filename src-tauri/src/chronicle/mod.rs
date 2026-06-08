// The Chronicle — append-only JSONL transcript writer + tail reader.
//
// Phase 2A (the Mezzanine reframe) moves the canonical path from
// `~/.zmuuzn-cockpit/` to `~/.zmuuzn-mezzanine/`. On first Mezzanine boot
// the `migration` module performs a one-time copy from the bench-era
// location into the new one; subsequent boots observe the marker file and
// no-op. The bench-era directory is left intact for rollback.
//
// The Mezzanine-era layout: `<base>/scientists/<scientist-id>.jsonl` —
// one file per dispatched scientist, written inline by
// `roster::live::LiveScientistSession`. One JSONL line per turn:
// `{ts, direction: "in"|"out", payload}`. Local-only — never synced,
// never committed; defensive `.gitignore` entries in the lab root and
// each experiment guard against accidental commits if the path ever
// drifts.
//
// Phase O-1 of the Observer (#00052) adds the `reader` module — a typed
// JSONL tail keyed by `ScientistId`, polling the same files the writer
// produces. The Observer subscribes; The Grind (#00053) will subscribe
// to the same stream for its economy engine. The infrastructure is
// symmetric: one writer, one reader, two consumers.

pub mod migration;
pub mod reader;
pub mod types;
pub mod writer;

pub use reader::ChronicleReader;
pub use writer::ChronicleWriter;
