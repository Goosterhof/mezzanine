# Experiment Log #00054 — The Ascent

> The balcony learns to rebuild itself. A newer balcony arrives from the
> floor below; the investor is asked, descends to raise it, and returns
> upstairs. Auto-update for the Mezzanine — checked and prompted, never
> silent.

| Field | Value |
|-------|-------|
| Gadget | The Mezzanine (`zmuuzn/gadgets/mezzanine/`) |
| Predecessor arc | #00053 — The Grind (absorption trilogy closed) |
| Status | **PLANNING** (drafted 2026-06-02) |
| Deployment target | Windows-with-WSL2 (the only target — see #00049 Phase 2D) |
| Substrate touched | None — the WSL2 bridge is orthogonal to the Windows shell |

---

## §1 — Why an Ascent

Every shape this gadget has worn — the Apprentice, the Workbench, the
Mezzanine — has been a binary the investor runs locally and updates by
hand: pull, `cargo tauri build`, copy the installer, click through. The
absorption trilogy (#00051–#00053) folded three VS Code gadgets into the
Mezzanine, which means the balcony is now the investor's *single* daily
surface. A single surface that updates by hand is a single surface that
drifts: the installed `.exe` falls behind the branch, and a fix that
landed weeks ago never reaches the balcony the investor actually stands
on.

The Ascent closes that gap. The Mezzanine is a **Tauri v2** binary, and
Tauri ships a first-party updater (`tauri-plugin-updater`). The work is
not invention; it is wiring the plugin, minting signing keys, standing up
a release pipeline this repo does not yet have, and dressing the prompt
in the balcony voice.

This arc does **not** change the substrate. Auto-update concerns the
Windows shell — the `.exe` the investor double-clicks — not the `claude`
sessions dispatched downstairs through `wsl.exe`. The roster, chronicle,
holotable, observer, and grind slices are untouched.

---

## §2 — Resolved Decisions

### RD-1 — Host on GitHub Releases (the "no server" tension, resolved)

CLAUDE.md § *What This Gadget Does NOT Do* states: *"Does not deploy to a
server. No Railway, no `/up` health check, no public URL."* The Ascent
needs a URL serving an update manifest and signed bundles, which looks at
first glance like a violation.

It is not. That principle forbids the Mezzanine **operating a running
service** — a process the investor must keep alive, monitor, and pay for.
GitHub Releases is **static artifact hosting**: files at rest behind
`github.com`, no process, no uptime obligation, nothing to monitor. The
repo already lives on GitHub (`goosterhof/mezzanine`) and the investor's
`gh` auth already lives in WSL2 (used by the Drydock). Reusing that
surface costs nothing new.

**Decision:** the updater endpoint points at the repository's GitHub
Releases. The manifest is published as a release asset; the updater reads
it over HTTPS. No service is operated.

### RD-2 — Check-and-prompt, never silent

The Mezzanine's load-bearing metaphor is that **the investor directs**.
Scientists go downstairs; the investor watches, decides, and recalls. A
silent background auto-install would have the gadget act without the
investor's word — structurally the same mistake the bench era made by
putting the investor *inside* the work.

**Decision:** the Ascent **checks** for a newer balcony and **asks**. The
investor chooses to descend (download + install + relaunch) or to stand
pat. No download begins without consent; no relaunch happens unannounced.
The check itself runs once on boot (after the first-run wizard clears)
and on demand from a balcony affordance.

### RD-3 — NSIS is the update target; MSI remains for first install

The bundle emits both `msi` and `nsis` (`tauri.conf.json:36`). Tauri's
updater is happiest with **NSIS** on Windows — the NSIS installer
supports the silent in-place reinstall the updater drives. MSI updates
carry WiX-side caveats (elevation, product-code matching) that fight the
updater's flow.

**Decision:** the MSI target stays for the *first* install and for
investors who prefer it; the **updater artifacts are generated from the
NSIS target**. The endpoint manifest advertises the NSIS bundle. (This is
a config choice in `bundle` + `plugins.updater`, not a code branch.)

### RD-4 — Key custody: public in the tree, private in CI secrets

Tauri's updater refuses any update whose signature does not verify
against a baked-in public key. This is the security spine of the feature
and the one piece with no graceful recovery: **lose the private key and
no future build can produce an update the installed balcony will accept.**

**Decision:**
- The keypair is generated once (`tauri signer generate`) and the
  **private key is escrowed by the investor** outside the repo (password
  manager / offline copy), then stored as the GitHub Actions secrets
  `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- The **public key is committed** to `tauri.conf.json` under
  `plugins.updater.pubkey`.
- The private key is **never** committed, logged, or echoed. `.gitignore`
  gains an explicit guard for `*.key` to prevent accident.

### RD-5 — A thin Rust side; the weight is config + CI + one Vue slice

The `@tauri-apps/plugin-updater` JS API (`check()` →
`downloadAndInstall()`) carries the runtime flow directly from the
frontend; relaunch comes from `@tauri-apps/plugin-process`. The Rust side
is therefore **plugin registration + capability grant + config**, with at
most a thin command to report the running version for the prompt copy.

**Decision:** no new Rust *module* is required. The new code is a single
Vue slice — `src/ascent/` — mirroring the slice discipline of war-room
ADR-0014, with tests under `tests/ascent/` to hold the 90% coverage gate.

---

## §3 — The Voice

The Ascent's surfaces are locked to the balcony register (per #00049 §The
Voice). Vocabulary: the floor below, descend, raise, the balcony stands.
Not "download/install/patch" in chrome copy — those are mechanism, not
voice.

| Surface | The Ascent Voice |
|---------|------------------|
| Up to date | *"Balcony current. Nothing waiting below."* |
| Update available (prompt) | *"A newer balcony stands ready — v{version}. Descend to raise it?"* |
| Prompt actions | *"Descend"* / *"Stay upstairs"* |
| Downloading | *"Raising the new balcony… {pct}%"* |
| Installing / relaunch | *"Stepping down while the balcony is rebuilt. Back upstairs in a moment."* |
| Check failed (network) | *"Could not see the floor below. The balcony stands as it is."* |
| Signature rejected | *"That balcony was not stamped by the laboratory. Refused."* |

The signature-rejected line matters: a verification failure is a security
event, not a transient one, and the copy says so plainly rather than
inviting a retry.

---

## §4 — Architecture

```
mezzanine/
├── .github/workflows/
│   └── ascent.yml ........... NEW — tag-triggered release build (Windows runner,
│                              sign, publish NSIS + latest.json to GitHub Releases)
├── src-tauri/
│   ├── Cargo.toml ........... + tauri-plugin-updater = "2", tauri-plugin-process = "2"
│   ├── tauri.conf.json ...... + plugins.updater { endpoints, pubkey };
│   │                          + bundle.createUpdaterArtifacts: true
│   ├── capabilities/default.json  + updater:default, process:allow-restart
│   └── src/lib.rs ........... + .plugin(tauri_plugin_updater::Builder::new().build())
│                              + .plugin(tauri_plugin_process::init())
└── src/ascent/ .............. NEW slice
    ├── types.ts ............. AscentStatus union (idle | checking | available |
    │                          downloading | rejected | error) + UpdateMeta
    ├── useAscent.ts ......... singleton composable — check() / descend() /
    │                          dismiss(); wraps plugin-updater + plugin-process;
    │                          _resetForTests()
    └── AscentPrompt.vue ..... balcony-voiced prompt strip; progress on descend
```

### The update flow (runtime)

1. **Boot.** After the first-run wizard clears, `useAscent.check()` fires
   once. (Gated on wizard completion so a brand-new install configures
   before it reaches outward.)
2. **`check()`** (plugin-updater) hits the GitHub Releases endpoint,
   reads `latest.json`, compares the manifest version against the running
   `version` from `tauri.conf.json`.
3. **No newer version** → status `idle`, the *"Balcony current"* line; the
   prompt stays hidden.
4. **Newer version** → status `available`, `AscentPrompt` slides in with
   *"A newer balcony stands ready — v{version}. Descend to raise it?"*
5. **Investor picks "Descend"** → `downloadAndInstall()` streams the
   signed NSIS bundle; the plugin **verifies the signature against the
   baked-in pubkey** before writing; progress events drive the *"Raising…
   {pct}%"* copy.
6. **Install complete** → `relaunch()` (plugin-process) restarts into the
   new balcony.
7. **Investor picks "Stay upstairs"** → `dismiss()`; the prompt closes for
   the session, re-offered on next boot.

The endpoint URL uses Tauri's templating so one manifest serves the
right artifact:

```
https://github.com/goosterhof/mezzanine/releases/latest/download/latest.json
```

(`{{target}}` / `{{arch}}` / `{{current_version}}` are available if a
per-target split is later needed; a single NSIS target does not need
them yet.)

---

## §5 — Phases

| Phase | Scope | Gate |
|-------|-------|------|
| **A-0 — Keys & spec** | Generate the updater keypair; escrow the private key with the investor; record this spec; add `*.key` to `.gitignore`. **Investor action required** (key custody is not automatable). | Pubkey in hand; private key escrowed + in CI secrets |
| **A-1 — Plugin wiring** | `Cargo.toml` deps; `lib.rs` registration; `capabilities/default.json` grants; `tauri.conf.json` `plugins.updater` block + `createUpdaterArtifacts`; `package.json` JS deps. | `cargo check` (Windows) + `vite build` clean |
| **A-2 — The Ascent slice** | `src/ascent/{types,useAscent,AscentPrompt}`; wire `AscentPrompt` into `App.vue`; boot-check gated on wizard completion; balcony voice locked. | oxlint 0/0 · vue-tsc clean · vitest green · coverage ≥ 90% |
| **A-3 — Release pipeline** | `.github/workflows/ascent.yml` — tag push (`v*`) → Windows runner → `tauri-apps/tauri-action` build + sign → publish NSIS bundle + `.sig` + `latest.json` to a GitHub Release. | A tagged dry-run produces a verifiable release |
| **A-4 — Version discipline** | Keep `tauri.conf.json` / `Cargo.toml` / `package.json` versions in lockstep (a `version:bump` npm script as single source). | Three manifests agree; CI asserts it |
| **A-5 — Cross-host ratification** | Windows runtime proof: build N, install, tag N+1, observe the prompt, descend, verify relaunch into N+1 and signature rejection of a tampered bundle. Deferred to Windows per the #00051–#00053 precedent. | Runtime evidence recorded in §Runtime ratification |

**A-0 is a gate, not just a task.** A-1's `pubkey` field and A-3's CI
secrets both depend on the keypair existing. Phases A-1/A-2 can be drafted
in parallel against a placeholder pubkey, but nothing ships until A-0's
real key is escrowed.

---

## §6 — Containment protocols

The frontend gates run here (Linux); the Rust + runtime gates defer to
Windows, exactly as the absorption arcs did.

**Static (this repo, Linux):**
- `npm run lint` — oxlint 0 errors (type-aware, war-room canonical config)
- `npm run format:check` — oxfmt clean
- `npm run typecheck` — vue-tsc clean
- `npm run test` — vitest green (A-2 adds `tests/ascent/*.spec.ts`:
  `useAscent` flow states + `AscentPrompt` render/actions/voice)
- `npm run test:coverage` — v8 ≥ 90% line/branch/function/statement
- `npm run build` — vite build clean

**Deferred to Windows (no cargo here):**
- `cargo check` + `cargo test` — plugin registration compiles
- Runtime ratification (A-5) — see the proof checklist above

---

## §7 — Risks & open edges

- **Key loss is terminal.** Mitigated by RD-4 escrow. Flagged here because
  no code can recover from it.
- **NSIS vs MSI drift.** Investors who first-installed via MSI receive
  NSIS updates; Tauri handles the cross-installer reinstall, but A-5 must
  prove it on a real MSI-first machine, not only NSIS-first.
- **First reach outward.** This is the gadget's first deliberate outbound
  call to a public URL on boot (the Drydock's `gh` calls are
  investor-initiated). The wizard-completion gate keeps a fresh install
  from phoning out before it is configured; worth an explicit note in the
  chronicle disclosure copy if the investor wants the symmetry.
- **`http:default` already granted** (`capabilities/default.json:16`),
  landed bench-era for the Drydock — the updater's network reach needs no
  new HTTP grant beyond `updater:default` itself.

---

## §8 — Cross-references

- Gadget charter: `gadgets/mezzanine/CLAUDE.md`
- Mezzanine genesis log: `documents/experiment-logs/00049-the-mezzanine.md`
- Predecessor arc: `documents/experiment-logs/00053-the-grind.md`
- Substrate precedent: `gadgets/horadric-cube/CLAUDE.md`
- Slice discipline: war-room ADR-0014 (vertical slices)
- Tauri updater (external): `tauri-plugin-updater` v2, `plugins.updater`
  config, `tauri-apps/tauri-action`

---

*Drafted 2026-06-02. Status PLANNING — no code cut. Phase A-0 (key
custody) is the investor-gated prerequisite; A-1/A-2 are ready to begin
against a placeholder pubkey on the investor's word.*
