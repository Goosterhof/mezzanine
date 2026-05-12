// The substrate — the only piece of the bench-era pty layer that survived
// the frontend cutover. `LiveScientistSession` (under `roster::live`) wraps
// the substrate's `build_command` to spawn dispatched-scientist ptys; the
// bench-era `LivePtySession` / `PtyManager` / `commands::pty` surfaces and
// the `ExperimentId` / `SessionState` enums were retired alongside the
// six-bench frontend they served.
//
// The module retains its `pty::` name for the substrate path (`pty::substrate`)
// so the imports in `roster::live` and `roster::manager` keep their current
// shape. A later cleanup pass may rename `pty::substrate` → `substrate::`
// at the crate root; for now the substrate is one file and its location is
// not worth churning the call sites.

pub mod substrate;
