// The Holotable — the floor the balcony looks down on.
//
// Arc 1 of the absorption trilogy (experiment log #00051): the VS Code
// gadget's WebGL engine is lifted into the Mezzanine as a slide-down panel.
// This Rust slice produces the typed substrate the Vue scene reads from —
// git state through the WSL2 bridge, HTTPS health pings via tauri-plugin-http,
// combined into a `DashboardState` that mirrors the original `stateAggregator.ts`
// contract without inheriting its `child_process` dependency.
//
// Three submodules, one shape:
//   * `git_state`    — runs git through `drydock::bridge::run_in_lab`
//   * `health_check` — fires HTTPS pings concurrently via tauri-plugin-http
//   * `aggregator`   — combines the two into `DashboardState`
//
// The aggregated state is exposed to the frontend through a single Tauri
// command (`read_holotable_state`) registered in `commands/holotable.rs`.
// Read-on-open + manual-refresh — no polling daemon, no file watcher.

pub mod aggregator;
pub mod git_state;
pub mod health_check;

pub use aggregator::{
    DashboardState, ExperimentNode, GadgetNode, HealthState, InfraNode, NodeKind,
};
pub use git_state::{LabGitState, SubmoduleState};
pub use health_check::{ExperimentEndpoint, HealthPing, LabHealth};
