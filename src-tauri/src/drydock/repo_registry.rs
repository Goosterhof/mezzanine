// The laboratory's GitHub registry — every repo the Drydock enumerates
// open PRs across. Six experiments + the shared nav package + five
// gadgets. The investor's other businesses (Brick & Mortar, Stud & Sort)
// live under a different GitHub account and persona; they are explicitly
// excluded.
//
// The registry is hardcoded because (a) the list changes once a year at
// most, and (b) loading it from disk would require parsing `.gitmodules`
// across both the parent repo and `gadgets/` subdirectories — more code
// to maintain than just listing twelve lines.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LabRepo {
    /// The label rendered in the Drydock UI (the laboratory's codename).
    pub label: String,
    /// `owner/name` form — what `gh --repo` expects.
    pub repo_full_name: String,
    /// Path relative to the laboratory root. Used to translate a PR file
    /// path (which is *repo-relative*) into a *lab-relative* path the
    /// other parsers can match against.
    pub local_path: String,
    /// The experiment scope keyword that pairs the PR's files with an
    /// active experiment log. `None` for repos that aren't tied to a
    /// single experiment (the shared nav package, gadgets).
    pub experiment_scope: Option<String>,
}

/// Every laboratory repo the Drydock surveys. Order matters: the panel
/// renders the list in this order, so experiments come first, then the
/// shared package, then gadgets.
pub fn lab_repos() -> Vec<LabRepo> {
    vec![
        LabRepo {
            label: "The Gatekeeper".to_string(),
            repo_full_name: "Goosterhof/zmuuzn-auth".to_string(),
            local_path: "experiments/zmuuzn-auth".to_string(),
            experiment_scope: Some("gatekeeper".to_string()),
        },
        LabRepo {
            label: "The War Table".to_string(),
            repo_full_name: "Goosterhof/zmuuzn-helldivers".to_string(),
            local_path: "experiments/zmuuzn-helldivers".to_string(),
            experiment_scope: Some("war-table".to_string()),
        },
        LabRepo {
            label: "The Crucible".to_string(),
            repo_full_name: "Goosterhof/zmuuzn-strava".to_string(),
            local_path: "experiments/zmuuzn-strava".to_string(),
            experiment_scope: Some("crucible".to_string()),
        },
        LabRepo {
            label: "The Parlour".to_string(),
            repo_full_name: "Goosterhof/zmuuzn-parlour".to_string(),
            local_path: "experiments/zmuuzn-parlour".to_string(),
            experiment_scope: Some("parlour".to_string()),
        },
        LabRepo {
            label: "The Smokestacks".to_string(),
            repo_full_name: "Goosterhof/zmuuzn-smokestacks".to_string(),
            local_path: "experiments/zmuuzn-smokestacks".to_string(),
            experiment_scope: Some("smokestacks".to_string()),
        },
        LabRepo {
            label: "The Horadrim".to_string(),
            repo_full_name: "Goosterhof/zmuuzn-horadrim".to_string(),
            local_path: "experiments/zmuuzn-horadrim".to_string(),
            experiment_scope: Some("horadrim".to_string()),
        },
        LabRepo {
            label: "The Shared Nervous System".to_string(),
            repo_full_name: "Goosterhof/zmuuzn-packages".to_string(),
            local_path: "packages/zmuuzn-packages".to_string(),
            experiment_scope: Some("lab-nav".to_string()),
        },
        LabRepo {
            label: "The Observer".to_string(),
            repo_full_name: "Goosterhof/pixel-lab".to_string(),
            local_path: "gadgets/pixel-lab".to_string(),
            experiment_scope: Some("observer".to_string()),
        },
        LabRepo {
            label: "The Holotable".to_string(),
            repo_full_name: "Goosterhof/lab-monitor-3d".to_string(),
            local_path: "gadgets/lab-monitor-3d".to_string(),
            experiment_scope: Some("holotable".to_string()),
        },
        LabRepo {
            label: "The Grind".to_string(),
            repo_full_name: "Goosterhof/idle-lab".to_string(),
            local_path: "gadgets/idle-lab".to_string(),
            experiment_scope: Some("grind".to_string()),
        },
        LabRepo {
            label: "The Horadric Cube".to_string(),
            repo_full_name: "Goosterhof/horadric-cube".to_string(),
            local_path: "gadgets/horadric-cube".to_string(),
            experiment_scope: Some("cube".to_string()),
        },
        LabRepo {
            label: "The Workbench".to_string(),
            repo_full_name: "Goosterhof/workbench".to_string(),
            local_path: "gadgets/workbench".to_string(),
            experiment_scope: Some("workbench".to_string()),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_lists_twelve_repos() {
        assert_eq!(lab_repos().len(), 12);
    }

    #[test]
    fn registry_orders_experiments_then_package_then_gadgets() {
        let repos = lab_repos();
        // First six are experiments.
        for r in repos.iter().take(6) {
            assert!(r.local_path.starts_with("experiments/"), "{r:?}");
        }
        // Position 7 is the shared package.
        assert_eq!(repos[6].local_path, "packages/zmuuzn-packages");
        // Last five are gadgets.
        for r in repos.iter().skip(7) {
            assert!(r.local_path.starts_with("gadgets/"), "{r:?}");
        }
    }

    #[test]
    fn every_repo_has_a_scope_keyword() {
        for r in lab_repos() {
            let scope = r.experiment_scope.expect("scope should be set");
            assert!(!scope.is_empty(), "scope empty for {}", r.label);
        }
    }
}
