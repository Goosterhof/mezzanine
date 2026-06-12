// Vital Signs parser — reads the ASCII box at the top of the laboratory's
// root CLAUDE.md and turns it into a typed payload Mission Control can
// render without re-parsing markdown on the frontend.
//
// The box is hand-curated so its shape is stable: each row is rendered as
// `│ <KEY>  │ <VALUE>  │`. The parser walks the body of the box, splits
// each row on `│`, and harvests the key/value pairs. Keys are
// case-sensitive; unknown keys are ignored so future investor edits to the
// dashboard don't break the parser.
//
// The `experiments_active` / `gadgets_calibrated` / etc. fields lift the
// leading integer off the value cell when present. The `summary` fields
// keep the full text — the frontend renders the summary line below the
// number, the way the box reads on disk.

use serde::Serialize;

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VitalSigns {
    pub experiments_active: Option<u32>,
    pub experiments_summary: String,
    pub gadgets_calibrated: Option<u32>,
    pub gadgets_summary: String,
    pub packages_published: Option<u32>,
    pub packages_summary: String,
    pub minions_operational: Option<u32>,
    pub minions_summary: String,
    pub sentinels_watching: Option<u32>,
    pub sentinels_summary: String,
    pub last_chaos: String,
    pub chaos_filed: String,
    pub enhance_filed: String,
}

/// Parse the vital-signs ASCII box from CLAUDE.md. Returns the typed
/// payload; if the box is missing or unrecognised, every field is empty.
/// The parser never returns an error — Mission Control should render a
/// degraded (but non-broken) panel rather than throw on a CLAUDE.md edit.
///
/// Multi-line cells are stitched: a row whose key column is blank is a
/// continuation of the row above it, and its value is appended to that
/// key's value. The box wraps long cells across several physical lines
/// (the Experiments cell now names all six experiments across two rows),
/// so without stitching the parser would only ever see the first line.
pub fn parse(content: &str) -> VitalSigns {
    let mut signs = VitalSigns::default();
    let mut current: Option<(String, String)> = None;
    let mut rows: Vec<(String, String)> = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with('│') {
            continue;
        }
        let parts: Vec<&str> = trimmed.split('│').map(str::trim).collect();
        // A real value row looks like ["", "<KEY>", "<VALUE>", ""].
        if parts.len() < 3 {
            continue;
        }
        let key = parts[1];
        let value = parts[2];
        if !key.is_empty() {
            // A new keyed row — flush whatever cell we were accumulating.
            if let Some(pair) = current.take() {
                rows.push(pair);
            }
            if !value.is_empty() {
                current = Some((key.to_string(), value.to_string()));
            }
        } else if !value.is_empty() {
            // A continuation row (blank key, has a value) — append to the
            // current key's cell so a wrapped value parses as one string.
            if let Some((_, ref mut acc)) = current {
                acc.push(' ');
                acc.push_str(value);
            }
        }
    }
    if let Some(pair) = current.take() {
        rows.push(pair);
    }

    for (key, value) in rows {
        match key.as_str() {
            "Experiments" => {
                signs.experiments_active = derive_count(&value);
                signs.experiments_summary = value;
            }
            "Gadgets" => {
                signs.gadgets_calibrated = derive_count(&value);
                signs.gadgets_summary = value;
            }
            "Packages" => {
                signs.packages_published = derive_count(&value);
                signs.packages_summary = value;
            }
            "Minions" => {
                signs.minions_operational = derive_count(&value);
                signs.minions_summary = value;
            }
            "Sentinels" => {
                signs.sentinels_watching = derive_count(&value);
                signs.sentinels_summary = value;
            }
            "Last Chaos" => signs.last_chaos = value,
            "Chaos Filed" => signs.chaos_filed = value,
            "Enhance Filed" => signs.enhance_filed = value,
            _ => {}
        }
    }
    signs
}

/// Derive a count from a value cell. The box has two dialects: the legacy
/// numeric form ("6 active — …", "1 published") and the current prose form
/// that names the items instead ("Gatekeeper, War Table, … — see The
/// Experiments"). Prefer a leading integer; otherwise count the named items.
fn derive_count(value: &str) -> Option<u32> {
    leading_count(value).or_else(|| count_list_items(value))
}

/// The integer that *opens* the value cell, if any. Must be truly leading —
/// "6 active" yields 6, but "Mezzanine, Horadric Cube — … tombstoned
/// 2026-05-26" yields nothing (a date buried in a parenthetical is not a
/// count). The old "first integer anywhere" scan reported 2026 gadgets the
/// day the box gained a tombstone date.
fn leading_count(value: &str) -> Option<u32> {
    let digits: String = value
        .trim_start()
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    digits.parse().ok()
}

