// Wounds at Threshold — directory listing for `.claude/memory/wounds/`.
//
// The Surgeon's threshold is "files exist." Mission Control surfaces the
// most recently modified wound files so the investor can see what's been
// flaring without opening the directory by hand. The CLAUDE.md spec says
// "render most recent by mtime" — that is exactly what we do, capped at
// MAX_WOUNDS so the panel doesn't grow without bound.
//
// The function returns an empty vec when the directory is missing or
// empty; that is the canonical "No wounds at threshold." case the panel
// renders as a quiet empty state.

use crate::error::{MezzanineError, MezzanineResult};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::path::Path;
use std::time::SystemTime;

pub const MAX_WOUNDS: usize = 8;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WoundSummary {
    pub filename: String,
    pub modified_at: String,
    pub size_bytes: u64,
}

pub fn list(wounds_dir: &Path) -> WoundsResult {
    if !wounds_dir.exists() {
        return Ok(Vec::new());
    }
    let entries = std::fs::read_dir(wounds_dir).map_err(MezzanineError::Io)?;
    let mut found: Vec<(SystemTime, WoundSummary)> = Vec::new();
    for entry in entries {
        let entry = entry.map_err(MezzanineError::Io)?;
        let metadata = entry.metadata().map_err(MezzanineError::Io)?;
        if !metadata.is_file() {
            continue;
        }
        let filename = entry
            .file_name()
            .to_str()
            .map(str::to_string)
            .unwrap_or_default();
        if filename.is_empty() || !filename.ends_with(".md") {
            continue;
        }
        let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        found.push((
            modified,
            WoundSummary {
                filename,
                modified_at: format_rfc3339(modified),
                size_bytes: metadata.len(),
            },
        ));
    }
    found.sort_by_key(|entry| std::cmp::Reverse(entry.0));
    Ok(found.into_iter().map(|(_, s)| s).take(MAX_WOUNDS).collect())
}

type WoundsResult = MezzanineResult<Vec<WoundSummary>>;

fn format_rfc3339(t: SystemTime) -> String {
    let datetime: DateTime<Utc> = t.into();
    datetime.to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn tempdir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("workbench-wounds-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn missing_directory_returns_empty() {
        let path = std::env::temp_dir().join("workbench-wounds-does-not-exist-xyz");
        let _ = fs::remove_dir_all(&path);
        let wounds = list(&path).unwrap();
        assert!(wounds.is_empty());
    }

    #[test]
    fn empty_directory_returns_empty() {
        let dir = tempdir();
        let wounds = list(&dir).unwrap();
        assert!(wounds.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn lists_markdown_files_only() {
        let dir = tempdir();
        fs::write(dir.join("alpha.md"), "wound").unwrap();
        fs::write(dir.join("readme.txt"), "not a wound").unwrap();
        fs::write(dir.join("beta.md"), "wound two").unwrap();

        let wounds = list(&dir).unwrap();
        let names: Vec<_> = wounds.iter().map(|w| w.filename.clone()).collect();
        assert!(names.contains(&"alpha.md".to_string()));
        assert!(names.contains(&"beta.md".to_string()));
        assert!(!names.contains(&"readme.txt".to_string()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn limits_to_max_wounds() {
        let dir = tempdir();
        for i in 0..(MAX_WOUNDS + 4) {
            fs::write(dir.join(format!("w{i:02}.md")), "x").unwrap();
        }
        let wounds = list(&dir).unwrap();
        assert_eq!(wounds.len(), MAX_WOUNDS);
        let _ = fs::remove_dir_all(&dir);
    }
}
