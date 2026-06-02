#!/usr/bin/env node
// Version discipline for the Ascent (#00056, Phase A-4).
//
// The Mezzanine's version lives in three manifests that MUST agree, because
// the updater compares the running version (tauri.conf.json, baked into the
// binary) against the release manifest. If package.json says 0.2.0 while
// tauri.conf.json still says 0.1.0, a release tagged v0.2.0 ships a binary
// that reports 0.1.0 — and the updater would re-offer the same version
// forever, or never. This script is the single source that keeps them locked.
//
//   node scripts/version.mjs check          — assert all three agree (CI gate)
//   node scripts/version.mjs bump 0.2.0      — set all three to 0.2.0
//
// No dependencies — plain Node fs + a scoped Cargo.toml edit (the [package]
// version only, never the inline dependency `version = "2"` tables).

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_JSON = resolve(ROOT, 'package.json');
const TAURI_CONF = resolve(ROOT, 'src-tauri/tauri.conf.json');
const CARGO_TOML = resolve(ROOT, 'src-tauri/Cargo.toml');

const SEMVER = /^\d+\.\d+\.\d+$/;

/** Read the [package] version from Cargo.toml — scoped, never an inline dep. */
function readCargoVersion(text) {
    const lines = text.split('\n');
    let inPackage = false;
    for (const line of lines) {
        const header = line.trim();
        if (header.startsWith('[')) {
            inPackage = header === '[package]';
            continue;
        }
        if (inPackage) {
            const match = line.match(/^\s*version\s*=\s*"([^"]+)"/);
            if (match) {
                return match[1];
            }
        }
    }
    return null;
}

/** Replace the [package] version in Cargo.toml, leaving inline deps untouched. */
function writeCargoVersion(text, version) {
    const lines = text.split('\n');
    let inPackage = false;
    let done = false;
    const next = lines.map((line) => {
        const header = line.trim();
        if (header.startsWith('[')) {
            inPackage = header === '[package]';
            return line;
        }
        if (inPackage && !done && /^\s*version\s*=\s*"[^"]+"/.test(line)) {
            done = true;
            return line.replace(/("version"|version)(\s*=\s*)"[^"]+"/, `version$2"${version}"`);
        }
        return line;
    });
    if (!done) {
        throw new Error('Could not find a [package] version line in Cargo.toml');
    }
    return next.join('\n');
}

function readVersions() {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    const conf = JSON.parse(readFileSync(TAURI_CONF, 'utf8'));
    const cargo = readCargoVersion(readFileSync(CARGO_TOML, 'utf8'));
    return {'package.json': pkg.version, 'tauri.conf.json': conf.version, 'Cargo.toml': cargo};
}

function check() {
    const versions = readVersions();
    const distinct = new Set(Object.values(versions));
    for (const [file, version] of Object.entries(versions)) {
        console.log(`  ${file.padEnd(18)} ${version ?? '(not found)'}`);
    }
    if (distinct.size === 1 && !distinct.has(undefined) && !distinct.has(null)) {
        console.log(`\nThe balcony's three manifests agree: v${[...distinct][0]}.`);
        return;
    }
    console.error('\nVersion drift: the three manifests disagree. Run `npm run version:bump <version>`.');
    process.exit(1);
}

function bump(version) {
    if (!version || !SEMVER.test(version)) {
        console.error(`Expected a semver version like 0.2.0, got: ${version ?? '(nothing)'}`);
        process.exit(1);
    }

    // Targeted replacement of the single top-level "version" line in each
    // JSON manifest — a JSON round-trip would expand the hand-kept inline
    // objects (e.g. "security": {"csp": null}) and churn the file. The
    // dependency entries carry no "version" key, so the first match is safe.
    const replaceJsonVersion = (path) => {
        const raw = readFileSync(path, 'utf8');
        if (!/("version"\s*:\s*)"[^"]+"/.test(raw)) {
            throw new Error(`Could not find a "version" field in ${path}`);
        }
        writeFileSync(path, raw.replace(/("version"\s*:\s*)"[^"]+"/, `$1"${version}"`));
    };
    replaceJsonVersion(PACKAGE_JSON);
    replaceJsonVersion(TAURI_CONF);

    const cargoRaw = readFileSync(CARGO_TOML, 'utf8');
    writeFileSync(CARGO_TOML, writeCargoVersion(cargoRaw, version));

    console.log(`The balcony is now v${version} across all three manifests. Tag it: git tag v${version}`);
}

const [, , mode, arg] = process.argv;
if (mode === 'check') {
    check();
} else if (mode === 'bump') {
    bump(arg);
} else {
    console.error('Usage: node scripts/version.mjs <check | bump <version>>');
    process.exit(1);
}
