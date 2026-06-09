#!/usr/bin/env node
// Release-readiness advisory (the "merged ≠ released" forcing function).
//
// The Mezzanine auto-updates: an installed balcony only descends when the
// release manifest's version is GREATER than the running binary's. So a
// user-facing fix that merges to `main` without a version bump is stranded —
// it lives in the repo, but every installed balcony compares "same version,
// nothing to offer" and never pulls it. This is exactly what happened to the
// dispatch fix (PR #19, 2026-06-08): merged, correct, green, and invisible to
// the v0.2.2 binary for a day until v0.2.3 was cut.
//
// This script runs on PRs and emits a NON-BLOCKING warning when a PR carries a
// `feat`/`fix` commit touching runtime code (`src/**` or `src-tauri/src/**`)
// but does NOT bump the version. It is a reminder, not a gate — not every code
// change needs a release (refactors, infra, tests, docs don't), so blocking
// would be noise. Per lab Decision 017 / Pattern 024, new enforcement starts as
// `warn` and earns the right to block only on evidence. The job always exits 0.
//
// The "user-facing" signal is the Commit Doctrine's own type prefix: `feat(` /
// `fix(` mean behaviour the investor would want shipped; `refactor`/`test`/
// `infra`/`docs`/`chore`/`sync`/`perf`/`design` do not trip the warning.
//
// No dependencies — Node built-ins + `git` (history present via fetch-depth 0).
// Advisory-first: ANY failure (missing refs, git error) degrades to silent-ok,
// because a broken advisory must never block the queue.

import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';

const BASE = process.env.BASE_REF;
const HEAD = process.env.HEAD_REF;

/** Run git, returning trimmed stdout, or null on any failure. */
function git(args) {
    try {
        return execFileSync('git', args, {encoding: 'utf8'}).trim();
    } catch {
        return null;
    }
}

/** Pull the `"version": "x.y.z"` out of a tauri.conf.json blob at a ref. */
function versionAt(ref) {
    const blob = git(['show', `${ref}:src-tauri/tauri.conf.json`]);
    if (blob === null) {
        return null;
    }
    try {
        return JSON.parse(blob).version ?? null;
    } catch {
        return null;
    }
}

/** Emit a GitHub Actions warning annotation + a job-summary line, then exit 0. */
function warn(message) {
    console.log(`::warning title=Release readiness::${message}`);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) {
        try {
            appendFileSync(summary, `> ⚠️ **Release readiness** — ${message}\n`);
        } catch {
            /* a summary write failure must not break the advisory */
        }
    }
    process.exit(0);
}

function ok(reason) {
    console.log(`release-readiness: ok — ${reason}`);
    process.exit(0);
}

if (!BASE || !HEAD) {
    ok('no BASE_REF/HEAD_REF in env (not a PR context)');
}

const baseVersion = versionAt(BASE);
const headVersion = versionAt(HEAD);

if (baseVersion === null || headVersion === null) {
    ok('could not resolve base/head version (advisory degrades to silent)');
}

if (baseVersion !== headVersion) {
    ok(`version bumped ${baseVersion} -> ${headVersion}`);
}

// Version unchanged — is this a user-facing runtime change that needs a release?
const changedFiles = (git(['diff', '--name-only', `${BASE}...${HEAD}`]) ?? '')
    .split('\n')
    .filter(Boolean);
const touchesRuntime = changedFiles.some(
    (f) => f.startsWith('src/') || f.startsWith('src-tauri/src/'),
);

const subjects = (git(['log', '--format=%s', `${BASE}..${HEAD}`]) ?? '')
    .split('\n')
    .filter(Boolean);
// Commit Doctrine: feat( / fix( (with optional `!` breaking marker) = user-facing.
const userFacing = subjects.some((s) => /^(feat|fix)(\(|!)/.test(s));

if (touchesRuntime && userFacing) {
    warn(
        `This PR changes runtime code under a feat/fix commit but leaves the version at ${headVersion}. ` +
            'If this is a user-facing fix, bump it (`npm run version:bump <next>`) and cut a tag — ' +
            'merging alone leaves every installed balcony on the old version. ' +
            'If this change does not need a release (refactor/infra/test), ignore this notice.',
    );
}

ok(
    touchesRuntime
        ? 'runtime change present but no feat/fix commit — no release implied'
        : 'no runtime-code change — no release implied',
);
