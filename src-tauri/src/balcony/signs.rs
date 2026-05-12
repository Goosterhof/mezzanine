// Balcony signs — what the rail tells the investor at a glance.
//
// Phase 2B ships three sign slots. Two carry data; the third is a
// reserved placeholder that the investor will fill once they discover
// what else they want at a glance. The parsers here power the two with
// data.
//
//   * Last Chaos — the most recent chaos report, decomposed out of the
//     `Last Chaos` row in the lab's CLAUDE.md vital-signs box. The raw
//     value is preserved so the frontend can fall back to it when the
//     score/number can't be extracted.
//
//   * Idea Ledger — aggregate state across every `documents/idea-ledgers/
//     idea-ledger-*.md` file. The sign carries three numbers worth of
//     intent: how many CANDIDATE ideas are waiting (the unresolved
//     pitches), how many SHELVED ideas survived their cross-examination
//     into the bullpen, and the most recent DELIVERED date — the
//     freshness signal that tells the investor whether the lab is
//     converting ideas or hoarding them.
//
// Parser conventions match `lab::vital_signs` and `lab::signals`:
//   * pure functions over &str
//   * never panic on weird input — return defaults instead
//   * `#[derive(Serialize)]` with camelCase for the Tauri bridge

use serde::Serialize;

use crate::lab::vital_signs;

/// Combined payload for the rail — one read call returns both signs.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BalconySigns {
    pub last_chaos: LastChaosSign,
    pub idea_ledger: IdeaLedgerSign,
}

/// The Last Chaos sign — the most recent chaos report and its score.
///
/// Source: the `Last Chaos` row of the laboratory's root CLAUDE.md
/// vital-signs box. The raw value is held verbatim so the frontend can
/// render it as fallback copy when the parser can't separate the parts.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LastChaosSign {
    /// The leading integer of the report (e.g. `68` from `#00068`).
    pub report_number: Option<u32>,
    /// The middle phrase between the number and the score (e.g.
    /// `Cardinal Candlelight (Parlour)`). Empty if the format doesn't
    /// match the canonical `#NNN — Label — N/10` shape.
    pub label: String,
    /// The score cell when present, kept as `N/10` so the frontend can
    /// render it without inventing a denominator.
    pub score: Option<String>,
    /// The Last Chaos cell exactly as it appeared in CLAUDE.md.
    pub raw: String,
}

/// The Idea Ledger sign — aggregate state across every per-experiment ledger.
///
/// The counts come from `### IDEA #NN — Title [STATUS]` headlines (status
/// in the bracket). The DELIVERED date is the maximum `YYYY-MM-DD` string
/// found in any IDEA block whose body declares `**Implementation Status:**
/// DELIVERED` or whose headline carries `[DELIVERED]`.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IdeaLedgerSign {
    pub candidate_count: u32,
    pub shelved_count: u32,
    /// `YYYY-MM-DD` of the most recent delivered idea across all ledgers.
    /// `None` when no delivered idea was found.
    pub most_recent_delivered: Option<String>,
}

/// Parse the Last Chaos sign out of the lab's root CLAUDE.md content.
pub fn parse_last_chaos(claude_md_content: &str) -> LastChaosSign {
    let signs = vital_signs::parse(claude_md_content);
    let raw = signs.last_chaos;
    decompose_last_chaos(&raw)
}

/// Pure decomposition of a `Last Chaos` cell — exposed for tests that
/// don't want to build a whole vital-signs box.
pub fn decompose_last_chaos(raw: &str) -> LastChaosSign {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return LastChaosSign::default();
    }
    let report_number = first_integer_after_hash(trimmed);
    let score = first_score(trimmed);
    let label = label_between(trimmed);
    LastChaosSign {
        report_number,
        label,
        score,
        raw: trimmed.to_string(),
    }
}

/// Parse the aggregate Idea Ledger sign across every supplied ledger file.
///
/// The caller is responsible for reading the files — the parser stays
/// pure so unit tests can pass arbitrary content.
pub fn parse_idea_ledger(ledger_contents: &[&str]) -> IdeaLedgerSign {
    let mut sign = IdeaLedgerSign::default();
    for content in ledger_contents {
        for_each_idea_block(content, |headline, body| {
            if headline.contains("[CANDIDATE]") {
                sign.candidate_count += 1;
            }
            if headline.contains("[SHELVED]") {
                sign.shelved_count += 1;
            }
            let delivered_headline = headline.contains("[DELIVERED]");
            let delivered_body = body.contains("**Implementation Status:** DELIVERED");
            if delivered_headline || delivered_body {
                if let Some(date) = max_iso_date(body) {
                    sign.most_recent_delivered = match sign.most_recent_delivered.take() {
                        Some(current) if current >= date => Some(current),
                        _ => Some(date),
                    };
                }
            }
        });
    }
    sign
}

