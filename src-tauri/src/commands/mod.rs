// Tauri command modules — the Workbench's IPC surface.
//
// Each module groups commands by the surface they serve. Phase 1A ships
// only the pty status reads (so the frontend can render rail tabs against
// a real backend). Files / GitHub / artifacts commands land in Phases 2-3.

pub mod pty;
