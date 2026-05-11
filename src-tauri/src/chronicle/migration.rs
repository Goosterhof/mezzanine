// Chronicle migration — bench era → Mezzanine era, one time.
//
// Phase 2A renames the chronicle path from `~/.zmuuzn-cockpit/` to
// `~/.zmuuzn-mezzanine/`. The transcripts the investor accumulated during
// the bench era are valuable — they're the Chronicle's record of every
// session ever ran on this lab — and they shouldn't be left orphaned by
// the rebrand.
//
// On first boot under the Mezzanine identity, this module performs a
// one-time copy from the old directory into the new one and writes a
// marker file (`.cockpit-migrated`) so the operation never repeats. The
// source directory is left intact for rollback — if the investor pins
// the gadget back to the bench-era release, the bench-era transcripts
// are still where the old code expects them.

use std::path::{Path, PathBuf};

pub const MIGRATION_MARKER: &str = ".cockpit-migrated";

#[allow(dead_code)] // consumed by tests; the lib.rs caller drops the Ok value
#[derive(Debug)]
pub struct MigrationOutcome {
    /// True if a copy ran during this call. False means a marker already
    /// existed (idempotent skip) or the source directory was absent.
    pub copied: bool,
    /// Number of files copied. Zero on skip.
    pub files_copied: usize,
    /// Where the marker was written (or would be written, on skip).
    pub marker_path: PathBuf,
}

/// Migrate transcripts from `source` to `destination` exactly once.
///
/// The destination base directory `destination` is the path that
/// `chronicle_base_dir` returns under the Mezzanine identity. The
/// migration writes a marker file at `<destination>/<MIGRATION_MARKER>`
/// after the copy completes; subsequent calls observe the marker and
/// no-op.
///
/// Failure modes are logged and downgraded — a failed migration must
/// never block the Mezzanine from opening. The investor still has access
/// to the source directory if anything went wrong.
pub fn migrate_once_from_cockpit(
    source: &Path,
    destination: &Path,
) -> std::io::Result<MigrationOutcome> {
    let marker_path = destination.join(MIGRATION_MARKER);

    // Marker present — migration already ran.
    if marker_path.exists() {
        return Ok(MigrationOutcome {
            copied: false,
            files_copied: 0,
            marker_path,
        });
    }

    // Source absent — fresh install, no migration needed. Write the marker
    // anyway so we never look for a bench-era directory that does not exist.
    if !source.exists() {
        std::fs::create_dir_all(destination)?;
        std::fs::write(&marker_path, migration_marker_contents(0))?;
        return Ok(MigrationOutcome {
            copied: false,
            files_copied: 0,
            marker_path,
        });
    }

    // Copy source tree into destination.
    std::fs::create_dir_all(destination)?;
    let files_copied = copy_tree(source, destination)?;

    // Write the marker — its presence is the load-bearing signal.
    std::fs::write(&marker_path, migration_marker_contents(files_copied))?;

    log::info!(
        "Mezzanine: chronicle migration completed — copied {files_copied} files from {} to {}",
        source.display(),
        destination.display(),
    );

    Ok(MigrationOutcome {
        copied: true,
        files_copied,
        marker_path,
    })
}

fn migration_marker_contents(files_copied: usize) -> String {
    format!(
        "{{\"migrated_at\":\"{}\",\"files_copied\":{}}}\n",
        chrono::Utc::now().to_rfc3339(),
        files_copied,
    )
}

