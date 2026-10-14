//! A view over the canonical backlog. Only the investor's ordering is written.
use crate::error::{MezzanineError, MezzanineResult};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::Path};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BacklogItem {
    pub id: String,
    pub filed: String,
    pub source: String,
    pub item: String,
    pub handler: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Priorities {
    pub revision: String,
    pub priorities: Vec<BacklogItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanningSnapshot {
    pub items: Vec<BacklogItem>,
    pub priorities: Vec<BacklogItem>,
    pub revision: String,
    pub backlog_path: String,
}

fn failure(message: impl Into<String>) -> MezzanineError {
    MezzanineError::LabFileRead(message.into())
}

fn cells(line: &str) -> Vec<String> {
    // Markdown table cells may contain escaped pipes.
    let mut result = Vec::new();
    let mut cell = String::new();
    let mut escaped = false;
    for ch in line.trim().trim_matches('|').chars() {
        if ch == '|' && !escaped {
            result.push(cell.trim().to_string());
            cell.clear();
        } else {
            cell.push(ch);
        }
        escaped = ch == '\\' && !escaped;
    }
    result.push(cell.trim().to_string());
    result
}

pub fn parse(content: &str) -> MezzanineResult<Vec<BacklogItem>> {
    let mut active = false;
    let mut found = false;
    let mut items = Vec::new();
    let mut seen = HashSet::new();
    for line in content.lines() {
        if line.trim() == "## Active backlog" {
            active = true;
            found = true;
            continue;
        }
        if !active {
            continue;
        }
        if line.starts_with("## ") || line.starts_with("| Completed |") {
            break;
        }
        if !line.trim().starts_with('|') {
            continue;
        }
        let parts = cells(line);
        if parts
            .first()
            .is_some_and(|s| s == "Filed" || s.starts_with('-'))
        {
            continue;
        }
        if parts.len() != 5 || chrono::NaiveDate::parse_from_str(&parts[0], "%Y-%m-%d").is_err() {
            return Err(failure(
                "The active backlog contains an unreadable row. Open the source to repair it.",
            ));
        }
        // Exact source identity survives reordering, computed age and handler changes.
        // Editing the task itself intentionally requires reconciliation, not a guessed match.
        let id = serde_json::to_string(&(&parts[0], &parts[1], &parts[2])).unwrap();
        if !seen.insert(id.clone()) {
            return Err(failure(
                "Duplicate backlog items need reconciliation in the source.",
            ));
        }
        items.push(BacklogItem {
            id,
            filed: parts[0].clone(),
            source: parts[1].clone(),
            item: parts[2].clone(),
            handler: parts[3].clone(),
        });
    }
    if !found {
        return Err(failure("The backlog has no Active backlog section."));
    }
    Ok(items)
}

fn read_priorities(documents: &Path) -> MezzanineResult<Priorities> {
    match fs::read_to_string(documents.join("mezzanine-priorities.json")) {
        Ok(body) => serde_json::from_str(&body)
            .map_err(|e| failure(format!("Priority file is unreadable: {e}"))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Priorities::default()),
        Err(e) => Err(e.into()),
    }
}

pub fn read(documents: &Path) -> MezzanineResult<PlanningSnapshot> {
    let path = documents.join("lab-backlog.md");
    let items = parse(&fs::read_to_string(&path)?)?;
    let plan = read_priorities(documents)?;
    Ok(PlanningSnapshot {
        items,
        revision: serde_json::to_string(&plan)?,
        priorities: plan.priorities,
        backlog_path: path.to_string_lossy().into_owned(),
    })
}

pub fn save(
    documents: &Path,
    expected_revision: &str,
    ids: &[String],
) -> MezzanineResult<PlanningSnapshot> {
    if ids.len() > 100 {
        return Err(failure("Keep at most 100 current priorities."));
    }
    let lock_path = documents.join(".mezzanine-priorities.lock");
    let lock = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                failure(format!(
                    "Priority lock exists at {}. Wait for any active save to finish. If it remains after a crash, confirm no Mezzanine instance is saving, remove this stale lock, then refresh. See PLANNING-SERVICES.md.",
                    lock_path.display()
                ))
            } else {
                failure(format!("Cannot create priority lock at {}: {e}", lock_path.display()))
            }
        })?;
    struct Lock(std::path::PathBuf, Option<fs::File>);
    impl Drop for Lock {
        fn drop(&mut self) {
            drop(self.1.take());
            let _ = fs::remove_file(&self.0);
        }
    }
    let _lock = Lock(lock_path, Some(lock));
    let current = read(documents)?;
    if current.revision != expected_revision {
        return Err(failure(
            "Priorities changed at another bench. Refresh before editing.",
        ));
    }
    let mut seen = HashSet::new();
    let mut priorities = Vec::new();
    for id in ids {
        if !seen.insert(id) {
            return Err(failure("Duplicate priority."));
        }
        let item = current
            .items
            .iter()
            .chain(current.priorities.iter())
            .find(|item| &item.id == id)
            .ok_or_else(|| failure("A selected backlog item changed. Refresh before editing."))?;
        priorities.push(item.clone());
    }
    let plan = Priorities {
        revision: uuid::Uuid::new_v4().to_string(),
        priorities,
    };
    let temp = documents.join(format!(".mezzanine-priorities-{}.tmp", plan.revision));
    let result = (|| -> MezzanineResult<()> {
        use std::io::Write;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.write_all(
            serde_json::to_string_pretty(&plan)
                .map_err(|e| failure(e.to_string()))?
                .as_bytes(),
        )?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, documents.join("mezzanine-priorities.json"))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result?;
    read(documents)
}

