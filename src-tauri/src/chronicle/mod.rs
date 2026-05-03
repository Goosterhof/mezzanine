// The Chronicle — append-only JSONL transcript writer.
//
// Every pty I/O pair is appended to a local file at
// `<home>/.zmuuzn-cockpit/transcripts/<experiment>/<YYYY-MM-DD>-<session-id>.jsonl`
// (Linux) or the same path under `%USERPROFILE%` on Windows. One JSONL
// line per turn: `{ts, direction: "in"|"out", payload}`. New file per
// calendar day per experiment — sessions that span midnight write to two
// files with the same session-id suffix. Local-only — never synced, never
// committed; defensive `.gitignore` entries in the lab root and each
// experiment guard against accidental commits if the path ever drifts.
//
// The writer is held as `Arc<ChronicleWriter>` in `AppState`; the pty
// manager clones the Arc into each `LivePtySession`, which records "in"
// on every command-bar write and "out" on every reader chunk.

pub mod reader;
pub mod writer;

pub use writer::{ChronicleWriter, TurnDirection};
