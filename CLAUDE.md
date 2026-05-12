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
The first-run wizard (Phase 4A) will make this path explicit.

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
│   │   ├── state.rs .......... AppState — RosterManager + lab_root + distro + ChronicleWriter
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
│   │   │   ├── dispatch.rs ... war-room-dispatch.md parser + insert_finding
│   │   │   ├── signals.rs .... laboratory-pulse.md Pending Signals parser
│   │   │   └── wounds.rs ..... `.claude/memory/wounds/` listing by mtime
│   │   ├── balcony/             Phase 2B — the rail's two read surfaces
│   │   │   ├── mod.rs
│   │   │   ├── signs.rs ...... Last Chaos + Idea Ledger sign parsers
│   │   │   └── briefing_library.rs  Five seed templates (Rust compile-time)
│   │   ├── drydock/             Bench-era Phase 3A — PR review enrichment (untouched by cutover)
│   │   │   ├── mod.rs
│   │   │   ├── repo_registry.rs Canonical list of 12 lab repos
│   │   │   ├── bridge.rs ..... Non-pty subprocess via WSL2 bridge
│   │   │   ├── minion_touch.rs Parse git log for minion-stamped commits
│   │   │   ├── chaos_detonations.rs Scan chaos-reports for filename hits
│   │   │   └── active_log.rs . Find IN PROGRESS / PLANNING log by scope
│   │   └── commands/
│   │       ├── mod.rs ........ Command surface registry
│   │       ├── roster.rs ..... dispatch / recall / list / list_recalled / write / resize / transition
│   │       ├── files.rs ...... Mission Control reads + dispatch write
│   │       ├── balcony.rs .... read_balcony_signs + list_briefing_templates (Phase 2B)
│   │       ├── chronicle.rs .. Privacy disclosure ack flow (read + write)
│   │       ├── github.rs ..... `gh` enumeration + review actions (Drydock)
│   │       └── artifacts.rs .. The three enrichment readers (Drydock)
│   ├── Cargo.toml ............ name = "mezzanine"; tauri 2 + portable-pty 0.8 + uuid v4
│   ├── tauri.conf.json ....... productName "The Mezzanine"; identifier nl.zmuuzn.mezzanine
│   ├── capabilities/default.json  Window + plugin permissions
│   └── icons/ ................ PLACEHOLDER copies from horadric-cube; Phase 4 swaps for balcony iconography
├── src/
│   ├── App.vue ............... Top-level shell — BalconyRail + TopBar + Roster + ScientistCanvas + CommandBar + Dispatch + MissionControl + DrydockPanel + PrivacyDisclosure
│   ├── main.ts ............... createApp + UnoCSS
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
│   │   ├── useBriefingLibrary.ts Cached fetch of the five seed templates
│   │   ├── TargetPicker.vue .. Grouped target list (Experiments / Gadgets / Packages / The Lab)
│   │   ├── BalconySign.vue ... One stamped tile on the rail (label + value + optional refresh)
│   │   ├── BriefingLibrary.vue Selectable template cards inside the dispatch sheet
│   │   └── Dispatch.vue ...... Slide-down dispatch sheet over the Roster (Target + Library + Brief)
│   ├── command/               Always-on input tray
│   │   └── CommandBar.vue .... Always-focused bottom input → write_to_scientist(selected, text + "\n")
│   ├── mission/               Mission Control panel slice (bench-era Phase 2A, untouched)
│   │   └── ...
│   ├── chronicle/             Privacy disclosure ack flow (bench-era Phase 2B, slimmed)
│   │   ├── PrivacyDisclosure.vue One-time blocking modal at first boot
│   │   ├── useDisclosure.ts .. Boot-time ack check + acknowledge() flow
│   │   └── types.ts
│   ├── drydock/               PR review with three enrichment fields (bench-era Phase 3A, untouched)
│   │   └── ...
│   └── assets/mezzanine.css .. Auxiliary CSS (almost empty — UnoCSS does the work)
├── tests/                      Mirrors src/ slices — all *.spec.ts live here
│   ├── balcony/ ............... BalconySign + BriefingLibrary + useBalconySigns + useBriefingLibrary + useDispatch
│   ├── chronicle/ ............. PrivacyDisclosure + useDisclosure
│   ├── mission/ ............... MissionControl + sections + ComposeDispatch + useMissionControl
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
| 2B — The Lab Floor | Balcony signs (Last Chaos + Idea Ledger state + Reserved); Briefing Library template cards in the Dispatch sheet | ✅ Closed 2026-05-12 — `balcony/` Rust module (`signs.rs` + `briefing_library.rs`) + two Tauri commands; new Vue slice (`BalconySign` + `BriefingLibrary` + `useBalconySigns` + `useBriefingLibrary`); BalconyRail wears three signs; Dispatch sheet hosts five-template library. Five containment protocols green on Windows (cargo check + 136/136 cargo test + oxlint 0/0 + oxfmt + vue-tsc + 101/101 vitest + vite build) |
| 2C — Carry-Overs | Dossier reframed as a Briefing Library template; First-Run Wizard refresh; Apprentice retirement re-verified; backfill component-level tests for the roster / balcony surfaces | Pending |
| 2D — Cross-Host Ratification | Linux + Windows `tauri dev` boot under the Mezzanine identity; substrate path-separator regression re-verified; chronicle migration idempotency confirmed across hosts | Pending |

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
  locally.
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
- Source idea ledger: `documents/idea-ledgers/idea-ledger-cockpit.md`
- Substrate precedent: `gadgets/horadric-cube/CLAUDE.md`
- Apprentice tombstone: documented in
  `documents/idea-ledgers/idea-ledger-cockpit.md` § TOMBSTONE
