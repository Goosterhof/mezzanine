# Four useful pages — 2026-10-14

The investor chose Mission Control for planning, Holotable for laboratory app
health, and Drydock for dependency updates. Grind and Briefs are retired.
This implementation is proposed in Mezzanine PR #180 on
`feat/planning-services-drydock`, based on
`92a64c7274e184ad57383a094b4556b74c17df29`; it is not a signed release or an
installed-Windows acceptance receipt.

## Planning

Mission Control reads the active table in `documents/lab-backlog.md`, with search,
handler filtering and a detail pane. Age is computed from Filed. The investor can
add, reorder and remove priorities. Preparing a brief selects either existing
colleague and opens an unsent draft. It refuses to replace an unfinished draft;
navigation preserves both terminals, scrollback and the selected recipient.
The expanded composer accepts multiline briefs; Shift+Enter inserts a newline,
Enter sends one bracketed paste to the selected CLI. Actual CLI handling still
needs an installed-app witness.

Only `documents/mezzanine-priorities.json` is written. Its schema is
`{revision: UUID, priorities: BacklogItem[]}`. Each snapshot has `id`, `filed`,
`source`, `item`, and `handler`; identity is the exact serialized tuple
`[filed, source, item]`. Reordering and handler changes preserve identity;
rewritten/removed tasks remain visible as missing priorities for reconciliation.
The app never rewrites or marks tasks complete in the canonical backlog.

Saves compare the entire previous priority document, take a create-new lock,
validate identities, sync a temporary file, then rename it into place. Conflicting
app writers and external edits made before the comparison are rejected. A manual
editor does not honor this lock and must not write during an app save. Malformed
tables/files surface errors, retaining the visible plan. A process crash can leave
`documents/.mezzanine-priorities.lock`; after confirming no app instance is saving,
remove that stale lock and refresh. This is deliberately not an automatically
stolen lease. Priority snapshots are checkout-local state, shared by sessions using that checkout.
The parent repository ignores the JSON, lock and temporary files. Priorities are
not committed or synchronized between machines; the canonical backlog remains
versioned laboratory knowledge. These snapshots do not establish agent ownership.

## Service watch

An app-owned poll checks the six deployed laboratory experiment endpoints every
60 seconds, independently of map visibility. Requests time out after five seconds;
redirects do not count as healthy. Focus/visibility changes refresh readings older
than 30 seconds. There are no overlapping polls. Evidence older than 150 seconds,
or a failed monitor call, becomes unknown. The sidebar retains the latest twenty
samples in memory and shows response time, last check and failure details.

The first failed check changes the badge; two consecutive failures create an
in-app notice, followed by a recovery notice when health returns. An all-unreachable
result mentions the local connection as a possible cause. Dismissal prevents
repeated notices for the same continuing failure. There is no closed-app watch,
OS notification or durable incident history. Database and platform decorations
are explicitly unmonitored. Repository dirtiness does not change app health.

The map keeps its camera/selection, resizes correctly after being hidden, and
does not repeat its entrance animation for every poll. The sidebar is the service
history; repository metadata is still refreshed on map entry or request.

## Dependency updates

Drydock defaults to Dependabot, groups by repository and retains an All PRs view.
The registry now covers all twelve submodules plus the umbrella. Each repo is
read up to 100 PRs; failures and a reached limit are visible completeness warnings.
Opening a PR reads its current head, check/review states, release-note body and
repository merge settings. GitHub's actual files view remains one click away.

Quick merge requires verified REST PR author `dependabot[bot]` of type `Bot`, plus
a complete nonempty commit list matching the PR commit count and inspected head.
Every commit must have that bot author and a valid verified signature. Human edits,
unknown authors, unsigned commits, incomplete evidence and more than 100 commits
are held for ordinary review. GitHub’s `web-flow` committer is allowed because it
signs real Dependabot commits; author and committer are distinct fields. These
checks run whenever an otherwise-eligible candidate is read, including immediately
before the merge. Quick merge also requires an
open non-draft PR, recognizable nonbreaking single-package versions, successful
check evidence, completed required review and GitHub's CLEAN merge state. Major,
pre-1.0 minor, grouped, prerelease/unclassified and Tauri paired updates are held
for preparation. This conservative title classifier is a routing aid, not a
claim that a dependency's code is safe. It can hold benign updates.

The investor presses Merge. The native command re-reads eligibility and matches
the displayed head, then calls `gh pr merge --match-head-commit`. Gadget repos
use merge commits; packages use rebase. Method selection reads repository settings;
there is no rule-by-rule branch-protection preflight. GitHub enforces branch rules
when the command runs, so conflicting linear-history rules can still reject it. No admin bypass is used. An accepted
request is reported as merged only after a separate read says MERGED; queued and
unconfirmed outcomes are distinct. A changed or newly blocked head is refused.
Checks and branch rules can change after the final read; GitHub enforces its rules
at mutation time. The inherited `gh` subprocess bridge has no application-level
timeout, so a stalled bridge can leave a read/action waiting.

