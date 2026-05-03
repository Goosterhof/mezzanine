// Tauri command modules — the Workbench's IPC surface.
//
// Each module groups commands by the surface they serve. Phase 1A shipped
// pty status reads; Phase 1C grew them to live spawn/write/kill verbs;
// Phase 2A adds the Mission Control file commands (read vital signs,
// dispatch, signals, wounds; write a new dispatch finding). GitHub /
// artifact commands land in Phase 3.

pub mod files;
pub mod pty;
