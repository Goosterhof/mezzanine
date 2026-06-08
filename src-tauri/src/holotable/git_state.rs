// The Holotable's git-state reader.
//
// Three commands through the WSL2 bridge:
//   * `git branch --show-current`   — the current branch name
//   * `git status --porcelain`       — working-tree cleanliness + line counts
//   * `git submodule status`         — per-submodule short ref + dirty flag
//
// Every command runs through `drydock::bridge::run_in_lab` so the substrate
// stays consistent with the Drydock's `gh` and `git log` invocations — one
// bridge, one set of error vocab, one set of regression tests.
//
// Failures degrade gracefully: each command's stderr is logged at WARN and
// the read returns whichever state it could assemble. The scene always has
// something to render — a blank floor is worse than a stale floor.

use crate::drydock::bridge::run_in_lab;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LabGitState {
    /// Current branch name; empty when `git branch --show-current` failed.
    pub branch: String,
    /// True when `git status --porcelain` produced any output.
    pub dirty: bool,
    /// Untracked file count (porcelain `??` lines).
    pub untracked_count: u32,
    /// Modified file count (porcelain second column non-space).
    pub modified_count: u32,
    /// Staged file count (porcelain first column non-space and non-`?`).
    pub staged_count: u32,
    /// One row per submodule listed by `git submodule status`.
    pub submodules: Vec<SubmoduleState>,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubmoduleState {
    /// Last path segment of the submodule (e.g. `zmuuzn-strava`).
    pub name: String,
    /// Path relative to the laboratory root (e.g. `experiments/zmuuzn-strava`).
    pub path: String,
    /// True when the submodule has uncommitted changes (porcelain non-empty).
    pub dirty: bool,
    /// False when `git submodule status` prefixed the line with `-`
    /// (submodule not initialized).
    pub initialized: bool,
}

/// Read the laboratory's git state through the WSL2 bridge. All three
/// subcommands run sequentially; degradation is per-command (a failed
/// branch read does not block status, and vice versa).
pub fn read(lab_root: &Path, distro: Option<&str>) -> LabGitState {
    let branch = read_branch(lab_root, distro);
    let (dirty, untracked_count, modified_count, staged_count) =
        read_status_counts(lab_root, distro);
    let submodules = read_submodules(lab_root, distro);
    LabGitState {
        branch,
        dirty,
        untracked_count,
        modified_count,
        staged_count,
        submodules,
    }
}

fn read_branch(lab_root: &Path, distro: Option<&str>) -> String {
    match run_in_lab(lab_root, "git", &["branch", "--show-current"], distro) {
        Ok(stdout) => stdout.trim().to_string(),
        Err(err) => {
            log::warn!("Holotable: branch read degraded — {err}; floor will show empty branch");
            String::new()
        }
    }
}

fn read_status_counts(lab_root: &Path, distro: Option<&str>) -> (bool, u32, u32, u32) {
    match run_in_lab(lab_root, "git", &["status", "--porcelain"], distro) {
        Ok(stdout) => parse_porcelain(&stdout),
        Err(err) => {
            log::warn!("Holotable: status read degraded — {err}; floor will show clean tree");
            (false, 0, 0, 0)
        }
    }
}

fn parse_porcelain(stdout: &str) -> (bool, u32, u32, u32) {
    let mut untracked = 0u32;
    let mut modified = 0u32;
    let mut staged = 0u32;
    let mut any = false;
    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }
        any = true;
        let mut chars = line.chars();
        let x = chars.next().unwrap_or(' ');
        let y = chars.next().unwrap_or(' ');
        if x == '?' && y == '?' {
            untracked += 1;
            continue;
        }
        if x != ' ' && x != '?' {
            staged += 1;
        }
        if y != ' ' && y != '?' {
            modified += 1;
        }
    }
    (any, untracked, modified, staged)
}

fn read_submodules(lab_root: &Path, distro: Option<&str>) -> Vec<SubmoduleState> {
    let raw = match run_in_lab(lab_root, "git", &["submodule", "status"], distro) {
        Ok(s) => s,
        Err(err) => {
            log::warn!(
                "Holotable: submodule status read degraded — {err}; floor renders without submodule context"
            );
            return Vec::new();
        }
    };
    parse_submodule_status(&raw)
}

fn parse_submodule_status(raw: &str) -> Vec<SubmoduleState> {
    let mut out = Vec::new();
    for line in raw.lines() {
        if line.is_empty() {
            continue;
        }
        // Format: `[ -+U]<sha> <path>[ (<describe>)]`. The leading byte
        // encodes initialization state: `-` = not initialized, `+` = sha
        // mismatch, ` ` = clean, `U` = merge conflict.
        let mut chars = line.chars();
        let first = chars.next().unwrap_or(' ');
        let initialized = first != '-';
        let dirty = first == '+' || first == 'U';
        let body = if first == ' ' { line } else { &line[1..] };
        let mut parts = body.split_whitespace();
        // Skip sha.
        let _sha = parts.next();
        let path = match parts.next() {
            Some(p) => p.to_string(),
            None => continue,
        };
        let name = path.rsplit('/').next().unwrap_or(&path).to_string();
        out.push(SubmoduleState {
            name,
            path,
            dirty,
            initialized,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn parses_clean_repo() {
        let (dirty, u, m, s) = parse_porcelain("");
        assert!(!dirty);
        assert_eq!((u, m, s), (0, 0, 0));
    }

    #[test]
    fn parses_dirty_repo() {
        let stdout = "M  src/a.rs\n M src/b.rs\n?? src/c.rs\nA  src/d.rs\n";
        let (dirty, untracked, modified, staged) = parse_porcelain(stdout);
        assert!(dirty);
        assert_eq!(untracked, 1);
        assert_eq!(modified, 1);
        assert_eq!(staged, 2);
    }

    #[test]
    fn parses_submodule_status_initialized() {
        let raw = " abcdef1 experiments/zmuuzn-auth (heads/main)\n abcdef2 gadgets/mezzanine (heads/main)\n";
        let subs = parse_submodule_status(raw);
        assert_eq!(subs.len(), 2);
        assert_eq!(subs[0].name, "zmuuzn-auth");
        assert_eq!(subs[0].path, "experiments/zmuuzn-auth");
        assert!(subs[0].initialized);
        assert!(!subs[0].dirty);
        assert_eq!(subs[1].name, "mezzanine");
    }

    #[test]
    fn parses_submodule_status_uninitialized_and_dirty() {
        let raw = "-abcdef1 experiments/zmuuzn-auth\n+abcdef2 gadgets/mezzanine (heads/main)\n";
        let subs = parse_submodule_status(raw);
        assert_eq!(subs.len(), 2);
        assert!(!subs[0].initialized);
        assert!(subs[1].dirty);
        assert!(subs[1].initialized);
    }

    #[cfg(unix)]
    #[test]
    fn read_returns_empty_state_when_lab_root_is_invalid() {
        // A non-git directory still resolves through the bridge — every
        // command fails with non-zero exit, every reader logs WARN and
        // returns its default. The scene gets a blank-but-non-panicking
        // state to render.
        let state = read(&PathBuf::from("/nonexistent-holotable-test-path"), None);
        assert_eq!(state.branch, "");
        assert!(!state.dirty);
        assert!(state.submodules.is_empty());
    }
}
