// Last-minion-touch parser.
//
// The Drydock annotates each file in a PR diff with the most recent
// minion-stamped commit that touched it. Four minions leave commit-message
// fingerprints in this laboratory's git log:
//
//   * The Task Master   stamps with `[DELIVERED]`
//   * The Enhancement Squad stamps with `P0` / `P1` / `P2` / `P3`
//   * The Surgeon       stamps with `mutation`
//   * The Illusionist   stamps with `design(` (a commit-doctrine scope token)
//
// The parser receives the raw `git log` output (one record per commit,
// terminated by a NUL byte) and returns the most recent minion-stamped
// touch, or `None` if no commit in the log carries a recognized stamp.
//
// The command-side `find_minion_touch` in `commands/artifacts.rs` shells
// `git log -z --follow --format='%H|%an|%ai|%s' -- <file>` through the
// WSL2 bridge and feeds the captured stdout here.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MinionTouch {
    pub minion: String,
    pub commit_hash: String,
    pub author: String,
    pub date: String,
    pub subject: String,
}

/// Parse `git log` output and return the most recent commit whose subject
/// carries a known minion stamp. Records are NUL-separated; fields inside
/// each record are pipe-separated (`hash|author|iso-date|subject`).
///
/// The parser walks commits newest-first (`git log` default) and stops at
/// the first match. If no commit in the log carries a stamp, returns
/// `None`.
pub fn parse(content: &str) -> Option<MinionTouch> {
    for record in content.split('\0') {
        let record = record.trim_matches('\n');
        if record.is_empty() {
            continue;
        }
        let parts: Vec<&str> = record.splitn(4, '|').collect();
        if parts.len() != 4 {
            continue;
        }
        let subject = parts[3].trim();
        let Some(minion) = recognize_minion(subject) else {
            continue;
        };
        return Some(MinionTouch {
            minion,
            commit_hash: parts[0].trim().to_string(),
            author: parts[1].trim().to_string(),
            date: parts[2].trim().chars().take(10).collect(),
            subject: subject.to_string(),
        });
    }
    None
}

/// Map a commit subject to its minion, if any. Returns the rendered label
/// the panel surfaces (`"The Task Master"` etc.) — not the raw stamp.
fn recognize_minion(subject: &str) -> Option<String> {
    if subject.contains("[DELIVERED]") {
        return Some("The Task Master".to_string());
    }
    if subject.contains("mutation") {
        return Some("The Surgeon".to_string());
    }
    if subject.contains("design(") {
        return Some("The Illusionist".to_string());
    }
    if has_squad_priority(subject) {
        return Some("The Enhancement Squad".to_string());
    }
    None
}

/// Recognize a P0/P1/P2/P3 token surrounded by word boundaries. We want
/// to match the Squad's own stamps (e.g., `[P1]`, `(P2)`, `P3:`) without
/// catching unrelated tokens like `P0WERED` or `P10`.
fn has_squad_priority(subject: &str) -> bool {
    let bytes = subject.as_bytes();
    for tag in ["P0", "P1", "P2", "P3"] {
        let target = tag.as_bytes();
        let mut start = 0;
        while let Some(idx) = find_subseq(&bytes[start..], target) {
            let abs = start + idx;
            let before = if abs == 0 { b' ' } else { bytes[abs - 1] };
            let after = if abs + target.len() >= bytes.len() {
                b' '
            } else {
                bytes[abs + target.len()]
            };
            if !is_word_byte(before) && !is_word_byte(after) {
                return true;
            }
            start = abs + 1;
        }
    }
    false
}

