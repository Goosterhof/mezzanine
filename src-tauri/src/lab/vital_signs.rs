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
pub fn parse(content: &str) -> VitalSigns {
    let mut signs = VitalSigns::default();
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
        if key.is_empty() || value.is_empty() {
            continue;
        }
        match key {
            "Experiments" => {
                signs.experiments_active = leading_u32(value);
                signs.experiments_summary = value.to_string();
            }
            "Gadgets" => {
                signs.gadgets_calibrated = leading_u32(value);
                signs.gadgets_summary = value.to_string();
            }
            "Packages" => {
                signs.packages_published = leading_u32(value);
                signs.packages_summary = value.to_string();
            }
            "Minions" => {
                signs.minions_operational = leading_u32(value);
                signs.minions_summary = value.to_string();
            }
            "Sentinels" => {
                signs.sentinels_watching = leading_u32(value);
                signs.sentinels_summary = value.to_string();
            }
            "Last Chaos" => signs.last_chaos = value.to_string(),
            "Chaos Filed" => signs.chaos_filed = value.to_string(),
            "Enhance Filed" => signs.enhance_filed = value.to_string(),
            _ => {}
        }
    }
    signs
}

fn leading_u32(value: &str) -> Option<u32> {
    let mut digits = String::new();
    for ch in value.chars() {
        if ch.is_ascii_digit() {
            digits.push(ch);
        } else if !digits.is_empty() {
            break;
        }
    }
    digits.parse().ok()
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

    #[test]
    fn leading_u32_skips_non_digit_prefix() {
        assert_eq!(leading_u32("6 active"), Some(6));
        assert_eq!(leading_u32("#00068 — Cardinal"), Some(68));
        assert_eq!(leading_u32("no number"), None);
    }
}
