# Conversation images and local file links

Graphite's explicit Markdown links to absolute laboratory paths now open a local
file dialog. PNG, JPEG, GIF and WebP files load on click; the viewer offers Fit
image / Actual size and Show in folder. Escape closes the dialog and the native
modal returns keyboard focus to the link. Other file types offer Show in folder
without executing or reading them into the webview. A Markdown image reference
is also a clickable preview, rather than an automatic disk read.

This fixes links such as `[Tavern icon](/home/user/lab/output/tavern.png)` in a
recorded assistant reply. Percent-encoded spaces and source `:line:column`
suffixes are supported. Bare prose filenames, remote images, generated-image
tool events and the Scientist's terminal are unchanged. Save generated artwork
inside the configured laboratory and include a Markdown file link in the reply.

## Native boundary

`src-tauri/src/heretic/files.rs` accepts only absolute POSIX paths inside the
configured lab root. It rejects traversal, repeated slashes, control characters,
Windows device names, drive/UNC namespaces and alternate streams before I/O.
The existing host-path resolver maps the trusted root into the configured WSL
distribution on Windows. Canonical targets must remain under that root. Image
reads additionally check the opened handle's path (Linux `/proc/self/fd`, Windows
`GetFinalPathNameByHandleW`) before reading bytes; raster signatures must match
the extension and the read is bounded to 12 MiB. I/O runs off the UI thread.

No Tauri asset scope or filesystem capability is widened. The native file action
uses reveal-in-folder, never an arbitrary ShellExecute/open command. Blob URLs
are revoked when closing/unmounting; late responses from closed dialogs are
ignored. Missing, oversized, refused and undecodable images have visible errors.

The configured laboratory is trusted local storage. This is not a sandbox against
an adversarial process that can concurrently rewrite that root or filesystem
namespace; the opened-handle check prevents returning bytes from an escaped
image, while folder reveal remains a path-based operating-system operation.

Screenshot and receipts: [image viewer evidence](documents/image-viewer/).

## Verification, 22 October 2026

- 713 frontend tests; coverage: 97.22% statements, 90.94% branches,
  96.53% functions, 98.09% lines. All four 90% gates pass.
- 247 Rust tests pass; one existing opt-in live conversation smoke ignored.
- Production build, typecheck, formatting, lint (existing warnings), version
  lockstep and strict Clippy pass. Focused tests rerun after review corrections.
- `scripts/witness-image-preview.cjs` exercises the actual Vue renderer and native
  browser dialog with simulated Tauri I/O: six groups pass, zero browser errors.
  It covers click-driven reads, Enter/Escape and focus return, fitting/actual size,
  reveal dispatch, missing-image retry, non-image handling and remote-image refusal.
  The real Tavern PNG is the fixture; no live profile is changed.

Run a preview on port 1432, then supply `PLAYWRIGHT_MODULE`, `CHAT_CHROME`,
`IMAGE_FIXTURE` (a real PNG), and optionally `IMAGE_ARTIFACTS` to the witness.
The isolated HTML harness lives at `/scripts/image-preview-witness.html` and
uses the production MarkdownReply and LocalFilePreview components.

Native Windows probes also pass: the exact opened-handle helper recognizes the
real Tavern PNG through the configured WSL UNC root; absolute/relative escaping
file symlinks and an escaping directory symlink fail canonicalization before
reading. Shell ID conversion and SHOpenFolderAndSelectItems return success
(HRESULT 0) for the PNG using the path normalization already present in pinned
tauri-plugin-opener 2.7.2. These are targeted native API probes, not the full app.

Installed Windows/WebView acceptance remains a release-time check. Browser mocks do not establish those outcomes. No release
or installed binary change is part of this source revision.

## Follow-up outside this change

The existing null CSP remains unchanged. A separately scoped CSP review could
add a second script-execution boundary around Markdown rendering and local IPC;
it needs validation across the entire app, its workers and blob image previews.
