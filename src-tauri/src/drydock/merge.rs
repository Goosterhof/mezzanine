//! Investor-triggered Dependabot merges. Eligibility is re-read at the mutation boundary.
use crate::{
    drydock::{bridge, repo_registry},
    error::{MezzanineError, MezzanineResult},
    state::AppState,
};
use serde::Serialize;
use serde_json::Value;
use std::path::Path;
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeCandidate {
    pub head_oid: String,
    pub title: String,
    pub body: String,
    pub method: String,
    pub ready: bool,
    pub reason: String,
    pub checks: Vec<Check>,
}
#[derive(Debug, Serialize)]
pub struct Check {
    pub name: String,
    pub state: String,
    pub url: String,
}

fn fail(message: impl Into<String>) -> MezzanineError {
    MezzanineError::WslBridge(message.into())
}
fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().unwrap_or("")
}
fn json(root: &Path, distro: Option<&str>, args: &[&str]) -> MezzanineResult<Value> {
    Ok(serde_json::from_str(&bridge::run_in_lab(
        root, "gh", args, distro,
    )?)?)
}
fn validate_repo(repo: &str, number: u64) -> MezzanineResult<()> {
    if number == 0
        || !repo_registry::lab_repos()
            .iter()
            .any(|r| r.repo_full_name == repo)
    {
        return Err(fail("Choose a PR from the laboratory registry."));
    }
    Ok(())
}
fn version(raw: &str) -> Option<(u64, u64)> {
    let raw = raw.trim_start_matches('v');
    if raw.contains('-') || raw.contains('+') {
        return None;
    }
    let mut parts = raw.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    if !parts.all(|p| p.parse::<u64>().is_ok()) {
        return None;
    }
    Some((major, minor))
}
fn update_hold(title: &str) -> Option<&'static str> {
    let lower = title.to_lowercase();
    if lower.contains("group") {
        return Some("Grouped update: prepare and inspect each dependency first.");
    }
    if lower.contains("tauri") {
        return Some("Prepare this update with its paired npm/Rust dependencies.");
    }
    let Some((_, versions)) = title.rsplit_once(" from ") else {
        return Some(
            "Grouped or unclassified update: prepare and review its dependency changes first.",
        );
    };
    let Some((from, to)) = versions.split_once(" to ") else {
        return Some("Update versions need review.");
    };
    let to = to.split_once(" in /").map_or(to, |(version, _)| version);
    let (Some(a), Some(b)) = (version(from), version(to)) else {
        return Some("Unclassified versions: prepare this update for review.");
    };
    if a.0 != b.0 || (a.0 == 0 && a.1 != b.1) {
        return Some("Major or pre-1.0 minor update: prepare and test it with a colleague.");
    }
    None
}
fn method(repo: &str, settings: &Value) -> MezzanineResult<String> {
    let gadget = repo_registry::lab_repos()
        .iter()
        .any(|r| r.repo_full_name == repo && r.local_path.starts_with("gadgets/"));
    let preferred = if repo == "Goosterhof/zmuuzn-packages" {
        "rebase"
    } else if gadget || settings["allow_merge_commit"] == true {
        "merge"
    } else if settings["allow_squash_merge"] == true {
        "squash"
    } else {
        "rebase"
    };
    let flag = match preferred {
        "merge" => "allow_merge_commit",
        "squash" => "allow_squash_merge",
        _ => "allow_rebase_merge",
    };
    if settings[flag] != true {
        return Err(fail("Repository merge settings conflict with laboratory policy. Open GitHub to resolve them."));
    }
    Ok(preferred.into())
}
fn classify(
    pr: &Value,
    author: &Value,
    settings: &Value,
    repo: &str,
    billing: bool,
) -> MezzanineResult<MergeCandidate> {
    let checks: Vec<Check> = pr["statusCheckRollup"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|check| {
            let conclusion = text(check, "conclusion");
            let state = if !conclusion.is_empty() {
                conclusion
            } else if !text(check, "state").is_empty() {
                text(check, "state")
            } else {
                text(check, "status")
            };
            Check {
                name: text(check, "name").to_string() + text(check, "context"),
                state: state.into(),
                url: text(check, "detailsUrl").to_string() + text(check, "targetUrl"),
            }
        })
        .collect();
    let method = method(repo, settings)?;
    let reason = if author["user"]["login"] != "dependabot[bot]" || author["user"]["type"] != "Bot"
    {
        "The quick merge is for verified Dependabot PRs."
    } else if text(pr, "state") != "OPEN" || pr["isDraft"] != false {
        "This PR is closed or still a draft."
    } else if let Some(hold) = update_hold(text(pr, "title")) {
        hold
    } else if billing {
        "CI unavailable: GitHub reports a billing or spending limit. Prepare local verification with a colleague."
    } else if checks.is_empty() {
        "No check evidence is available. Prepare local verification with a colleague."
    } else if checks.iter().any(|c| {
        matches!(
            c.state.as_str(),
            "FAILURE" | "ERROR" | "TIMED_OUT" | "CANCELLED" | "ACTION_REQUIRED" | "STARTUP_FAILURE"
        )
    }) {
        "Checks need attention. Inspect the results; a failed start is not a tested change."
    } else if checks
        .iter()
        .any(|c| !matches!(c.state.as_str(), "SUCCESS" | "NEUTRAL" | "SKIPPED"))
    {
        "Waiting for checks to finish."
    } else if !checks.iter().any(|c| c.state == "SUCCESS") {
        "No successful check was recorded. Prepare local verification."
    } else if text(pr, "reviewDecision") == "CHANGES_REQUESTED"
        || text(pr, "reviewDecision") == "REVIEW_REQUIRED"
    {
        "Required review is not complete."
    } else if text(pr, "mergeStateStatus") != "CLEAN" {
        "GitHub has not marked this head ready to merge. Refresh or inspect the branch rules."
    } else {
        "Ready to merge this revision."
    };
    let head = text(pr, "headRefOid");
    if head.len() != 40 || !head.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err(fail("GitHub did not return an exact PR head."));
    }
    Ok(MergeCandidate {
        head_oid: head.into(),
        title: text(pr, "title").into(),
        body: text(pr, "body").into(),
        method,
        ready: reason == "Ready to merge this revision.",
        reason: reason.into(),
        checks,
    })
}
fn billing_diagnostic(value: &str) -> bool {
    let value = value.to_lowercase();
    value.contains("billing")
        || value.contains("spending limit")
        || value.contains("payments have failed")
}
fn candidate(
    root: &Path,
    distro: Option<&str>,
    repo: &str,
    number: u64,
) -> MezzanineResult<MergeCandidate> {
    validate_repo(repo, number)?;
    let number_arg = number.to_string();
    let pr = json(
        root,
        distro,
        &[
            "pr",
            "view",
            &number_arg,
            "--repo",
            repo,
            "--json",
            "title,body,headRefOid,state,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup",
        ],
    )?;
    let author = json(
        root,
        distro,
        &["api", &format!("repos/{repo}/pulls/{number}")],
    )?;
    // Two API reads must agree before we even display an eligible candidate.
    if author["head"]["sha"].as_str() != pr["headRefOid"].as_str() {
        return Err(fail("The PR changed during refresh. Read it again."));
    }
    let settings = json(root, distro, &["api", &format!("repos/{repo}")])?;
    // Explicit provider diagnostics only; never infer billing from a short duration.
    let mut billing = false;
    if pr["statusCheckRollup"].as_array().is_some_and(|checks| {
        checks
            .iter()
            .any(|c| matches!(text(c, "conclusion"), "FAILURE" | "STARTUP_FAILURE"))
    }) {
        if let Ok(runs) = json(
            root,
            distro,
            &[
                "api",
                &format!(
                    "repos/{repo}/commits/{}/check-runs?per_page=100",
                    text(&pr, "headRefOid")
                ),
            ],
        ) {
            for run in runs["check_runs"].as_array().into_iter().flatten() {
                let diagnostic = format!(
                    "{} {}",
                    text(&run["output"], "title"),
                    text(&run["output"], "summary")
                )
                .to_lowercase();
                if billing_diagnostic(&diagnostic) {
                    billing = true;
                    break;
                }
                if text(run, "conclusion") != "failure" {
                    continue;
                }
                if let Some(id) = run["id"].as_u64() {
                    if let Ok(annotations) = json(
                        root,
                        distro,
                        &[
                            "api",
                            &format!("repos/{repo}/check-runs/{id}/annotations?per_page=100"),
                        ],
                    ) {
                        billing = annotations.as_array().is_some_and(|rows| {
                            rows.iter()
                                .any(|row| billing_diagnostic(text(row, "message")))
                        });
                        if billing {
                            break;
                        }
                    }
                }
            }
        }
    }
    classify(&pr, &author, &settings, repo, billing)
}
#[tauri::command]
pub async fn read_merge_candidate(
    state: State<'_, AppState>,
    repo_full_name: String,
    number: u64,
) -> MezzanineResult<MergeCandidate> {
    let root = state
        .lab_root
        .read()
        .clone()
        .ok_or(MezzanineError::ConfigCorrupt)?;
    let distro = state.distro.read().clone();
    tokio::task::spawn_blocking(move || {
        candidate(&root, distro.as_deref(), &repo_full_name, number)
    })
    .await
    .map_err(|e| fail(e.to_string()))?
}
fn ensure_merge_revision(fresh: &MergeCandidate, expected_head: &str) -> MezzanineResult<()> {
    if fresh.head_oid != expected_head {
        return Err(fail(
            "The PR changed. Refresh and inspect the new revision before merging.",
        ));
    }
    if !fresh.ready {
        return Err(fail(fresh.reason.clone()));
    }
    Ok(())
}

