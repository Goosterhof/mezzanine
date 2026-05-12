// The substrate — what the bench wraps.
//
// Every claude session is a subprocess. On Windows that subprocess is
// `wsl.exe` bridging into the investor's WSL2 distro; on Unix it is a
// direct `bash`. The substrate module hides that branch behind a single
// `build_command` function so the rest of the pty layer never has to ask
// which OS it lives on.
//
// Phase 1C's load-bearing spike validates four substrate properties:
//   1. The spawned subprocess command line genuinely contains `wsl.exe`
//      (Windows only — verified via CommandBuilder Debug rendering).
//   2. The pty inside the wrapped session sees Linux as the underlying OS.
//   3. ANSI escape sequences pass through the pty unmolested.
//   4. Terminal-size queries (`stty size`) return what the master allocated.
//
// Tests for criteria 2–4 run on Unix (here in WSL2 dev, and on the
// Sentinel CI's Ubuntu runner). Test for criterion 1 runs on Windows
// (the investor's `cargo test` on Windows). Each axis is covered exactly
// once — no wishful cross-platform validation.

use crate::roster::target::Target;
use portable_pty::CommandBuilder;
use std::path::{Path, PathBuf};

/// Everything the substrate needs to wrap one session.
///
/// `working_dir` is the **WSL2-side absolute path** even on Windows — the
/// `cd` happens inside the bridged bash, not in the Windows-side wsl.exe
/// invocation. `distro` is the only Windows-specific field; on Unix it is
/// ignored entirely.
#[derive(Debug, Clone)]
pub struct SessionSpec {
    pub working_dir: PathBuf,
    pub binary: String,
    pub args: Vec<String>,
    pub distro: Option<String>,
}

impl SessionSpec {
    /// Build a session spec for one of the Mezzanine's dispatched
    /// scientists. The `Target::cwd` resolver already handles
    /// POSIX/backslash normalization and trailing-slash hygiene, so the
    /// path is constructed there rather than re-implementing the join
    /// logic here.
    pub fn for_target(lab_root: &Path, target: &Target, distro: Option<String>) -> Self {
        Self {
            working_dir: target.cwd(lab_root),
            binary: "claude".to_string(),
            args: Vec::new(),
            distro,
        }
    }
}

/// Build a `portable_pty::CommandBuilder` for the substrate.
///
/// On Windows: `wsl.exe -d <distro> -- bash -lc "<inner>"`.
/// On Unix:    `bash -lc "<inner>"`.
///
/// The inner shell command is always `cd <working_dir> && exec <binary> <args...>` —
/// `exec` replaces the bash so signals (Ctrl+C, SIGHUP) reach the wrapped
/// binary directly instead of dying on the shell wrapper.
pub fn build_command(spec: &SessionSpec) -> CommandBuilder {
    let inner = inner_shell_command(spec);

    #[cfg(windows)]
    {
        let mut cmd = CommandBuilder::new("wsl.exe");
        if let Some(distro) = &spec.distro {
            cmd.arg("-d");
            cmd.arg(distro);
        }
        cmd.arg("--");
        cmd.arg("bash");
        cmd.arg("-lc");
        cmd.arg(inner);
        cmd
    }

    #[cfg(unix)]
    {
        let _ = &spec.distro; // silence unused on Unix without sprinkling cfg
        let mut cmd = CommandBuilder::new("bash");
        cmd.arg("-lc");
        cmd.arg(inner);
        cmd
    }
}

/// Compose the inner shell command — `cd <dir> && exec <bin> <args...>`.
fn inner_shell_command(spec: &SessionSpec) -> String {
    let working_dir = spec
        .working_dir
        .to_str()
        .expect("substrate: working_dir must be valid UTF-8");
    let mut cmd = format!(
        "cd {} && exec {}",
        shell_quote(working_dir),
        shell_quote(&spec.binary),
    );
    for arg in &spec.args {
        cmd.push(' ');
        cmd.push_str(&shell_quote(arg));
    }
    cmd
}

