# CLAUDE.md — The Workbench

The Workbench is the Mad Scientist's daily-driver cockpit — a Tauri v2 desktop
gadget that wraps the `claude` CLI in six persistent pty sessions, surfaces
Mission Control / Drydock / Experiment Dossier as slide-in panels, and lets
the investor command the laboratory from one bench instead of bouncing
between terminals.

This repo lives as a submodule at `zmuuzn/gadgets/workbench/` — the
laboratory's fifth calibrated gadget after the Apprentice's retirement on
2026-04-30. The Workbench supersedes the Apprentice: same role (chat-driven
Claude direction inside a custom UI), different substrate (Tauri v2 + pty
wrap of the `claude` binary instead of the Agent SDK that the investor's
Team account cannot authenticate against).

## The Voice

The Workbench speaks like a workbench — physical, instrument-y, mechanical.
Not maritime (no anchors, helms, decks, voyages). The vocabulary is steel,
brass, vises, racks, instruments, benches, chronicles, drydocks. The voice is
locked at the experiment-log level (#00048) and applies to every empty state,
loading state, error message, and panel label this gadget will ever ship.

| Surface | The Workbench Voice |
|---------|---------------------|
| Empty (no session) | *"Tools racked. Click an experiment to start a session."* |
| Loading (pty booting) | *"Vise tightening… booting The Crucible."* |
| Awaiting input | *"Listening."* |
| Task running | *"The forge is running." / "Wiring the Smokestacks."* |
| Crashed | *"Session snapped. Exit code 1. Click to restart."* |
| Empty Drydock | *"No open PRs across the laboratory. Clean slate."* |
| Empty Mission Control dispatch | *"No active dispatches. Tools racked."* |

## The Architecture

The Workbench is a **Windows-native Tauri binary** that bridges into the
investor's WSL2 distro for every laboratory-side concern. The shape mimics
VS Code's Remote-WSL extension: the UI runs on Windows, but pty
subprocesses, lab file reads, and `gh` CLI invocations all happen inside
WSL2 where the laboratory actually lives at
`/home/goosterhof/code/zmuuzn`.

### The WSL2 Bridge (architecture decision AD-1, locked)

| Concern | Windows Side | WSL2 Side | Bridge Mechanism |
|---------|--------------|-----------|------------------|
| Tauri binary | runs here | — | native `.exe` |
| Pty subprocess | spawns `wsl.exe` | `claude` runs inside WSL2 | `wsl.exe -d <distro> -- bash -c "cd <wsl-path> && claude"` |
| Lab file reads | requested here | files live here | `\\wsl$\<distro>\home\goosterhof\code\zmuuzn\…` UNC paths OR `wsl.exe -- cat <wsl-path>` |
| Experiment CWDs | translated here | actual paths here | `/home/goosterhof/code/zmuuzn/experiments/zmuuzn-<name>/` (WSL2 paths, not Windows paths) |
| Chronicle transcripts | stored here | reachable here too | `%USERPROFILE%\.zmuuzn-cockpit\transcripts\` (Windows-side; reachable from WSL2 at `/mnt/c/Users/<user>/.zmuuzn-cockpit/`) |
| `gh` CLI invocation | — | runs here | `wsl.exe -d <distro> -- gh ...` (investor's `gh` auth lives in WSL2) |
| `git log` reads | — | runs here | `wsl.exe -d <distro> -- git log ...` |

**Why Chronicle transcripts on the Windows side:** they are gadget-local
data, not laboratory data. Keeping them out of the WSL2 home preserves the
investor's WSL2 environment for code; the investor can still grep them from
WSL2 at `/mnt/c/Users/<user>/.zmuuzn-cockpit/` when needed. The first-run
wizard makes this path explicit.

**Implication for the substrate spike:** `portable-pty` must wrap `wsl.exe`
correctly on Windows — not `claude.exe` directly. The Phase 1C spike at the
start of that phase is the gate before any UI work depends on live
sessions. Validation criteria: spawned subprocess command line genuinely
contains `wsl.exe`; the pty inside the wrapped session sees Linux as the
underlying OS (e.g., `uname -a` returning Linux); ANSI escape sequences
pass through; terminal width queries return the right answer.

## Tech Stack

- **Core:** Tauri v2 (Rust 2021 edition, rust-version 1.77+)
- **UI:** Vue 3.5 + TypeScript 5.6 + Vite 6 + UnoCSS 0.65 (attributify)
- **State:** module-singleton composables (`useSessions`, `useShell`) — plain
  Vue refs scoped at module level, no Pinia. The gadget's state surface is
  small and tree-shakeable; `parking_lot::RwLock` handles the Rust side.
- **Pty:** the `portable-pty` Rust crate (the lab's first use of it; the
  Horadric Cube uses `tauri-plugin-shell` for one-shot subprocesses, not
  interactive pty sessions)
- **Terminal renderer:** `@xterm/xterm` 5.x + `@xterm/addon-fit` — the
  canvas mounts one `Terminal` per experiment (lazy, persistent for the
  gadget's lifetime). xterm's own scrollback (5000 lines) replaces the
  ring-buffer model the original Phase 1B/1C design specified; ANSI
  escape sequences from `claude` are rendered, not printed as glyphs
- **Async:** `tokio` for the read/write pumps
- **Persistence:** `tauri-plugin-store` for first-run wizard config
  (lab root path, claude binary path, transcript acknowledgment)
- **HTTP:** `tauri-plugin-http` (registered in `Cargo.toml`,
  `http:default` permission granted in `capabilities/default.json` —
  landed with Phase 3A's Drydock for GitHub API access)
- **Logging:** `tauri-plugin-log` to stdout + log dir
- **Chronicle:** plain `std::fs` + `chrono` for JSONL transcript writes —
  no extra crate needed for append-only newline-delimited JSON

## Layout

```
workbench/
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs ............ Builder, plugin registration, command list
│   │   ├── main.rs ........... Trivial entry — calls lib::run()
│   │   ├── error.rs .......... WorkbenchError + Serialize-for-Tauri-bridge
│   │   ├── state.rs .......... AppState — PtyManager + lab_root
│   │   ├── pty/
│   │   │   ├── mod.rs ........ Module root, re-exports
│   │   │   ├── session.rs .... ExperimentId enum + SessionState enum
│   │   │   └── manager.rs .... PtyManager — registry, LRU policy (Phase 1C)
│   │   ├── chronicle/           Phase 2B JSONL transcript layer
│   │   │   ├── mod.rs ........ Module root, re-exports
│   │   │   ├── writer.rs ..... Append-only JSONL + daily rotation + pause flag
│   │   │   └── reader.rs ..... Last-N-days replay for the History pane
│   │   ├── lab/                 Lab-artifact parsers (Phase 2A)
│   │   │   ├── mod.rs ........ Module root
│   │   │   ├── vital_signs.rs  CLAUDE.md ASCII-box parser
│   │   │   ├── dispatch.rs ... war-room-dispatch.md parser + insert_finding
│   │   │   ├── signals.rs .... laboratory-pulse.md Pending Signals parser
│   │   │   └── wounds.rs ..... `.claude/memory/wounds/` listing by mtime
│   │   ├── drydock/             Phase 3A Drydock parsers + bridge
│   │   │   ├── mod.rs ........ Module root, re-exports
│   │   │   ├── repo_registry.rs Canonical list of 12 lab repos
│   │   │   ├── bridge.rs ..... Non-pty subprocess via WSL2 bridge
│   │   │   ├── minion_touch.rs Parse git log for minion-stamped commits
│   │   │   ├── chaos_detonations.rs Scan chaos-reports for filename hits
│   │   │   └── active_log.rs . Find IN PROGRESS / PLANNING log by scope
│   │   └── commands/
│   │       ├── mod.rs ........ Command surface registry
│   │       ├── pty.rs ........ Pty IPC surface (Phases 1A + 1C)
│   │       ├── files.rs ...... Mission Control reads + dispatch write (Phase 2A)
│   │       ├── chronicle.rs .. History read + disclosure ack (Phase 2B)
│   │       ├── github.rs ..... `gh` enumeration + review actions (Phase 3A)
│   │       └── artifacts.rs .. The three enrichment readers (Phase 3A)
│   ├── Cargo.toml ............ Pinned to tauri 2, plugins-2, portable-pty 0.8
│   ├── tauri.conf.json ....... productName, window 1440x900, identifier
│   ├── capabilities/default.json  Window + plugin permissions
│   └── icons/ ................ PLACEHOLDER copies from horadric-cube;
│                                Phase 4 swaps for vise/calliper iconography
├── src/
│   ├── App.vue ............... Top-level shell — TopBar + Rail + Canvas + CommandBar
│   ├── main.ts ............... createApp + UnoCSS
│   ├── shell/                 Frame: top bar, left rail, panel chrome
│   │   ├── TopBar.vue ........ Mission Control / Drydock / Dossier panel toggles
│   │   ├── ExperimentRail.vue  Left rail — 6 tabs with pulse dots
│   │   └── useShell.ts ....... openPanel + togglePanel/closePanel singleton
│   ├── session/               Pty session domain (state, buffers, recency)
│   │   ├── SessionCanvas.vue . Center xterm.js stack — one wrapper per experiment, only active visible
│   │   ├── PulseDot.vue ...... 5-state animated indicator
│   │   ├── useSessions.ts .... Singleton pulse state, recency, active focus
│   │   ├── useTerminals.ts ... Singleton xterm Terminal pool (one per experiment, lazy, persistent)
│   │   └── types.ts .......... ExperimentId / SessionState / EXPERIMENTS table
│   ├── command/               Always-on input tray
│   │   └── CommandBar.vue .... Always-focused bottom input + @<exp> routing
│   ├── mission/               Mission Control panel slice (Phase 2A)
│   │   ├── MissionControl.vue  Slide-in panel, refresh-on-open, Escape closes
│   │   ├── VitalSigns.vue ... Five-stat grid + last-chaos line
│   │   ├── WarRoomDispatch.vue Active-findings list + Compose button
│   │   ├── MinionsDue.vue ... Pending-signals list
│   │   ├── WoundsAtThreshold   Wound directory listing (most-recent N)
│   │   ├── ComposeDispatch.vue Templated editor; writes back on save
│   │   ├── useMissionControl.ts Singleton state + parallel refresh
│   │   └── types.ts .......... Mirrors `src-tauri/src/lab/*` serde structs
│   ├── chronicle/             Chronicle slice (Phase 2B)
│   │   ├── HistoryPane.vue ... Read-only feed of last 7 days, overlays canvas
│   │   ├── PrivacyDisclosure.vue One-time blocking modal at first boot
│   │   ├── useHistory.ts ..... Singleton state + read_chronicle_history
│   │   ├── useDisclosure.ts .. Boot-time ack check + acknowledge() flow
│   │   └── types.ts .......... ChronicleTurn / TurnDirection
│   ├── drydock/               Drydock slice (Phase 3A)
│   │   ├── DrydockPanel.vue .. Slide-in panel, refresh on open, Escape closes
│   │   ├── PrCard.vue ........ Per-PR collapsible card, header + expanded body
│   │   ├── FileDiff.vue ...... Per-file enrichment (minion / chaos / active-log)
│   │   ├── ReviewActions.vue . Approve / Comment / Request Changes with body
│   │   ├── useDrydock.ts ..... Singleton state + IPC + per-PR file/enrichment cache
│   │   └── types.ts .......... DrydockPullRequest, FileEnrichment, ReviewVerdict, …
│   └── assets/workbench.css .. Auxiliary CSS (almost empty — UnoCSS does the work)
├── tests/                      Mirrors src/ slices — all *.spec.ts live here
│   ├── App.spec.ts ............ Composition smoke test (rail click → canvas focus)
│   ├── shell/ ................. TopBar / ExperimentRail / useShell specs
│   ├── session/ ............... SessionCanvas / PulseDot / useSessions / types specs
│   ├── command/ ............... CommandBar spec
│   ├── mission/ ............... MissionControl + 4 sections + ComposeDispatch + useMissionControl specs
│   ├── chronicle/ ............. HistoryPane + PrivacyDisclosure + useHistory + useDisclosure specs
│   └── drydock/ ............... DrydockPanel + PrCard + FileDiff + ReviewActions + useDrydock specs
├── uno.config.ts ............. Bench palette: wb-surface, wb-rail, wb-canvas, wb-pulse-*
├── vite.config.ts ............ Vue + UnoCSS plugins, port 1430
├── .oxlintrc.json ............ War-room canonical oxlint config (correctness:error, type-aware)
├── vitest.config.ts .......... jsdom + v8 coverage with 90% thresholds
└── tsconfig.json ............. Strict, no path aliases — slices import relatively
```

### The Frontend Foundation (war-room standards)

The Vue side is laid out as **vertical slices** in the spirit of war-room
ADR-0014: each slice owns its components, composables, and types together
under `src/{slice}/`. Slices import from each other relatively
(`../session/types`), not through a `@/` alias — the slice boundary is
the source of truth, not a global root.

Tests mirror that layout under `tests/{slice}/*.spec.ts` (matching the
lab's gadget convention of a top-level `tests/` directory). Test files
reach back into source via `../../src/{slice}/{name}` — explicit, no
magic alias.

State lives in **module-singleton composables**, not Pinia:

- `session/useSessions.ts` — pulse state per experiment, LRU recency,
  active-experiment focus. The pty byte stream lives in xterm.js
  Terminals (`useTerminals.ts`); this composable holds only the
  rail/pulse-dot facing state.
- `session/useTerminals.ts` — module-singleton pool of xterm `Terminal`
  instances, one per experiment. Created lazily on first activation
  and kept alive for the gadget's lifetime so cursor, scrollback, and
  half-typed input survive tab switches and LRU subprocess eviction.
- `shell/useShell.ts` — which top-bar panel (if any) is open.

Each composable exports a `reset()` that tests call in `beforeEach` to
isolate from other tests. The singleton state survives across `useX()`
calls within a single mount, which is the property the rail and canvas
both depend on. No Pinia, no provide/inject ceremony, no factory layer
that nothing else asks for.

**Test coverage** runs at v8 with 90% line/branch/function/statement
thresholds (`npm run test:coverage`). Phase 1A scaffold sits at 100%
lines, 95% branches across 53 tests — every component, composable,
and the App composition itself.

## Phase Roadmap

The deployment plan lives in `documents/experiment-logs/00048-the-workbench.md`.
Status pointer for Claude when reopening this lab journal:

| Phase | Scope | Status |
|-------|-------|--------|
| 1A | Tauri scaffold + Apprentice retirement + Sentinel CI | ✅ Closed 2026-04-30 |
| 1B | The Floor — window, rail, command bar wired to mock data | ✅ Closed 2026-05-03; ratified on Windows 2026-05-11 |
| 1C | Pty integration — `portable-pty` + `wsl.exe` substrate spike + live sessions | ✅ Closed 2026-05-03 (Linux); ratified on Windows 2026-05-11 — substrate path-separator bug fixed (PathBuf::join → POSIX string join, regression test added), xterm.js + FitAddon now host the pty stream, `resize_session` plumbs cols/rows. Substrate criteria 2–4 directly verified by live `claude` boot, not just compile-time |
| 2A | Mission Control panel (Vital Signs + dispatch + minion-due + wounds) | ✅ Closed 2026-05-03 — slide-in panel reads CLAUDE.md vital-signs box, `documents/war-room-dispatch.md`, `documents/laboratory-pulse.md` Pending Signals, and `.claude/memory/wounds/`; Compose Dispatch templated editor splices `### N. Title` blocks ahead of `## Resolved`. 23 new vitest specs (77→100), 18 new Rust tests (15→33), all five containment protocols green |
| 2B | The Chronicle — JSONL transcript writer + History pane | ✅ Closed 2026-05-03 — `chronicle::writer` appends `{ts, direction, payload}` per pty turn, rotates files at local midnight, paused at boot until the investor acks `PrivacyDisclosure`. `chronicle::reader::history(dir, exp, days)` replays last N days; tolerates malformed lines. New `src/chronicle/` slice with HistoryPane (overlays SessionCanvas) and PrivacyDisclosure (one-time blocking modal — stands in for the Phase 4A wizard's privacy-ack subset). 12 new Rust tests (33→45), 17 new vitest specs (100→117), all five containment protocols green |
| 3A | The Drydock — PR review with three artifact-derived enrichment fields | ✅ Closed 2026-05-11 — `drydock/` module (12-repo registry + non-pty WSL2 bridge + three pure parsers for last-minion-touch / chaos-detonation / active-experiment-log). New `commands/github.rs` (`gh_auth_status`, `list_open_prs` enumerating 12 lab repos, `pull_request_files`, `approve_pr` / `comment_pr` / `request_changes_pr` via `gh pr review --body-file -`). New `commands/artifacts.rs` (three readers feeding the parsers from disk). New `src/drydock/` slice: DrydockPanel slide-in, PrCard with collapsed/expanded states, FileDiff with three enrichment fields per file, ReviewActions (Approve / Comment / Request Changes). 44 new Rust tests (45→89), 27 new vitest specs (117→144), all five containment protocols green |
| 3B | Experiment Dossier — read-only context panel | Pending 3A |
| 4A | First-run wizard | Pending Phase 3 |
| 4B | Retirement verification (Apprentice retirement was enacted in Phase 1A) | Pending 4A |

**The first act of Phase 1C is a load-bearing spike** validating that
`portable-pty` can wrap `wsl.exe` cleanly on Windows. The spike's failure
mode is not "build slowly" — it is "stop and re-architect." Substrate
verification before any UI work depends on live sessions.

## Commands

```bash
# From gadgets/workbench/
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

- **Does not deploy to a server.** No Railway, no `/up` health check, no
  public URL. The Workbench is a desktop binary the investor runs locally.
- **Does not edit code.** It directs `claude` to edit code. The Workbench
  is a commander surface, not an editor surface — that distinction is
  load-bearing for every UI decision.
- **Does not duplicate VS Code.** No tree explorer, no diff viewer (Phase 3
  shows PR diffs but only with enrichment, not as an editor), no extension
  ecosystem. If a feature would compete with VS Code's existing surface,
  it does not belong here.
- **Does not enforce the doctrine on writes.** Pre-commit hooks enforce
  the doctrine server-side. The Pulpit (idea #08, killed) would have
  duplicated that with worse latency. The Compose Dispatch button in
  Mission Control is the only write affordance, and it writes prose, not
  code.

## Cross-References

- Source experiment log: `documents/experiment-logs/00048-the-workbench.md`
- Source idea ledger: `documents/idea-ledgers/idea-ledger-cockpit.md`
- Substrate precedent: `gadgets/horadric-cube/CLAUDE.md`
- Apprentice tombstone: documented in
  `documents/idea-ledgers/idea-ledger-cockpit.md` § TOMBSTONE
