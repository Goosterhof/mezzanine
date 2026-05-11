// Target — what the lab floor looks like from the Mezzanine.
//
// Four kinds of work surfaces stretch below the balcony: the laboratory's
// experiments (six), the calibrated gadgets (five — including the Mezzanine
// itself, so the investor can dispatch a scientist to work on the gadget
// they're currently using), the shared packages (one for now), and the lab
// root. A Target resolves to a CWD; the rest is frontend concern.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Target {
    Experiment { codename: ExperimentCodename },
    Gadget { codename: GadgetCodename },
    Package { codename: PackageCodename },
    LabRoot,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExperimentCodename {
    Gatekeeper,
    WarTable,
    Crucible,
    Parlour,
    Smokestacks,
    Horadrim,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum GadgetCodename {
    Observer,
    Holotable,
    Grind,
    HoradricCube,
    /// The Mezzanine itself. Dispatching a scientist here puts them in
    /// the Mezzanine's own gadget folder — useful when the investor wants
    /// a scientist to work on the gadget they're commanding from.
    Mezzanine,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PackageCodename {
    LabNav,
}

impl Target {
    /// Helper for tests + matching: Target::LabRoot is the equivalent unit
    /// variant; the others are struct-style with a `codename` field.
    pub fn experiment(codename: ExperimentCodename) -> Self {
        Self::Experiment { codename }
    }

    pub fn gadget(codename: GadgetCodename) -> Self {
        Self::Gadget { codename }
    }

    pub fn package(codename: PackageCodename) -> Self {
        Self::Package { codename }
    }

    /// Lab-root-relative path this target lives at.
    pub fn relative_path(&self) -> &'static str {
        match self {
            Self::Experiment { codename } => codename.relative_path(),
            Self::Gadget { codename } => codename.relative_path(),
            Self::Package { codename } => codename.relative_path(),
            Self::LabRoot => "",
        }
    }

    /// Absolute working directory for the scientist's pty. POSIX
    /// forward-slash join — the substrate passes the result through
    /// `bash -c "cd ..."` where backslashes would parse as escapes
    /// (Phase 1C's substrate path-separator regression; the same hygiene
    /// applies here).
    pub fn cwd(&self, lab_root: &Path) -> PathBuf {
        let mut s = lab_root.to_string_lossy().replace('\\', "/").to_string();
        while s.ends_with('/') {
            s.pop();
        }
        let rel = self.relative_path();
        if !rel.is_empty() {
            s.push('/');
            s.push_str(rel);
        }
        PathBuf::from(s)
    }

    /// Display label rendered by the frontend's target picker + roster row.
    pub fn label(&self) -> &'static str {
        match self {
            Self::Experiment { codename } => codename.label(),
            Self::Gadget { codename } => codename.label(),
            Self::Package { codename } => codename.label(),
            Self::LabRoot => "The Lab",
        }
    }
}

impl ExperimentCodename {
    pub fn relative_path(self) -> &'static str {
        match self {
            Self::Gatekeeper => "experiments/zmuuzn-auth",
            Self::WarTable => "experiments/zmuuzn-helldivers",
            Self::Crucible => "experiments/zmuuzn-strava",
            Self::Parlour => "experiments/zmuuzn-parlour",
            Self::Smokestacks => "experiments/zmuuzn-smokestacks",
            Self::Horadrim => "experiments/zmuuzn-horadrim",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Gatekeeper => "The Gatekeeper",
            Self::WarTable => "The War Table",
            Self::Crucible => "The Crucible",
            Self::Parlour => "The Parlour",
            Self::Smokestacks => "The Smokestacks",
            Self::Horadrim => "The Horadrim",
        }
    }
}

