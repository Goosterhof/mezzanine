// The Roster — the Mezzanine's living list of dispatched scientists.
//
// The Roster is the home view of the gadget: who is out, on what mission,
// in what target, in what state. Each Scientist is one claude pty session;
// each pty is dispatched into a Target with a mission brief. The
// RosterManager owns the live pty handles and the data records that mirror
// them to the frontend.
//
// Phase 2A scope: data structures, manager scaffolding, pty spawning,
// recall lifecycle, recently-recalled 5-minute strip, idle-warning
// computation, snapshot persistence. The frontend reframe lands in a
// later session — until then, the legacy `pty::manager::PtyManager`
// continues to serve the bench-era frontend.
//
// `#![allow(dead_code)]` is applied at the module level because the IPC
// surface (commands::roster) consumes most of these items but the
// frontend has not yet been wired through to them. Once Phase 2A's
// frontend session lands and the Mezzanine slice consumes the new
// commands, the allow can be removed and the lint will turn up real
// dead code (if any).

#![allow(dead_code)]

pub mod live;
pub mod manager;
pub mod persistence;
pub mod recall_strip;
pub mod scientist;
pub mod target;

pub use manager::RosterManager;