#[tauri::command]
pub async fn merge_dependabot_pr(
    state: State<'_, AppState>,
    repo_full_name: String,
    number: u64,
    expected_head: String,
) -> MezzanineResult<String> {
    let root = state
        .lab_root
        .read()
        .clone()
        .ok_or(MezzanineError::ConfigCorrupt)?;
    let distro = state.distro.read().clone();
    tokio::task::spawn_blocking(move || {
        let fresh = candidate(&root, distro.as_deref(), &repo_full_name, number)?;
        ensure_merge_revision(&fresh, &expected_head)?;
        bridge::run_in_lab(&root, "gh", &["pr", "merge", &number.to_string(), "--repo", &repo_full_name, &format!("--{}", fresh.method), "--match-head-commit", &expected_head], distro.as_deref())?;
        // A merge queue can accept without merging. Never report success from exit status alone.
        match json(&root, distro.as_deref(), &["pr", "view", &number.to_string(), "--repo", &repo_full_name, "--json", "state,autoMergeRequest"]) {
            Ok(result) if result["state"] == "MERGED" => Ok("Merged. Refreshing the dock…".into()),
            Ok(result) if !result["autoMergeRequest"].is_null() => Ok("Queued for merge by GitHub. It has not merged yet.".into()),
            _ => Ok("GitHub accepted the request; final merge state is not confirmed. Check the PR before retrying.".into()),
        }
    }).await.map_err(|e| fail(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn pr() -> Value {
        serde_json::json!({"headRefOid":"a".repeat(40),"state":"OPEN","isDraft":false,"title":"Bump vue from 3.5.0 to 3.5.1","mergeStateStatus":"CLEAN","reviewDecision":"","statusCheckRollup":[{"name":"ci","conclusion":"SUCCESS"}]})
    }
    fn author() -> Value {
        serde_json::json!({"user":{"login":"dependabot[bot]","type":"Bot"}})
    }
    fn settings() -> Value {
        serde_json::json!({"allow_merge_commit":true,"allow_rebase_merge":true})
    }
    #[test]
    fn accepts_a_directory_suffix_and_requires_a_billing_diagnostic() {
        assert!(update_hold(
            "chore(deps-dev): bump playwright-core from 1.63.0 to 1.64.0 in /frontend"
        )
        .is_none());
        assert!(billing_diagnostic("The job was not started because recent account payments have failed or your spending limit needs to be increased."));
        assert!(!billing_diagnostic("Process failed after 3 seconds"));
    }

    #[test]
    fn changed_revision_and_newly_blocked_checks_refuse_a_merge() {
        let mut fresh =
            classify(&pr(), &author(), &settings(), "Goosterhof/mezzanine", false).unwrap();
        assert!(ensure_merge_revision(&fresh, &"b".repeat(40)).is_err());
        assert!(ensure_merge_revision(&fresh, &"a".repeat(40)).is_ok());
        fresh.ready = false;
        fresh.reason = "Checks now failing".into();
        assert!(ensure_merge_revision(&fresh, &"a".repeat(40)).is_err());
    }

    #[test]
    fn holds_majors_groups_pairs_and_missing_checks() {
        for title in [
            "Bump vue from 3.5.0 to 4.0.0",
            "Bump x from 0.4.0 to 0.5.0",
            "Bump the vue group",
            "Bump @tauri-apps/api from 2.1.0 to 2.2.0",
        ] {
            let mut p = pr();
            p["title"] = title.into();
            assert!(
                !classify(&p, &author(), &settings(), "Goosterhof/mezzanine", false)
                    .unwrap()
                    .ready
            );
        }
        let mut p = pr();
        p["statusCheckRollup"] = serde_json::json!([]);
        assert!(
            !classify(&p, &author(), &settings(), "Goosterhof/mezzanine", false)
                .unwrap()
                .ready
        );
    }
    #[test]
    fn verifies_bot_and_policy_and_explains_billing() {
        let p = pr();
        let good = classify(&p, &author(), &settings(), "Goosterhof/mezzanine", false).unwrap();
        assert!(good.ready);
        assert_eq!(good.method, "merge");
        assert_eq!(
            classify(
                &p,
                &author(),
                &settings(),
                "Goosterhof/zmuuzn-packages",
                false
            )
            .unwrap()
            .method,
            "rebase"
        );
        assert!(
            !classify(
                &p,
                &serde_json::json!({"user":{"login":"human","type":"User"}}),
                &settings(),
                "Goosterhof/mezzanine",
                false
            )
            .unwrap()
            .ready
        );
        let blocked = classify(&p, &author(), &settings(), "Goosterhof/mezzanine", true).unwrap();
        assert!(!blocked.ready);
        assert!(blocked.reason.contains("CI unavailable"));
    }
}
