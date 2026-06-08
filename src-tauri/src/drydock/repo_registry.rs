// The laboratory's GitHub registry — every repo the Drydock enumerates
// open PRs across. The list is anchored to what `.gitmodules` actually
// declares plus the parent umbrella:
//
//   * Six experiments — each its own `Goosterhof/zmuuzn-<name>` repo.
//   * The shared nav package — `Goosterhof/zmuuzn-packages`.
//   * Two stand-alone-repo gadgets — `horadric-cube` and `mezzanine`.
//   * The Laboratory umbrella — `Goosterhof/zmuuzn`, the parent repo
//     that hosts `gadgets/pixel-lab`, `gadgets/lab-monitor-3d`, and
//     `gadgets/idle-lab` as in-tree folders (not submodules). PRs that
//     touch those gadgets land here.
//
// The three in-tree gadgets do NOT have their own GitHub repos under
// `Goosterhof/<slug>` — earlier registry entries that pointed at
// `Goosterhof/pixel-lab` and friends produced "Could not resolve to a
// Repository" 404s on every Drydock refresh. Surface them through the
// umbrella entry instead.
//
// The investor's other businesses (Brick & Mortar, Stud & Sort) live
// under a different GitHub account and persona; they are explicitly
// excluded.
//
// The registry is hardcoded because (a) the list changes once a year at
// most, and (b) loading it from disk would require parsing `.gitmodules`
// across both the parent repo and `gadgets/` subdirectories — more code
// to maintain than just listing the canonical entries here.

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
            label: "The Horadric Cube".to_string(),
            repo_full_name: "Goosterhof/horadric-cube".to_string(),
            local_path: "gadgets/horadric-cube".to_string(),
            experiment_scope: Some("cube".to_string()),
        },
        LabRepo {
            label: "The Mezzanine".to_string(),
            repo_full_name: "Goosterhof/mezzanine".to_string(),
            local_path: "gadgets/mezzanine".to_string(),
            experiment_scope: Some("mezzanine".to_string()),
        },
        LabRepo {
            label: "The Laboratory".to_string(),
            repo_full_name: "Goosterhof/zmuuzn".to_string(),
            local_path: ".".to_string(),
            experiment_scope: Some("lab".to_string()),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_lists_ten_repos() {
        // Six experiments + shared package + two stand-alone-repo gadgets
        // + the laboratory umbrella. The three in-tree gadgets (pixel-lab,
        // lab-monitor-3d, idle-lab) are NOT separate repos — their PRs
        // surface under the umbrella.
        assert_eq!(lab_repos().len(), 10);
    }

    #[test]
    fn registry_orders_experiments_then_package_then_standalone_gadgets_then_umbrella() {
        let repos = lab_repos();
        // First six are experiments.
        for r in repos.iter().take(6) {
            assert!(r.local_path.starts_with("experiments/"), "{r:?}");
        }
        // Position 7 is the shared package.
        assert_eq!(repos[6].local_path, "packages/zmuuzn-packages");
        // Positions 8 and 9 are the two stand-alone-repo gadgets.
        assert_eq!(repos[7].local_path, "gadgets/horadric-cube");
        assert_eq!(repos[8].local_path, "gadgets/mezzanine");
        // Position 10 is the laboratory umbrella.
        assert_eq!(repos[9].local_path, ".");
        assert_eq!(repos[9].repo_full_name, "Goosterhof/zmuuzn");
    }

    #[test]
    fn registry_excludes_in_tree_gadgets() {
        // pixel-lab, lab-monitor-3d, and idle-lab live as folders inside
        // the parent repo, not as standalone GitHub repos. Earlier registry
        // entries that pointed at Goosterhof/<gadget> 404'd on every Drydock
        // refresh; the umbrella entry surfaces their PRs instead.
        let slugs: Vec<String> = lab_repos().into_iter().map(|r| r.repo_full_name).collect();
        for ghost in [
            "Goosterhof/pixel-lab",
            "Goosterhof/lab-monitor-3d",
            "Goosterhof/idle-lab",
        ] {
            assert!(
                !slugs.iter().any(|s| s == ghost),
                "registry must not enumerate non-existent repo {ghost}"
            );
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