/// Recursive directory copy. Returns count of files (not directories) copied.
fn copy_tree(source: &Path, destination: &Path) -> std::io::Result<usize> {
    let mut count = 0;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let entry_path = entry.path();
        let file_name = entry.file_name();
        let dest_path = destination.join(&file_name);
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            std::fs::create_dir_all(&dest_path)?;
            count += copy_tree(&entry_path, &dest_path)?;
        } else if file_type.is_file() {
            std::fs::copy(&entry_path, &dest_path)?;
            count += 1;
        }
        // Symlinks ignored — the chronicle does not use them.
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mezzanine-chron-migration-test-{}-{}",
            suffix,
            uuid::Uuid::new_v4(),
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn migration_skips_when_marker_already_present() {
        let dir = temp_dir("marker-present");
        let source = dir.join("cockpit");
        let destination = dir.join("mezzanine");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("oldfile.jsonl"), b"x").unwrap();
        std::fs::create_dir_all(&destination).unwrap();
        std::fs::write(destination.join(MIGRATION_MARKER), b"prior").unwrap();

        let outcome = migrate_once_from_cockpit(&source, &destination).unwrap();
        assert!(!outcome.copied);
        assert_eq!(outcome.files_copied, 0);
        // oldfile should NOT have been copied.
        assert!(!destination.join("oldfile.jsonl").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn migration_writes_marker_when_source_absent() {
        let dir = temp_dir("no-source");
        let source = dir.join("cockpit-does-not-exist");
        let destination = dir.join("mezzanine");

        let outcome = migrate_once_from_cockpit(&source, &destination).unwrap();
        assert!(!outcome.copied);
        assert_eq!(outcome.files_copied, 0);
        assert!(destination.join(MIGRATION_MARKER).exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn migration_copies_flat_files_and_writes_marker() {
        let dir = temp_dir("flat-copy");
        let source = dir.join("cockpit");
        let destination = dir.join("mezzanine");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("a.jsonl"), b"alpha").unwrap();
        std::fs::write(source.join("b.jsonl"), b"beta").unwrap();

        let outcome = migrate_once_from_cockpit(&source, &destination).unwrap();
        assert!(outcome.copied);
        assert_eq!(outcome.files_copied, 2);
        assert!(destination.join("a.jsonl").exists());
        assert!(destination.join("b.jsonl").exists());
        assert!(destination.join(MIGRATION_MARKER).exists());
        // Source is preserved for rollback.
        assert!(source.join("a.jsonl").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn migration_copies_nested_subdirectories() {
        let dir = temp_dir("nested");
        let source = dir.join("cockpit");
        let destination = dir.join("mezzanine");
        std::fs::create_dir_all(source.join("gatekeeper")).unwrap();
        std::fs::create_dir_all(source.join("crucible")).unwrap();
        std::fs::write(source.join("gatekeeper/2026-04-30-x.jsonl"), b"g").unwrap();
        std::fs::write(source.join("crucible/2026-05-01-y.jsonl"), b"c1").unwrap();
        std::fs::write(source.join("crucible/2026-05-02-y.jsonl"), b"c2").unwrap();

        let outcome = migrate_once_from_cockpit(&source, &destination).unwrap();
        assert!(outcome.copied);
        assert_eq!(outcome.files_copied, 3);
        assert!(destination.join("gatekeeper/2026-04-30-x.jsonl").exists());
        assert!(destination.join("crucible/2026-05-01-y.jsonl").exists());
        assert!(destination.join("crucible/2026-05-02-y.jsonl").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn migration_is_idempotent_across_repeated_calls() {
        let dir = temp_dir("idempotent");
        let source = dir.join("cockpit");
        let destination = dir.join("mezzanine");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("a.jsonl"), b"alpha").unwrap();

        let first = migrate_once_from_cockpit(&source, &destination).unwrap();
        assert!(first.copied);
        assert_eq!(first.files_copied, 1);

        // Modify source after first migration — should NOT propagate.
        std::fs::write(source.join("b.jsonl"), b"beta").unwrap();

        let second = migrate_once_from_cockpit(&source, &destination).unwrap();
        assert!(!second.copied);
        assert_eq!(second.files_copied, 0);
        assert!(destination.join("a.jsonl").exists());
        assert!(
            !destination.join("b.jsonl").exists(),
            "post-migration source changes must NOT bleed into destination"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn marker_file_contains_iso8601_timestamp_and_count() {
        let dir = temp_dir("marker-shape");
        let source = dir.join("cockpit");
        let destination = dir.join("mezzanine");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("a.jsonl"), b"x").unwrap();

        migrate_once_from_cockpit(&source, &destination).unwrap();
        let marker = std::fs::read_to_string(destination.join(MIGRATION_MARKER)).unwrap();
        assert!(marker.contains("migrated_at"));
        assert!(marker.contains("files_copied"));
        assert!(marker.contains("\"files_copied\":1"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