impl GadgetCodename {
    pub fn relative_path(self) -> &'static str {
        match self {
            Self::Observer => "gadgets/pixel-lab",
            Self::Holotable => "gadgets/lab-monitor-3d",
            Self::Grind => "gadgets/idle-lab",
            Self::HoradricCube => "gadgets/horadric-cube",
            // The gadget folder is renamed in the parent repo as a separate
            // step; the path stored here is the post-rename target.
            Self::Mezzanine => "gadgets/mezzanine",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Observer => "The Observer",
            Self::Holotable => "The Holotable",
            Self::Grind => "The Grind",
            Self::HoradricCube => "The Horadric Cube",
            Self::Mezzanine => "The Mezzanine",
        }
    }
}

impl PackageCodename {
    pub fn relative_path(self) -> &'static str {
        match self {
            Self::LabNav => "packages/zmuuzn-packages",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::LabNav => "lab-nav",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn experiment_cwd_joins_with_relative_path() {
        let t = Target::experiment(ExperimentCodename::Crucible);
        assert_eq!(
            t.cwd(Path::new("/home/g/code/zmuuzn")).to_str().unwrap(),
            "/home/g/code/zmuuzn/experiments/zmuuzn-strava",
        );
    }

    #[test]
    fn gadget_cwd_resolves_to_post_rename_mezzanine_path() {
        let t = Target::gadget(GadgetCodename::Mezzanine);
        assert_eq!(
            t.cwd(Path::new("/home/g/code/zmuuzn")).to_str().unwrap(),
            "/home/g/code/zmuuzn/gadgets/mezzanine",
        );
    }

    #[test]
    fn package_cwd_resolves_to_packages_path() {
        let t = Target::package(PackageCodename::LabNav);
        assert_eq!(
            t.cwd(Path::new("/home/g/code/zmuuzn")).to_str().unwrap(),
            "/home/g/code/zmuuzn/packages/zmuuzn-packages",
        );
    }

    #[test]
    fn lab_root_cwd_returns_lab_root_unchanged() {
        let t = Target::LabRoot;
        assert_eq!(
            t.cwd(Path::new("/home/g/code/zmuuzn")).to_str().unwrap(),
            "/home/g/code/zmuuzn",
        );
    }

    #[test]
    fn cwd_normalizes_windows_backslashes_to_posix() {
        let t = Target::experiment(ExperimentCodename::Horadrim);
        assert_eq!(
            t.cwd(Path::new("C:\\Users\\foo\\code\\zmuuzn"))
                .to_str()
                .unwrap(),
            "C:/Users/foo/code/zmuuzn/experiments/zmuuzn-horadrim",
        );
    }

    #[test]
    fn cwd_trims_trailing_slash_on_lab_root() {
        let t = Target::experiment(ExperimentCodename::Gatekeeper);
        assert_eq!(
            t.cwd(Path::new("/home/g/code/zmuuzn/")).to_str().unwrap(),
            "/home/g/code/zmuuzn/experiments/zmuuzn-auth",
        );
    }

    #[test]
    fn target_round_trips_through_serde_for_struct_variant() {
        let original = Target::experiment(ExperimentCodename::Crucible);
        let json = serde_json::to_string(&original).unwrap();
        let back: Target = serde_json::from_str(&json).unwrap();
        assert_eq!(original, back);
        assert!(json.contains(r#""kind":"experiment""#));
        assert!(json.contains(r#""codename":"crucible""#));
    }

    #[test]
    fn lab_root_serializes_as_kind_only() {
        let json = serde_json::to_string(&Target::LabRoot).unwrap();
        assert_eq!(json, r#"{"kind":"lab-root"}"#);
    }

    #[test]
    fn lab_root_round_trips_through_serde() {
        let json = serde_json::to_string(&Target::LabRoot).unwrap();
        let back: Target = serde_json::from_str(&json).unwrap();
        assert_eq!(back, Target::LabRoot);
    }

    #[test]
    fn label_renders_codename_when_present() {
        assert_eq!(
            Target::experiment(ExperimentCodename::Horadrim).label(),
            "The Horadrim",
        );
        assert_eq!(
            Target::gadget(GadgetCodename::Mezzanine).label(),
            "The Mezzanine",
        );
        assert_eq!(Target::LabRoot.label(), "The Lab");
    }
}
