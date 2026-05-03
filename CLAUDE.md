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
- **Async:** `tokio` for the read/write pumps
- **Persistence:** `tauri-plugin-store` for first-run wizard config
  (lab root path, claude binary path, transcript acknowledgment)
- **HTTP:** `tauri-plugin-http` (allowlisted to GitHub API hosts when
  Phase 3A's Drydock lands; not yet allowlisted in Phase 1A)
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
│   │   ├── chronicle/
│   │   │   └── mod.rs ........ ChronicleTurn type (Phase 2B writes the file)
│   │   └── commands/
│   │       ├── mod.rs ........ Command surface registry
│   │       └── pty.rs ........ list_sessions / session_state (Phase 1A reads)
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
│   │   ├── SessionCanvas.vue . Center pty output pane (last 200 lines)
│   │   ├── PulseDot.vue ...... 5-state animated indicator
│   │   ├── useSessions.ts .... Singleton state, ring buffers, recency, focus
│   │   └── types.ts .......... ExperimentId / SessionState / EXPERIMENTS table
│   ├── command/               Always-on input tray
│   │   └── CommandBar.vue .... Always-focused bottom input + @<exp> routing
│   └── assets/workbench.css .. Auxiliary CSS (almost empty — UnoCSS does the work)
├── tests/                      Mirrors src/ slices — all *.spec.ts live here
│   ├── App.spec.ts ............ Composition smoke test (rail click → canvas focus)
│   ├── shell/ ................. TopBar / ExperimentRail / useShell specs
│   ├── session/ ............... SessionCanvas / PulseDot / useSessions / types specs
│   └── command/ ............... CommandBar spec
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

- `session/useSessions.ts` — pty state, 200-line ring buffers per
  experiment, LRU recency, active-experiment focus.
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
| 1B | The Floor — window, rail, command bar wired to mock data | ✅ Closed 2026-05-03 (Windows boot smoke-test deferred to first investor `tauri dev`) |
| 1C | Pty integration — `portable-pty` + `wsl.exe` substrate spike + live sessions | ⏳ Substrate spike + live-session manager + spawn/write/kill commands + frontend wiring landed 2026-05-03 (Unix substrate verified, Windows substrate compiles & is staged for investor). Remaining: LRU eviction at the 4th tab click, `@<exp>` prefix routing in the command bar, working/awaiting debounce on the pulse dot, and end-to-end smoke test on Windows. |
| 2A | Mission Control panel (Vital Signs + dispatch + minion-due + wounds) | Pending Phase 1 |
| 2B | The Chronicle — JSONL transcript writer + History pane | Pending 2A |
| 3A | The Drydock — PR review with three artifact-derived enrichment fields | Pending Phase 2 |
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
