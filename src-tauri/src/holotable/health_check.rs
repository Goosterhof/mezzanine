// The Holotable's health-check pinger.
//
// Six experiments wear health rings on the floor. Each ring is the result
// of a HEAD/GET against `https://<codename>.zmuuzn.nl/up` — the same Railway
// health endpoint the experiments register in their `railway.toml`.
//
// The experiment list comes from `drydock::repo_registry` (the canonical
// list of laboratory repos) — hardcoding URLs here would create a second
// source of truth that drifts the first time a seventh experiment ships.
//
// Six requests fire concurrently via `tokio::join_all`. Each request has
// a 5-second timeout. Per-experiment failures are first-class — a 503,
// a connection refused, a DNS NXDOMAIN — they each map to `HealthState::Red`
// with the error text preserved for the tooltip surface. The floor renders
// even when half the experiments are down; that is the whole point of the
// floor.
//
// HTTPS through `tauri_plugin_http::reqwest` — the plugin re-exports the
// `reqwest` crate version-aligned with the runtime we host. The
// `http:default` permission in `capabilities/default.json` (granted with
// the bench-era Drydock for GitHub API enrichment) already covers this.

use crate::drydock::repo_registry;
use serde::Serialize;
use std::time::{Duration, Instant};
use tauri_plugin_http::reqwest;