fn find_subseq(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn is_word_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(hash: &str, author: &str, date: &str, subject: &str) -> String {
        format!("{hash}|{author}|{date}|{subject}\n\0")
    }

    #[test]
    fn empty_input_returns_none() {
        assert!(parse("").is_none());
        assert!(parse("\0").is_none());
        assert!(parse("\n\n").is_none());
    }

    #[test]
    fn no_stamps_returns_none() {
        let log = record(
            "abc",
            "Gerard",
            "2026-05-01 12:00:00 +0000",
            "fix(crucible): minor copy tweak",
        ) + &record(
            "def",
            "Gerard",
            "2026-04-30 10:00:00 +0000",
            "chore(lab): bump deps",
        );
        assert!(parse(&log).is_none());
    }

    #[test]
    fn recognizes_task_master_delivered() {
        let log = record(
            "aaaa",
            "Gerard",
            "2026-04-15 09:00:00 +0000",
            "feat(crucible): forge insights pane [DELIVERED]",
        );
        let touch = parse(&log).unwrap();
        assert_eq!(touch.minion, "The Task Master");
        assert_eq!(touch.commit_hash, "aaaa");
        assert_eq!(touch.author, "Gerard");
        assert_eq!(touch.date, "2026-04-15");
        assert!(touch.subject.contains("[DELIVERED]"));
    }

    #[test]
    fn recognizes_surgeon_mutation() {
        let log = record(
            "bbbb",
            "Gerard",
            "2026-04-10 09:00:00 +0000",
            "refactor(gatekeeper): apply mutation MP-0004",
        );
        let touch = parse(&log).unwrap();
        assert_eq!(touch.minion, "The Surgeon");
    }

    #[test]
    fn recognizes_illusionist_design_scope() {
        let log = record(
            "cccc",
            "Gerard",
            "2026-04-05 09:00:00 +0000",
            "design(parlour): cardinal candlelight v2",
        );
        let touch = parse(&log).unwrap();
        assert_eq!(touch.minion, "The Illusionist");
    }

    #[test]
    fn recognizes_squad_priority_in_brackets() {
        let log = record(
            "dddd",
            "Gerard",
            "2026-03-28 09:00:00 +0000",
            "enhance(war-table) [P1]: harden mission OCR fallback",
        );
        let touch = parse(&log).unwrap();
        assert_eq!(touch.minion, "The Enhancement Squad");
    }

    #[test]
    fn recognizes_squad_priority_with_colon() {
        let log = record(
            "eeee",
            "Gerard",
            "2026-03-15 09:00:00 +0000",
            "fix(smokestacks) P2: factory planner crash on empty machines list",
        );
        let touch = parse(&log).unwrap();
        assert_eq!(touch.minion, "The Enhancement Squad");
    }

    #[test]
    fn does_not_match_p0_inside_word() {
        let log = record(
            "ffff",
            "Gerard",
            "2026-03-10 09:00:00 +0000",
            "fix(observer): rename SP0CK to SPOCK",
        );
        // `SP0CK` contains `P0` mid-word — must not match.
        assert!(parse(&log).is_none());
    }

    #[test]
    fn does_not_match_p10_or_p100() {
        let log = record(
            "gggg",
            "Gerard",
            "2026-03-05 09:00:00 +0000",
            "perf(holotable): improve P10 latency on label LOD",
        );
        // `P10` is a percentile, not a Squad priority.
        assert!(parse(&log).is_none());
    }

    #[test]
    fn picks_first_stamped_commit_newest_wins() {
        // git log emits newest first; the parser must return the first match.
        let log = String::new()
            + &record(
                "newest",
                "Gerard",
                "2026-05-01 09:00:00 +0000",
                "feat(crucible): pane [DELIVERED]",
            )
            + &record(
                "older",
                "Gerard",
                "2026-04-01 09:00:00 +0000",
                "design(crucible): pane v1",
            );
        let touch = parse(&log).unwrap();
        assert_eq!(touch.commit_hash, "newest");
        assert_eq!(touch.minion, "The Task Master");
    }

    #[test]
    fn skips_unstamped_commits_and_finds_the_stamped_one() {
        let log = String::new()
            + &record(
                "skip1",
                "Gerard",
                "2026-05-01 09:00:00 +0000",
                "chore: bump dep",
            )
            + &record(
                "skip2",
                "Gerard",
                "2026-04-28 09:00:00 +0000",
                "docs: update README",
            )
            + &record(
                "hit",
                "Gerard",
                "2026-04-20 09:00:00 +0000",
                "feat(parlour): mute toggle [DELIVERED]",
            );
        let touch = parse(&log).unwrap();
        assert_eq!(touch.commit_hash, "hit");
        assert_eq!(touch.minion, "The Task Master");
    }

    #[test]
    fn tolerates_malformed_record_and_keeps_scanning() {
        let log = String::new()
            + "this-is-garbage-no-pipes\0"
            + &record(
                "ok",
                "Gerard",
                "2026-04-20 09:00:00 +0000",
                "design(crucible): pane",
            );
        let touch = parse(&log).unwrap();
        assert_eq!(touch.commit_hash, "ok");
    }

    #[test]
    fn date_is_truncated_to_iso_day() {
        let log = record(
            "h",
            "Gerard",
            "2026-04-20 09:30:42 +0200",
            "design(parlour): v1",
        );
        let touch = parse(&log).unwrap();
        assert_eq!(touch.date, "2026-04-20");
    }
}
