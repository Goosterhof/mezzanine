// War Room Dispatch parser + writer.
//
// `documents/war-room-dispatch.md` follows a stable shape:
//
//   ## Active Findings
//
//   ### 1. Title goes here
//
//   **Severity:** Medium (...)
//   **Location:** experiments/zmuuzn-strava/CLAUDE.md
//
//   <body markdown — runs until the next ### or the next ## header>
//
//   ### 2. ...
//
//   ## Resolved
//
// The parser's contract: collect every `### N. Title` block under
// `## Active Findings`, stop when the next `##`-level header appears.
// Severity and Location are pulled out as named fields when present;
// the rest of the body stays in `body_markdown` so the frontend can
// render it verbatim.
//
// The writer is pragmatic: appending a new finding means inserting a
// `### N. Title` block at the *end* of Active Findings (just before the
// next `##`-level header). The investor edits the headline and severity
// inline; we never hand-edit existing findings.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DispatchFinding {
    pub number: u32,
    pub title: String,
    pub severity: String,
    pub location: String,
    pub body_markdown: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewDispatchFinding {
    pub title: String,
    pub severity: String,
    pub location: String,
    pub body_markdown: String,
}

/// Parse every `### N. Title` block under `## Active Findings`. Returns an
/// empty vec if the file has no Active Findings section or no findings
/// inside it.
pub fn parse(content: &str) -> Vec<DispatchFinding> {
    let mut findings = Vec::new();
    let mut in_active = false;
    let mut current: Option<DispatchFinding> = None;
    let mut body_lines: Vec<&str> = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim_end();
        if trimmed.starts_with("## ") {
            if let Some(mut finding) = current.take() {
                finding.body_markdown = body_lines.join("\n").trim().to_string();
                findings.push(finding);
                body_lines.clear();
            }
            in_active = trimmed == "## Active Findings";
            continue;
        }
        if !in_active {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("### ") {
            if let Some(mut finding) = current.take() {
                finding.body_markdown = body_lines.join("\n").trim().to_string();
                findings.push(finding);
                body_lines.clear();
            }
            current = Some(parse_finding_header(rest));
            continue;
        }
        let Some(finding) = current.as_mut() else {
            continue;
        };
        if let Some(value) = trimmed.strip_prefix("**Severity:**") {
            finding.severity = value.trim().to_string();
            continue;
        }
        if let Some(value) = trimmed.strip_prefix("**Location:**") {
            // Strip Markdown ` ` ticks if the investor wrapped the path.
            let cleaned = value.trim().trim_matches('`').to_string();
            finding.location = cleaned;
            continue;
        }
        body_lines.push(trimmed);
    }
    if let Some(mut finding) = current.take() {
        finding.body_markdown = body_lines.join("\n").trim().to_string();
        findings.push(finding);
    }
    findings
}

fn parse_finding_header(rest: &str) -> DispatchFinding {
    // Format: "1. Title goes here" — split on the first ". ".
    let mut finding = DispatchFinding::default();
    if let Some((num_str, title)) = rest.split_once(". ") {
        finding.number = num_str.trim().parse().unwrap_or(0);
        finding.title = title.trim().to_string();
    } else {
        finding.title = rest.trim().to_string();
    }
    finding
}

/// Render a new finding as the markdown block to splice into the
/// dispatch file. Numbering is the caller's job (use `next_number`).
pub fn render_new_finding(number: u32, finding: &NewDispatchFinding) -> String {
    let mut out = String::new();
    out.push_str(&format!("### {}. {}\n\n", number, finding.title.trim()));
    out.push_str(&format!("**Severity:** {}\n", finding.severity.trim()));
    out.push_str(&format!("**Location:** {}\n\n", finding.location.trim()));
    let body = finding.body_markdown.trim();
    if !body.is_empty() {
        out.push_str(body);
        out.push('\n');
    }
    out
}

