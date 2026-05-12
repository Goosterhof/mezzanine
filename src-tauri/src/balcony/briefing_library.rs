// The Briefing Library — a Rust compile-time catalogue of mission templates.
//
// The investor opens the Dispatch sheet, picks a target, and either types
// a free-form brief or grabs a template card here. The five seed
// templates reframe the bench-era panels as missions you'd hand to a
// scientist — instead of opening a Mission Control panel and reading
// findings, you dispatch a scientist to *go run* Mission Control's sweep.
//
// The library is intentionally hard-coded for Phase 2B. Once the investor
// authors their first custom template, the YAML/Markdown source path
// becomes worth building (per the Phase 2B Reframe Decisions row).
//
// Each template carries:
//   * id            — stable identifier for selection state
//   * label         — title rendered on the dispatch card
//   * description   — one-line subtitle on the card
//   * target_shape  — whether the template runs against the lab as a
//                     whole or requires the investor to pick an
//                     experiment first
//   * opening_prompt — text that prefills the brief textarea; the
//                     investor can edit before dispatch
//
// The opening prompts are deliberately verbose. The bench era found that
// a scientist who gets a vague brief ("triage wounds") starts by asking
// for clarification; a scientist who gets a structured brief produces
// useful output on the first turn.

use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BriefingTargetShape {
    /// Template runs regardless of which target is selected — the
    /// investor still picks a target, but the brief itself is target-
    /// agnostic.
    LabWide,
    /// Template requires an Experiment target — selecting it nudges the
    /// target picker toward the Experiments group.
    PerExperiment,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BriefingTemplate {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub target_shape: BriefingTargetShape,
    pub opening_prompt: &'static str,
}

/// The seed library shipped in Phase 2B. Order matters — the cards
/// render in this order in the Dispatch sheet.
pub const SEED_TEMPLATES: &[BriefingTemplate] = &[
    BriefingTemplate {
        id: "mission-control-sweep",
        label: "Mission Control sweep",
        description: "Read the war-room dispatch, pending signals, and wounds-at-threshold; report a triage plan.",
        target_shape: BriefingTargetShape::LabWide,
        opening_prompt: "\
Run a Mission Control sweep across the laboratory. Read these artefacts and \
summarise the state inline:

1. `documents/war-room-dispatch.md` — list every active finding and what it \
   blocks.
2. `documents/laboratory-pulse.md` § Pending Signals — surface any unprocessed \
   minion signals.
3. `.claude/memory/wounds/` — flag any wound at or above its escalation \
   threshold.

For each item, recommend a single next move (resolve, dispatch a minion, \
shelve). Keep the triage report tight — five lines per finding maximum.",
    },
    BriefingTemplate {
        id: "drydock-pr-review",
        label: "Drydock PR review",
        description: "Sweep open PRs across lab repos; recommend approve / changes / hold for each.",
        target_shape: BriefingTargetShape::LabWide,
        opening_prompt: "\
Open the Drydock and review the laboratory's outstanding pull requests.

1. Enumerate every open PR across the lab's repos (`gh pr list --json`).
2. For each PR, read the diff, find any minion-touched commits in the history, \
   scan related chaos-detonation reports, and locate an active experiment log \
   if one applies.
3. Produce one of three verdicts per PR: approve, request changes, hold for \
   reviewer.

Keep the per-PR write-up under ten lines. Skip drafts and PRs already \
approved.",
    },
    BriefingTemplate {
        id: "experiment-dossier-read",
        label: "Experiment dossier read",
        description: "Read the selected experiment's full dossier and report back inline.",
        target_shape: BriefingTargetShape::PerExperiment,
        opening_prompt: "\
Read the selected experiment's dossier in full and report inline what you \
find. Cover:

* The experiment's `CLAUDE.md` lab journal — what it is, voice, current \
  Phase Roadmap row.
* The active experiment log under `documents/experiment-logs/` — what's \
  IN PROGRESS or PLANNING.
* Open chaos reports under the experiment's `documents/chaos-reports/` — \
  scores, themes, anything still cooking.
* The matching idea ledger under `documents/idea-ledgers/` — CANDIDATE \
  and SHELVED items.
* The last 20 commits in this submodule's history.

Close with a three-line state summary the investor can read while standing \
on the balcony.",
    },
    BriefingTemplate {
        id: "wounds-triage",
        label: "Wounds-at-threshold triage",
        description: "Read every wound file at or above threshold; recommend a Surgeon dispatch or shelving.",
        target_shape: BriefingTargetShape::LabWide,
        opening_prompt: "\
Triage the laboratory's wound queue.

1. List every file under `.claude/memory/wounds/` and read each one's `count` \
   field.
2. For wounds at or above their declared threshold, summarise the failure \
   cascade and recommend whether to dispatch The Surgeon, retire the wound \
   as healed, or escalate to a Protocol Mutation Proposal.
3. Skip wounds with `count: 0` or marked HEALED.

Output one line per active wound. Do not edit any wound file — diagnosis \
only.",
    },
    BriefingTemplate {
        id: "compose-war-room-dispatch",
        label: "Compose war-room dispatch",
        description: "Draft a new finding for the war-room dispatch from the current session's evidence.",
        target_shape: BriefingTargetShape::LabWide,
        opening_prompt: "\
Compose a new finding for the war-room dispatch.

1. Read `documents/war-room-dispatch.md` so the new finding fits its tone, \
   numbering, and structure.
2. From the current session's evidence, draft one new finding:
   * a short imperative title,
   * one paragraph stating the evidence and the recommendation,
   * a labelled checklist of follow-ups if any apply.
3. Output the finding as a markdown block ready to paste; do not write the \
   file yourself unless explicitly asked.",
    },
];

pub fn list_templates() -> &'static [BriefingTemplate] {
    SEED_TEMPLATES
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn library_ships_five_seed_templates() {
        assert_eq!(SEED_TEMPLATES.len(), 5);
    }

    #[test]
    fn template_ids_are_unique_and_kebab_case() {
        let mut ids = HashSet::new();
        for tpl in SEED_TEMPLATES {
            assert!(ids.insert(tpl.id), "duplicate template id: {}", tpl.id);
            assert!(
                tpl.id
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'),
                "template id is not kebab-case: {}",
                tpl.id,
            );
        }
    }

    #[test]
    fn dossier_template_is_marked_per_experiment() {
        let dossier = SEED_TEMPLATES
            .iter()
            .find(|t| t.id == "experiment-dossier-read")
            .expect("dossier template present");
        assert_eq!(dossier.target_shape, BriefingTargetShape::PerExperiment);
    }

    #[test]
    fn non_dossier_templates_are_lab_wide() {
        for tpl in SEED_TEMPLATES {
            if tpl.id == "experiment-dossier-read" {
                continue;
            }
            assert_eq!(
                tpl.target_shape,
                BriefingTargetShape::LabWide,
                "template should be lab-wide: {}",
                tpl.id,
            );
        }
    }

    #[test]
    fn opening_prompts_are_non_trivial() {
        for tpl in SEED_TEMPLATES {
            assert!(
                tpl.opening_prompt.len() > 80,
                "opening prompt too short for {}",
                tpl.id,
            );
        }
    }

    #[test]
    fn list_templates_returns_seed() {
        assert_eq!(list_templates().len(), SEED_TEMPLATES.len());
    }
}
