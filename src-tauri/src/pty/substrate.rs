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
    /// Extra environment variables exported into the WSL2-side bash before
    /// the `exec` — one `export 'K'='V' &&` fragment per pair, in order,
    /// after the canonical alt-screen export and before the binary. The
    /// `for_target` constructor leaves this empty; only the crier
    /// (`for_crier`) populates it. **Keys must not contain `=`** — the
    /// crier is the sole caller and its keys are compile-time literals, so
    /// this is a documented contract, not a runtime guard.
    pub env: Vec<(String, String)>,
    pub distro: Option<String>,
}

impl SessionSpec {
    /// Build a session spec for one of the Mezzanine's dispatched
    /// scientists. The `Target::cwd` resolver already handles
    /// POSIX/backslash normalization and trailing-slash hygiene, so the
    /// path is constructed there rather than re-implementing the join
    /// logic here. `binary` overrides the substrate's default `"claude"`;
    /// the wizard threads its persisted choice through here.
    ///
    /// `mission` is the scientist's opening prompt. When non-empty it is
    /// passed to `claude` as a single positional argument — `claude
    /// '<mission>'` starts an INTERACTIVE session with the prompt
    /// auto-submitted as the first turn (this is distinct from `-p`, which
    /// prints and exits). An empty/whitespace mission yields no args, so
    /// the scientist gets a plain `claude` session with no seeded prompt.
    pub fn for_target(
        lab_root: &Path,
        target: &Target,
        distro: Option<String>,
        binary: Option<String>,
        mission: &str,
    ) -> Self {
        let args = if mission.trim().is_empty() {
            Vec::new()
        } else {
            vec![mission.to_string()]
        };
        Self {
            working_dir: target.cwd(lab_root),
            binary: binary
                .filter(|b| !b.trim().is_empty())
                .unwrap_or_else(|| "claude".to_string()),
            args,
            env: Vec::new(),
            distro,
        }
    }

    /// Build the session spec for the town-crier relay — the Mezzanine's
    /// always-on patrol post (experiment log #00060). Unlike `for_target`,
    /// the crier carries no `mission` opening prompt: its `args` are the
    /// channel-loading flag and the relay server selector, which `claude`
    /// reads as a CLI flag plus an MCP-server subcommand, not as a seeded
    /// prompt. The crier always runs from the lab root (`Target::LabRoot`)
    /// — `--dangerously-load-development-channels server:town-crier-relay`
    /// resolves the `town-crier-relay` server name against the `.mcp.json`
    /// in the working directory, and only the lab root's `.mcp.json`
    /// defines it.
    ///
    /// The token is injected as `TOWN_CRIER_LAB_TOKEN`, **not**
    /// `TC_RELAY_TOKEN`. The relay reads its token from the `.mcp.json` env
    /// block, which sets `TC_RELAY_TOKEN: "${TOWN_CRIER_LAB_TOKEN:-unset}"`
    /// — an MCP-config env key is explicit and overwrites any
    /// outer-shell-injected `TC_RELAY_TOKEN`. Injecting the variable the
    /// `.mcp.json` *expands* (`TOWN_CRIER_LAB_TOKEN`) is the only path that
    /// reaches the relay. `TC_RELAY_ARMED=1` rides the shell because the
    /// `.mcp.json` deliberately omits it (an always-set ARMED would make
    /// every session poll). `TC_RELAY_REPOS` is NOT injected — the
    /// `.mcp.json` sets it explicitly, so any injected value is dead.
    pub fn for_crier(
        lab_root: &Path,
        distro: Option<String>,
        binary: Option<String>,
        token: &str,
    ) -> Self {
        Self {
            working_dir: Target::LabRoot.cwd(lab_root),
            binary: binary
                .filter(|b| !b.trim().is_empty())
                .unwrap_or_else(|| "claude".to_string()),
            args: vec![
                "--dangerously-load-development-channels".to_string(),
                "server:town-crier-relay".to_string(),
            ],
            env: vec![
                ("TC_RELAY_ARMED".to_string(), "1".to_string()),
                ("TOWN_CRIER_LAB_TOKEN".to_string(), token.to_string()),
            ],
            distro,
        }
    }
}

