// Pty event payloads — the shape the frontend listens for.
//
// Two events cross the IPC bridge during a live session:
//   * `pty-output` — every read chunk from the master, with the
//     experiment id so the frontend can route to the right ring buffer.
//   * `pty-exit` — fired exactly once per session when the wrapped
//     child has exited (or the pty has closed). exit_code = -1 means
//     wait() failed before a real status could be harvested.

use crate::pty::session::ExperimentId;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct OutputPayload {
    pub experiment: ExperimentId,
    pub chunk: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExitPayload {
    pub experiment: ExperimentId,
    pub exit_code: i32,
}
