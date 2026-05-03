// The Chronicle — append-only JSONL transcript writer.
//
// Every pty I/O pair is appended to a local file at
// `%USERPROFILE%\.zmuuzn-cockpit\transcripts\<experiment>\<YYYY-MM-DD>-<session-id>.jsonl`
// (Windows) or `~/.zmuuzn-cockpit/transcripts/...` (Linux dev). One JSONL
// line per turn: `{ts, direction: "in"|"out", payload}`. New file per
// calendar day per experiment. Local-only — never synced, never committed.
//
// Phase 1A: stub only. Phase 2B implements the writer and wires it into
// PtyManager so every read/write goes through the chronicle before
// reaching the frontend. Until then, the type shapes live here as
// forward-deployed scaffolding.
#![allow(dead_code)]

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TurnDirection {
    In,
    Out,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChronicleTurn {
    pub ts: DateTime<Utc>,
    pub direction: TurnDirection,
    pub payload: String,
}