#[cfg(test)]
mod tests {
    use super::*;
    const BACKLOG: &str = "## Active backlog\n| Filed | Source | Item | Handler | Age |\n|---|---|---|---|---|\n| 2026-10-14 | [note](note.md) | Fix **thing** \\| safely | investor | 0d |\n\n| Completed | Item | Commit |\n| 2026-10-13 | old | abc |";
    #[test]
    fn reads_only_active_and_identity_ignores_age_and_handler() {
        let items = parse(BACKLOG).unwrap();
        assert_eq!(items.len(), 1);
        assert!(items[0].item.contains("\\|"));
        assert_eq!(
            items[0].id,
            parse(&BACKLOG.replace("investor", "heretic").replace("0d", "99d")).unwrap()[0].id
        );
        assert!(parse("unrecognized source").is_err());
    }
    #[test]
    fn persists_order_refuses_stale_writes_and_retains_missing_items() {
        let dir = std::env::temp_dir().join(format!("mz-planning-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("lab-backlog.md"), BACKLOG).unwrap();
        let first = read(&dir).unwrap();
        let next = save(&dir, &first.revision, &[first.items[0].id.clone()]).unwrap();
        assert!(save(&dir, "", &[]).is_err());
        fs::write(dir.join("lab-backlog.md"), "## Active backlog\n").unwrap();
        let removed = read(&dir).unwrap();
        assert!(removed.items.is_empty());
        assert_eq!(removed.priorities.len(), 1);
        assert!(save(&dir, &next.revision, &[])
            .unwrap()
            .priorities
            .is_empty());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn refuses_manual_edits_and_another_writers_lock_without_touching_backlog() {
        let dir = std::env::temp_dir().join(format!("mz-planning-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("lab-backlog.md"), BACKLOG).unwrap();
        let first = read(&dir).unwrap();
        let next = save(&dir, &first.revision, &[first.items[0].id.clone()]).unwrap();
        let path = dir.join("mezzanine-priorities.json");
        let mut plan = read_priorities(&dir).unwrap();
        plan.priorities.clear(); // An external editor may leave the UUID unchanged.
        let edited = serde_json::to_string(&plan).unwrap();
        fs::write(&path, &edited).unwrap();
        assert!(save(&dir, &next.revision, &[]).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), edited);
        let fresh = read(&dir).unwrap();
        let lock = dir.join(".mezzanine-priorities.lock");
        fs::write(&lock, "other writer").unwrap();
        let error = save(&dir, &fresh.revision, &[]).err().unwrap().to_string();
        assert!(error.contains(lock.to_str().unwrap()));
        assert!(error.contains("confirm no Mezzanine instance is saving"));
        assert!(error.contains("remove this stale lock"));
        assert_eq!(fs::read_to_string(&lock).unwrap(), "other writer");
        assert_eq!(
            fs::read_to_string(dir.join("lab-backlog.md")).unwrap(),
            BACKLOG
        );
        fs::remove_dir_all(dir).unwrap();
    }
}