/// Build a `portable_pty::CommandBuilder` for the substrate.
///
/// On Windows: `wsl.exe -d <distro> -- bash -lc "<inner>"`.
/// On Unix:    `bash -lc "<inner>"`.
///
/// The inner shell command is always
/// `cd <working_dir> && export CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 && exec <binary> <args...>` —
/// `exec` replaces the bash so signals (Ctrl+C, SIGHUP) reach the wrapped
/// binary directly instead of dying on the shell wrapper. The exported flag
/// pins `claude` to its classic main-screen renderer — see `inner_shell_command`.
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

/// Compose the inner shell command —
/// `cd <dir> && export CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 && exec <bin> <args...>`.
///
/// **Why the exported flag.** The Mezzanine renders every dispatched scientist
/// inside an `@xterm/xterm` canvas (decision 007). When `claude` runs its
/// flicker-free *fullscreen* renderer — forced lab-wide by `CLAUDE_CODE_NO_FLICKER=1`
/// in the investor's `~/.claude/settings.json` — it draws on the terminal's
/// **alternate screen buffer**. In the alt buffer, with no application mouse
/// tracking active at the prompt, xterm.js translates the mouse wheel into
/// arrow-key presses; `claude` reads those as input-history navigation, so the
/// investor scrolls the prompt history instead of the conversation and has no
/// way to scroll the transcript at all.
///
/// `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` overrides `NO_FLICKER` (verified
/// against claude 2.1.177: the binary stops emitting `\x1b[?1049h`) and pins
/// the *classic main-screen renderer*. `claude` then streams the conversation
/// to the normal buffer, where xterm's own scrollback (5000 lines) holds it and
/// the wheel scrolls the transcript natively. The trade is the flicker-free
/// fullscreen rendering — a non-issue in a local canvas-rendered xterm, and the
/// investor's global terminal keeps `NO_FLICKER` untouched because this flag is
/// scoped to the Mezzanine-dispatched session only.
///
/// The flag must ride the WSL2-side bash command, not the `wsl.exe`
/// `CommandBuilder` env: env vars set on the Windows-side builder do not cross
/// into the WSL distro without `WSLENV` plumbing, but an `export` inside the
/// inner shell runs where `claude` actually lives (AD-1, the WSL2 bridge).
fn inner_shell_command(spec: &SessionSpec) -> String {
    let working_dir = spec
        .working_dir
        .to_str()
        .expect("substrate: working_dir must be valid UTF-8");
    let mut cmd = format!(
        "cd {} && export CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1",
        shell_quote(working_dir),
    );
    // Custom env vars join the canonical alt-screen export — each as its
    // own `export 'K'='V' &&` fragment, in order, all set before the
    // subprocess starts. The crier (`for_crier`) is the only populator;
    // `for_target` leaves `env` empty, so this loop is a no-op for ordinary
    // scientist dispatches and their inner command is byte-identical to
    // before this field existed.
    for (key, value) in &spec.env {
        cmd.push_str(" && export ");
        cmd.push_str(&shell_quote(key));
        cmd.push('=');
        cmd.push_str(&shell_quote(value));
    }
    cmd.push_str(" && exec ");
    cmd.push_str(&shell_quote(&spec.binary));
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
            env: Vec::new(),
            distro: None,
        };
        assert_eq!(
            inner_shell_command(&spec),
            "cd '/tmp/x' && export CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 && exec 'echo' 'hello'",
        );
    }

    #[test]
    fn inner_shell_command_pins_classic_renderer() {
        // Regression guard: the alt-screen disable flag must ride the inner
        // bash command (exported, before exec) so the dispatched `claude`
        // renders on the main screen and the investor can scroll the
        // conversation in xterm. Dropping this re-opens the wheel-scrolls-
        // history wound under the lab-wide CLAUDE_CODE_NO_FLICKER=1 setting.
        let spec = SessionSpec {
            working_dir: PathBuf::from("/tmp/x"),
            binary: "claude".to_string(),
            args: Vec::new(),
            env: Vec::new(),
            distro: None,
        };
        let inner = inner_shell_command(&spec);
        assert!(
            inner.contains("export CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 && exec "),
            "expected the alt-screen disable flag exported before exec, got: {inner}",
        );
    }

    #[test]
    fn for_target_resolves_via_target_cwd() {
        use crate::roster::target::{ExperimentCodename, Target};
        let spec = SessionSpec::for_target(
            Path::new("/home/scientist/code/zmuuzn"),
            &Target::experiment(ExperimentCodename::Crucible),
            None,
            None,
            "",
        );
        assert_eq!(
            spec.working_dir.to_str().unwrap(),
            "/home/scientist/code/zmuuzn/experiments/zmuuzn-strava",
        );
        assert_eq!(spec.binary, "claude");
    }

    #[test]
    fn for_target_honours_binary_override() {
        use crate::roster::target::{ExperimentCodename, Target};
        let spec = SessionSpec::for_target(
            Path::new("/home/scientist/code/zmuuzn"),
            &Target::experiment(ExperimentCodename::Crucible),
            None,
            Some("/opt/claude/bin/claude".to_string()),
            "",
        );
        assert_eq!(spec.binary, "/opt/claude/bin/claude");
    }

    #[test]
    fn for_target_blank_binary_falls_back_to_claude() {
        use crate::roster::target::{ExperimentCodename, Target};
        let spec = SessionSpec::for_target(
            Path::new("/home/scientist/code/zmuuzn"),
            &Target::experiment(ExperimentCodename::Crucible),
            None,
            Some("   ".to_string()),
            "",
        );
        assert_eq!(spec.binary, "claude");
    }

    #[test]
    fn for_target_seeds_mission_as_positional_arg() {
        use crate::roster::target::Target;
        let spec = SessionSpec::for_target(
            Path::new("/home/scientist/code/zmuuzn"),
            &Target::LabRoot,
            None,
            None,
            "@agent-inspector",
        );
        assert_eq!(spec.args, vec!["@agent-inspector".to_string()]);
        // The mission reaches the inner shell command after the binary,
        // single-quoted — this is what gives claude its opening prompt.
        assert_eq!(
            inner_shell_command(&spec),
            "cd '/home/scientist/code/zmuuzn' && export CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 && exec 'claude' '@agent-inspector'",
        );
    }

    #[test]
    fn for_target_empty_mission_yields_plain_claude() {
        use crate::roster::target::Target;
        let spec = SessionSpec::for_target(
            Path::new("/home/scientist/code/zmuuzn"),
            &Target::LabRoot,
            None,
            None,
            "   ",
        );
        assert!(spec.args.is_empty());
        assert_eq!(
            inner_shell_command(&spec),
            "cd '/home/scientist/code/zmuuzn' && export CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 && exec 'claude'",
        );
    }

    #[test]
    fn for_target_carries_no_env() {
        // Regular scientist dispatches inject no extra env — the field is
        // empty for everything but the crier (acceptance criterion 4).
        use crate::roster::target::Target;
        let spec = SessionSpec::for_target(
            Path::new("/home/scientist/code/zmuuzn"),
            &Target::LabRoot,
            None,
            None,
            "go",
        );
        assert!(spec.env.is_empty());
    }

    // ---- Env injection (1A) -----------------------------------------------
    // The substrate emits one `export 'K'='V' &&` per env pair, between the
    // canonical alt-screen export and the exec.

    #[test]
    fn env_vars_appear_in_inner_command() {
        // Criterion 1: a populated env produces `export 'FOO'='bar baz' &&`
        // before the exec, with the value quoted (spaces survive).
        let spec = SessionSpec {
            working_dir: PathBuf::from("/tmp/x"),
            binary: "claude".to_string(),
            args: Vec::new(),
            env: vec![("FOO".to_string(), "bar baz".to_string())],
            distro: None,
        };
        let inner = inner_shell_command(&spec);
        assert!(
            inner.contains("export 'FOO'='bar baz' &&"),
            "expected the env export before exec, got: {inner}",
        );
        assert_eq!(
            inner,
            "cd '/tmp/x' && export CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 && export 'FOO'='bar baz' && exec 'claude'",
        );
    }

    #[test]
    fn empty_env_yields_no_extra_exports() {
        // Criterion 2: an empty env produces the byte-identical command the
        // substrate emitted before the env field existed — no tokens between
        // the alt-screen export and the exec.
        let spec = SessionSpec {
            working_dir: PathBuf::from("/tmp/x"),
            binary: "claude".to_string(),
            args: Vec::new(),
            env: Vec::new(),
            distro: None,
        };
        assert_eq!(
            inner_shell_command(&spec),
            "cd '/tmp/x' && export CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 && exec 'claude'",
        );
    }

    // ---- The crier spec (1B) ----------------------------------------------

    #[test]
    fn for_crier_produces_flag_args() {
        // Criterion 5: the crier's args are the channel flag + relay server
        // selector — not a mission positional.
        let spec = SessionSpec::for_crier(
            Path::new("/home/scientist/code/zmuuzn"),
            None,
            None,
            "tok",
        );
        assert_eq!(
            spec.args,
            vec![
                "--dangerously-load-development-channels".to_string(),
                "server:town-crier-relay".to_string(),
            ],
        );
    }

    #[test]
    fn for_crier_inner_command_quotes_flag_tokens_distinctly() {
        // Criterion 6: the flag and the server selector appear as distinct
        // quoted tokens after the binary.
        let spec = SessionSpec::for_crier(
            Path::new("/home/scientist/code/zmuuzn"),
            None,
            None,
            "tok",
        );
        let inner = inner_shell_command(&spec);
        assert!(
            inner.contains("'--dangerously-load-development-channels'"),
            "expected the channel flag quoted, got: {inner}",
        );
        assert!(
            inner.contains("'server:town-crier-relay'"),
            "expected the relay selector quoted, got: {inner}",
        );
    }

    #[test]
    fn for_crier_injects_armed_and_token_not_relay_token() {
        // Criterion 7: env carries TC_RELAY_ARMED=1 + TOWN_CRIER_LAB_TOKEN,
        // NOT TC_RELAY_TOKEN (which .mcp.json overwrites).
        let spec = SessionSpec::for_crier(
            Path::new("/home/scientist/code/zmuuzn"),
            None,
            None,
            "s3cr3t",
        );
        assert!(spec
            .env
            .iter()
            .any(|(k, v)| k == "TC_RELAY_ARMED" && v == "1"));
        assert!(spec
            .env
            .iter()
            .any(|(k, v)| k == "TOWN_CRIER_LAB_TOKEN" && v == "s3cr3t"));
        assert!(
            !spec.env.iter().any(|(k, _)| k == "TC_RELAY_TOKEN"),
            "TC_RELAY_TOKEN must NOT be injected — .mcp.json overwrites it",
        );
    }

    #[test]
    fn for_crier_does_not_inject_relay_repos() {
        // Criterion 8: TC_RELAY_REPOS is an explicit .mcp.json key — any
        // injected value is dead, so the crier does not inject it.
        let spec = SessionSpec::for_crier(
            Path::new("/home/scientist/code/zmuuzn"),
            None,
            None,
            "tok",
        );
        assert!(!spec.env.iter().any(|(k, _)| k == "TC_RELAY_REPOS"));
    }

    #[test]
    fn for_crier_working_dir_is_lab_root() {
        // Criterion 9: cwd is the lab root, not an experiment subdir.
        let spec = SessionSpec::for_crier(
            Path::new("/home/scientist/code/zmuuzn"),
            None,
            None,
            "tok",
        );
        assert_eq!(
            spec.working_dir.to_str().unwrap(),
            "/home/scientist/code/zmuuzn",
        );
    }

    #[test]
    fn for_crier_full_inner_command_exports_token_before_exec() {
        // The token export rides the inner bash before the exec — the whole
        // point of the env-injection wire (the bash -lc empty-token trap).
        let spec = SessionSpec::for_crier(Path::new("/home/scientist/code/zmuuzn"), None, None, "T");
        assert_eq!(
            inner_shell_command(&spec),
            "cd '/home/scientist/code/zmuuzn' && export CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 && \
             export 'TC_RELAY_ARMED'='1' && export 'TOWN_CRIER_LAB_TOKEN'='T' && \
             exec 'claude' '--dangerously-load-development-channels' 'server:town-crier-relay'",
        );
    }

    #[test]
    fn for_crier_honours_binary_override() {
        let spec = SessionSpec::for_crier(
            Path::new("/home/scientist/code/zmuuzn"),
            None,
            Some("/opt/claude/bin/claude".to_string()),
            "tok",
        );
        assert_eq!(spec.binary, "/opt/claude/bin/claude");
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
            None,
            "",
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
            env: Vec::new(),
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
            env: Vec::new(),
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
            env: Vec::new(),
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
            env: Vec::new(),
            distro: None,
        };
        let output = run_command_capture(spec, &["/tmp"]);
        assert!(
            output.contains("/tmp"),
            "expected '/tmp' in pty output, got: {output:?}",
        );
    }
}
