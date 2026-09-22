# Pages with conversations that survive navigation

The investor requested pages instead of overlay tabs, using the War Tent as
inspiration, and explicitly chose: “Keep running; restore on return.”

| Page | Contents | Previous location |
| --- | --- | --- |
| Conversation | Both colleagues, Speaking Tube status, independent terminals, shared command bar and expandable ink floor | Main frame |
| Mission Control | Last Chaos, Idea Ledger, vital signs, minions due and wounds | Right overlay; signs were in the global header |
| Drydock | Open PRs, diffs and review actions | Right overlay |
| Holotable | Interactive laboratory map | Overlay across the conversation |
| Grind | Laboratory economy, buildings, upgrades and theorems | Overlay across the conversation |
| Briefs | Minion briefs sent to the Mad Scientist's existing session | Dropdown sheet covering the conversation |

Navigation selects a page; selecting it again leaves it open. Pages fill the
content area and have no overlay close button or global Escape dismissal.
Wizard and updater prompts keep their existing task-specific behavior.

## Conversation lifetime

`App.vue` owns native event subscriptions, colleague startup, observer updates
and the Grind economy. `ConversationPage.vue` owns the entire conversation
composition and is hidden with `v-show`, never unmounted on a page change.
The terminals keep receiving output; their DOM elements, history, command-bar
draft and recipient remain in place. Navigation never opens or recalls a colleague.
Closing the desktop app still ends its sessions, as before; this change does not
add session persistence across application restarts or extend xterm's 5000-line cap.

The War Tent's `App.vue` and `generals/SeatTerminal.vue` supplied two relevant
precedents: preserve the mounted conversation and skip zero-size terminal fits.
Keeping the PTY alive alone does not preserve xterm's history. Fitting a hidden
terminal can reflow it to two columns and exhaust its scrollback capacity.

The browser experiment also exposed a second problem: xterm changes the reading
position when a returning page fits a resized window. Markers anchor readers who
have scrolled up. The bookmark survives background output and reflow; readers
at the live end continue following new output. Restoration waits for layout,
synchronizes the scrollbar through public APIs, then returns to the bookmarked
line. A marker trimmed out of the bounded history is not restored.

Canvas visibility is independent of session lifetime: leaving Conversation pauses
the ink floor; Holotable and Grind initialize on first visit and pause when hidden.
The floor keeps its existing reduced-motion handling. The composition audition
(wireframe #00041) ruled Direction C, the Long Bench. It shipped in v0.3.2:
`compactFloor` now defaults to the expanded 200px bench, and the `⌃` control
crops the same drawing to 64px. The floor's walk and crossing state lives in
the scene and survives a page change. A colleague caught mid-crossing is still
mid-crossing on return. A letter that arrived while another page was showing is
already in the receiver's hand at the bell, and is never replayed.

## Browser receipts and installation boundary

All 564 frontend tests pass. Coverage clears the four 90% gates: 95.56%
statements, 90.67% branches, 93.11% functions and 96.38% lines. Lint has no
errors; formatting and the typechecked production build pass.

Real Chromium, simulated Tauri commands/events, and actual Vue/xterm rendering:

- Exactly two opening calls, zero recalls while visiting all five other pages.
- Both terminal elements survive; output injected while away reaches both buffers.
- The unsent draft survives; the reading position remains line 20 before and after
  resizing from 1440×900 to 1080×720 while Conversation is hidden.
- Hidden terminal dimensions do not change. On return the panes fit the new size;
  each terminal wrapper has 443px of height at 1080×720. No horizontal overflow or
  page errors occurred.
- Screenshots: `documents/mezzanine-conversation-page.png`,
  `documents/mezzanine-conversation-compact.png`, and
  `documents/mezzanine-mission-page.png`. Their terminal content is synthetic.

Repeat the browser check with a running Vite server and a Playwright installation:
`node scripts/witness-pages.cjs`. If Playwright is installed outside this project,
set `PLAYWRIGHT_MODULE` to that installation's module path. The script stubs the
entire Tauri boundary; it does not open real model sessions or send real messages.

The installed Windows executable has not been replaced or revalidated for this
revision. Browser receipts do not establish native WebView2 behavior or live CLI
reception. The older installation receipts in `TWO-COLLEAGUES.md` describe the
previous executable, not this page revision.
