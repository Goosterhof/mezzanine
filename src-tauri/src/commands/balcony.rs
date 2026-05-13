// Balcony commands — the rail's two read surfaces.
//
// `read_balcony_signs` reads the laboratory's root CLAUDE.md for the Last
// Chaos cell and every `documents/idea-ledgers/idea-ledger-*.md` for the
// Idea Ledger sign. Each read is best-effort: a missing file degrades the
// affected sign to its default value rather than failing the whole call,
// because a missing file is a real possibility on the investor's machine
// and the rail should still render something.
//
// `list_briefing_templates` returns the compile-time seed library.

use std::path::{Path, PathBuf};

use tauri::State;

use crate::balcony::briefing_library::{self, BriefingTemplate};
use crate::balcony::signs::{self, BalconySigns, IdeaLedgerSign, LastChaosSign};
use crate::error::{MezzanineError, MezzanineResult};
use crate::host_paths;
use crate::state::AppState;

#[tauri::command]
pub async fn read_balcony_signs(state: State<'_, AppState>) -> MezzanineResult<BalconySigns> {
    let (lab_root, distro) = read_lab_state(&state)?;
    // Both reads happen through the WSL2 UNC bridge on Windows. They are
    // sync I/O — move them to the blocking pool so the UI thread stays
    // responsive on rail refresh.
    tokio::task::spawn_blocking(move || {
        let last_chaos = read_last_chaos_sign(&lab_root, distro.as_deref());
        let idea_ledger = read_idea_ledger_sign(&lab_root, distro.as_deref());
        Ok(BalconySigns {
            last_chaos,
            idea_ledger,
        })
    })
    .await
    .map_err(|e| MezzanineError::LabFileRead(format!("balcony read join failed: {e}")))?
}

#[tauri::command]
pub async fn list_briefing_templates() -> Vec<BriefingTemplate> {
    // No I/O — the seed library is compile-time. Async wrapper only so
    // every command in this module presents a uniform signature to Tauri.
    briefing_library::list_templates().to_vec()
}

fn read_last_chaos_sign(lab_root: &Path, distro: Option<&str>) -> LastChaosSign {
    let path = host_paths::resolve_for_std_fs(lab_root, distro, "CLAUDE.md");
    match std::fs::read_to_string(&path) {
        Ok(content) => signs::parse_last_chaos(&content),
        Err(err) => {
            log::warn!(
                "Mezzanine: Last Chaos sign degraded — could not read {} ({err})",
                path.display(),
            );
            LastChaosSign::default()
        }
    }
}

fn read_idea_ledger_sign(lab_root: &Path, distro: Option<&str>) -> IdeaLedgerSign {
    let dir = host_paths::resolve_for_std_fs(lab_root, distro, "documents/idea-ledgers");
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(err) => {
            log::warn!(
                "Mezzanine: Idea Ledger sign degraded — could not list {} ({err})",
                dir.display(),
            );
            return IdeaLedgerSign::default();
        }
    };

    let mut contents: Vec<String> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !is_ledger_file(&path) {
            continue;
        }
        match std::fs::read_to_string(&path) {
            Ok(text) => contents.push(text),
            Err(err) => log::warn!(
                "Mezzanine: skipping unreadable ledger {} ({err})",
                path.display(),
            ),
        }
    }
    let refs: Vec<&str> = contents.iter().map(String::as_str).collect();
    signs::parse_idea_ledger(&refs)
}

fn is_ledger_file(path: &std::path::Path) -> bool {
    if path.extension().and_then(|e| e.to_str()) != Some("md") {
        return false;
    }
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|name| name.starts_with("idea-ledger-"))
        .unwrap_or(false)
}

fn read_lab_state(state: &State<'_, AppState>) -> MezzanineResult<(PathBuf, Option<String>)> {
    let lab_root = state
        .lab_root
        .read()
        .clone()
        .ok_or(MezzanineError::ConfigCorrupt)?;
    let distro = state.distro.read().clone();
    Ok((lab_root, distro))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    /// Allocate a fresh sandbox directory under the OS temp dir. Same
    /// pattern the rest of the crate uses (`lab::wounds`, `roster::*`):
    /// uuid-suffixed so parallel tests don't collide; the caller drops
    /// the directory at the end of the test scope.
    fn sandbox(prefix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mezzanine-balcony-{prefix}-{}",
            uuid::Uuid::new_v4(),
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_file(root: &Path, rel: &str, content: &str) {
        let full = root.join(rel);
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(full, content).unwrap();
    }

    #[test]
    fn read_last_chaos_sign_returns_default_when_claude_md_missing() {
        let dir = sandbox("missing-chaos");
        let sign = read_last_chaos_sign(&dir, None);
        assert_eq!(sign, LastChaosSign::default());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_last_chaos_sign_parses_existing_claude_md() {
        let dir = sandbox("present-chaos");
        write_file(
            &dir,
            "CLAUDE.md",
            "│ Last Chaos │ #00068 — Cardinal Candlelight (Parlour) — 8/10 │\n",
        );
        let sign = read_last_chaos_sign(&dir, None);
        assert_eq!(sign.report_number, Some(68));
        assert_eq!(sign.score.as_deref(), Some("8/10"));
        assert_eq!(sign.label, "Cardinal Candlelight (Parlour)");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_idea_ledger_sign_returns_default_when_dir_missing() {
        let dir = sandbox("missing-ledgers");
        let sign = read_idea_ledger_sign(&dir, None);
        assert_eq!(sign, IdeaLedgerSign::default());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_idea_ledger_sign_aggregates_only_idea_ledger_md_files() {
        let dir = sandbox("present-ledgers");
        write_file(
            &dir,
            "documents/idea-ledgers/idea-ledger-alpha.md",
            "### IDEA #01 — A [CANDIDATE]\nbody\n### IDEA #02 — B [SHELVED]\nbody\n",
        );
        write_file(
            &dir,
            "documents/idea-ledgers/idea-ledger-beta.md",
            "### IDEA #03 — C [APPROVED]\n**Implementation Status:** DELIVERED\n_(Implemented 2026-04-22)_\n",
        );
        // A non-ledger markdown file in the same directory must be ignored.
        write_file(
            &dir,
            "documents/idea-ledgers/README.md",
            "### IDEA #99 — Decoy [CANDIDATE]\n",
        );
        let sign = read_idea_ledger_sign(&dir, None);
        assert_eq!(sign.candidate_count, 1);
        assert_eq!(sign.shelved_count, 1);
        assert_eq!(sign.most_recent_delivered.as_deref(), Some("2026-04-22"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn list_briefing_templates_returns_seed_size() {
        let templates = list_briefing_templates().await;
        assert_eq!(templates.len(), briefing_library::SEED_TEMPLATES.len());
    }
}
