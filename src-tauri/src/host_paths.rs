// Host path resolvers — bridge between the WSL2-side POSIX `lab_root`
// and the two kinds of host operations the Mezzanine performs on it.
//
// The `lab_root` stored in `AppState` is *always* a WSL2-side POSIX path
// — that is what the substrate's `cd && exec claude` needs, and what the
// first-run wizard captures. But not every caller is the substrate. Two
// other shapes exist:
//
//   * **Direct `std::fs` reads from the Windows host** — balcony signs,
//     Mission Control files, Drydock artifact scans. On Windows these
//     must travel as `\\wsl$\<distro>\path\to\file` UNC paths so the
//     Windows filesystem driver routes the read into WSL2. `resolve_for_std_fs`
//     does that conversion; on Unix it returns the POSIX join unchanged.
//
//   * **Subprocess working dirs piped to `wsl.exe -- bash -lc "cd ..."`** —
//     the Drydock's `git log` / `gh` invocations. These need a POSIX-form
//     *string* the Windows-side `Path::join` cannot have injected backslashes
//     into. `to_posix_lab_path` produces it.
//
// The bench era's `Target::cwd` does the same POSIX-form normalization for
// the pty substrate; this module is its free-function complement for
// callers that hold an arbitrary relative path instead of a `Target` enum.

use std::path::{Path, PathBuf};

