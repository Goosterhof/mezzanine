// Open chaos detonations on a file.
//
// The Chaos Monkey files reports in `documents/chaos-reports/` — numbered
// markdown files that score creative & containment risk for a target.
// Most reports cite specific files by their leaf name (e.g.,
// `CardinalRoom.vue`), some cite by full repo-relative path. We match on
// both: a substring search for the basename, with a guard against
// false-positive hits on unrelated words.
//
// The parser is split into two pieces:
//   * `scan_report(filename, content, target_basename) -> Option<ChaosDetonation>`
//     — pure: given one report's contents, returns the matched detonation
//     if the report cites the file.
//   * `detonations_for(reports, target_path) -> Vec<ChaosDetonation>`
//     — runs the scan across many reports, sorted highest-score first
//     so the panel surfaces the worst offender at the top.
//
// `commands/artifacts.rs::find_chaos_detonations` enumerates the chaos-
// reports directory and feeds each file into `scan_report`.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChaosDetonation {
    pub report_number: String,
    pub report_filename: String,
    pub title: String,
    pub madness_score: Option<u8>,
    pub madness_label: Option<String>,
}

/// Scan one chaos report for a reference to `target_basename`. Returns
/// `Some(detonation)` when the report cites the file, `None` otherwise.
///
/// A "cite" means: the basename appears as a whole word in the markdown
/// (between non-alphanumeric characters), so `Card.vue` cited in the
/// report would not match a PR file named `MyCard.vue`.
pub fn scan_report(
    filename: &str,
    content: &str,
    target_basename: &str,
) -> Option<ChaosDetonation> {
    if target_basename.is_empty() {
        return None;
    }
    if !contains_as_token(content, target_basename) {
        return None;
    }
    let report_number = extract_report_number(filename);
    let title = extract_title(content).unwrap_or_else(|| filename.to_string());
    let (madness_score, madness_label) = extract_madness(content);
    Some(ChaosDetonation {
        report_number,
        report_filename: filename.to_string(),
        title,
        madness_score,
        madness_label,
    })
}

/// Run `scan_report` across many `(filename, content)` pairs. The target
/// is a repo-relative path (e.g., `frontend/src/components/CardinalRoom.vue`);
/// we match on its basename, since that is how chaos reports usually
/// cite files. Returns detonations sorted by madness score descending
/// (worst offender first); reports with no score sink to the bottom.
pub fn detonations_for(reports: &[(String, String)], target_path: &str) -> Vec<ChaosDetonation> {
    let target_basename = basename_of(target_path);
    if target_basename.is_empty() {
        return Vec::new();
    }
    let mut hits: Vec<ChaosDetonation> = reports
        .iter()
        .filter_map(|(name, content)| scan_report(name, content, target_basename))
        .collect();
    hits.sort_by(|a, b| match (b.madness_score, a.madness_score) {
        (Some(bs), Some(as_)) => bs.cmp(&as_),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => a.report_number.cmp(&b.report_number),
    });
    hits
}

fn basename_of(path: &str) -> &str {
    path.rsplit_once('/').map(|(_, b)| b).unwrap_or(path)
}

