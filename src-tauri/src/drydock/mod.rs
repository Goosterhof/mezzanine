// The drydock — pure parsers for Phase 3A's three artifact-derived
// enrichment fields. The Drydock panel reviews PRs across the laboratory,
// and each PR (and each file in each PR) is annotated with three pieces of
// context the investor would otherwise have to hunt for by hand:
//
//   * `minion_touch.rs` — parse `git log` output to find the last
//     minion-stamped commit that touched a file. Recognizes Task Master
//     (`[DELIVERED]`), Enhancement Squad (`P0` / `P1` / `P2` / `P3`),
//     Surgeon (`mutation`), and Illusionist (`design(`) stamps.
//   * `chaos_detonations.rs` — scan `documents/chaos-reports/` for
//     filename references. Returns matching reports with their madness
//     score. Basename match — chaos reports cite files by leaf name far
//     more often than by full path.
//   * `active_log.rs` — scan `documents/experiment-logs/` for the most
//     recent log in IN PROGRESS or PLANNING status for a given scope.
//   * `repo_registry.rs` — the canonical list of laboratory repos the
//     Drydock enumerates PRs across. Six experiments + the shared nav
//     package + five gadgets.
//   * `bridge.rs` — invoke `gh` and `git` subprocesses through the same
//     WSL2 bridge the pty substrate uses. Returns captured stdout for
//     the parsers to chew on.
//
// All parsers are pure (`fn parse(content: &str) -> T`) so the unit tests
// live alongside them and don't need Tauri or a filesystem. The Tauri
// commands in `commands/{artifacts,github}.rs` glue parsers + bridge to
// the frontend.

pub mod active_log;
pub mod bridge;
pub mod chaos_detonations;
pub mod minion_touch;
pub mod repo_registry;