/// Walk every `### IDEA #N — ...` block in `content`. For each one, hand
/// the visitor the headline (the trimmed `### ...` line) and the body
/// (everything between the headline and the next `### ` line or EOF).
fn for_each_idea_block<F: FnMut(&str, &str)>(content: &str, mut visit: F) {
    let mut current_headline: Option<String> = None;
    let mut current_body = String::new();
    for line in content.lines() {
        let trimmed_left = line.trim_start();
        if trimmed_left.starts_with("### ") {
            // Close any open block before opening the next.
            if let Some(headline) = current_headline.take() {
                visit(&headline, &current_body);
            }
            current_body.clear();
            if trimmed_left.starts_with("### IDEA #") {
                current_headline = Some(trimmed_left.trim().to_string());
            } else {
                current_headline = None;
            }
            continue;
        }
        if current_headline.is_some() {
            current_body.push_str(line);
            current_body.push('\n');
        }
    }
    if let Some(headline) = current_headline {
        visit(&headline, &current_body);
    }
}

/// `#00068` → `Some(68)`. Returns the first integer following a `#`.
fn first_integer_after_hash(value: &str) -> Option<u32> {
    let mut chars = value.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch != '#' {
            continue;
        }
        let mut digits = String::new();
        while let Some(&peek) = chars.peek() {
            if peek.is_ascii_digit() {
                digits.push(peek);
                chars.next();
            } else {
                break;
            }
        }
        if !digits.is_empty() {
            return digits.parse().ok();
        }
    }
    None
}

/// `... 8/10` → `Some("8/10")`. Finds the first `N/10` (or `N/M`) cell.
fn first_score(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            // Find the run of digits.
            let start = i;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            // Require a '/' immediately after.
            if i < bytes.len() && bytes[i] == b'/' {
                let slash = i;
                i += 1;
                let denom_start = i;
                while i < bytes.len() && bytes[i].is_ascii_digit() {
                    i += 1;
                }
                if i > denom_start {
                    return Some(value[start..i].to_string());
                }
                // No digits after '/'. Skip the slash so we don't loop.
                i = slash + 1;
            }
        } else {
            i += 1;
        }
    }
    None
}

/// `#00068 — Cardinal Candlelight (Parlour) — 8/10` → `Cardinal Candlelight (Parlour)`.
/// Returns empty when the canonical em-dash shape isn't present.
fn label_between(value: &str) -> String {
    // The canonical separator is the em-dash (`—`). Fall back to the
    // ASCII `-` if the dash isn't present.
    let parts: Vec<&str> = if value.contains('—') {
        value.split('—').collect()
    } else if value.contains('-') {
        value.split('-').collect()
    } else {
        return String::new();
    };
    if parts.len() < 3 {
        return String::new();
    }
    parts[1].trim().to_string()
}

/// Find the largest `YYYY-MM-DD` string in `text`. ISO ordering is
/// lexicographic, so plain string comparison is correct here.
fn max_iso_date(text: &str) -> Option<String> {
    let mut best: Option<String> = None;
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    while i + 10 <= len {
        if looks_like_iso_date(&bytes[i..i + 10]) {
            // Bound: don't accept dates that bleed into a longer digit
            // run (e.g. `2026-03-205` wouldn't be a real date).
            if i + 10 == len || !bytes[i + 10].is_ascii_digit() {
                let candidate = &text[i..i + 10];
                if best.as_deref().map_or(true, |cur| candidate > cur) {
                    best = Some(candidate.to_string());
                }
                i += 10;
                continue;
            }
        }
        i += 1;
    }
    best
}

