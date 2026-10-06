#!/usr/bin/env node
// Tauri pair lockstep — the npm half and the Rust half of every Tauri package
// must share a major.minor, or `tauri build` refuses to bundle:
//
//   Error Found version mismatched Tauri packages. Make sure the NPM package
//   and Rust crate versions are on the same major/minor releases
//
// That check only runs inside `tauri build`, which only the Ascent's release
// job runs. The Sentinel builds with cargo and vite separately, so a split
// passes every PR gate and dies on the tag. It did: Dependabot moved three
// plugin crates a minor ahead of their npm packages, and the v0.3.4 release
// failed before compiling a line (2026-10-06). This script reads both
// lockfiles and fails the PR instead.
//
//   node scripts/tauri-pairs.mjs     — exit 1 on any major.minor split
//
// Pairs: @tauri-apps/api ↔ tauri, @tauri-apps/plugin-<x> ↔ tauri-plugin-<x>.
// Dependency-free (Node built-ins only), like its siblings in scripts/.

import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const npmLock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const cargoLock = readFileSync(join(root, 'src-tauri', 'Cargo.lock'), 'utf8');

const crateVersions = new Map();
for (const block of cargoLock.split('[[package]]')) {
    const name = /^name = "([^"]+)"$/m.exec(block)?.[1];
    const version = /^version = "([^"]+)"$/m.exec(block)?.[1];
    if (name && version) crateVersions.set(name, version);
}

const majorMinor = (v) => v.split('.').slice(0, 2).join('.');

const rows = [];
for (const [path, entry] of Object.entries(npmLock.packages ?? {})) {
    const match = /^node_modules\/@tauri-apps\/(api|plugin-[a-z0-9-]+)$/.exec(path);
    if (!match) continue;
    const crate = match[1] === 'api' ? 'tauri' : `tauri-${match[1]}`;
    const crateVersion = crateVersions.get(crate);
    if (!crateVersion) continue; // a JS-only package has no Rust half to agree with
    rows.push({npm: `@tauri-apps/${match[1]}`, npmVersion: entry.version, crate, crateVersion});
}

const split = rows.filter((r) => majorMinor(r.npmVersion) !== majorMinor(r.crateVersion));

for (const r of rows) {
    const mark = split.includes(r) ? '✗' : '✓';
    console.log(`${mark} ${r.npm} ${r.npmVersion}  ~  ${r.crate} ${r.crateVersion}`);
}

if (split.length > 0) {
    console.error(
        `\nThe balcony's two halves disagree on ${split.length} Tauri package(s); \`tauri build\` will refuse the release.\n` +
            'Move the lagging side to the same major.minor (usually `npm update <npm package>` after a Dependabot crate bump), then re-run this check.',
    );
    process.exit(1);
}

console.log(`\nAll ${rows.length} Tauri pairs agree on major.minor.`);
