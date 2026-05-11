// Tauri command modules — the gadget's IPC surface.
//
// Each module groups commands by the surface they serve. Phase 1A shipped
// pty status reads; Phase 1C grew them to live spawn/write/kill verbs;
// Phase 2A (Mission Control) adds the Mission Control file commands;
// Phase 2B adds the Chronicle commands; Phase 3A adds the Drydock's `gh`
// enumeration + review actions and the three artifact-enrichment readers.
// Mezzanine Phase 2A adds the `roster` module — dispatch/recall lifecycle
// for scientists, alongside the bench-era pty surface that the existing
// frontend still consumes.

pub mod artifacts;
pub mod chronicle;
pub mod files;
pub mod github;
pub mod pty;
pub mod roster;
