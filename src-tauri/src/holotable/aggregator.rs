// The Holotable aggregator — git + health → DashboardState.
//
// Near-1:1 port of the original `stateAggregator.ts` in
// `gadgets/lab-monitor-3d/src/`. The shape changes from `StructureState[]`
// to typed sibling arrays (`experiments` / `gadgets` / `database` /
// `pipeline`) because Rust serde reads better when the type names match
// the rendered geography. The scene module (`src/holotable/scene.js`) reads
// the legacy shape internally, so the Vue composable flattens this into
// the structure array the lifted WebGL engine expects — that adapter lives
// on the frontend side in `useHolotable.ts`, NOT here. The Rust shape is
// the typed canonical; the JS adapter is the bridge to the engine the
// original gadget already had.
//
// RD-3 constraint: gadgets are named by their on-disk directories at Arc 1
// ship time. `lab-monitor-3d` and `pixel-lab` and `idle-lab` still exist
// as submodules — tombstoning waits for arc #00053.

use serde::Serialize;

use super::git_state::{LabGitState, SubmoduleState};
use super::health_check::{self, LabHealth};

/// HealthState — the four ring colors the scene supports. The original VS
/// Code holotable carried these as string literals; here we make them an
/// enum so a typo'd `"gren"` is a compile error, not a silently dim ring.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum HealthState {
    Green,
    Amber,
    Red,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Tower,
    Experiment,
    Gadget,
    Database,
    Pipeline,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentNode {
    pub id: String,
    /// The codename the floor renders on hover (`The Gatekeeper`).
    pub label: String,
    /// The slug used by the scene for lookups (`gatekeeper`, `war-table`).
    pub slug: String,
    pub kind: NodeKind,
    pub health: HealthState,
    pub url: String,
    /// Submodule git status when the experiment lives as a submodule.
    /// `clean` / `dirty` / `uninitialized` / `unknown` — kept as a string
    /// because the scene's tooltip prints it verbatim.
    pub git_status: String,
    pub detail: String,
    pub response_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GadgetNode {
    pub id: String,
    /// On-disk directory name (per RD-3: `lab-monitor-3d`, `pixel-lab`,
    /// `idle-lab`, `horadric-cube`, `mezzanine` at Arc 1 ship time).
    pub label: String,
    pub kind: NodeKind,
    pub health: HealthState,
    pub git_status: String,
    pub detail: String,
    /// `true` for the gadget that is the Mezzanine itself — the scene
    /// labels this workbench as "you are here".
    pub is_self: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InfraNode {
    pub id: String,
    pub label: String,
    pub kind: NodeKind,
    pub health: HealthState,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TowerNode {
    pub id: String,
    pub label: String,
    pub kind: NodeKind,
    pub health: HealthState,
    pub branch: String,
    pub dirty: bool,
    pub modified_count: u32,
    pub staged_count: u32,
    pub untracked_count: u32,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DashboardState {
    pub tower: TowerNode,
    pub experiments: Vec<ExperimentNode>,
    pub gadgets: Vec<GadgetNode>,
    pub database: InfraNode,
    pub pipeline: InfraNode,
    /// Repeated at the root for the scene's header read.
    pub branch: String,
    /// Repeated at the root for tooltip / header.
    pub dirty: bool,
    /// `YYYY-MM-DDTHH:MM:SS` UTC stamp from when the aggregator built this state.
    pub timestamp: String,
}

/// The five gadgets that exist on disk at Arc 1 ship time, ordered as the
/// scene's outer ring will render them. Order matters: the scene sorts
/// structures by index for the summoning animation stagger.
pub const ARC1_GADGETS: &[&str] = &[
    "lab-monitor-3d",
    "pixel-lab",
    "idle-lab",
    "horadric-cube",
    "mezzanine",
];

/// Build the full dashboard state from the two substrate inputs.
pub fn build(git: LabGitState, health: LabHealth) -> DashboardState {
    let tower = build_tower(&git);
    let experiments = build_experiments(&git, &health);
    let gadgets = build_gadgets(&git);
    let database = build_database();
    let pipeline = build_pipeline();
    DashboardState {
        tower,
        experiments,
        gadgets,
        database,
        pipeline,
        branch: git.branch.clone(),
        dirty: git.dirty,
        timestamp: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
    }
}

fn build_tower(git: &LabGitState) -> TowerNode {
    let health = if git.branch.is_empty() {
        HealthState::Unknown
    } else if git.dirty {
        HealthState::Amber
    } else {
        HealthState::Green
    };
    let detail = if git.branch.is_empty() {
        "No git data — the laboratory's memory is unreachable".to_string()
    } else if git.dirty {
        format!(
            "Uncommitted work on {} — the laboratory has open experiments",
            git.branch
        )
    } else {
        format!("Holding steady on {}", git.branch)
    };
    TowerNode {
        id: "tower".to_string(),
        label: "Zmuuzn".to_string(),
        kind: NodeKind::Tower,
        health,
        branch: git.branch.clone(),
        dirty: git.dirty,
        modified_count: git.modified_count,
        staged_count: git.staged_count,
        untracked_count: git.untracked_count,
        detail,
    }
}

fn build_experiments(git: &LabGitState, health: &LabHealth) -> Vec<ExperimentNode> {
    health
        .experiments
        .iter()
        .map(|ping| {
            let sub = find_experiment_submodule(&git.submodules, &ping.slug);
            let mut state = health_check::classify(ping);
            // A dirty submodule lifts a clean green to amber; the original
            // aggregator did this so the floor surfaced uncommitted work
            // even when the deployed surface was healthy.
            if let Some(sub) = sub {
                if !sub.initialized {
                    state = HealthState::Red;
                } else if sub.dirty && state == HealthState::Green {
                    state = HealthState::Amber;
                }
            }
            let git_status = match sub {
                None => "unknown".to_string(),
                Some(s) if !s.initialized => "uninitialized".to_string(),
                Some(s) if s.dirty => "dirty".to_string(),
                Some(_) => "clean".to_string(),
            };
            let detail = describe_experiment(ping, sub);
            ExperimentNode {
                id: format!("experiment-{}", ping.slug),
                label: ping.label.clone(),
                slug: ping.slug.clone(),
                kind: NodeKind::Experiment,
                health: state,
                url: ping.url.clone(),
                git_status,
                detail,
                response_time_ms: ping.response_time_ms,
            }
        })
        .collect()
}

fn find_experiment_submodule<'a>(subs: &'a [SubmoduleState], slug: &str) -> Option<&'a SubmoduleState> {
    // The slug → path mapping is built from the codename. The Crucible's
    // submodule lives at `experiments/zmuuzn-strava`, not at
    // `experiments/zmuuzn-crucible` — so we can't compose the path from
    // the slug alone. Instead we match by repo registry: read the path
    // from `repo_registry::lab_repos()` and look it up here.
    let target_path = crate::drydock::repo_registry::lab_repos()
        .into_iter()
        .find(|r| r.experiment_scope.as_deref() == Some(slug))
        .map(|r| r.local_path)?;
    subs.iter().find(|s| s.path == target_path)
}

fn describe_experiment(ping: &super::health_check::HealthPing, sub: Option<&SubmoduleState>) -> String {
    if let Some(s) = sub {
        if !s.initialized {
            return "Pod not initialized — still in cryosleep".to_string();
        }
    }
    if ping.healthy {
        format!(
            "Breathing easy — responded in {}ms",
            ping.response_time_ms
        )
    } else if let Some(code) = ping.status_code {
        format!("Door opened, room is sick — HTTP {code}")
    } else if !ping.error.is_empty() {
        format!("In distress — {}", ping.error)
    } else {
        "Status unclear — no telemetry received".to_string()
    }
}

fn build_gadgets(git: &LabGitState) -> Vec<GadgetNode> {
    ARC1_GADGETS
        .iter()
        .map(|name| {
            let path = format!("gadgets/{name}");
            let sub = git.submodules.iter().find(|s| s.path == path);
            let (health, git_status) = match sub {
                None => (HealthState::Unknown, "untracked".to_string()),
                Some(s) if !s.initialized => (HealthState::Red, "uninitialized".to_string()),
                Some(s) if s.dirty => (HealthState::Amber, "dirty".to_string()),
                Some(_) => (HealthState::Green, "clean".to_string()),
            };
            let is_self = *name == "mezzanine";
            let detail = if is_self {
                "You are here — the balcony itself".to_string()
            } else if *name == "lab-monitor-3d" {
                "The Holotable's origin — being absorbed across arcs #00051–#00053".to_string()
            } else {
                "Instrument calibrated and standing by".to_string()
            };
            GadgetNode {
                id: format!("gadget-{name}"),
                label: (*name).to_string(),
                kind: NodeKind::Gadget,
                health,
                git_status,
                detail,
                is_self,
            }
        })
        .collect()
}

fn build_database() -> InfraNode {
    InfraNode {
        id: "database".to_string(),
        label: "PostgreSQL".to_string(),
        kind: NodeKind::Database,
        health: HealthState::Green,
        detail: "The shared bloodstream — all experiments draw from this crystal".to_string(),
    }
}

fn build_pipeline() -> InfraNode {
    InfraNode {
        id: "pipeline".to_string(),
        label: "Railway".to_string(),
        kind: NodeKind::Pipeline,
        health: HealthState::Green,
        detail: "Launch platform ready — europe-west4 sector".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::holotable::health_check::HealthPing;

    fn ok_ping(slug: &str, label: &str) -> HealthPing {
        HealthPing {
            slug: slug.to_string(),
            label: label.to_string(),
            url: format!("https://{slug}.zmuuzn.nl/up"),
            healthy: true,
            status_code: Some(200),
            response_time_ms: 42,
            error: String::new(),
        }
    }

    fn down_ping(slug: &str, label: &str) -> HealthPing {
        HealthPing {
            slug: slug.to_string(),
            label: label.to_string(),
            url: format!("https://{slug}.zmuuzn.nl/up"),
            healthy: false,
            status_code: None,
            response_time_ms: 5_000,
            error: "timed out after 5s".to_string(),
        }
    }

    #[test]
    fn arc1_gadgets_lists_five_on_disk_names_per_rd3() {
        // RD-3 lock: gadgets are named for the directories that exist on
        // disk when Arc 1 ships. Tombstoning waits for Arc #00053.
        assert_eq!(ARC1_GADGETS.len(), 5);
        assert!(ARC1_GADGETS.contains(&"lab-monitor-3d"));
        assert!(ARC1_GADGETS.contains(&"pixel-lab"));
        assert!(ARC1_GADGETS.contains(&"idle-lab"));
        assert!(ARC1_GADGETS.contains(&"horadric-cube"));
        assert!(ARC1_GADGETS.contains(&"mezzanine"));
    }

    #[test]
    fn builds_dashboard_state_from_combined_inputs() {
        let git = LabGitState {
            branch: "main".to_string(),
            dirty: false,
            untracked_count: 0,
            modified_count: 0,
            staged_count: 0,
            submodules: vec![SubmoduleState {
                name: "zmuuzn-auth".to_string(),
                path: "experiments/zmuuzn-auth".to_string(),
                dirty: false,
                initialized: true,
            }],
        };
        let health = LabHealth {
            experiments: vec![ok_ping("gatekeeper", "The Gatekeeper")],
        };
        let state = build(git, health);
        assert_eq!(state.tower.label, "Zmuuzn");
        assert_eq!(state.tower.health, HealthState::Green);
        assert_eq!(state.experiments.len(), 1);
        assert_eq!(state.experiments[0].slug, "gatekeeper");
        assert_eq!(state.experiments[0].health, HealthState::Green);
        assert_eq!(state.experiments[0].git_status, "clean");
        assert_eq!(state.gadgets.len(), 5);
        assert_eq!(state.database.label, "PostgreSQL");
        assert_eq!(state.pipeline.label, "Railway");
    }

    #[test]
    fn dirty_tower_lifts_to_amber() {
        let git = LabGitState {
            branch: "feat/holotable-absorbed".to_string(),
            dirty: true,
            untracked_count: 2,
            modified_count: 4,
            staged_count: 1,
            submodules: vec![],
        };
        let state = build(git, LabHealth { experiments: vec![] });
        assert_eq!(state.tower.health, HealthState::Amber);
        assert!(state.tower.detail.contains("open experiments"));
    }

    #[test]
    fn unknown_branch_paints_tower_unknown() {
        let git = LabGitState::default();
        let state = build(git, LabHealth { experiments: vec![] });
        assert_eq!(state.tower.health, HealthState::Unknown);
    }

    #[test]
    fn dirty_submodule_lifts_green_experiment_to_amber() {
        let git = LabGitState {
            branch: "main".to_string(),
            submodules: vec![SubmoduleState {
                name: "zmuuzn-auth".to_string(),
                path: "experiments/zmuuzn-auth".to_string(),
                dirty: true,
                initialized: true,
            }],
            ..LabGitState::default()
        };
        let state = build(
            git,
            LabHealth {
                experiments: vec![ok_ping("gatekeeper", "The Gatekeeper")],
            },
        );
        assert_eq!(state.experiments[0].health, HealthState::Amber);
        assert_eq!(state.experiments[0].git_status, "dirty");
    }

    #[test]
    fn uninitialized_submodule_paints_experiment_red() {
        let git = LabGitState {
            branch: "main".to_string(),
            submodules: vec![SubmoduleState {
                name: "zmuuzn-auth".to_string(),
                path: "experiments/zmuuzn-auth".to_string(),
                dirty: false,
                initialized: false,
            }],
            ..LabGitState::default()
        };
        let state = build(
            git,
            LabHealth {
                experiments: vec![ok_ping("gatekeeper", "The Gatekeeper")],
            },
        );
        assert_eq!(state.experiments[0].health, HealthState::Red);
        assert_eq!(state.experiments[0].git_status, "uninitialized");
        assert!(state.experiments[0].detail.contains("cryosleep"));
    }

    #[test]
    fn down_experiment_paints_red() {
        let git = LabGitState::default();
        let state = build(
            git,
            LabHealth {
                experiments: vec![down_ping("crucible", "The Crucible")],
            },
        );
        assert_eq!(state.experiments[0].health, HealthState::Red);
        assert!(state.experiments[0].detail.contains("distress"));
    }

    #[test]
    fn mezzanine_gadget_is_marked_as_self() {
        let state = build(LabGitState::default(), LabHealth { experiments: vec![] });
        let mz = state.gadgets.iter().find(|g| g.label == "mezzanine").unwrap();
        assert!(mz.is_self);
        assert!(mz.detail.contains("You are here"));
    }

    #[test]
    fn lab_monitor_3d_gadget_voices_absorption() {
        let state = build(LabGitState::default(), LabHealth { experiments: vec![] });
        let h = state.gadgets.iter().find(|g| g.label == "lab-monitor-3d").unwrap();
        assert!(!h.is_self);
        assert!(h.detail.to_lowercase().contains("absorbed"));
    }
}
