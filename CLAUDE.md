# CLAUDE.md — The Mezzanine

The Mezzanine is the investor's command balcony — a Tauri v2 desktop
gadget where the investor stands above the lab floor and dispatches mad
scientists onto missions. Each scientist is a persistent `claude` pty
session, dispatched into a target (any experiment, gadget, package, or
the lab root) with a free-form brief. The Roster lists who is out and on
what. Selecting a row opens that scientist's xterm canvas; the command
bar feeds the selection. Recall closes the scientist cleanly; the
chronicle survives on disk.

This repo lives as a submodule at `zmuuzn/gadgets/mezzanine/`. It
supersedes **The Workbench** — the bench era (six fixed pty tabs, the
ExperimentRail, the slide-in panels read by the investor) closed on
2026-05-12 when the frontend cutover landed. The metaphor changed; the
substrate (portable-pty wrapping wsl.exe on Windows, bash on Unix) and
the xterm.js canvas survived intact.

The Mezzanine also stands in the lineage that retired **The Apprentice**
on 2026-04-30 (Agent SDK incompatible with the investor's Team account).
Pty-wrap of the `claude` CLI is the laboratory's standard Claude
integration mechanism; the Mezzanine is its current shape.

## The Voice

The Mezzanine speaks like a balcony — architectural, elevated,
directorial. The investor is upstairs; the experiments, gadgets, and
packages are downstairs. Vocabulary is brass railings, the floor below,
dispatch, roster, recall, missions, briefs. Not maritime (no anchors,
helms, decks, voyages). Not bench-era (no vises, racks, instruments,
tools-racked). The voice is locked at the experiment-log level (#00049)
and applies to every empty state, loading state, error message, and
panel label this gadget will ever ship.

| Surface | The Mezzanine Voice |
|---------|---------------------|
| Empty Roster | *"Balcony quiet. No scientists dispatched."* |
| No selection | *"Balcony quiet. No scientist selected. Dispatch one from the balcony, or click a roster row."* |
| Roster row label | *"The Crucible · 'check phpstan' · working · 2m 14s"* |
| Idle-warning row | *"Idle 1h+"* (dim treatment, signal-coloured pulse) |
| Recently Recalled tile | *"<target> · <mission> · <recalledAgo>"* (dimmed strip below the Roster) |
| Dispatch CTA | *"Dispatch ▾"* |
| Dispatch sheet header | *"Send a scientist to the lab floor"* |
| Brief placeholder | *"What is the mission? Free-form — the scientist receives this as the opening prompt."* |
| Command bar placeholder | *"Speak to the selected scientist…"* |
| Crashed scientist | *"Mission ended in failure. Recall the row to clear it; the chronicle survives."* |

## The Architecture

The Mezzanine is a **Windows-native Tauri binary** that bridges into the
investor's WSL2 distro for every laboratory-side concern. The shape
mimics VS Code's Remote-WSL extension: the UI runs on Windows, but the
pty subprocess, lab file reads, and `gh` CLI invocations all happen
inside WSL2 where the laboratory actually lives at
`/home/goosterhof/code/zmuuzn`.

### The WSL2 Bridge (architecture decision AD-1, locked)

Inherited from the bench era — the substrate did not change with the
rebrand. What changed is *who* the substrate spawns: every pty wraps a
*dispatched scientist's claude session*, not a *fixed experiment bench*.

| Concern | Windows Side | WSL2 Side | Bridge Mechanism |
|---------|--------------|-----------|------------------|
| Tauri binary | runs here | — | native `.exe` |
| Pty subprocess | spawns `wsl.exe` | `claude` runs inside WSL2 | `wsl.exe -d <distro> -- bash -lc "cd <wsl-path> && exec claude"` |
| Lab file reads | requested here | files live here | `\\wsl$\<distro>\home\goosterhof\code\zmuuzn\…` UNC paths OR `wsl.exe -- cat <wsl-path>` |
| Scientist CWDs | translated here | actual paths here | `/home/goosterhof/code/zmuuzn/<target-relative-path>/` — POSIX, never `PathBuf::join` |
| Chronicle transcripts | stored here | reachable here too | `%USERPROFILE%\.zmuuzn-mezzanine\transcripts\scientists\<id>.jsonl` (Windows-side; reachable from WSL2 at `/mnt/c/Users/<user>/.zmuuzn-mezzanine/`) |
| `gh` CLI invocation | — | runs here | `wsl.exe -d <distro> -- gh ...` (investor's `gh` auth lives in WSL2) |
| `git log` reads | — | runs here | `wsl.exe -d <distro> -- git log ...` |

**Why Chronicle transcripts on the Windows side:** they are gadget-local
data, not laboratory data. Keeping them out of the WSL2 home preserves
the investor's WSL2 environment for code; the investor can still grep
them from WSL2 at `/mnt/c/Users/<user>/.zmuuzn-mezzanine/` when needed.
The first-run wizard (delivered as Phase 2C) makes this path explicit.

**The chronicle path migration:** on first Mezzanine boot, transcripts
under the bench-era `~/.zmuuzn-cockpit/` directory are one-time-copied
into `~/.zmuuzn-mezzanine/` (see `src-tauri/src/chronicle/migration.rs`).
A `.cockpit-migrated` marker prevents re-copy. The bench-era directory
is left intact for rollback.

**Substrate implication:** `portable-pty` must wrap `wsl.exe` correctly
on Windows — not `claude.exe` directly. The substrate's path-separator
hygiene is load-bearing: `PathBuf::join` injects a backslash on Windows,
which bash inside `wsl.exe` then sees as an escape and fails. Paths are
joined as strings via POSIX `/`, never via `PathBuf::join`. This is the
**Substrate Finding 1** the bench-era Phase 1C spike surfaced; the
regression test in `pty/substrate.rs` is part of the test suite.

## Tech Stack

- **Core:** Tauri v2 (Rust 2021 edition, rust-version 1.77+)
- **UI:** Vue 3.5 + TypeScript 5.6 + Vite 6 + UnoCSS 0.65 (attributify)
- **State:** module-singleton composables — `useRoster`, `useDispatch`,
  `useIdleWarning`, `useShell` — plain Vue refs scoped at module level,
  no Pinia. `parking_lot::RwLock` handles the Rust side.
- **Pty:** the `portable-pty` Rust crate. Each dispatched scientist
  owns one `LiveScientistSession` with a dedicated reader thread that
  emits `scientist-output` / `scientist-exit` events on the Tauri bridge.
- **Terminal renderer:** `@xterm/xterm` 6.x + `@xterm/addon-fit` — the
  canvas mounts one `Terminal` per dispatched scientist (lazy on first
  selection, kept alive until recall). xterm's own scrollback (5000
  lines) renders ANSI from `claude` directly.
- **Async:** `tokio` for the Tauri runtime; the reader thread per
  scientist is a dedicated `std::thread::spawn` (blocking pty read).
- **Persistence:** `tauri-plugin-store` for first-run wizard config
  (lab root path, claude binary path, transcript acknowledgment);
  `roster.json` snapshot at `~/.zmuuzn-mezzanine/roster.json` survives
  gadget restart with full scientist lifecycle state.
- **HTTP:** `tauri-plugin-http` (`http:default` permission granted in
  `capabilities/default.json` — landed with the bench-era Phase 3A
  Drydock for GitHub API access).
- **Logging:** `tauri-plugin-log` to stdout + log dir.
- **Chronicle:** plain `std::fs` + `chrono` for JSONL transcript writes
  — no extra crate needed for append-only newline-delimited JSON.

## Layout

```
mezzanine/
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs ............ Builder, plugin registration, command list
│   │   ├── main.rs ........... Trivial entry — calls lib::run()
│   │   ├── error.rs .......... MezzanineError + Serialize-for-Tauri-bridge
│   │   ├── state.rs .......... AppState — RosterManager + lab_root + distro + claude_binary + mezzanine_home + ChronicleWriter
│   │   ├── host_paths.rs ..... WSL2-side POSIX `lab_root` ↔ Windows host path resolvers: `\\wsl$\` UNC for `std::fs` reads, POSIX strings for `wsl.exe -- bash -lc "cd …"` working dirs (Phase 2D runtime sweep)
│   │   ├── wizard/             First-run wizard persistence (Phase 2C)
│   │   │   └── mod.rs ........ WizardState serde struct + read/write of `wizard-state.json`
│   │   ├── pty/
│   │   │   ├── mod.rs ........ Substrate-only module (bench-era pty layer retired)
│   │   │   └── substrate.rs .. CommandBuilder for wsl.exe (Windows) / bash (Unix); SessionSpec::for_target
│   │   ├── roster/             The Mezzanine's dispatched-scientist lifecycle
│   │   │   ├── mod.rs ........ Module root, re-exports
│   │   │   ├── scientist.rs .. Scientist struct + ScientistId (uuid v4) + MissionState
│   │   │   ├── target.rs ..... Target enum: Experiment / Gadget / Package / LabRoot + cwd() resolver
│   │   │   ├── live.rs ....... LiveScientistSession — owns one pty + reader thread + transcript path
│   │   │   ├── manager.rs .... RosterManager — dispatch / recall / list / persistence
│   │   │   ├── persistence.rs  Roster snapshot read/write — survives gadget restart
│   │   │   └── recall_strip.rs Recently-recalled 5-minute TTL buffer
│   │   ├── chronicle/           Per-scientist JSONL transcript writer + path migration
│   │   │   ├── mod.rs ........ Module root, re-exports
│   │   │   ├── writer.rs ..... ChronicleWriter — base-dir holder + pause flag (vestigial; see commit log)
│   │   │   └── migration.rs .. One-time `~/.zmuuzn-cockpit/` → `~/.zmuuzn-mezzanine/` copy
│   │   ├── lab/                 Lab-artifact parsers (Mission Control)
│   │   │   ├── mod.rs
│   │   │   ├── vital_signs.rs  CLAUDE.md ASCII-box parser
│   │   │   ├── signals.rs .... laboratory-pulse.md Pending Signals parser
│   │   │   └── wounds.rs ..... `.claude/memory/wounds/` listing by mtime
│   │   ├── balcony/             Phase 2B — the rail's two read surfaces
│   │   │   ├── mod.rs
│   │   │   ├── signs.rs ...... Last Chaos + Idea Ledger sign parsers
│   │   │   └── briefing_library.rs  Four seed templates (Rust compile-time)
│   │   ├── drydock/             Bench-era Phase 3A — PR review enrichment (untouched by cutover)
│   │   │   ├── mod.rs
│   │   │   ├── repo_registry.rs Canonical list of 12 lab repos
│   │   │   ├── bridge.rs ..... Non-pty subprocess via WSL2 bridge
│   │   │   ├── minion_touch.rs Parse git log for minion-stamped commits
│   │   │   ├── chaos_detonations.rs Scan chaos-reports for filename hits
│   │   │   └── active_log.rs . Find IN PROGRESS / PLANNING log by scope
│   │   ├── holotable/             Arc 1 of the lab-monitor-3d absorption (#00051)
│   │   │   ├── mod.rs
│   │   │   ├── git_state.rs .. Lab branch/status/submodule reader via run_in_lab
│   │   │   ├── health_check.rs Concurrent /up HTTPS pings via tauri-plugin-http
│   │   │   └── aggregator.rs . Git + health → DashboardState (typed serde shape)
│   │   └── commands/
│   │       ├── mod.rs ........ Command surface registry
│   │       ├── roster.rs ..... dispatch / recall / list / list_recalled / write / resize / transition
│   │       ├── files.rs ...... Mission Control reads + dispatch write
│   │       ├── balcony.rs .... read_balcony_signs + list_briefing_templates (Phase 2B)
│   │       ├── chronicle.rs .. Privacy disclosure ack flow (read + write)
│   │       ├── wizard.rs ..... First-run wizard IPC (read_state / read_detected / complete) — Phase 2C
│   │       ├── github.rs ..... `gh` enumeration + review actions (Drydock)
│   │       ├── artifacts.rs .. The three enrichment readers (Drydock)
│   │       └── holotable.rs .. read_holotable_state — Arc 1 (#00051)
│   ├── Cargo.toml ............ name = "mezzanine"; tauri 2 + portable-pty 0.8 + uuid v4
│   ├── tauri.conf.json ....... productName "The Mezzanine"; identifier nl.zmuuzn.mezzanine
│   ├── capabilities/default.json  Window + plugin permissions
│   └── icons/ ................ PLACEHOLDER copies from horadric-cube; Phase 4 swaps for balcony iconography
├── scripts/
│   └── version.mjs ........... The Ascent (#00056) — version lockstep across package.json / tauri.conf.json / Cargo.toml (`check` / `bump` modes)
├── src/
│   ├── App.vue ............... Top-level shell — BalconyRail + TopBar + Roster + ScientistCanvas + CommandBar + Dispatch + MissionControl + DrydockPanel + FirstRunWizard + AscentPrompt
│   ├── main.ts ............... createApp + UnoCSS
│   ├── ascent/                The Ascent (#00056) — the balcony rebuilds itself
│   │   ├── types.ts .......... AscentStatus union + UpdateMeta
│   │   ├── useAscent.ts ...... Singleton — check() / descend() / dismiss(); wraps plugin-updater + plugin-process; _resetForTests()
│   │   └── AscentPrompt.vue .. Balcony-voiced prompt strip; descend/stay actions + descent progress
│   ├── shell/                 Frame
│   │   ├── BalconyRail.vue ... Top rail — three signs (Last Chaos, Idea Ledger, Reserved) + Dispatch ▾ trigger
│   │   ├── TopBar.vue ........ Mission Control / Drydock panel toggles
│   │   └── useShell.ts ....... openPanel + togglePanel/closePanel singleton
│   ├── roster/                The dispatched-scientist domain
│   │   ├── types.ts .......... Scientist / Target / MissionState / TARGET_OPTIONS / targetLabel / targetKey
│   │   ├── useRoster.ts ...... Singleton roster + recalled-strip + selection state
│   │   ├── useRosterBackend.ts IPC bridge — wires dispatch / recall / list / events
│   │   ├── useScientistTerminals.ts xterm.js Terminal pool, keyed by ScientistId
│   │   ├── useIdleWarning.ts . 1h idle threshold, ticks every minute
│   │   ├── PulseDot.vue ...... 5-state animated indicator + idle-warning treatment
│   │   ├── ScientistRow.vue .. One roster row: target / mission / state / elapsed / Recall
│   │   ├── Roster.vue ........ The list of dispatched scientists + Recently Recalled strip
│   │   ├── RecentlyRecalledStrip.vue  5-minute dim strip below the active Roster
│   │   └── ScientistCanvas.vue Center xterm.js stack — one wrapper per scientist, only selected visible
│   ├── balcony/               Dispatch surface + rail signs (Phase 2B)
│   │   ├── types.ts .......... BalconySigns / BriefingTemplate mirrors of the Rust serde shapes
│   │   ├── useDispatch.ts .... Singleton dispatch-sheet state (open / target / template / brief / submit)
│   │   ├── useBalconySigns.ts Last Chaos + Idea Ledger sign loader (refresh on demand)
│   │   ├── useBriefingLibrary.ts Cached fetch of the four seed templates
│   │   ├── TargetPicker.vue .. Grouped target list (Experiments / Gadgets / Packages / The Lab)
│   │   ├── BalconySign.vue ... One stamped tile on the rail (label + value + optional refresh)
│   │   ├── BriefingLibrary.vue Selectable template cards inside the dispatch sheet
│   │   └── Dispatch.vue ...... Slide-down dispatch sheet over the Roster (Target + Library + Brief)
│   ├── holotable/             Arc 1 — the lab floor below the balcony (#00051)
│   │   ├── types.ts .......... DashboardState / HealthState / HolotableError TS mirrors
│   │   ├── useHolotable.ts ... Singleton state + IPC + legacy-shape adapter for the scene
│   │   ├── lab-core.js ....... Lifted pure helpers (ESM); ignored by oxlint/oxfmt/vue-tsc
│   │   ├── scene.js .......... Lifted 1835-line WebGL engine; exports initScene(opts)
│   │   ├── HolotableScene.vue . `<canvas>` host — mounts scene, watches state, pause/resume RAF
│   │   └── HolotablePanel.vue . Slide-down panel — refresh button, voiced error variants
│   ├── command/               Always-on input tray
│   │   └── CommandBar.vue .... Always-focused bottom input → write_to_scientist(selected, text + "\n")
│   ├── wizard/                First-run wizard (Phase 2C) — three steps, balcony voice
│   │   ├── types.ts .......... WizardState / WizardDetected / WizardSubmission + WIZARD_STEP_ORDER
│   │   ├── useWizard.ts ...... Singleton state + IPC (loadStatus / goNext / goBack / submit)
│   │   ├── FirstRunWizard.vue . Blocking modal — renders active step + Back / Continue / "Open the balcony."
│   │   ├── StepLaboratory.vue . Step 1 — lab root input
│   │   ├── StepBinary.vue ..... Step 2 — claude binary override (blank → "claude" from PATH)
│   │   └── StepChronicle.vue .. Step 3 — chronicle disclosure copy, refreshed for the dispatched model
│   ├── mission/               Mission Control panel slice (bench-era Phase 2A, untouched)
│   │   └── ...
│   ├── chronicle/             Chronicle wire-shape stub (PrivacyDisclosure + useDisclosure retired Phase 2C)
│   │   └── types.ts .......... ChronicleTurn + TurnDirection — JSONL transcript shape
│   ├── drydock/               PR review with three enrichment fields (bench-era Phase 3A, untouched)
│   │   └── ...
│   └── assets/mezzanine.css .. Auxiliary CSS (almost empty — UnoCSS does the work)
├── tests/                      Mirrors src/ slices — all *.spec.ts live here
│   ├── ascent/ ................ useAscent (flow states) + AscentPrompt (render / actions / balcony voice)
│   ├── balcony/ ............... BalconySign + BriefingLibrary + useBalconySigns + useBriefingLibrary + useDispatch
│   ├── wizard/ ................ useWizard + FirstRunWizard + Steps (StepLaboratory / StepBinary / StepChronicle)
│   ├── mission/ ............... MissionControl + sections + useMissionControl
│   ├── drydock/ ............... DrydockPanel + PrCard + FileDiff + ReviewActions + useDrydock
│   └── shell/ ................. TopBar + useShell
├── uno.config.ts ............. Balcony palette: mz-surface, mz-rail, mz-canvas, mz-pulse-*
├── vite.config.ts ............ Vue + UnoCSS plugins, port 1430
├── .oxlintrc.json ............ War-room canonical oxlint config (correctness:error, type-aware)
├── vitest.config.ts .......... jsdom + v8 coverage with 90% thresholds
└── tsconfig.json ............. Strict, no path aliases — slices import relatively
```

### The Frontend Foundation (war-room standards)

The Vue side is laid out as **vertical slices** in the spirit of
war-room ADR-0014: each slice owns its components, composables, and
types together under `src/{slice}/`. Slices import from each other
relatively (`../roster/types`), not through a `@/` alias — the slice
boundary is the source of truth, not a global root.

Tests mirror that layout under `tests/{slice}/*.spec.ts`. Test files
reach back into source via `../../src/{slice}/{name}` — explicit, no
magic alias.

State lives in **module-singleton composables**, not Pinia. Each
composable exports a `reset()` (or `_resetForTests()`) that tests call
in `beforeEach` to isolate from other tests. The singleton state
survives across `useX()` calls within a single mount, which is the
property the Roster and ScientistCanvas both depend on.

**Test coverage** runs at v8 with 90% line/branch/function/statement
thresholds when invoked via `npm run test:coverage`. The frontend
cutover landed with the bench-era specs retired and the new
roster / balcony surfaces shipping ahead of dedicated specs; backfill
sweep is a Phase 2C task.

## Phase Roadmap

The deployment plan lives in
`documents/experiment-logs/00049-the-mezzanine.md`. Predecessor log:
`documents/experiment-logs/00048-the-workbench.md` — bench-era arc
(Phases 1A–3A) closed by 2026-05-11.

| Phase | Scope | Status |
|-------|-------|--------|
| 2A — backend swap | Cargo + Tauri identity renamed; `roster/` module added alongside `pty/`; WorkbenchError → MezzanineError; chronicle migration wired | ✅ Closed 2026-05-11 (df38399 + a1347a8) |
| 2A — frontend cutover | Folder rename `gadgets/workbench/` → `gadgets/mezzanine/`; CSS prefix swap; new Vue surfaces (Roster / Dispatch / BalconyRail); bench-era code retired; Rust pty / chronicle reader retired; lib.rs registry trimmed | ✅ Closed 2026-05-12 — five containment protocols green on Linux (cargo check + 112/112 cargo test + oxlint + oxfmt + vue-tsc + 78/78 vitest + vite build) |
| 2B — The Lab Floor | Balcony signs (Last Chaos + Idea Ledger state + Reserved); Briefing Library template cards in the Dispatch sheet | ✅ Closed 2026-05-12 — `balcony/` Rust module (`signs.rs` + `briefing_library.rs`) + two Tauri commands; new Vue slice (`BalconySign` + `BriefingLibrary` + `useBalconySigns` + `useBriefingLibrary`); BalconyRail wears three signs; Dispatch sheet hosts a four-template library (originally five at Phase 2B close; Compose War Room Dispatch retired 2026-05-15). Five containment protocols green on Windows (cargo check + 136/136 cargo test + oxlint 0/0 + oxfmt + vue-tsc + 101/101 vitest + vite build) |
| 2C — Carry-Overs | First-Run Wizard refresh; Apprentice retirement re-verified; backfill component-level tests for the roster slice. **Dossier reframe landed early in Phase 2B** as the `experiment-dossier-read` template. | ✅ Closed 2026-05-13 — `wizard/` Rust module (`mod.rs`) + `commands/wizard.rs` (three Tauri commands: `read_wizard_state` / `read_wizard_detected` / `complete_wizard`); new Vue slice (`FirstRunWizard` + three step components + `useWizard`); substrate accepts a `binary` override threaded from the wizard; `chronicle/PrivacyDisclosure.vue` + `useDisclosure.ts` retired (step 3 folds in the disclosure ack — CTA *"Open the balcony."*). Five containment protocols green on Windows (cargo check + 146/146 cargo test + oxlint 0/0 + oxfmt + vue-tsc + 236/236 vitest + vite build); v8 coverage 96.78% (gate restored at 90%). Two close-button assertions + one anti-Dossier guard added in commit `0300dd9` while sealing W1 of Phase 2D. |
| 2D — Cross-Host Ratification | Linux + Windows `tauri dev` boot under the Mezzanine identity; substrate path-separator regression re-verified; chronicle migration idempotency confirmed across hosts | ✅ Closed 2026-05-15 — de-scoped to Windows-with-WSL2 (the only deployment target). Static green on 2026-05-13 (six unit tests for migration + substrate Debug + cwd POSIX coercion). Runtime W1 stamped 2026-05-13; W2–W9 stamped 2026-05-15 (wizard persisted at `/home/goosterhof/Code/zmuuzn`, live `claude` greeting + ANSI fidelity in xterm, JSONL 297 in / 893 out, Recently Recalled strip honoured, two distinct Gatekeeper scientists with separate UUIDs, `.cockpit-migrated` marker idempotent across boots, zero "Workbench" in chrome). Full evidence notes in #00049 §Runtime ratification. |
| Arc 1 — The Holotable | VS Code `gadgets/lab-monitor-3d/` absorbed into the Mezzanine as a `[Holotable]` panel; new `holotable/` slice on both sides (Rust substrate + Vue host); 1835-line WebGL engine lifted intact; `[Holotable]` button added to TopBar; cross-host ratification deferred to Windows (no cargo here) | ✅ Static-green 2026-05-26 — frontend gates: oxlint 0/0, vue-tsc clean, vitest 242/242 (+14 new), v8 coverage 97.03% lines / 91.76% branches / 98.48% functions, vite build clean (scene chunked at 31kB). Rust side `cargo check` + `cargo test` pending Windows; static review confirms the substrate follows `commands/balcony.rs` exactly. Per RD-3, `gadgets/lab-monitor-3d/` is NOT tombstoned here — that waits for Arc #00053. Experiment log: `documents/experiment-logs/00051-the-holotable.md`. |
| Arc 2 — The Observer | VS Code `gadgets/pixel-lab/` absorbed into the Mezzanine as an `[Observer]` panel; new `observer/` slice on both sides; shared `chronicle/reader.rs` infrastructure (consumed by Arc 3); `ChronicleTurn` + `TurnDirection` promoted from `roster::live` to `chronicle::types` for cross-module deserialization; 2554-line Canvas 2D engine lifted from `gadgets/pixel-lab/webview/lab.js` (IIFE→ES module, VS Code messaging stripped, MINION_OFFSETS cap retired); 43 ported activity-inference tests + 15 useObserver tests; `[Observer]` (OB) added as new rightmost TopBar button; bidirectional roster/sprite selection sync; push-always chronicle subscription (contrast: Holotable is investor-pull); cross-host ratification deferred to Windows | ✅ Static-green 2026-05-26 — frontend gates: oxlint 0/0, vue-tsc clean, vitest 312/312 (+70 new), v8 coverage 96.56% lines / 91.65% branches / 98.21% functions, vite build clean (scene chunked at 37kB). Rust side `cargo check` + `cargo test` pending Windows; the new `chronicle::reader` tests use `tauri::test::mock_app` under the dev-only `test` feature added to `Cargo.toml`. Per #00052 RD-3, `gadgets/pixel-lab/` is NOT tombstoned here — that waits for Arc #00053. Experiment log: `documents/experiment-logs/00052-the-observer.md`. |
| Arc 3 — The Grind | VS Code `gadgets/idle-lab/` absorbed into the Mezzanine as a `[Grind]` panel; new `grind/` slice on both sides (Rust economy + Vue engine + HUD + renderer); 1084-line `game-core.js` rewritten as `gameCore.ts` (ES module, all 8 building tiers / 10 upgrades / 15 milestones / prestige / offline progress intact); economy reframed per RD-2 — the *lab* earns, not the investor (chronicle line / dispatch / clean recall / mission duration replace keystroke / save / file open); G-0 spec recorded inline (CHRONICLE_LINE_RP=0.5, CHRONICLE_RATE_CAP=4.0/s, DISPATCH_RP=25, RECALL_CLEAN_RP=100); 16-node theorem tree (the 12 originals + new Dispatch branch: Tireless Bench / Recall Discipline / Briefing Library / Many Hands); `[Grind]` (GR) added as new rightmost TopBar button; ChronicleReader extended with `tokio::sync::broadcast` for in-process Rust consumers (the EconomyManager subscribes); `grind-rp-grant` Tauri event for frontend; G-6 cleanup tail executed (three submodule tombstones + three Sentinel retirements + root CLAUDE.md gadget table 5→2); cross-host ratification deferred to Windows | ✅ Static-green 2026-05-26 — frontend gates: oxlint 0 errors, vue-tsc clean, vitest 395/395 (+83 new), v8 coverage 96.58% lines / 91.79% branches / 94.37% functions, vite build clean. Rust side `cargo check` + `cargo test` pending Windows; the new `grind::economy::tests` cover all four grant paths, the token-bucket rate limiter, per-scientist independence, dispatch/recall dedup, and wire-shape (kebab-case) serialization. Per RD-3 (executed in G-6), `gadgets/{lab-monitor-3d,pixel-lab,idle-lab}/` are tombstoned with CLAUDE.md headers; their Sentinels are `workflow_dispatch`-only; root CLAUDE.md gadget count is 2 (Mezzanine + Horadric Cube). Experiment log: `documents/experiment-logs/00053-the-grind.md`. |
| The Ascent (#00056) | The balcony rebuilds itself — `tauri-plugin-updater` + `-process` wired (Cargo/lib.rs/capabilities/tauri.conf); new `ascent/` Vue slice (`types` + `useAscent` singleton + `AscentPrompt`) on the `check()` → `descend()` → `relaunch()` flow; check-and-prompt, never silent (RD-2); boot-check gated on wizard completion; updater keypair minted (pubkey in `tauri.conf.json`, private key escrow investor-gated); release pipeline `.github/workflows/ascent.yml` (tag `v*` → Windows → `tauri-action` sign + publish NSIS + `latest.json`); version lockstep via `scripts/version.mjs` + `version-lockstep.yml`. (The `prefers-reduced-motion` gate this slice's prompt-rise transition needs was landed concurrently by the Warden in `42238e8`; the Ascent rebased onto it rather than duplicate it.) | 🟡 A-1–A-4 static-green 2026-06-02 — oxlint 0 errors, vue-tsc clean, vitest 418/418 (+23 ascent), v8 coverage ascent 100% lines / 98.4% branches (overall 96.72% / 92.35%), `cargo check` + `vite build` clean. A-0 escrow (private key → CI secrets) + A-5 runtime ratification pending; `cargo test` execution still deferred to Linux (Windows test binary hits a pre-existing `STATUS_ENTRYPOINT_NOT_FOUND`). Experiment log: `documents/experiment-logs/00056-the-ascent.md`. |

## Commands

```bash
# From gadgets/mezzanine/
npm install
npm run dev          # Vite dev server on http://localhost:1430
npm run tauri dev    # Tauri development mode (Windows / WSL2 dev)
npm run build        # vue-tsc + Vite production build
npm run typecheck    # vue-tsc --noEmit
npm run lint         # oxlint (war-room canonical config — `.oxlintrc.json`, type-aware)
npm run format:check # oxfmt dry-run (war-room canonical config — `.oxfmtrc.json`)
npm run test         # Vitest
npm run test:coverage # Vitest with v8 coverage (90% thresholds)

# Rust side
cargo build --manifest-path src-tauri/Cargo.toml
cargo tauri build   # Tauri production build (Windows target)
```

## What This Gadget Does NOT Do

- **Does not deploy to a server.** No Railway, no `/up` health check,
  no public URL. The Mezzanine is a desktop binary the investor runs
  locally. (The Ascent's auto-updater reads a manifest from GitHub
  Releases — that is *static artifact hosting*, not a service the
  laboratory operates; no process, no uptime obligation. See #00056 RD-1.)
- **Does not edit code.** It directs `claude` to edit code. The
  Mezzanine is a *command* surface, not an *editor* surface — that
  distinction is load-bearing for every UI decision.
- **Does not duplicate VS Code.** No tree explorer, no diff viewer
  (the Drydock shows PR diffs but only with enrichment, not as an
  editor), no extension ecosystem. If a feature would compete with
  VS Code's existing surface, it does not belong here.
- **Does not put the investor *inside* an experiment.** The investor
  is always upstairs on the balcony. Scientists go downstairs to do
  the work; the investor watches, directs, and recalls. This is what
  the bench era got structurally wrong and the Mezzanine corrects.

## Cross-References

- Current experiment log: `documents/experiment-logs/00049-the-mezzanine.md`
- Predecessor log: `documents/experiment-logs/00048-the-workbench.md`
- Rebrand decision: `.claude/memory/decisions/008-workbench-rebranded-to-mezzanine.md`
- Source idea ledger: `documents/idea-ledgers/idea-ledger-mezzanine.md` (renamed 2026-05-13 from `idea-ledger-cockpit.md` — pre-Workbench-naming-vote filename)
- Substrate precedent: `gadgets/horadric-cube/CLAUDE.md`
- Apprentice tombstone: documented in
  `documents/idea-ledgers/idea-ledger-mezzanine.md` § TOMBSTONE
