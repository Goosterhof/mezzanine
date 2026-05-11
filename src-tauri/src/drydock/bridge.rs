// The drydock bridge — non-pty subprocess invocations through the WSL2
// bridge on Windows, direct bash on Unix. Mirrors `pty::substrate` but
// for `std::process::Command` rather than `portable_pty::CommandBuilder`,
// because `gh`, `git log`, and `cat` are one-shot reads that don't need
// pty semantics.
//
// The shape is identical to substrate.rs by design: the same bridging
// rules, the same single-quote escape protocol, the same `cd <dir> &&
// exec <bin> <args...>` inner shell command. We deliberately don't share
// code with substrate.rs — that module returns `portable_pty::CommandBuilder`
// and the public types differ; copying twenty lines is cheaper than a
// generic wrapper.

use crate::error::{WorkbenchError, WorkbenchResult};
use std::path::Path;
use std::process::{Command, Output};

/// Run `bin` with `args` inside `working_dir`, bridged through WSL2 on
/// Windows. Returns captured stdout as a UTF-8 string. Stderr is only
/// surfaced on non-zero exit.
///
/// `distro` is the Windows-only WSL2 distro name. On Unix it is ignored.
pub fn run_in_lab(
    working_dir: &Path,
    bin: &str,
    args: &[&str],
    distro: Option<&str>,
) -> WorkbenchResult<String> {
    let inner = inner_shell_command(working_dir, bin, args);
    let mut cmd = bridged_command(&inner, distro);
    let output = cmd
        .output()
        .map_err(|e| WorkbenchError::WslBridge(format!("subprocess failed: {e}")))?;
    extract_stdout(output, bin)
}

/// Same as `run_in_lab` but pipes `stdin_payload` to the subprocess's
/// stdin before reading stdout. Used by `gh pr review --body -` style
/// invocations where the body might be long enough to embarrass an
/// argv-only path.
pub fn run_in_lab_with_stdin(
    working_dir: &Path,
    bin: &str,
    args: &[&str],
    stdin_payload: &str,
    distro: Option<&str>,
) -> WorkbenchResult<String> {
    use std::io::Write;
    use std::process::Stdio;

    let inner = inner_shell_command(working_dir, bin, args);
    let mut cmd = bridged_command(&inner, distro);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| WorkbenchError::WslBridge(format!("subprocess failed: {e}")))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(stdin_payload.as_bytes())
            .map_err(WorkbenchError::Io)?;
    }
    let output = child
        .wait_with_output()
        .map_err(|e| WorkbenchError::WslBridge(format!("subprocess wait failed: {e}")))?;
    extract_stdout(output, bin)
}

/// Build a `Command` that runs `inner` through bash, bridged through
/// `wsl.exe` on Windows.
fn bridged_command(inner: &str, distro: Option<&str>) -> Command {
    #[cfg(windows)]
    {
        let mut cmd = Command::new("wsl.exe");
        if let Some(d) = distro {
            cmd.arg("-d").arg(d);
        }
        cmd.arg("--").arg("bash").arg("-lc").arg(inner);
        cmd
    }
    #[cfg(unix)]
    {
        let _ = distro;
        let mut cmd = Command::new("bash");
        cmd.arg("-lc").arg(inner);
        cmd
    }
}

fn inner_shell_command(working_dir: &Path, bin: &str, args: &[&str]) -> String {
    let dir = working_dir
        .to_str()
        .expect("bridge: working_dir must be valid UTF-8");
    let mut cmd = format!("cd {} && exec {}", shell_quote(dir), shell_quote(bin));
    for arg in args {
        cmd.push(' ');
        cmd.push_str(&shell_quote(arg));
    }
    cmd
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

fn extract_stdout(output: Output, bin: &str) -> WorkbenchResult<String> {
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        let code = output.status.code().unwrap_or(-1);
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(WorkbenchError::WslBridge(format!(
            "{bin} exited {code}: {stderr}"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn shell_quote_wraps_simple() {
        assert_eq!(shell_quote("foo"), "'foo'");
    }

    #[test]
    fn shell_quote_escapes_embedded_single_quote() {
        assert_eq!(shell_quote("don't"), r"'don'\''t'");
    }

    #[test]
    fn inner_shell_command_composes_cd_and_exec() {
        let cmd = inner_shell_command(&PathBuf::from("/tmp/x"), "git", &["log", "-n", "5"]);
        assert_eq!(cmd, "cd '/tmp/x' && exec 'git' 'log' '-n' '5'");
    }

    #[cfg(unix)]
    #[test]
    fn run_in_lab_captures_stdout_on_success() {
        let out = run_in_lab(&PathBuf::from("/tmp"), "echo", &["hello"], None).unwrap();
        assert!(out.contains("hello"), "got: {out:?}");
    }

    #[cfg(unix)]
    #[test]
    fn run_in_lab_surfaces_stderr_on_non_zero_exit() {
        let err = run_in_lab(&PathBuf::from("/tmp"), "false", &[], None).unwrap_err();
        // `false` exits 1 with empty stderr; the error message still
        // names the binary and exit code.
        let msg = err.to_string();
        assert!(msg.contains("false") || msg.contains("1"), "got: {msg}");
    }

    #[cfg(unix)]
    #[test]
    fn run_in_lab_with_stdin_pipes_payload() {
        let out =
            run_in_lab_with_stdin(&PathBuf::from("/tmp"), "cat", &[], "piped-body", None).unwrap();
        assert!(out.contains("piped-body"), "got: {out:?}");
    }
}
