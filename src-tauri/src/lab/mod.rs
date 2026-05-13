// The lab module — the Mezzanine's read window onto the laboratory's
// long-form artifacts. Mission Control (Phase 2A) reads four sources from
// disk and renders them as a single panel:
//
//   * `vital_signs.rs` — the ASCII vital-signs box at the top of CLAUDE.md
//   * `dispatch.rs`    — `documents/war-room-dispatch.md` active findings
//   * `signals.rs`     — `documents/laboratory-pulse.md` pending signal queue
//   * `wounds.rs`      — `.claude/memory/wounds/` directory listing
//
// The parsers are pure (`fn parse(content: &str) -> Result<T>`) so the unit
// tests live in each module and don't need Tauri or a filesystem. The Tauri
// commands in `commands/files.rs` glue the parsers to disk reads.

pub mod dispatch;
pub mod signals;
pub mod vital_signs;
pub mod wounds;
