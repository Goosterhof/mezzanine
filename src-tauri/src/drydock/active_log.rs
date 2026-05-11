// Active-experiment-log finder.
//
// `documents/experiment-logs/<N>-<slug>.md` is the laboratory's primary
// planning artifact. Each log has a header block:
//
//   # Experiment Log #00048: The Workbench
//
//   **Experiment:** ...
//   **Status:** IN PROGRESS
//   **Scope:** workbench (lab-wide gadget — not scoped to a single experiment)
//   **Created:** 2026-04-30
//
// The Drydock annotates each PR with the most recent log that is
// currently IN PROGRESS or PLANNING and whose scope keyword matches the
// repo's `experiment_scope`. That link is the "what we're trying to
// build" context the investor wants on review surfaces.
//
// The parser is split into:
//   * `parse_header(filename, content) -> Option<LogHeader>` — pure,
//     returns the fields it can extract from one log file.
//   * `find_active_for_scope(logs, scope) -> Option<ActiveExperimentLog>` —
//     filters parsed headers by status and scope, returns the highest
//     number (most recent log wins).

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveExperimentLog {
    pub number: String,
    pub filename: String,
    pub title: String,
    pub status: String,
    pub scope: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogHeader {
    pub number: String,
    pub filename: String,
    pub title: String,
    pub status: String,
    pub scope: String,
}

/// Active statuses — the Drydock surfaces logs in any of these states.
const ACTIVE_STATUSES: &[&str] = &["IN PROGRESS", "PLANNING"];

/// Parse one experiment log file's header block. Returns `None` if the
/// file lacks a recognizable `# Experiment Log #...` heading.
pub fn parse_header(filename: &str, content: &str) -> Option<LogHeader> {
    let mut title = String::new();
    let mut number = String::new();
    let mut status = String::new();
    let mut scope = String::new();

    for line in content.lines().take(40) {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("# Experiment Log #") {
            if let Some((num, rest)) = rest.split_once(':') {
                number = num.trim().to_string();
                title = rest.trim().to_string();
            }
            continue;
        }
        if let Some(value) = trimmed.strip_prefix("**Status:**") {
            status = value.trim().to_string();
            continue;
        }
        if let Some(value) = trimmed.strip_prefix("**Scope:**") {
            scope = extract_scope_token(value.trim());
            continue;
        }
    }

    if title.is_empty() || number.is_empty() {
        return None;
    }
    Some(LogHeader {
        number,
        filename: filename.to_string(),
        title,
        status,
        scope,
    })
}

/// From a header like `crucible` or `crucible (deep tweak)` or
/// `` `crucible` `` extract the bare scope token. The scope line uses
/// freeform prose with backticks sometimes; we take the first
/// alphanumeric/hyphen run.
fn extract_scope_token(raw: &str) -> String {
    let trimmed = raw.trim_matches('`').trim();
    trimmed
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect::<String>()
        .to_lowercase()
}

/// Walk parsed headers, return the highest-numbered IN PROGRESS / PLANNING
/// log whose scope keyword matches `scope`. Scope match is case-insensitive
/// equality on the first token of `**Scope:**`.
pub fn find_active_for_scope(logs: &[LogHeader], scope: &str) -> Option<ActiveExperimentLog> {
    let scope_lower = scope.to_lowercase();
    let mut best: Option<&LogHeader> = None;
    for header in logs {
        if !is_active(&header.status) {
            continue;
        }
        if header.scope != scope_lower {
            continue;
        }
        match best {
            None => best = Some(header),
            Some(current) if header.number > current.number => best = Some(header),
            _ => {}
        }
    }
    best.map(|h| ActiveExperimentLog {
        number: h.number.clone(),
        filename: h.filename.clone(),
        title: h.title.clone(),
        status: h.status.clone(),
        scope: h.scope.clone(),
    })
}

fn is_active(status: &str) -> bool {
    ACTIVE_STATUSES.iter().any(|s| status.starts_with(s))
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOG_48: &str = "\
# Experiment Log #00048: The Workbench

**Experiment:** A Tauri v2 desktop cockpit.
**Status:** IN PROGRESS
**Scope:** `workbench` (lab-wide gadget — not scoped to a single experiment)
**Created:** 2026-04-30
";

    const LOG_30: &str = "\
# Experiment Log #00030: The Cross-Pollinator

**Experiment:** Cross-reference engine.
**Status:** DELIVERED
**Scope:** lab
**Created:** 2026-04-01
";

    const LOG_44: &str = "\
# Experiment Log #00044: The Crucible Insights Pane

**Experiment:** Forge insights surface.
**Status:** PLANNING
**Scope:** crucible
**Created:** 2026-04-22
";

    const LOG_47: &str = "\
# Experiment Log #00047: The Crucible Calendar

**Experiment:** Forge calendar.
**Status:** IN PROGRESS
**Scope:** crucible (deep tweak)
**Created:** 2026-04-28
";

    #[test]
    fn parse_header_extracts_canonical_fields() {
        let header = parse_header("00048-the-workbench.md", LOG_48).unwrap();
        assert_eq!(header.number, "00048");
        assert_eq!(header.title, "The Workbench");
        assert_eq!(header.status, "IN PROGRESS");
        assert_eq!(header.scope, "workbench");
    }

    #[test]
    fn parse_header_returns_none_without_title_heading() {
        assert!(parse_header("nope.md", "no heading here").is_none());
    }

    #[test]
    fn parse_header_strips_backticks_from_scope() {
        let log =
            "# Experiment Log #00050: Test\n\n**Scope:** `crucible`\n**Status:** IN PROGRESS\n";
        let header = parse_header("00050-test.md", log).unwrap();
        assert_eq!(header.scope, "crucible");
    }

    #[test]
    fn parse_header_takes_first_word_of_scope() {
        let log = "# Experiment Log #00051: Test\n\n**Scope:** crucible (deep tweak)\n**Status:** IN PROGRESS\n";
        let header = parse_header("00051-test.md", log).unwrap();
        assert_eq!(header.scope, "crucible");
    }

    #[test]
    fn find_active_for_scope_returns_only_active_logs() {
        let logs = vec![
            parse_header("00030.md", LOG_30).unwrap(),
            parse_header("00044.md", LOG_44).unwrap(),
        ];
        // Log 30 is DELIVERED — must not match.
        assert!(find_active_for_scope(&logs, "lab").is_none());
        // Log 44 is PLANNING crucible — matches.
        let active = find_active_for_scope(&logs, "crucible").unwrap();
        assert_eq!(active.number, "00044");
        assert_eq!(active.status, "PLANNING");
    }

    #[test]
    fn find_active_for_scope_returns_highest_number_when_multiple_match() {
        let logs = vec![
            parse_header("00044.md", LOG_44).unwrap(),
            parse_header("00047.md", LOG_47).unwrap(),
        ];
        let active = find_active_for_scope(&logs, "crucible").unwrap();
        assert_eq!(active.number, "00047");
        assert_eq!(active.title, "The Crucible Calendar");
    }

    #[test]
    fn find_active_for_scope_matches_case_insensitive() {
        let logs = vec![parse_header("00048.md", LOG_48).unwrap()];
        let active = find_active_for_scope(&logs, "WorkBench").unwrap();
        assert_eq!(active.scope, "workbench");
    }

    #[test]
    fn find_active_for_scope_returns_none_when_scope_unknown() {
        let logs = vec![parse_header("00048.md", LOG_48).unwrap()];
        assert!(find_active_for_scope(&logs, "gatekeeper").is_none());
    }

    #[test]
    fn find_active_for_scope_returns_none_for_empty_list() {
        assert!(find_active_for_scope(&[], "anything").is_none());
    }
}