/// Count comma-separated named items in the descriptive head of a value cell
/// (everything before the first em-dash / en-dash / parenthesis). Only a
/// genuine comma list yields a count, so a single-phrase cell like
/// "Operational — full roster" stays `None` rather than reporting a
/// misleading 1.
fn count_list_items(value: &str) -> Option<u32> {
    let head = value.split(['—', '–', '(']).next().unwrap_or(value).trim();
    if !head.contains(',') {
        return None;
    }
    let count = head
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .count();
    (count > 0).then_some(count as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
```
┌─────────────────────────────────────────────────────────────────┐
│                   LABORATORY VITAL SIGNS                        │
├──────────────┬──────────────────────────────────────────────────┤
│ Experiments  │ 6 active — Gatekeeper, War Table, Crucible,     │
│              │   Parlour, Smokestacks, Horadrim                │
│ Gadgets      │ 5 calibrated — Observer, Holotable,             │
│              │   Grind, Horadric Cube, Mezzanine               │
│ Packages     │ 1 published — The Shared Nervous System         │
│ Minions      │ 18 operational — all agents, all stations manned │
│ Sentinels    │ 4 watching — gadget CI pipelines armed          │
│ Last Chaos   │ #00068 — Cardinal Candlelight (Parlour) — 8/10  │
│ Chaos Filed  │ 68 reports — highest: 10/10 (Auth Surface)      │
│ Enhance Filed│ 5 reports                                       │
│ Reactor      │ FrankenPHP via Octane — port 8080               │
└──────────────┴──────────────────────────────────────────────────┘
```";

    #[test]
    fn parses_the_canonical_box() {
        let signs = parse(SAMPLE);
        assert_eq!(signs.experiments_active, Some(6));
        assert!(signs.experiments_summary.starts_with("6 active"));
        assert_eq!(signs.gadgets_calibrated, Some(5));
        assert_eq!(signs.packages_published, Some(1));
        assert_eq!(signs.minions_operational, Some(18));
        assert_eq!(signs.sentinels_watching, Some(4));
        assert!(signs.last_chaos.starts_with("#00068"));
        assert!(signs.chaos_filed.starts_with("68 reports"));
        assert_eq!(signs.enhance_filed, "5 reports");
    }

    #[test]
    fn empty_input_returns_empty_signs() {
        let signs = parse("");
        assert_eq!(signs, VitalSigns::default());
    }

    #[test]
    fn ignores_unknown_keys_without_panicking() {
        let content = "│ Reactor │ FrankenPHP via Octane │";
        let signs = parse(content);
        assert_eq!(signs, VitalSigns::default());
    }

    // The current prose box names its items instead of counting them, and
    // wraps the long cells across continuation rows.
    const PROSE_SAMPLE: &str = "\
```
┌─────────────────────────────────────────────────────────────────┐
│                   LABORATORY VITAL SIGNS                        │
├──────────────┬──────────────────────────────────────────────────┤
│ Experiments  │ Gatekeeper, War Table, Crucible, Parlour,       │
│              │   Smokestacks, Horadrim — see The Experiments   │
│ Gadgets      │ Mezzanine, Horadric Cube — see The Gadgets      │
│              │   (Observer · Holotable · Grind absorbed into   │
│              │   the Mezzanine; directories tombstoned 2026-05-26) │
│ Packages     │ The Shared Nervous System — see The Packages    │
│ Minions      │ Operational — full roster in The Minions table  │
│ Sentinels    │ Mezzanine + Horadric Cube CI armed              │
│ Last Chaos   │ #00078 — Full Surface Re-Autopsy (Gatekeeper) — 9/10 │
│ Enhance Filed│ 8 reports — highest: 30/30 (Smokestacks #00008) │
└──────────────┴──────────────────────────────────────────────────┘
```";

    #[test]
    fn prose_box_counts_named_experiments_and_gadgets() {
        let signs = parse(PROSE_SAMPLE);
        assert_eq!(signs.experiments_active, Some(6));
        assert_eq!(signs.gadgets_calibrated, Some(2));
    }

    #[test]
    fn prose_box_stitches_continuation_rows_into_the_summary() {
        let signs = parse(PROSE_SAMPLE);
        // The second physical line of the Experiments cell must survive.
        assert!(
            signs.experiments_summary.contains("Smokestacks, Horadrim"),
            "got: {}",
            signs.experiments_summary
        );
    }

    #[test]
    fn prose_box_leaves_uncountable_rows_none_but_keeps_their_summary() {
        let signs = parse(PROSE_SAMPLE);
        assert_eq!(signs.packages_published, None);
        assert_eq!(signs.minions_operational, None);
        assert_eq!(signs.sentinels_watching, None);
        assert!(signs.minions_summary.starts_with("Operational"));
        assert!(signs.packages_summary.contains("Shared Nervous System"));
        assert!(signs.sentinels_summary.contains("CI armed"));
    }

    #[test]
    fn a_tombstone_date_is_not_mistaken_for_a_count() {
        // Regression: the gadgets cell ends with `tombstoned 2026-05-26`.
        // A "first integer anywhere" parse would report 2026 gadgets.
        let signs = parse(PROSE_SAMPLE);
        assert_eq!(signs.gadgets_calibrated, Some(2));
    }

    #[test]
    fn leading_count_requires_a_truly_leading_integer() {
        assert_eq!(leading_count("6 active"), Some(6));
        assert_eq!(leading_count("18 operational — all manned"), Some(18));
        assert_eq!(leading_count("Gatekeeper, War Table"), None);
        assert_eq!(leading_count("#00068 — Cardinal"), None);
        assert_eq!(leading_count("no number"), None);
    }

    #[test]
    fn count_list_items_only_counts_genuine_comma_lists() {
        assert_eq!(
            count_list_items("Gatekeeper, War Table, Crucible — see The Experiments"),
            Some(3)
        );
        assert_eq!(
            count_list_items("Mezzanine, Horadric Cube — see The Gadgets"),
            Some(2)
        );
        assert_eq!(count_list_items("Operational — full roster"), None);
        assert_eq!(count_list_items("The Shared Nervous System"), None);
    }
}
