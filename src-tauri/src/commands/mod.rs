// Tauri command modules — the Mezzanine's IPC surface.
//
// Each module groups commands by the surface they serve:
//   * `roster`     — dispatch / recall / list / write / resize / transition
//                    (the Mezzanine's lifecycle for dispatched scientists)
//   * `files`      — Mission Control file reads + dispatch write
//   * `chronicle`  — privacy-disclosure ack flow (read + write)
//   * `github`     — `gh` enumeration + review actions for the Drydock
//   * `artifacts`  — three readers feeding the Drydock's per-file enrichment
//   * `wizard`     — first-run wizard state read + atomic submission
//   * `holotable`  — Arc 1 dashboard read for the lab floor below
//   * `observer`   — Arc 2 chronicle tail start/stop for per-scientist sprites
//
// The bench-era `pty` module (six per-experiment session commands) was
// retired with the frontend cutover; the bench-era `chronicle::history`
// reader went with it (the History pane is retired — chronicle replay is
// a future Briefing Library mission, not a panel).

pub mod artifacts;
pub mod balcony;
pub mod chronicle;
pub mod files;
pub mod github;
pub mod grind;
pub mod holotable;
pub mod observer;
pub mod roster;
pub mod wizard;