fn looks_like_iso_date(window: &[u8]) -> bool {
    if window.len() != 10 {
        return false;
    }
    let digit = |b: u8| b.is_ascii_digit();
    digit(window[0])
        && digit(window[1])
        && digit(window[2])
        && digit(window[3])
        && window[4] == b'-'
        && digit(window[5])
        && digit(window[6])
        && window[7] == b'-'
        && digit(window[8])
        && digit(window[9])
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLAUDE_MD: &str = "\
┌─────────────────────────────────────────────────────────────────┐
│                   LABORATORY VITAL SIGNS                        │
├──────────────┬──────────────────────────────────────────────────┤
│ Experiments  │ 6 active                                         │
│ Last Chaos   │ #00068 — Cardinal Candlelight (Parlour) — 8/10   │
└──────────────┴──────────────────────────────────────────────────┘
";

    #[test]
    fn parses_last_chaos_from_claude_md_box() {
        let sign = parse_last_chaos(CLAUDE_MD);
        assert_eq!(sign.report_number, Some(68));
        assert_eq!(sign.score.as_deref(), Some("8/10"));
        assert_eq!(sign.label, "Cardinal Candlelight (Parlour)");
        assert!(sign.raw.starts_with("#00068"));
    }

    #[test]
    fn last_chaos_empty_when_box_missing() {
        let sign = parse_last_chaos("nothing here");
        assert_eq!(sign, LastChaosSign::default());
    }

    #[test]
    fn last_chaos_preserves_raw_even_when_label_decomposition_fails() {
        let sign = decompose_last_chaos("just some text without separators");
        assert_eq!(sign.raw, "just some text without separators");
        assert_eq!(sign.report_number, None);
        assert_eq!(sign.score, None);
        assert!(sign.label.is_empty());
    }

    #[test]
    fn first_integer_after_hash_handles_padded_reports() {
        assert_eq!(first_integer_after_hash("#00068 — anything"), Some(68));
        assert_eq!(first_integer_after_hash("no hash 12"), None);
        assert_eq!(first_integer_after_hash("#abc — broken"), None);
    }

    #[test]
    fn first_score_picks_first_n_over_m_pair() {
        assert_eq!(first_score("score 8/10 trailing"), Some("8/10".to_string()));
        assert_eq!(first_score("10/10 first"), Some("10/10".to_string()));
        assert_eq!(first_score("no score at all"), None);
        assert_eq!(first_score("partial 7/ missing"), None);
    }

    const LEDGER_WITH_MIXED_STATES: &str = "\
# Ideas Ledger — Test Ledger

### IDEA #01 — First [CANDIDATE]
**Pitch:** ...
Some prose; no implementation status.

### IDEA #02 — Second [SHELVED]
**Pitch:** ...
This one was killed before it shipped.

### IDEA #03 — Third [APPROVED]
**Pitch:** ...
**Implementation Status:** DELIVERED
**Experiment Log:** *(Implemented 2026-03-16 as a prerequisite.)*

### IDEA #04 — Fourth [APPROVED]
**Pitch:** ...
**Implementation Status:** DELIVERED
**Experiment Log:** *(Christened 2026-04-22 via Task Master pipeline.)*

### IDEA #05 — Fifth [CANDIDATE]
**Pitch:** ...

## Some other heading that should not affect the parser

### IDEA #06 — Sixth [SHELVED]
**Pitch:** ...
";

    #[test]
    fn idea_ledger_counts_status_tags_across_files() {
        let sign = parse_idea_ledger(&[LEDGER_WITH_MIXED_STATES]);
        assert_eq!(sign.candidate_count, 2);
        assert_eq!(sign.shelved_count, 2);
        assert_eq!(sign.most_recent_delivered.as_deref(), Some("2026-04-22"));
    }

    #[test]
    fn idea_ledger_returns_default_for_empty_input() {
        let sign = parse_idea_ledger(&[]);
        assert_eq!(sign, IdeaLedgerSign::default());
    }

    #[test]
    fn idea_ledger_aggregates_across_multiple_files() {
        let a = "### IDEA #01 — A [CANDIDATE]\nbody\n";
        let b = "### IDEA #02 — B [CANDIDATE]\nbody\n### IDEA #03 — C [SHELVED]\nbody\n";
        let c = "### IDEA #04 — D [APPROVED]\n**Implementation Status:** DELIVERED\nShipped 2026-05-01\n";
        let sign = parse_idea_ledger(&[a, b, c]);
        assert_eq!(sign.candidate_count, 2);
        assert_eq!(sign.shelved_count, 1);
        assert_eq!(sign.most_recent_delivered.as_deref(), Some("2026-05-01"));
    }

    #[test]
    fn idea_ledger_accepts_delivered_headline_tag_even_without_status_line() {
        let content = "### IDEA #07 — Direct [DELIVERED]\nNotes from 2026-02-10 are here.\n";
        let sign = parse_idea_ledger(&[content]);
        assert_eq!(sign.most_recent_delivered.as_deref(), Some("2026-02-10"));
    }

    #[test]
    fn max_iso_date_skips_longer_digit_runs() {
        // The trailing `5` would extend the digit run; reject it.
        let val = max_iso_date("a 2026-03-205 mid 2026-03-20 end");
        assert_eq!(val.as_deref(), Some("2026-03-20"));
    }

    #[test]
    fn max_iso_date_takes_lex_max_even_when_earlier_appears_first() {
        let val = max_iso_date("first 2026-01-10 then 2026-04-22 then 2026-02-01");
        assert_eq!(val.as_deref(), Some("2026-04-22"));
    }

    #[test]
    fn for_each_idea_block_isolates_bodies_at_next_h3() {
        let mut seen = Vec::new();
        for_each_idea_block(
            "### IDEA #01 — A [CANDIDATE]\nbody A\n### IDEA #02 — B [SHELVED]\nbody B\n",
            |h, b| seen.push((h.to_string(), b.trim().to_string())),
        );
        assert_eq!(seen.len(), 2);
        assert!(seen[0].0.contains("[CANDIDATE]"));
        assert_eq!(seen[0].1, "body A");
        assert!(seen[1].0.contains("[SHELVED]"));
        assert_eq!(seen[1].1, "body B");
    }

    #[test]
    fn for_each_idea_block_ignores_non_idea_h3_blocks() {
        let mut seen = 0;
        for_each_idea_block(
            "### Some Other Header\nnot an idea\n### IDEA #01 — Yes [CANDIDATE]\nbody\n",
            |_, _| seen += 1,
        );
        assert_eq!(seen, 1);
    }
}