/// True iff `needle` appears in `haystack` with non-alphanumeric (or
/// start/end) boundaries on both sides. Prevents false matches on
/// `Card.vue` finding `MyCard.vue`.
fn contains_as_token(haystack: &str, needle: &str) -> bool {
    let bytes = haystack.as_bytes();
    let target = needle.as_bytes();
    if target.is_empty() || bytes.len() < target.len() {
        return false;
    }
    let mut start = 0;
    while let Some(idx) = haystack[start..].find(needle) {
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
    false
}

fn is_word_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

/// Pull `00045` out of `00045-chaos-foo-bar.md`. Returns the leading
/// digit run; falls back to the filename without extension if the
/// canonical pattern doesn't hold.
fn extract_report_number(filename: &str) -> String {
    let leading: String = filename
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    if leading.is_empty() {
        filename.trim_end_matches(".md").to_string()
    } else {
        leading
    }
}

/// Pull the report's title out of its first `# ` H1 line. Falls back to
/// the filename if the report has no H1.
fn extract_title(content: &str) -> Option<String> {
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("# ") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

/// Pull the madness score out of `**Madness Score:** 8/10 — Burning`.
/// Returns `(score, label)` — either may be `None` if the line is
/// missing or malformed.
fn extract_madness(content: &str) -> (Option<u8>, Option<String>) {
    for line in content.lines() {
        let Some(rest) = line.strip_prefix("**Madness Score:**") else {
            continue;
        };
        let rest = rest.trim();
        if let Some((numeric, label)) = rest.split_once('—') {
            let score = numeric
                .trim()
                .split('/')
                .next()
                .and_then(|n| n.parse().ok());
            return (score, Some(label.trim().to_string()));
        }
        let score = rest.split('/').next().and_then(|n| n.trim().parse().ok());
        return (score, None);
    }
    (None, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    const REPORT_45: &str = "\
# Chaos Report #00045: Parlour Cardinal Refactor

**Target:** The Parlour refactor
**Madness Score:** 8/10 — Burning

The Monkey noted that `CardinalRoom.vue` and `useVoiceRoom.ts` carry the
weight of every interaction in the room.
";

    const REPORT_30: &str = "\
# Chaos Report #00030: Generic Sweep

**Target:** Holotable scene generation
**Madness Score:** 5/10 — Tepid

No references to the parlour files here.
";

    const REPORT_20: &str = "\
# Chaos Report #00020: Containment

**Target:** Auth surface
**Madness Score:** 10/10 — Alive

The findings name `CardinalRoom.vue` once in passing — but the real subject
is `OAuthGatekeeper.php`.
";

    #[test]
    fn scan_report_returns_none_for_empty_basename() {
        assert!(scan_report("00045.md", REPORT_45, "").is_none());
    }

    #[test]
    fn scan_report_finds_basename_citation() {
        let hit = scan_report("00045-chaos.md", REPORT_45, "CardinalRoom.vue").unwrap();
        assert_eq!(hit.report_number, "00045");
        assert_eq!(hit.madness_score, Some(8));
        assert_eq!(hit.madness_label.as_deref(), Some("Burning"));
        assert_eq!(hit.title, "Chaos Report #00045: Parlour Cardinal Refactor");
    }

    #[test]
    fn scan_report_returns_none_when_basename_absent() {
        assert!(scan_report("00030-chaos.md", REPORT_30, "CardinalRoom.vue").is_none());
    }

    #[test]
    fn scan_report_rejects_partial_word_matches() {
        // The report mentions `CardinalRoom.vue`, but our target is `Cardinal.vue` —
        // the basename appears as a substring (Cardinal*Room*.vue) but not as a
        // standalone token. The reverse direction (looking for the longer name
        // inside the shorter mention) is more typical; this guard protects
        // against accidental hits.
        let report = "References to `Cardinal.vue` are abundant.";
        // Target `Cardinal.vue` appears whole — should hit.
        assert!(scan_report("00099-chaos.md", report, "Cardinal.vue").is_some());
        // Target `inal.vue` is a substring inside `Cardinal.vue` — must NOT hit.
        assert!(scan_report("00099-chaos.md", report, "inal.vue").is_none());
    }

    #[test]
    fn detonations_for_sorts_by_score_descending() {
        let reports = vec![
            ("00030-chaos.md".to_string(), REPORT_30.to_string()),
            ("00045-chaos.md".to_string(), REPORT_45.to_string()),
            ("00020-chaos.md".to_string(), REPORT_20.to_string()),
        ];
        let hits = detonations_for(&reports, "frontend/src/CardinalRoom.vue");
        assert_eq!(hits.len(), 2);
        // 10/10 sorts ahead of 8/10.
        assert_eq!(hits[0].report_number, "00020");
        assert_eq!(hits[1].report_number, "00045");
    }

    #[test]
    fn detonations_for_matches_on_basename_not_path() {
        let reports = vec![("00045-chaos.md".to_string(), REPORT_45.to_string())];
        let hits = detonations_for(&reports, "frontend/src/components/CardinalRoom.vue");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].report_filename, "00045-chaos.md");
    }

    #[test]
    fn detonations_for_returns_empty_when_no_reports_cite_file() {
        let reports = vec![("00030-chaos.md".to_string(), REPORT_30.to_string())];
        let hits = detonations_for(&reports, "something-unrelated.vue");
        assert!(hits.is_empty());
    }

    #[test]
    fn detonations_for_handles_empty_target_path() {
        let reports = vec![("00045-chaos.md".to_string(), REPORT_45.to_string())];
        assert!(detonations_for(&reports, "").is_empty());
    }

    #[test]
    fn extract_madness_handles_score_without_label() {
        let report = "**Madness Score:** 9/10\nbody";
        let (score, label) = extract_madness(report);
        assert_eq!(score, Some(9));
        assert!(label.is_none());
    }

    #[test]
    fn extract_madness_returns_none_when_line_absent() {
        let (score, label) = extract_madness("no score here");
        assert!(score.is_none());
        assert!(label.is_none());
    }

    #[test]
    fn extract_report_number_extracts_leading_digits() {
        assert_eq!(extract_report_number("00045-chaos-foo.md"), "00045");
        assert_eq!(extract_report_number("99-quick.md"), "99");
    }

    #[test]
    fn extract_report_number_falls_back_when_no_digits() {
        assert_eq!(extract_report_number("oddly-named.md"), "oddly-named");
    }
}