const PING_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LabHealth {
    pub experiments: Vec<HealthPing>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HealthPing {
    /// Slug used by the aggregator to pair this ping with a registry entry.
    /// `gatekeeper`, `war-table`, etc. — the same `experiment_scope` field
    /// the Drydock uses to bind PRs to logs.
    pub slug: String,
    /// The label the floor renders on hover (`The Gatekeeper`).
    pub label: String,
    /// The full URL the ping targeted, kept in the payload so the tooltip
    /// can name the surface that failed.
    pub url: String,
    /// True when the response landed with a 2xx status.
    pub healthy: bool,
    /// HTTP status code when one was received; `None` on transport failure.
    pub status_code: Option<u16>,
    /// Round-trip duration in milliseconds. `0` when the request never left.
    pub response_time_ms: u64,
    /// Human-readable failure note when `healthy == false`. Empty on success.
    pub error: String,
}

/// One endpoint to ping. Built from a `LabRepo` entry; emitted here so the
/// caller can introspect the list (the aggregator iterates it to make the
/// gadgets/infra-only repos addressable without trying to ping them).
#[derive(Debug, Clone)]
pub struct ExperimentEndpoint {
    pub slug: String,
    pub label: String,
    pub url: String,
}

/// The six experiment endpoints, derived from the canonical registry.
pub fn endpoints() -> Vec<ExperimentEndpoint> {
    repo_registry::lab_repos()
        .into_iter()
        .filter_map(|repo| {
            let scope = repo.experiment_scope?;
            if !repo.local_path.starts_with("experiments/") {
                return None;
            }
            // Map repo path → public subdomain via the codename slug.
            // `experiments/zmuuzn-auth` (scope `gatekeeper`) → `auth.zmuuzn.nl`.
            let subdomain = subdomain_from_repo_path(&repo.local_path)?;
            Some(ExperimentEndpoint {
                slug: scope,
                label: repo.label,
                url: format!("https://{subdomain}.zmuuzn.nl/up"),
            })
        })
        .collect()
}

/// Map `experiments/zmuuzn-<short>` → `<short>` for the public subdomain.
/// Returns `None` for paths that don't fit the convention.
fn subdomain_from_repo_path(path: &str) -> Option<String> {
    let name = path.rsplit('/').next()?;
    name.strip_prefix("zmuuzn-").map(|s| s.to_string())
}

/// Fire one ping per endpoint, concurrently. Every endpoint resolves into a
/// `HealthPing` — even on failure, so the floor sees one row per experiment.
pub async fn ping_all() -> LabHealth {
    let endpoints = endpoints();
    let mut set = tokio::task::JoinSet::new();
    for endpoint in endpoints {
        set.spawn(ping_one(endpoint));
    }
    let mut experiments = Vec::new();
    while let Some(joined) = set.join_next().await {
        match joined {
            Ok(ping) => experiments.push(ping),
            Err(err) => log::warn!("Holotable: ping task panicked: {err}"),
        }
    }
    // Sort by slug so the floor renders a deterministic ring order
    // regardless of which ping finished first.
    experiments.sort_by(|a, b| a.slug.cmp(&b.slug));
    LabHealth { experiments }
}

async fn ping_one(endpoint: ExperimentEndpoint) -> HealthPing {
    let client = match reqwest::Client::builder().timeout(PING_TIMEOUT).build() {
        Ok(c) => c,
        Err(err) => {
            return HealthPing {
                slug: endpoint.slug,
                label: endpoint.label,
                url: endpoint.url,
                healthy: false,
                status_code: None,
                response_time_ms: 0,
                error: format!("client build failed: {err}"),
            };
        }
    };
    let start = Instant::now();
    let result = client.get(&endpoint.url).send().await;
    let elapsed_ms = start.elapsed().as_millis() as u64;
    match result {
        Ok(response) => {
            let status = response.status();
            HealthPing {
                slug: endpoint.slug,
                label: endpoint.label,
                url: endpoint.url,
                healthy: status.is_success(),
                status_code: Some(status.as_u16()),
                response_time_ms: elapsed_ms,
                error: if status.is_success() {
                    String::new()
                } else {
                    format!("HTTP {}", status.as_u16())
                },
            }
        }
        Err(err) => {
            let error = if err.is_timeout() {
                format!("timed out after {}s", PING_TIMEOUT.as_secs())
            } else {
                err.to_string()
            };
            HealthPing {
                slug: endpoint.slug,
                label: endpoint.label,
                url: endpoint.url,
                healthy: false,
                status_code: None,
                response_time_ms: elapsed_ms,
                error,
            }
        }
    }
}

/// Map a status outcome to a high-level HealthState. Kept here so both the
/// aggregator and tests share one classifier.
pub fn classify(ping: &HealthPing) -> super::aggregator::HealthState {
    if ping.healthy {
        super::aggregator::HealthState::Green
    } else if ping.status_code.is_some() {
        // The endpoint answered but not cleanly — amber, not red. The
        // experiment is reachable but unhealthy; this is the "partial
        // failure" state the original VS Code holotable surfaced.
        super::aggregator::HealthState::Amber
    } else {
        super::aggregator::HealthState::Red
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::holotable::aggregator::HealthState;

    fn ping(healthy: bool, status: Option<u16>) -> HealthPing {
        HealthPing {
            slug: "gatekeeper".to_string(),
            label: "The Gatekeeper".to_string(),
            url: "https://auth.zmuuzn.nl/up".to_string(),
            healthy,
            status_code: status,
            response_time_ms: 42,
            error: String::new(),
        }
    }

    #[test]
    fn endpoints_lists_six_experiments() {
        let eps = endpoints();
        assert_eq!(eps.len(), 6);
        let slugs: Vec<&str> = eps.iter().map(|e| e.slug.as_str()).collect();
        assert!(slugs.contains(&"gatekeeper"));
        assert!(slugs.contains(&"war-table"));
        assert!(slugs.contains(&"crucible"));
        assert!(slugs.contains(&"parlour"));
        assert!(slugs.contains(&"smokestacks"));
        assert!(slugs.contains(&"horadrim"));
    }

    #[test]
    fn endpoints_compose_public_subdomain_from_repo_path() {
        let eps = endpoints();
        let gatekeeper = eps.iter().find(|e| e.slug == "gatekeeper").unwrap();
        assert_eq!(gatekeeper.url, "https://auth.zmuuzn.nl/up");
        let crucible = eps.iter().find(|e| e.slug == "crucible").unwrap();
        assert_eq!(crucible.url, "https://strava.zmuuzn.nl/up");
    }

    #[test]
    fn subdomain_from_repo_path_strips_prefix() {
        assert_eq!(
            subdomain_from_repo_path("experiments/zmuuzn-auth"),
            Some("auth".to_string())
        );
        assert_eq!(
            subdomain_from_repo_path("experiments/zmuuzn-horadrim"),
            Some("horadrim".to_string())
        );
    }

    #[test]
    fn subdomain_from_repo_path_returns_none_for_unconventional_paths() {
        assert_eq!(subdomain_from_repo_path("gadgets/mezzanine"), None);
        assert_eq!(subdomain_from_repo_path("."), None);
    }

    #[test]
    fn maps_200_to_green() {
        assert_eq!(classify(&ping(true, Some(200))), HealthState::Green);
    }

    #[test]
    fn maps_503_to_amber() {
        // The endpoint answered but not cleanly — amber tells the investor
        // "the door opened but something behind it is sick", which is
        // different from "the door never opened" (red).
        assert_eq!(classify(&ping(false, Some(503))), HealthState::Amber);
    }

    #[test]
    fn maps_timeout_to_red() {
        assert_eq!(classify(&ping(false, None)), HealthState::Red);
    }
}