/// Insert a new finding at the end of Active Findings — just before the
/// next `##`-level header (typically `## Resolved`) or end-of-file.
pub fn insert_finding(content: &str, finding: &NewDispatchFinding) -> String {
    let existing = parse(content);
    let next_number = existing.iter().map(|f| f.number).max().unwrap_or(0) + 1;
    let block = render_new_finding(next_number, finding);

    let lines: Vec<&str> = content.lines().collect();
    let mut active_start: Option<usize> = None;
    let mut active_end: Option<usize> = None;
    for (idx, raw) in lines.iter().enumerate() {
        let line = raw.trim_end();
        if line == "## Active Findings" {
            active_start = Some(idx);
        } else if active_start.is_some() && active_end.is_none() && line.starts_with("## ") {
            active_end = Some(idx);
        }
    }
    let Some(_start) = active_start else {
        // No Active Findings section at all — append a fresh one at end of file.
        let mut out = content.trim_end().to_string();
        out.push_str("\n\n## Active Findings\n\n");
        out.push_str(&block);
        return out;
    };
    let insert_at = active_end.unwrap_or(lines.len());
    let mut out_lines: Vec<String> = lines[..insert_at]
        .iter()
        .map(|s| (*s).to_string())
        .collect();
    // Walk back over trailing horizontal rules / blank lines so the new
    // block lands flush against the last finding rather than after the
    // separator that precedes the next section.
    while let Some(last) = out_lines.last() {
        if last.trim().is_empty() || last.trim() == "---" {
            out_lines.pop();
        } else {
            break;
        }
    }
    out_lines.push(String::new());
    for chunk in block.lines() {
        out_lines.push(chunk.to_string());
    }
    out_lines.push(String::new());
    out_lines.push("---".to_string());
    out_lines.push(String::new());
    out_lines.extend(lines[insert_at..].iter().map(|s| (*s).to_string()));
    out_lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
# War Room Dispatch

**Last Updated:** 2026-04-16

## Active Findings

### 1. CLAUDE.md Inventory Drift — Crucible

**Severity:** Medium (22 days unresolved — first flagged 2026-03-25)
**Location:** experiments/zmuuzn-strava/CLAUDE.md

The Crucible's CLAUDE.md lists fewer components than actually exist:
- Actions: Lists 8, actual 10

### 2. Smokestacks toFloat/toString Duplication

**Severity:** Low
**Location:** experiments/zmuuzn-smokestacks/backend/app/Actions/

Identical helpers duplicated across five actions.

---

## Resolved

| Finding | Resolved | Note |
|---|---|---|
| Old issue | 2026-04-01 | Fixed |
";

    #[test]
    fn parses_active_findings_only() {
        let findings = parse(SAMPLE);
        assert_eq!(findings.len(), 2);

        let first = &findings[0];
        assert_eq!(first.number, 1);
        assert_eq!(first.title, "CLAUDE.md Inventory Drift — Crucible");
        assert!(first.severity.starts_with("Medium"));
        assert_eq!(first.location, "experiments/zmuuzn-strava/CLAUDE.md");
        assert!(first.body_markdown.contains("Actions: Lists 8, actual 10"));

        let second = &findings[1];
        assert_eq!(second.number, 2);
        assert!(second.title.starts_with("Smokestacks"));
        assert_eq!(second.severity, "Low");
    }

    #[test]
    fn no_active_findings_returns_empty() {
        let content = "# War Room Dispatch\n\n## Resolved\n\nNothing here.\n";
        assert!(parse(content).is_empty());
    }

    #[test]
    fn missing_section_returns_empty() {
        assert!(parse("# something else").is_empty());
    }

    #[test]
    fn render_new_finding_emits_canonical_block() {
        let new = NewDispatchFinding {
            title: "Pulse drift".to_string(),
            severity: "High".to_string(),
            location: "documents/laboratory-pulse.md".to_string(),
            body_markdown: "Pulse hasn't been updated in three sessions.".to_string(),
        };
        let block = render_new_finding(7, &new);
        assert!(block.starts_with("### 7. Pulse drift\n\n"));
        assert!(block.contains("**Severity:** High\n"));
        assert!(block.contains("**Location:** documents/laboratory-pulse.md\n"));
        assert!(block
            .trim_end()
            .ends_with("Pulse hasn't been updated in three sessions."));
    }

    #[test]
    fn insert_finding_appends_with_next_number() {
        let new = NewDispatchFinding {
            title: "New thing".to_string(),
            severity: "Low".to_string(),
            location: "x.md".to_string(),
            body_markdown: "Body.".to_string(),
        };
        let updated = insert_finding(SAMPLE, &new);
        let parsed = parse(&updated);
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[2].number, 3);
        assert_eq!(parsed[2].title, "New thing");
        // Resolved section must still be intact.
        assert!(updated.contains("## Resolved"));
        assert!(updated.contains("Old issue"));
    }

    #[test]
    fn insert_finding_creates_section_when_missing() {
        let content = "# War Room Dispatch\n\nNo sections yet.";
        let new = NewDispatchFinding {
            title: "First".to_string(),
            severity: "Low".to_string(),
            location: "x.md".to_string(),
            body_markdown: "Body.".to_string(),
        };
        let updated = insert_finding(content, &new);
        assert!(updated.contains("## Active Findings"));
        assert!(updated.contains("### 1. First"));
    }
}
