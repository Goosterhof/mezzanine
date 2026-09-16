# Two colleagues, one balcony

The investor requested one Mad Scientist and the Heretic, replacing the
Mezzanine's many-Claude roster, with the Speaking Tube ready on entry.

The existing PTY/xterm architecture remains. A new native colleague identity and
an atomic `open_colleague` command enforce one live session per identity within
the app. This avoids replacing the proven terminal integration with a second
chat client or API harness. The two terminals start after setup and event
subscription, and remain visible side by side with independent scrollback:
Mad Scientist on the left, Heretic on the right. Selection changes input focus
and the named command-bar recipient; it never hides either pane. Closing the app
ends both sessions; reopening starts fresh model conversations. Chronicles stay
on disk. Legacy anonymous roster records receive a backup before retirement.

The Heretic is a full scientist on the ink floor, distinguished by amber glasses
and a scarf. Its nameplate introduces Codex as the constructive rival. `Brief`
reuses the existing Mad Scientist terminal. The old independent Claude
Town-Crier patrol is no longer launched or exposed in this app.

## Private correspondence

Claude uses the laboratory's one project MCP definition, with a launch-scoped
connection UUID and channel opt-in. Codex uses explicit per-launch MCP arguments
and an opening turn that reads its own `CODEX_THREAD_ID` and calls `tube_connect`.
No hook installation, trust bypass, latest-session guess or detached background
watcher is involved. This initial tool call is a model action: until it succeeds,
the UI reports connecting. Normal CLI login, project trust, and MCP approval
prompts still apply.

Both servers use the same absolute mailbox. Their heartbeat IDs match the native
roster, so other laboratory sessions cannot produce a false connected light.
Codex queue failures retry without acknowledging mail. The MCP session owns the
poller, and shutdown waits for a bounded in-flight queue call before closing its
database. A listener heartbeat is not proof of model reception or handling.

The installed Codex 0.154.0 CLI supplied `--no-alt-screen`, MCP `-c` overrides
and `queue`; a model-free startup probe confirmed that MCP subprocesses do not
receive `CODEX_THREAD_ID` automatically. The opening-turn attachment avoids
assuming otherwise. The official [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
is the reference for per-launch configuration. Existing tube experiments proved
Codex notice reception between turns; mid-turn interruption is not claimed.

## Verification receipts

- Frontend: 543 Vitest tests pass after removing 35 tests of the retired
  Town-Crier UI; typecheck, lint, format and Vite build pass.
- Rust: 233 tests pass, including real PTYs with inert `sleep` children for
  singleton reuse, two independent identities, restart and legacy migration.
  Clippy with `-D warnings` and Linux native build pass.
- Speaking Tube: session attachment, literal target routing, retry, unchanged
  receipts and shutdown are tested with real MCP subprocesses, temporary
  databases and a fake Codex executable. All 21 tests pass. An explicit stdin
  EOF regression covers Codex closing its MCP pipe without sending SIGTERM;
  the heartbeat stops and the server exits. No personal chat receives test mail.
- Chromium: both benches open exactly once, repeated selection creates no new
  session, and no legacy dispatch/patrol command is invoked. No page errors or
  horizontal overflow at 1440×900 and 1080×720. Tauri responses and terminal
  output are simulated in this browser check. Both xterm screens are mounted
  side by side; typing directly in the left pane and sending from the shared
  command bar to the right pane each reach only their intended colleague.

- Windows: production executable built with `custom-protocol`; actual WebView2
  loaded `http://tauri.localhost/` without a development server. An isolated data
  folder using the investor's existing wizard choices started exactly two real
  CLI sessions. Both current roster UUIDs obtained live mailbox heartbeats:
  Claude `channel`, Codex `queue` bound to its own `CODEX_THREAD_ID`. The displayed
  labels settled to `Tube listening` and `Tube listening · between turns`.
  The final side-by-side build also passed the real WebView layout check with
  the development server stopped. Both panes showed live CLI output. Closing
  that test window changed both matching listener heartbeats to `closed`,
  verifying the stdin-EOF cleanup fix through Windows and WSL. Real cross-bench letter
  handling was not exercised by this walkthrough; delivery/receipt semantics
  have separate MCP integration coverage above.

Claude Code can ask for confirmation of its local development channel when a
bench opens. Confirm `I am using this for local development` in that terminal;
the app does not bypass this CLI prompt. The installed shortcut walkthrough
confirmed both listeners after that prompt was accepted.

The investor confirmed the installed result on 2026-09-16: “everything is working”,
and requested PR review by the General.

## Review follow-up

The General reported no blockers and one dead-code cleanup item. Removed the
unreachable Town-Crier panel, composable, lamp, types and their two spec files,
plus the retired panel ID, its two shell tests and the stale Balustrade test import. The active terminal and tube behavior is
unchanged. The refreshed frontend gates pass in the isolated PR checkout.

## Running the updated app

The new Mezzanine and the parent laboratory's new Speaking Tube sources must be
used together. In the configured WSL/Linux laboratory:

```sh
npm ci --prefix gadgets/speaking-tube
```

Node 24+, signed-in `claude` and `codex` in the login-shell PATH, and a Codex CLI
with `queue` are required. The existing wizard's Claude override is honored.
Windows detects its default WSL distribution (this machine uses `Ubuntu-24.04`)
instead of assuming a distribution named `Ubuntu`. `MEZZANINE_WSL_DISTRO` still
overrides it. Background mailbox checks do not open console windows.
When Node is absent from that non-interactive shell, the launcher loads the
existing default from `~/.nvm/nvm.sh`. It does not change shell startup files.
Claude's variadic channel option is terminated with `--` before the opening
prompt; otherwise the CLI consumes the greeting as another channel name.
Build/run the desktop from this gadget with `npm run tauri dev`, or use the
updated Windows executable. Existing released installers are not silently
replaced by a source checkout change.

For a direct Windows Cargo build, build the frontend first and pass
`--release --features custom-protocol`; the feature embeds the frontend instead
of depending on the development server.

On 2026-09-16 the verified 0.3.0 executable replaced the installed copy at
`C:\Users\goost\AppData\Local\The Mezzanine\mezzanine.exe`; desktop and Start
Menu shortcuts still target that path. The previous executable is backed up
beside it as `mezzanine.exe.0.2.6-20260916-204737.bak`. The copied executable's
SHA-256 matches the tested build. This is a local executable update, not a
published GitHub release or replacement installer.

The same installation was then updated with the investor's requested permanent
side-by-side layout; the original 0.2.6 backup remains available.
