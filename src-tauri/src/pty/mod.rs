// The pty module — the Workbench's vise.
//
// Six pty sessions, each one wrapping a `wsl.exe -d <distro> -- bash -c
// "cd <wsl-path> && claude"` subprocess on Windows (or a direct bash on Linux
// during development). The vise grips a session and holds it open between
// glances — switching tabs does not kill the subprocess.
//
// Phase 1A: structs only. The actual portable-pty integration lands at the
// start of Phase 1C with a substrate-validation spike before any UI work
// depends on live sessions.

pub mod live;
pub mod manager;
pub mod output;
pub mod session;
pub mod substrate;
