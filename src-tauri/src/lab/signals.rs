// Pending Signals parser — reads the `### Pending Signals` table out of
// `documents/laboratory-pulse.md` and returns the active rows.
//
// Strikethrough rows (`~~...~~` in every cell) are processed signals the
// minion left in place for pattern analysis. Mission Control surfaces only
// active signals — those without strikethrough markers in the date cell.
//
// Table shape:
//   | Date | Source Minion | Signal Type | Target | Message | Recommended Dispatch |
//   |---|---|---|---|---|---|
//   | 2026-04-15 | The Inheritance | Neglect Alert | War Table | ... | `@muse war-table` |

use serde::Serialize;

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MinionSignal {
    pub date: String,
    pub source: String,
    pub signal_type: String,
    pub target: String,
    pub message: String,
    pub recommended_dispatch: String,
}

pub fn parse(content: &str) -> Vec<MinionSignal> {
    let mut signals = Vec::new();
    let mut in_pending = false;
    let mut header_seen = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("### ") {
            in_pending = trimmed == "### Pending Signals";
            header_seen = false;
            continue;
        }
        if trimmed.starts_with("## ") {
            // Left the Signal Queue section entirely.
            in_pending = false;
            continue;
        }
        if !in_pending {
            continue;
        }
        if !trimmed.starts_with('|') {
            continue;
        }
        // Skip the header row and the separator row.
        if !header_seen {
            if trimmed.contains("---") {
                header_seen = true;
            }
            continue;
        }
        let cells = split_table_row(trimmed);
        if cells.len() < 6 {
            continue;
        }
        let date_cell = cells[0].as_str();
        if is_struck_through(date_cell) {
            continue;
        }
        signals.push(MinionSignal {
            date: date_cell.to_string(),
            source: cells[1].clone(),
            signal_type: cells[2].clone(),
            target: cells[3].clone(),
            message: cells[4].clone(),
            recommended_dispatch: cells[5].trim_matches('`').to_string(),
        });
    }
    signals
}

fn split_table_row(line: &str) -> Vec<String> {
    let stripped = line.trim().trim_start_matches('|').trim_end_matches('|');
    stripped
        .split('|')
        .map(|cell| cell.trim().to_string())
        .collect()
}

fn is_struck_through(cell: &str) -> bool {
    let trimmed = cell.trim();
    trimmed.starts_with("~~") && trimmed.ends_with("~~")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
## Signal Queue

### Pending Signals

| Date | Source Minion | Signal Type | Target | Message | Recommended Dispatch |
|---|---|---|---|---|---|
| ~~2026-03-17~~ | ~~The Inheritance~~ | ~~Neglect Alert~~ | ~~War Table~~ | ~~old~~ | ~~`/idea war-table`~~ |
| 2026-04-15 | The Inheritance | Neglect Alert | War Table | Attention 28/100 | `@muse war-table` |
| 2026-04-20 | The Surgeon | Wound Cluster | Task Master | Phase C closure cluster | `@surgeon task-master` |

### Processed Signals

| Date Fired | Date Processed | Source | Signal | Target | Resolution |
|---|---|---|---|---|---|
| 2026-03-17 | 2026-03-17 | The Inheritance | Neglect Alert | War Table | done |

## Campaign Registry

(other table follows)
";

    #[test]
    fn parses_only_active_pending_signals() {
        let signals = parse(SAMPLE);
        assert_eq!(signals.len(), 2);
        assert_eq!(signals[0].date, "2026-04-15");
        assert_eq!(signals[0].source, "The Inheritance");
        assert_eq!(signals[0].target, "War Table");
        assert_eq!(signals[0].recommended_dispatch, "@muse war-table");
        assert_eq!(signals[1].source, "The Surgeon");
    }

    #[test]
    fn empty_when_section_missing() {
        assert!(parse("# nothing here").is_empty());
    }

    #[test]
    fn empty_when_only_struck_rows() {
        let content = "\
### Pending Signals

| Date | Source | Signal | Target | Message | Dispatch |
|---|---|---|---|---|---|
| ~~2026-03-01~~ | ~~A~~ | ~~B~~ | ~~C~~ | ~~D~~ | ~~`/x`~~ |
";
        assert!(parse(content).is_empty());
    }

    #[test]
    fn stops_at_next_header() {
        // Make sure rows from the Processed Signals table aren't mistaken for pending.
        let signals = parse(SAMPLE);
        assert!(signals.iter().all(|s| s.signal_type != "Resolution"));
        assert!(!signals.iter().any(|s| s.message == "done"));
    }
}
