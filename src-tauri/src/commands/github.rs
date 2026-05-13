// GitHub IPC commands — the Drydock's PR enumeration + review action
// surface. Every call shells `gh` through the WSL2 bridge, because the
// investor's `gh auth login` token lives in WSL2, not in the Windows
// environment the Tauri binary runs under.
//
// The shape:
//   * `gh_auth_status()` — `gh auth status`; the panel renders an empty
//     state when the investor isn't authenticated.
//   * `list_open_prs()` — enumerates open PRs across every repo in
//     `drydock::repo_registry`. Sequential per-repo calls; fast enough
//     on WSL2 (~80 ms each, 12 repos, under a second total).
//   * `pull_request_files()` — `gh pr view <n> --repo X --json files`
//     for the per-file diff list the panel renders when a PR is expanded.
//   * `approve_pr` / `comment_pr` / `request_changes_pr` — `gh pr review`
//     wrappers. The body is piped via stdin so multi-line review bodies
//     are passed cleanly.

use crate::drydock::{bridge, repo_registry};
use crate::error::{MezzanineError, MezzanineResult};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhAuthStatus {
    pub authenticated: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    pub repo_full_name: String,
    pub repo_label: String,
    pub repo_local_path: String,
    pub experiment_scope: Option<String>,
    pub number: u64,
    pub title: String,
    pub author: String,
    pub head_ref: String,
    pub is_draft: bool,
    pub additions: u64,
    pub deletions: u64,
    pub changed_files: u64,
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestFile {
    pub path: String,
    pub additions: u64,
    pub deletions: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct RawAuthor {
    #[serde(default)]
    login: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawPullRequest {
    number: u64,
    title: String,
    author: RawAuthor,
    head_ref_name: String,
    #[serde(default)]
    is_draft: bool,
    #[serde(default)]
    additions: u64,
    #[serde(default)]
    deletions: u64,
    #[serde(default)]
    changed_files: u64,
    url: String,
}

#[derive(Debug, Clone, Deserialize)]
struct RawPrFilesEnvelope {
    #[serde(default)]
    files: Vec<RawPrFile>,
}

#[derive(Debug, Clone, Deserialize)]
struct RawPrFile {
    path: String,
    #[serde(default)]
    additions: u64,
    #[serde(default)]
    deletions: u64,
}

const PR_LIST_FIELDS: &str =
    "number,title,author,headRefName,isDraft,additions,deletions,changedFiles,url";

#[tauri::command]
pub async fn gh_auth_status(state: State<'_, AppState>) -> MezzanineResult<GhAuthStatus> {
    let (lab_root, distro) = read_lab_state(&state)?;
    // The subprocess call is sync. Hand it to a blocking-thread so the
    // main thread (and the tokio worker pool) stays free for the UI.
    let result = tokio::task::spawn_blocking(move || {
        bridge::run_in_lab(&lab_root, "gh", &["auth", "status"], distro.as_deref())
    })
    .await
    .map_err(|e| MezzanineError::WslBridge(format!("gh auth status join failed: {e}")))?;
    // `gh auth status` exits 0 when authenticated, 1 when not. The error
    // case is a non-authenticated signal — not a bridge failure — so the
    // panel can render the calm one-liner.
    match result {
        Ok(msg) => Ok(GhAuthStatus {
            authenticated: true,
            message: msg.trim().to_string(),
        }),
        Err(MezzanineError::WslBridge(msg)) => Ok(GhAuthStatus {
            authenticated: false,
            message: msg,
        }),
        Err(other) => Err(other),
    }
}

#[tauri::command]
pub async fn list_open_prs(state: State<'_, AppState>) -> MezzanineResult<Vec<PullRequest>> {
    let (lab_root, distro) = read_lab_state(&state)?;
    let repos = repo_registry::lab_repos();
    let lab_root = std::sync::Arc::new(lab_root);
    let distro = std::sync::Arc::new(distro);

    // Spawn 12 blocking tasks in parallel — one per repo. Wall-clock
    // collapses from ~12 × per-call latency down to the slowest single
    // `gh pr list`. The webview thread stays responsive throughout.
    let mut handles = Vec::with_capacity(repos.len());
    for repo in repos {
        let lab_root = std::sync::Arc::clone(&lab_root);
        let distro = std::sync::Arc::clone(&distro);
        let handle = tokio::task::spawn_blocking(move || {
            let stdout = bridge::run_in_lab(
                &lab_root,
                "gh",
                &[
                    "pr",
                    "list",
                    "--repo",
                    &repo.repo_full_name,
                    "--state",
                    "open",
                    "--limit",
                    "30",
                    "--json",
                    PR_LIST_FIELDS,
                ],
                distro.as_deref(),
            );
            (repo, stdout)
        });
        handles.push(handle);
    }

    let mut out = Vec::new();
    for handle in handles {
        let (repo, stdout_result) = match handle.await {
            Ok(pair) => pair,
            Err(e) => {
                log::warn!("Drydock: gh pr list task join failed: {e}");
                continue;
            }
        };
        // A single repo's failure (private, archived, network blip) must
        // not down the whole panel. Skip and continue — the panel will
        // simply omit that repo's PRs this refresh.
        let stdout = match stdout_result {
            Ok(s) => s,
            Err(e) => {
                log::warn!(
                    "Drydock: gh pr list failed for {}: {e}",
                    repo.repo_full_name
                );
                continue;
            }
        };
        let raws: Vec<RawPullRequest> = match serde_json::from_str(stdout.trim()) {
            Ok(v) => v,
            Err(e) => {
                log::warn!(
                    "Drydock: gh pr list JSON parse failed for {}: {e}",
                    repo.repo_full_name
                );
                continue;
            }
        };
        for raw in raws {
            out.push(PullRequest {
                repo_full_name: repo.repo_full_name.clone(),
                repo_label: repo.label.clone(),
                repo_local_path: repo.local_path.clone(),
                experiment_scope: repo.experiment_scope.clone(),
                number: raw.number,
                title: raw.title,
                author: raw.author.login,
                head_ref: raw.head_ref_name,
                is_draft: raw.is_draft,
                additions: raw.additions,
                deletions: raw.deletions,
                changed_files: raw.changed_files,
                url: raw.url,
            });
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn pull_request_files(
    state: State<'_, AppState>,
    repo_full_name: String,
    number: u64,
) -> MezzanineResult<Vec<PullRequestFile>> {
    let (lab_root, distro) = read_lab_state(&state)?;
    let stdout = tokio::task::spawn_blocking(move || {
        let number_arg = number.to_string();
        bridge::run_in_lab(
            &lab_root,
            "gh",
            &[
                "pr",
                "view",
                &number_arg,
                "--repo",
                &repo_full_name,
                "--json",
                "files",
            ],
            distro.as_deref(),
        )
    })
    .await
    .map_err(|e| MezzanineError::WslBridge(format!("gh pr view join failed: {e}")))??;
    let envelope: RawPrFilesEnvelope = serde_json::from_str(stdout.trim())
        .map_err(|e| MezzanineError::WslBridge(format!("gh pr view JSON: {e}")))?;
    Ok(envelope
        .files
        .into_iter()
        .map(|f| PullRequestFile {
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
        })
        .collect())
}

#[tauri::command]
pub async fn approve_pr(
    state: State<'_, AppState>,
    repo_full_name: String,
    number: u64,
    body: String,
) -> MezzanineResult<()> {
    submit_review(&state, repo_full_name, number, "--approve", body).await
}

#[tauri::command]
pub async fn comment_pr(
    state: State<'_, AppState>,
    repo_full_name: String,
    number: u64,
    body: String,
) -> MezzanineResult<()> {
    submit_review(&state, repo_full_name, number, "--comment", body).await
}

#[tauri::command]
pub async fn request_changes_pr(
    state: State<'_, AppState>,
    repo_full_name: String,
    number: u64,
    body: String,
) -> MezzanineResult<()> {
    submit_review(&state, repo_full_name, number, "--request-changes", body).await
}

async fn submit_review(
    state: &State<'_, AppState>,
    repo_full_name: String,
    number: u64,
    verdict_flag: &'static str,
    body: String,
) -> MezzanineResult<()> {
    let (lab_root, distro) = read_lab_state(state)?;
    tokio::task::spawn_blocking(move || {
        let number_arg = number.to_string();
        // --body-file - reads the body from stdin so multi-line review bodies
        // cross the bridge intact (no argv length / quoting surprises).
        bridge::run_in_lab_with_stdin(
            &lab_root,
            "gh",
            &[
                "pr",
                "review",
                &number_arg,
                "--repo",
                &repo_full_name,
                verdict_flag,
                "--body-file",
                "-",
            ],
            &body,
            distro.as_deref(),
        )
    })
    .await
    .map_err(|e| MezzanineError::WslBridge(format!("gh pr review join failed: {e}")))??;
    Ok(())
}

fn read_lab_state(state: &State<'_, AppState>) -> MezzanineResult<(PathBuf, Option<String>)> {
    let lab_root = {
        let guard = state.lab_root.read();
        guard.clone().ok_or(MezzanineError::ConfigCorrupt)?
    };
    let distro = state.distro.read().clone();
    Ok((lab_root, distro))
}