Billing/spending failures are recognized from explicit provider check diagnostics
and annotations of failed/startup-failed runs, never from successful check
summaries or short run duration. On 2026-10-14 a read-only check of
Parlour PR #165 at `837646cf2a5b2bd9a696613004f3b8033cd75dc4` confirmed
`app/dependabot` in the list response, an `in /frontend` title suffix, and billing
text in check annotations while summary/title were empty. No live PR was merged.
Held updates can prepare a draft following Pattern 031 and the existing drain
workflow; that draft asks for local verification and a recommendation.

## Evidence and remaining boundaries

Local validation on 2026-10-14:

- 694 frontend tests pass (67 files). Rust: 239 pass, one existing test ignored.
- Typechecked production build, formatting, lint and Clippy with denied warnings
  pass. Lint retains 16 existing warnings; Vite retains its main-chunk size advisory.
- Branch coverage **fails** the configured 90% threshold: 87.16%. An isolated
  archive of the starting head also fails, at 88.21%; this change lowers it by
  1.05 percentage points. Statements 94.58%, functions 90.66%, lines 95.62% pass.
  The threshold was not changed. Closing the branch-coverage gap remains work.
- Chromium passes at 1440×900 and 1080×720: exactly two colleagues, zero recalls,
  same terminal DOM, background output retained, draft retained, reading line 20
  restored after hidden resize, no horizontal overflow or browser errors.
- The witness saves a priority, prepares an unsent brief, shows a sustained
  service failure, refuses a changed-head merge, and verifies a nonzero map canvas.
- Native tests exercise stale/manual priority writes, writer locking, missing
  tasks, merge policy, billing evidence, missing checks and changed/newly held heads.

The repeatable browser
witness is `scripts/witness-pages.cjs`, using real Chromium/Vue/xterm with the
entire native boundary simulated. Preview captures in `documents/tab-cleanup/`
contain synthetic priorities, service responses, terminal text and PRs. They are
layout/action evidence, not proof of live production health or a successful merge.

Installed Windows validation remains outstanding: priority save/reload and source
opening across the WSL path, live service polling after focus/sleep, a prepared
multiline brief accepted by both CLIs, and GitHub reads/actions through the Windows
bridge. No running investor session was restarted or replaced. The previous
`GRAPHITE.md` and `TWO-COLLEAGUES.md` edits were preserved separately.


## Peer review follow-up — 2026-10-14

The Mad Scientist reviewed native merge/persistence code at `6790fbb` (Tube #170),
not the full frontend or service monitor. The follow-up adds complete, signed bot
commit provenance to the mutation gate, ignores successful-run billing prose,
clarifies server-side branch-rule enforcement, makes priority state explicitly
checkout-local and ignored, and names the stale-lock path and cautious recovery
steps in the displayed error. Regression tests cover human commits beneath a bot
head, unsigned/unknown authorship, incomplete/changing commit lists and false
billing labels. This does not close the previously documented coverage or Windows
acceptance gaps.

Follow-up validation: 243 Rust tests pass (one existing ignored), six affected
frontend tests pass, Clippy with denied warnings and formatting pass. Parent
`git check-ignore` confirms the priority JSON/lock/temp paths are ignored. A
read-only check of Parlour #165 confirms a real bot-authored, web-flow-committed
head has `verification.verified=true` and `reason=valid`. No live merge was used
for this validation. The three preview captures predate the small saved-state
label correction; their action scenarios are unchanged.


### Bounded re-review receipt — 2026-10-14

Tube #173 records the Mad Scientist’s read-only recheck of
`6790fbb..f159ae4485e8b030e897d0cf234f8da856bf96e2` and parent
`adef50ff77d44c59129e36ae48c96decba72bcee`: all five original findings closed,
with no new issues in that bounded diff. This is not a full frontend/monitoring
review, coverage acceptance, Windows validation or publication authorization.
Both implementation and ignore-rule commits remain local and unpushed.

The peer suggested optional guidance for human-authored GitHub branch updates.
That copy change is deferred: the current hold correctly routes such commits to
ordinary review, and any recovery instructions should first be verified to preserve
human changes. No source behavior changed for this receipt.


## Coverage threshold closed — 2026-10-14

At the investor’s request, twelve behavioral tests now cover Graphite’s reading
controls (pin snapshots/thread changes, folded work, retry and scroll preservation),
Mission Control’s priority ordering, source failures and prepared briefs, and
Drydock’s stale evidence, queued outcomes, check links and held-update drafts.
The native boundary and reader data are simulated; viewport geometry in component
tests is controlled, not a new native/browser acceptance claim.

The draft test first failed because a successful preparation retained a prior
“colleague unavailable” alert. `MergeActions.prepare` now clears the previous
action error before retrying. This one-line correction is the only production
behavior change in the coverage follow-up.

`npm run test:coverage` passes all 706 tests (68 files):

| Metric | Coverage | Existing threshold |
| --- | --- | --- |
| Statements | 97.11% | 90% |
| Branches | 90.85% | 90% |
| Functions | 96.46% | 90% |
| Lines | 98.03% | 90% |

No coverage exclusions, source instrumentation or thresholds changed. Sentinel’s
frontend job now runs `npm run test:coverage`, enforcing the existing gates in CI.
The typechecked production build, lint and formatting pass; existing unrelated
lint warnings remain. Rust is unchanged from the 243-test receipt. The coverage
gap above is closed locally; installed-Windows acceptance and the scope limits of
the prior peer review remain. The new commit requires its own CI/peer result.
