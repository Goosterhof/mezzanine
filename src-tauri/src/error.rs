// The Workbench's error vocabulary.
//
// The bench breaks. When it does, the investor deserves to know which tool
// snapped. Every error variant names the part of the workbench that failed —
// no anonymous "something went wrong."

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum WorkbenchError {
    #[error("the vise refused to grip — pty spawn failed: {0}")]
    PtySpawn(String),

    #[error("the bridge to WSL2 collapsed — wsl.exe invocation failed: {0}")]
    WslBridge(String),

    #[error("the chronicle wouldn't write — transcript I/O failed: {0}")]
    Chronicle(String),

    #[error("the lab file was unreadable: {0}")]
    LabFileRead(String),

    #[error("config corrupted — first-run wizard required")]
    ConfigCorrupt,

    #[error("session not found — id: {0}")]
    SessionNotFound(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
}

// Tauri requires errors crossing the IPC bridge to be Serializable. The
// frontend never sees the raw error type — only its rendered message — but
// serde::Serialize is the contract Tauri enforces.
impl Serialize for WorkbenchError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

pub type WorkbenchResult<T> = Result<T, WorkbenchError>;
