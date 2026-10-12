# The Heretic’s margin — 12 October 2026

The investor asked to spice up the Heretic’s Mezzanine chat, with clickable links
as the minimum, then explicitly chose to explore a richer chat view with formatted
replies and code blocks. The investor subsequently chose **Graphite** and requested its integration plus
a PR. The study below preserves the original proposal; the live implementation
and its separate evidence are documented in [GRAPHITE.md](../../GRAPHITE.md).

## Try the study

From the Mezzanine directory, run `npm run dev` and open
<http://localhost:1430/studies/heretic-chat/>. It is an isolated Vite entry, not
included in the production app. Both colleagues remain visible.

- **Graphite / Paper:** compare the reading surface against the existing dark
  terminal and the ink figures below. Graphite is the initial proposal: it fits
  the surrounding balcony with less visual contrast. Paper is a deliberate
  alternative that extends the floor’s journal atmosphere into the conversation.
- **A reply / At work / A question:** inspect three scripted conversation states.
- Expand the work trace, copy the code, follow references, pin a reply, revisit
  it through **Margin**, and use **Latest** to return to the bottom.
- **Compact spacing** reduces the reply’s vertical footprint.

The content is authored Vue markup demonstrating formatted replies, not a general
Markdown renderer. Code colouring is authored for this example. Pins and choices
are page-local and reset on reload. The composer is a labelled noninteractive
preview. The Mad Scientist’s displayed text is also scripted, not correspondence.
The floor reuses the real figure renderer in a simplified static setting; it is
not the production Long Bench. No live session is created or replaced.

## The small change in the real app

`src/roster/terminalLinks.ts` supplies one activation path for ordinary web URLs
and named OSC 8 links. The terminal pool loads the official web-links addon and
sets xterm’s explicit-link handler. Both routes use the existing Tauri opener.

Ctrl/Command + primary click opens HTTP(S) links. Plain clicks preserve terminal
selection behaviour. Hover exposes the actual destination. Failed opens produce a
dismissible notice on the relevant bench. Other protocols and local file paths
are not handed to the operating system. That initial link-only patch made no permission or Rust changes.
The existing [xterm link-handling guide](https://xtermjs.org/docs/guides/link-handling/)
describes the two distinct link sources and modifier behaviour.

This fix is implemented and browser-tested in source. It has **not** been built
into or validated through the installed Windows app.

## Original integration hypotheses (superseded by the live reader)

The current Mezzanine transports PTY output, not message objects. Attempting to
recover rich messages from rendered terminal lines would inherit line wrapping,
cursor movement, and CLI presentation changes. A transcript mirror would preserve
the existing terminal but add a second history source with identity and ordering
risks. For a full replacement, the stronger candidate is a native adapter to
Codex’s structured app-server protocol, with the Mad Scientist’s terminal retained.

The [official app-server documentation](https://learn.chatgpt.com/docs/app-server)
describes threads, streaming items and server requests. Local schema generation
with **codex-cli 0.155.1** confirmed `agentMessage`, `commandExecution`, and
`fileChange` items, plus `item/agentMessage/delta` identifiers for thread, turn and
item. This is interface evidence only: no live model or Windows bridge was tested.

Before replacing the terminal, a bounded integration experiment must demonstrate:

1. One exact Heretic session through Windows → WSL, existing account/configuration
   and permissions, correct startup and child-process shutdown.
2. Ordered streamed replies and tool output, interrupted/failed turns, and reload
   recovery without repeating or losing content.
3. Working user questions and approval requests, steering and cancellation. A
   presentation client takes responsibility for these interactions.
4. Speaking Tube attachment to that exact thread and verified queued delivery.
   The current CLI listener must not be assumed to work in a new adapter.
5. A real Markdown renderer with escaped code and disabled raw HTML; deliberate
   browser/file destinations through the appropriate native bridge.

The study proves the proposed interactions are buildable, not that this integration
is complete. It does not replace the existing fresh-conversation startup policy.

## Original study verification

Browser witness: `scripts/witness-heretic-chat.mjs`, with `PLAYWRIGHT_MODULE`
pointing to an available Playwright installation and `CHAT_CHROME` to its Chromium
binary if required. `CHAT_ARTIFACTS` changes the output directory (default
`/tmp/mezzanine-heretic-chat`). Run against the local Vite server.

The witness checks clipboard copy, pin/revisit, real reference destinations,
working/question states, Latest scrolling, 1080×720 layout, reduced motion, and
real xterm interactions for plain, OSC 8 and wrapped URLs. Only the Tauri IPC
boundary is simulated for those terminal checks. It records zero browser errors.
Screenshots and the bounded receipt are retained in `evidence/`.

The production frontend build and formatting checks pass. The full frontend suite
passed **779 tests** before the final additional notice-display regression; the
affected two suites then passed **21 tests**, including that new regression. The
build retains its existing large-chunk warning. No Rust source changed. No
installed Windows validation, deployment, PR, or release is claimed.
