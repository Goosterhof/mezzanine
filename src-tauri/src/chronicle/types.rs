// Chronicle types — the shared JSONL turn shape.
//
// Promoted from `roster::live` in Phase O-1 of the Observer (#00052) so
// the reader (`chronicle::reader`) and the writer (inline in
// `roster::live::append_turn`) can share one struct without a lifetime
// parameter blocking deserialization. The reader needs an owned `payload`
// because the bytes have to outlive the file read; the writer trades a
// tiny allocation per turn for the symmetry. The bench-era borrowed-slice
// version is gone.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TurnDirection {
    In,
    Out,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChronicleTurn {
    pub ts: String,
    pub direction: TurnDirection,
    pub payload: String,
}