/// Resolve a lab-relative path into a host filesystem path the running
/// Mezzanine process can read with `std::fs`. On Windows, prefix with
/// `\\wsl$\<distro>\` so reads reach inside WSL2; on Unix, the lab_root
/// is already a path the process can see directly.
pub fn resolve_for_std_fs(lab_root: &Path, distro: Option<&str>, relative: &str) -> PathBuf {
    #[cfg(windows)]
    {
        if let Some(d) = distro.filter(|s| !s.is_empty()) {
            return wsl_unc_path(lab_root, d, relative);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = distro;
    }
    lab_root.join(relative)
}

/// POSIX-form lab path string — used by callers that pipe the result
/// through the WSL2 bridge as a `cd` argument. Always forward slashes,
/// never the host's native separator.
pub fn to_posix_lab_path(lab_root: &Path, relative: &str) -> String {
    let root = lab_root
        .to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_string();
    let rel = relative.trim_start_matches(['/', '\\']).replace('\\', "/");
    if rel.is_empty() {
        root
    } else if root.is_empty() {
        rel
    } else {
        format!("{root}/{rel}")
    }
}

#[cfg(windows)]
fn wsl_unc_path(lab_root: &Path, distro: &str, relative: &str) -> PathBuf {
    let posix = lab_root.to_string_lossy().replace('\\', "/");
    let trimmed = posix.trim_start_matches('/').trim_end_matches('/');
    let unc = if trimmed.is_empty() {
        format!("\\\\wsl$\\{distro}")
    } else {
        format!("\\\\wsl$\\{}\\{}", distro, trimmed.replace('/', "\\"))
    };
    let mut p = PathBuf::from(unc);
    let rel = relative.trim_start_matches(['/', '\\']);
    if !rel.is_empty() {
        p.push(rel.replace('/', "\\"));
    }
    p
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- to_posix_lab_path -------------------------------------------------

    #[test]
    fn posix_join_passthrough_for_posix_lab_root() {
        let out = to_posix_lab_path(Path::new("/home/g/code/zmuuzn"), "CLAUDE.md");
        assert_eq!(out, "/home/g/code/zmuuzn/CLAUDE.md");
    }

    #[test]
    fn posix_join_normalizes_windows_lab_root() {
        // Defensive: if someone ever stores a Windows-style lab_root, we
        // still emit a POSIX-form string the bash inside wsl.exe can `cd`.
        let out = to_posix_lab_path(Path::new("C:\\Users\\foo\\code\\zmuuzn"), "CLAUDE.md");
        assert_eq!(out, "C:/Users/foo/code/zmuuzn/CLAUDE.md");
    }

    #[test]
    fn posix_join_handles_nested_relative() {
        let out = to_posix_lab_path(
            Path::new("/home/g/code/zmuuzn"),
            "documents/idea-ledgers",
        );
        assert_eq!(out, "/home/g/code/zmuuzn/documents/idea-ledgers");
    }

    #[test]
    fn posix_join_trims_leading_slash_on_relative() {
        let out = to_posix_lab_path(Path::new("/home/g/code/zmuuzn"), "/CLAUDE.md");
        assert_eq!(out, "/home/g/code/zmuuzn/CLAUDE.md");
    }

    #[test]
    fn posix_join_trims_trailing_slash_on_root() {
        let out = to_posix_lab_path(Path::new("/home/g/code/zmuuzn/"), "CLAUDE.md");
        assert_eq!(out, "/home/g/code/zmuuzn/CLAUDE.md");
    }

    #[test]
    fn posix_join_handles_empty_relative() {
        let out = to_posix_lab_path(Path::new("/home/g/code/zmuuzn"), "");
        assert_eq!(out, "/home/g/code/zmuuzn");
    }

    #[test]
    fn posix_join_normalizes_backslash_in_relative() {
        let out = to_posix_lab_path(
            Path::new("/home/g/code/zmuuzn"),
            "documents\\idea-ledgers",
        );
        assert_eq!(out, "/home/g/code/zmuuzn/documents/idea-ledgers");
    }

    // ---- resolve_for_std_fs (Unix branch) ---------------------------------

    #[cfg(not(windows))]
    #[test]
    fn std_fs_resolution_on_unix_is_direct_join() {
        let p = resolve_for_std_fs(Path::new("/home/g/code/zmuuzn"), None, "CLAUDE.md");
        assert_eq!(p.to_str().unwrap(), "/home/g/code/zmuuzn/CLAUDE.md");
    }

    #[cfg(not(windows))]
    #[test]
    fn std_fs_resolution_on_unix_ignores_distro() {
        let p = resolve_for_std_fs(
            Path::new("/home/g/code/zmuuzn"),
            Some("Ubuntu"),
            "documents/idea-ledgers",
        );
        assert_eq!(
            p.to_str().unwrap(),
            "/home/g/code/zmuuzn/documents/idea-ledgers"
        );
    }

    // ---- resolve_for_std_fs (Windows branch) ------------------------------

    #[cfg(windows)]
    #[test]
    fn std_fs_resolution_on_windows_prepends_wsl_unc_prefix() {
        let p = resolve_for_std_fs(
            Path::new("/home/g/code/zmuuzn"),
            Some("Ubuntu"),
            "CLAUDE.md",
        );
        assert_eq!(
            p.to_str().unwrap(),
            r"\\wsl$\Ubuntu\home\g\code\zmuuzn\CLAUDE.md"
        );
    }

    #[cfg(windows)]
    #[test]
    fn std_fs_resolution_handles_nested_relative() {
        let p = resolve_for_std_fs(
            Path::new("/home/goosterhof/code/zmuuzn"),
            Some("Ubuntu"),
            "documents/idea-ledgers",
        );
        assert_eq!(
            p.to_str().unwrap(),
            r"\\wsl$\Ubuntu\home\goosterhof\code\zmuuzn\documents\idea-ledgers"
        );
    }

    #[cfg(windows)]
    #[test]
    fn std_fs_resolution_falls_back_to_direct_join_when_distro_absent() {
        // Without a distro, we have no UNC prefix to attach. The caller's
        // read will fail noisily, but the function does not panic.
        let p = resolve_for_std_fs(Path::new("/home/g/code/zmuuzn"), None, "CLAUDE.md");
        // Path::join with a POSIX-shaped left and a relative right injects
        // a backslash on Windows; we accept that — this branch is the
        // "misconfigured" fallback, not the production path.
        assert!(p.to_str().unwrap().contains("CLAUDE.md"));
    }

    #[cfg(windows)]
    #[test]
    fn std_fs_resolution_falls_back_when_distro_empty() {
        let p = resolve_for_std_fs(Path::new("/home/g/code/zmuuzn"), Some(""), "CLAUDE.md");
        assert!(p.to_str().unwrap().contains("CLAUDE.md"));
    }

    #[cfg(windows)]
    #[test]
    fn std_fs_resolution_handles_trailing_slash_on_root() {
        let p = resolve_for_std_fs(
            Path::new("/home/g/code/zmuuzn/"),
            Some("Ubuntu"),
            "CLAUDE.md",
        );
        assert_eq!(
            p.to_str().unwrap(),
            r"\\wsl$\Ubuntu\home\g\code\zmuuzn\CLAUDE.md"
        );
    }
}