/// Single-quote-wrap an argument for inclusion in a bash command line.
/// Bash treats everything inside single quotes as literal except the
/// closing quote itself — so an embedded `'` becomes `'\''` (close, escaped
/// quote, reopen).
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use portable_pty::{native_pty_system, PtySize};
    use std::io::Read;
    use std::time::{Duration, Instant};

    fn drain_until_or_timeout(
        reader: &mut Box<dyn Read + Send>,
        needles: &[&str],
        timeout: Duration,
    ) -> String {
        let start = Instant::now();
        let mut buffer = String::new();
        let mut byte_buffer = [0u8; 4096];
        while start.elapsed() < timeout {
            match reader.read(&mut byte_buffer) {
                Ok(0) => break,
                Ok(n) => {
                    buffer.push_str(&String::from_utf8_lossy(&byte_buffer[..n]));
                    if needles.iter().all(|needle| buffer.contains(needle)) {
                        return buffer;
                    }
                }
                Err(_) => break,
            }
        }
        buffer
    }

    fn run_command_capture(spec: SessionSpec, needles: &[&str]) -> String {
        let pty = native_pty_system()
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("substrate spike: openpty failed");

        let cmd = build_command(&spec);
        let mut child = pty
            .slave
            .spawn_command(cmd)
            .expect("substrate spike: spawn_command failed");
        drop(pty.slave);

        let mut reader = pty.master.try_clone_reader().expect("clone reader");
        let output = drain_until_or_timeout(&mut reader, needles, Duration::from_secs(5));
        let _ = child.kill();
        let _ = child.wait();
        output
    }

    // ---- Pure functions: shell quoting + command composition --------------

    #[test]
    fn shell_quote_wraps_simple_strings() {
        assert_eq!(shell_quote("foo"), "'foo'");
        assert_eq!(shell_quote("foo bar"), "'foo bar'");
    }

    #[test]
    fn shell_quote_escapes_embedded_single_quotes() {
        assert_eq!(shell_quote("don't"), r"'don'\''t'");
    }

    #[test]
    fn inner_shell_command_uses_cd_and_exec() {
        let spec = SessionSpec {
            working_dir: PathBuf::from("/tmp/x"),
            binary: "echo".to_string(),
            args: vec!["hello".to_string()],
            distro: None,
        };
        assert_eq!(
            inner_shell_command(&spec),
            "cd '/tmp/x' && exec 'echo' 'hello'",
        );
    }

    #[test]
    fn for_target_resolves_via_target_cwd() {
        use crate::roster::target::{ExperimentCodename, Target};
        let spec = SessionSpec::for_target(
            Path::new("/home/scientist/code/zmuuzn"),
            &Target::experiment(ExperimentCodename::Crucible),
            None,
        );
        assert_eq!(
            spec.working_dir.to_str().unwrap(),
            "/home/scientist/code/zmuuzn/experiments/zmuuzn-strava",
        );
        assert_eq!(spec.binary, "claude");
    }

    // ---- Windows substrate criterion 1 ------------------------------------
    // The CommandBuilder for Windows must invoke `wsl.exe` with the right
    // distro and inner command. We don't spawn — we inspect Debug.

    #[cfg(windows)]
    #[test]
    fn windows_substrate_wraps_wsl_exe() {
        use crate::roster::target::{ExperimentCodename, Target};
        let spec = SessionSpec::for_target(
            Path::new("/home/scientist/code/zmuuzn"),
            &Target::experiment(ExperimentCodename::Crucible),
            Some("Ubuntu".to_string()),
        );
        let cmd = build_command(&spec);
        let debug = format!("{cmd:?}");
        assert!(
            debug.contains("wsl.exe"),
            "expected 'wsl.exe' in CommandBuilder, got: {debug}",
        );
        assert!(
            debug.contains("Ubuntu"),
            "expected '-d Ubuntu' in CommandBuilder, got: {debug}",
        );
        assert!(
            debug.contains("zmuuzn-strava"),
            "expected experiment path in CommandBuilder, got: {debug}",
        );
    }

    // ---- Unix substrate criteria 2/3/4 ------------------------------------
    // The pty wraps a real bash; the wrapped subprocess sees Linux, ANSI
    // codes survive, and the master's allocated size reaches `stty size`.

    #[cfg(unix)]
    #[test]
    fn unix_substrate_sees_linux_kernel() {
        // Criterion 2: uname -s returns Linux.
        let spec = SessionSpec {
            working_dir: std::env::temp_dir(),
            binary: "uname".to_string(),
            args: vec!["-s".to_string()],
            distro: None,
        };
        let output = run_command_capture(spec, &["Linux"]);
        assert!(
            output.contains("Linux"),
            "expected 'Linux' in pty output, got: {output:?}",
        );
    }

    #[cfg(unix)]
    #[test]
    fn unix_substrate_passes_ansi_escapes() {
        // Criterion 3: ANSI escape sequences survive the pty.
        // We use printf to emit raw \033 sequences.
        let spec = SessionSpec {
            working_dir: std::env::temp_dir(),
            binary: "printf".to_string(),
            args: vec![r"\033[31mred\033[0m".to_string()],
            distro: None,
        };
        let output = run_command_capture(spec, &["red"]);
        assert!(
            output.contains("\x1b[31m"),
            "expected ANSI red-on, got: {output:?}",
        );
        assert!(
            output.contains("\x1b[0m"),
            "expected ANSI reset, got: {output:?}",
        );
    }

    #[cfg(unix)]
    #[test]
    fn unix_substrate_honors_terminal_size() {
        // Criterion 4: `stty size` reports the master's allocated rows×cols.
        // We opened the pty at 24×80, so the wrapped subprocess should see
        // "24 80".
        let spec = SessionSpec {
            working_dir: std::env::temp_dir(),
            binary: "stty".to_string(),
            args: vec!["size".to_string()],
            distro: None,
        };
        let output = run_command_capture(spec, &["24 80"]);
        assert!(
            output.contains("24 80"),
            "expected '24 80' in pty output, got: {output:?}",
        );
    }

    #[cfg(unix)]
    #[test]
    fn unix_substrate_honors_working_dir() {
        // Sanity: the cd inside the substrate actually changes directory.
        let spec = SessionSpec {
            working_dir: PathBuf::from("/tmp"),
            binary: "pwd".to_string(),
            args: Vec::new(),
            distro: None,
        };
        let output = run_command_capture(spec, &["/tmp"]);
        assert!(
            output.contains("/tmp"),
            "expected '/tmp' in pty output, got: {output:?}",
        );
    }
}
