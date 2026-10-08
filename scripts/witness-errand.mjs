// The Errand Floor's witness (#00067 P3): the REAL app on `vite dev`, the Tauri
// boundary mocked at __TAURI_INTERNALS__, the frozen R2 boards emitted as
// `scientist-signal`, and the floor read back off its own pixels.
//
//   AC-6   the sill canvas takes no input: a point under it reaches the command bar
//   AC-7c  the tier-3 sweep: 6 postures, 0 breaching sill paints; the real-raster
//          provoked control fires the alarm once (and a clean control never)
//   AC-11  Kilroy: every Lot 8 type's eye clears the brass by >= +0.5 px in the
//          sill and on the grip, and the Chaos Monkey's on his grip
//   AC-12  the pipe-ink gap is >= 4 px at every used post (centre, ±22, ±46),
//          at 1440 and 1080, every type in every post pose
//
// Dev-only, never in CI (it needs a browser and the dev server). Run from the gadget:
//   npm run dev                      # :1430, in another shell
//   PLAYWRIGHT_MODULE=<path>/node_modules/playwright-core node scripts/witness-errand.mjs
// Options: --only sweep,provoke,click,kilroy,pipe   --out <file.json>
// Exits 1 when any gate fails. The sweep's frame times are reported, not gated: a
// headless software raster is an upper bound.
//
//   AC-13  the frame gate, on the Windows host (#00059's shape): `--only perf --headed`
//          holds 2 colleagues, 3 minions at their posts and the monkey on the rail for
//          30 s at 1440×900; max frame <= 25 ms and 0 frames over 25 ms. Never default.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = process.env.WITNESS_URL || 'http://127.0.0.1:1430/';
const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i < 0 ? null : process.argv[i + 1];
};
const ONLY = (arg('--only') ?? 'sweep,provoke,click,kilroy,pipe').split(',');
const HEADED = process.argv.includes('--headed');
const FIXTURE = JSON.parse(readFileSync(resolve(HERE, '../tests/observer/fixtures/scenario-casting-r2.json'), 'utf8'));
const MS = 'mad-scientist';
/** the 7 Lot 8 types (AC-3's list) */
const TYPES = ['surgeon', 'librarian', 'scribe', 'synchronizer', 'general-purpose', 'Explore', 'Plan'];
const KILROY_MIN = 0.5;
const PIPE_MIN = 4;
/** errands.ts POST_OFFSETS, every count folded together */
const POSTS = [0, -22, 22, -46, 46];

// --- the mocked Tauri boundary (the shape of witness-pages.cjs) ------------------------------
function tauriMock() {
    const callbacks = new Map();
    const listeners = new Map();
    let seq = 1;
    const now = new Date().toISOString();
    const scientists = ['mad-scientist', 'heretic'].map((colleague) => ({
        id: colleague,
        colleague,
        target: {kind: 'lab-root'},
        mission: 'Errand witness',
        state: 'idle',
        startedAt: now,
        lastStateChange: now,
    }));
    window.emitTest = (event, payload) => {
        for (const id of listeners.get(event) || []) callbacks.get(id)({event, payload, id});
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener: () => {}};
    window.__TAURI_INTERNALS__ = {
        transformCallback: (fn) => {
            const id = seq++;
            callbacks.set(id, fn);
            return id;
        },
        invoke: async (cmd, args = {}) => {
            if (cmd === 'plugin:event|listen') {
                listeners.set(args.event, [...(listeners.get(args.event) || []), args.handler]);
                return args.handler;
            }
            if (cmd === 'read_wizard_state') return {completedAt: '2026-10-08', labRoot: '/laboratory', claudeBinary: 'claude'};
            if (cmd === 'read_wizard_detected')
                return {labRoot: '/laboratory', claudeBinary: 'claude', hostPlatform: 'windows'};
            if (cmd === 'list_roster' || cmd === 'list_recently_recalled' || cmd === 'list_briefing_templates') return [];
            if (cmd === 'open_colleague') return scientists.find((s) => s.colleague === args.colleague);
            if (cmd === 'read_tube_connections')
                return scientists.map((s) => ({id: s.id, identity: s.colleague, delivery: 'queue', error: null}));
            if (cmd === 'read_balcony_signs')
                return {
                    lastChaos: {reportNumber: 121, label: 'Laboratory-wide', score: '6/10', raw: null},
                    ideaLedger: {candidateCount: 4, shelvedCount: 12, mostRecentDelivered: '2026-10-07'},
                };
            if (cmd === 'read_inheritance_signals' || cmd === 'read_wounds_at_threshold' || cmd === 'list_open_prs')
                return [];
            if (cmd === 'gh_auth_status') return {authenticated: true, message: ''};
            if (cmd === 'read_holotable_state') return (await import('/src/holotable/types.ts')).EMPTY_DASHBOARD;
            return null;
        },
    };
}

// --- in-page instruments ----------------------------------------------------------------------
/** Installed once per page: the board pump, the frame clock, the sill sampler and the pipe reader.
 *  The painter is imported by the exact URL the scene loaded: after a hot update Vite serves it as
 *  `sillPainter.ts?t=…`, and the bare path would be a second instance whose readout never moves. */
async function installInstruments(page) {
    await page.evaluate(async (ms) => {
        const loaded = performance
            .getEntriesByType('resource')
            .map((e) => e.name)
            .findLast((n) => n.includes('/src/observer/sillPainter.ts'));
        const painter = await import(loaded ?? '/src/observer/sillPainter.ts');
        const {benchGeometry} = await import('/src/observer/projection.ts');
        const dark = (d, k) => d[k + 3] > 120 && 0.3 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2] < 150;
        // Each run of columns where a minion's ink appears: its centre, and its smallest gap to the
        // first dark pipe pixel above it on the empty bench. Read only under the arch (the posts:
        // centre ±80) and above the benchtop a post minion stands on: the captions keep time and
        // the ledger changes, never there. A minion's pixel is dark in the frame with NO empty-bench
        // ink within 2 rows: the pen boils from one sequence per frame and the minions draw before
        // the arch, so a minion on the bench moves the arch's strokes by a pixel. A figure that
        // truly touches the pipe still reads <= 2 px, under the 4 px gate.
        const SLACK = 2;
        const inkNear = (d, {W, x, y}) => {
            for (let dy = -SLACK; dy <= SLACK; dy++) if (y + dy >= 0 && dark(d, ((y + dy) * W + x) * 4)) return true;
            return false;
        };
        function figureClusters(base, img) {
            const W = base.width;
            const geo = benchGeometry(W, false);
            const H = Math.floor(geo.benchTopY - geo.cropTop);
            const [c0, c1] = [Math.floor(W / 2 - 80), Math.ceil(W / 2 + 80)];
            const a = base.data;
            const b = img.data;
            const tops = new Array(W).fill(-1);
            for (let x = c0; x < c1; x++) {
                for (let y = 0; y < H; y++) {
                    const k = (y * W + x) * 4;
                    if (dark(b, k) && !inkNear(a, {W, x, y})) {
                        tops[x] = y;
                        break;
                    }
                }
            }
            const out = [];
            let cur = null;
            for (let x = c0; x <= c1; x++) {
                if (x < c1 && tops[x] >= 0) {
                    cur ??= {x0: x, x1: x, gap: Infinity};
                    cur.x1 = x;
                    for (let y = tops[x] - 1; y >= 0; y--) {
                        if (dark(a, (y * W + x) * 4)) {
                            cur.gap = Math.min(cur.gap, tops[x] - y - 1);
                            break;
                        }
                    }
                } else if (cur) {
                    if (cur.x1 - cur.x0 >= 6) out.push({centre: (cur.x0 + cur.x1) / 2, gap: cur.gap});
                    cur = null;
                }
            }
            return out;
        }
        const bench = () => document.querySelector('[data-observer-canvas]');
        const pixels = () => {
            const c = bench();
            return c.getContext('2d').getImageData(0, 0, c.width, c.height);
        };
        let seq = 0;
        let lastAt = 0;
        const w = {
            /** emit one board NOW: its clocks are shifted onto the page's own (the fold reads receipt time) */
            emit(board, shiftMs = 0) {
                const at = Math.max(Date.now(), lastAt + 1);
                lastAt = at;
                const t = (v) => (typeof v === 'number' ? v + shiftMs : v);
                const out = {
                    ...board,
                    seq: ++seq,
                    at,
                    scientist: {...board.scientist, since: t(board.scientist.since)},
                    minions: board.minions.map((m) => ({...m, since: t(m.since), spawnedAt: t(m.spawnedAt)})),
                    departed: board.departed.map((d) => ({...d, at: t(d.at)})),
                };
                window.emitTest('scientist-signal', {scientistId: ms, board: out});
            },
            /** replay boards at their own offsets from t0, in real time */
            replay(boards, t0) {
                const start = Date.now();
                return new Promise((done) => {
                    for (const b of boards) setTimeout(() => w.emit(b, start - t0), b.at - t0);
                    setTimeout(done, boards[boards.length - 1].at - t0 + 1500);
                });
            },
            frames: [],
            kilroy: {},
            sampling: false,
            /** every animation frame: its interval, and each sill eye reading at its held best */
            sample() {
                w.frames = [];
                w.kilroy = {};
                w.sampling = true;
                let last = null;
                const loop = (ts) => {
                    if (!w.sampling) return;
                    if (last !== null) w.frames.push(ts - last);
                    last = ts;
                    for (const k of painter.sillReadout.kilroy) {
                        if (k.arms !== 'grip' && k.arms !== 'point') continue;
                        const key = `${k.type}|${k.arms}`;
                        w.kilroy[key] = Math.max(w.kilroy[key] ?? -Infinity, k.eyeAboveRailPx);
                    }
                    requestAnimationFrame(loop);
                };
                requestAnimationFrame(loop);
            },
            stop() {
                w.sampling = false;
                const f = w.frames;
                return {
                    frames: f.length,
                    frameMaxMs: f.length ? Math.max(...f) : 0,
                    over25: f.filter((d) => d > 25).length,
                    kilroy: w.kilroy,
                };
            },
            resetSill() {
                Object.assign(painter.sillReadout, {paints: 0, breachPaints: 0, breaches: [], kilroy: []});
            },
            sillState() {
                const c = document.querySelector('canvas[aria-hidden="true"][tabindex="-1"]');
                const r = painter.sillReadout;
                return {
                    shown: !!c && getComputedStyle(c).display !== 'none',
                    paints: r.paints,
                    breachPaints: r.breachPaints,
                    breaches: [...r.breaches],
                };
            },
            /** the empty bench's pixels: every minion's ink is read against them */
            snapBase() {
                w.base = pixels();
            },
            /** each minion's ink against the empty bench: its offset from the centre, and its pipe gap */
            clusters() {
                const W = bench().width;
                return figureClusters(w.base, pixels()).map((k) => ({dx: k.centre - W / 2, gap: k.gap}));
            },
        };
        window.__witness = w;
    }, MS);
}

async function openPage(browser, {vp, reduced = false}) {
    const context = await browser.newContext({
        viewport: {width: vp[0], height: vp[1]},
        deviceScaleFactor: 1,
        reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    const page = await context.newPage();
    const errors = [];
    const alarms = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
        if (m.type() === 'error' && m.text().startsWith('TIER 3 BREACH')) alarms.push(m.text());
    });
    await page.addInitScript(tauriMock);
    await page.goto(APP);
    await page.waitForSelector('[data-terminal="heretic"] .xterm');
    await page.waitForSelector('[data-observer-canvas][data-bench-phase]');
    await page.evaluate(() => document.fonts.ready);
    await installInstruments(page);
    await page.waitForTimeout(400);
    return {context, page, errors, alarms};
}

const results = {};
const failures = [];
const gate = (ok, what) => {
    if (!ok) failures.push(what);
    return ok;
};

const minion = (id, type, state, at) => ({
    id,
    type,
    task: 'Witness roll call',
    background: false,
    spawnedAt: at,
    state,
    detail: state === 'waiting' ? 'Waiting on you: Bash' : 'Witness',
    since: at,
});
const board = (minions, departed, state = 'running') => ({
    v: 1,
    seq: 0,
    at: 0,
    scientist: {state, detail: 'Witness', since: 0},
    minions,
    departed,
});

// --- AC-7c: the tier-3 sweep over the frozen R2 scenario -------------------------------------
async function sweep(browser) {
    const POSTURES = [
        {name: '1440×900', vp: [1440, 900]},
        {name: '1440×900 compact', vp: [1440, 900], compact: true},
        {name: '1080×720', vp: [1080, 720]},
        {name: '1440×819 (forced compact)', vp: [1440, 819], sillMayBeNull: true},
        {name: '1440×900 reduced motion', vp: [1440, 900], reduced: true},
        {name: '1440×900 keystroke at t 5.5', vp: [1440, 900], keyAt: 5.5},
    ];
    const rows = [];
    for (const p of POSTURES) {
        const {context, page, errors, alarms} = await openPage(browser, p);
        if (p.compact) await page.locator('[data-floor-expand]').click();
        await page.mouse.move(4, 4);
        await page.waitForTimeout(300);
        await page.evaluate(() => {
            window.__witness.resetSill();
            window.__witness.sample();
        });
        const run = page.evaluate(({boards, t0}) => window.__witness.replay(boards, t0), {
            boards: FIXTURE.boards,
            t0: FIXTURE.t0Ms,
        });
        if (p.keyAt !== undefined) {
            await page.waitForTimeout(p.keyAt * 1000);
            await page.locator('[data-command-input]').press('k');
        }
        await run;
        const st = await page.evaluate(() => ({...window.__witness.stop(), ...window.__witness.sillState()}));
        const gripped = Object.keys(st.kilroy)
            .filter((k) => k.endsWith('|grip'))
            .map((k) => k.split('|')[0]);
        const row = {
            posture: p.name,
            sill: st.shown,
            paints: st.paints,
            breachPaints: st.breachPaints,
            breaches: st.breaches,
            alarms: alarms.length,
            gripped,
            frames: st.frames,
            frameMaxMs: +st.frameMaxMs.toFixed(1),
            framesOver25: st.over25,
            errors,
        };
        rows.push(row);
        console.log(
            `${p.name.padEnd(30)} sill ${st.shown ? 'yes ' : 'NONE'} paints ${String(st.paints).padStart(4)}  breach ${st.breachPaints} ${st.breaches.join(',')}  grips [${gripped.join(' ')}]  frame max ${row.frameMaxMs} ms, >25 ms ${st.over25}/${st.frames}`,
        );
        gate(st.breachPaints === 0 && alarms.length === 0, `AC-7c: ${p.name} breached tier 3 (${st.breaches.join(', ')})`);
        gate(errors.length === 0, `${p.name}: page errors ${errors.join(' | ')}`);
        if (!p.sillMayBeNull) gate(st.shown && st.paints > 0, `AC-5/7c: ${p.name} has no sill (only forced compact may)`);
        // the grip gate's own control: the Librarian (t 6) and the monkey (t 6.6) arrive inside
        // the 1.5 s after the keystroke at 5.5, so neither may grip
        if (p.keyAt !== undefined)
            gate(
                !gripped.includes('librarian') && !gripped.includes('chaos-monkey'),
                `AC-8: a keystroke at t ${p.keyAt} did not skip the grip (${gripped.join(', ')})`,
            );
        await context.close();
    }
    results.sweep = rows;
}

// --- AC-7c's real-raster provoked control ------------------------------------------------------
async function provoke(browser) {
    const {context, page, alarms} = await openPage(browser, {vp: [1440, 900]});
    const read = await page.evaluate(async () => {
        const {paintSill, sillReadout} = await import('/src/observer/sillPainter.ts');
        const {sillEnvelope} = await import('/src/observer/sill.ts');
        const R = (x, y, w, h, name) => ({x, y, w, h, name});
        const env = sillEnvelope({
            bar: R(0, 0, 400, 100, 'command bar'),
            input: R(10, 10, 200, 20, 'command input'),
            stamps: [R(220, 10, 60, 20, 'DIRECT stamp'), R(290, 10, 60, 20, 'TO: stamp')],
            divider: R(0, 100, 400, 6, 'divider'),
            torn: R(0, 106, 400, 4, 'torn'),
            bench: R(0, 110, 400, 170, 'bench'),
            paneMs: R(0, 0, 200, 5, 'Mad Scientist pane'),
            paneHer: R(200, 0, 200, 5, 'Heretic pane'),
        });
        const fig = {
            kind: 'specimen',
            layer: 'border',
            id: 'provoked',
            type: 'surgeon',
            cls: 'lab',
            x: 120,
            y: 60,
            s: 0.6,
            legs: 'kneel',
            arms: 'idle',
            mechT: 0,
        };
        const canvas = document.createElement('canvas');
        const paint = (extra) => {
            const before = sillReadout.breachPaints;
            paintSill(canvas, {env: {...env, tier3: [...env.tier3, extra]}, geo: {cropTop: 0}, dpr: 1}, [fig], {
                t: 0,
                still: true,
                seed: 0,
            });
            return sillReadout.breachPaints - before;
        };
        // a provoked rect over the figure's ink, then the same rect where no ink lands
        return {hot: paint(R(60, 60, 120, 220, 'provoked')), clean: paint(R(330, 60, 60, 220, 'provoked'))};
    });
    const provoked = alarms.filter((a) => a.includes('provoked')).length;
    results.provoke = {...read, alarmLines: provoked};
    console.log(`provoked control: hot paint flagged ${read.hot}, clean paint flagged ${read.clean}, alarm lines ${provoked}`);
    gate(read.hot === 1 && provoked === 1, 'AC-7c: the provoked alarm did not fire exactly once');
    gate(read.clean === 0, 'AC-7c: the clean control raised the alarm');
    await context.close();
}

// --- AC-6: a point under the sill reaches the command bar ---------------------------------------
async function click(browser) {
    const {context, page} = await openPage(browser, {vp: [1440, 900]});
    const r = await page.evaluate(() => {
        const sill = document.querySelector('canvas[aria-hidden="true"][tabindex="-1"]');
        const s = sill.getBoundingClientRect();
        const input = document.querySelector('[data-command-input]').getBoundingClientRect();
        const bar = document.querySelector('[data-command-bar]').getBoundingClientRect();
        const centre = document.elementFromPoint(s.x + s.width / 2, s.y + s.height / 2);
        // inside both the sill canvas's rect and the command bar's: between the ceiling and the bar's foot
        const y = (s.top + Math.min(bar.bottom, s.bottom)) / 2;
        const under = document.elementFromPoint(input.x + input.width / 2, y);
        return {
            sillRect: [s.x, s.y, s.width, s.height].map(Math.round),
            overlap: bar.bottom > s.top,
            centreIsSill: centre === sill,
            barProbeY: Math.round(y),
            barReached: !!under?.closest('[data-command-bar]'),
        };
    });
    results.click = r;
    console.log(
        `AC-6: sill ${r.sillRect.join(',')}; its centre hits the sill: ${r.centreIsSill}; overlaps the bar: ${r.overlap}; a point under it reached the bar: ${r.barReached}`,
    );
    gate(!r.centreIsSill, 'AC-6: the sill canvas takes the pointer');
    gate(!r.overlap || r.barReached, 'AC-6: a point under the sill did not reach the command bar');
    await context.close();
}

// --- AC-11: Kilroy, every type alone: a grip, then a held wait in the sill --------------------
async function kilroy(browser) {
    const {context, page, errors} = await openPage(browser, {vp: [1440, 900]});
    await page.mouse.move(4, 4);
    await page.evaluate(() => window.__witness.sample());
    const emit = (b) => page.evaluate((x) => window.__witness.emit(x), b);
    // the first board after mount is a cold start: what it lists lands without an arrival
    await emit(board([], []));
    await page.waitForTimeout(300);
    for (const type of [...TYPES, 'chaos-monkey']) {
        const id = `kilroy-${type}`;
        const now = await page.evaluate(() => Date.now());
        await emit(board([minion(id, type, 'thinking', now)], []));
        await page.waitForTimeout(2600); // the grip: the hop, 1.2 s on the brass, down to the post
        if (type !== 'chaos-monkey') {
            await emit(board([minion(id, type, 'waiting', now)], []));
            await page.waitForTimeout(3000); // held 1.5 s, the climb, then a while in the sill
        }
        await emit(board([], [{id, type, at: now}]));
        await page.waitForTimeout(2600); // home again, the sill free
    }
    const st = await page.evaluate(() => window.__witness.stop());
    const rows = [...TYPES, 'chaos-monkey'].map((type) => ({
        type,
        grip: st.kilroy[`${type}|grip`] ?? null,
        sill: type === 'chaos-monkey' ? null : (st.kilroy[`${type}|point`] ?? null),
    }));
    results.kilroy = rows;
    const f = (v) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`);
    for (const r of rows) {
        console.log(`Kilroy ${r.type.padEnd(16)} grip ${f(r.grip).padStart(6)}  sill ${f(r.sill).padStart(6)}`);
        gate(r.grip !== null && r.grip >= KILROY_MIN, `AC-11: ${r.type} on the grip reads ${f(r.grip)} px`);
        if (r.type !== 'chaos-monkey')
            gate(r.sill !== null && r.sill >= KILROY_MIN, `AC-11: ${r.type} in the sill reads ${f(r.sill)} px`);
    }
    gate(errors.length === 0, `Kilroy: page errors ${errors.join(' | ')}`);
    await context.close();
}

// --- AC-12: the pipe gap at every used post, every type, every post pose ----------------------
const nearestPost = (dx) => {
    const best = POSTS.reduce((a, o) => (Math.abs(dx - o) < Math.abs(dx - a) ? o : a), POSTS[0]);
    return Math.abs(dx - best) <= 12 ? best : null;
};

/** Under reduced motion the boil pins to one seed, so the pipe's ink is the same pixels in every
 *  frame: a minion's ink is exactly what differs from the empty bench. */
async function pipe(browser) {
    const STATES = ['thinking', 'reading', 'writing', 'running', 'waiting'];
    const out = [];
    for (const vp of [
        [1440, 900],
        [1080, 720],
    ]) {
        const {context, page, errors} = await openPage(browser, {vp, reduced: true});
        // 1080×720 is under the 820 px cliff: the crop is forced, so the ⌃ control peeks at the
        // whole bench, and the pointer stays on it (leaving the band ends the peek)
        if (vp[1] < 820) await page.locator('[data-floor-expand]').click();
        assert.equal(await page.locator('[data-lab-floor]').getAttribute('data-floor-collapsed'), 'false');
        const emit = (b) => page.evaluate((x) => window.__witness.emit(x), b);
        const settle = async () => {
            await page.waitForTimeout(450);
            await page.waitForSelector('[data-observer-canvas][data-errands-in-transit="0"]');
            await page.waitForTimeout(60);
        };
        await emit(board([], []));
        await settle();
        await page.evaluate(() => window.__witness.snapBase());
        const gaps = new Map(POSTS.map((o) => [o, {gap: Infinity, cast: '', state: '', n: 0}]));
        let caseNo = 0;
        for (const n of [1, 2, 3]) {
            for (let r = 0; r < TYPES.length; r++) {
                const cast = Array.from({length: n}, (_, i) => TYPES[(r + i) % TYPES.length]);
                for (const state of STATES) {
                    caseNo++;
                    const now = await page.evaluate(() => Date.now());
                    const ms = cast.map((type, i) => minion(`pipe-${caseNo}-${i}`, type, state, now + i));
                    await emit(board(ms, []));
                    await settle();
                    for (const cluster of await page.evaluate(() => window.__witness.clusters())) {
                        const off = nearestPost(cluster.dx);
                        if (off === null) continue;
                        const g = gaps.get(off);
                        g.n++;
                        if (cluster.gap < g.gap) Object.assign(g, {gap: cluster.gap, cast: cast.join('+'), state});
                    }
                    await emit(board([], ms.map((m) => ({id: m.id, type: m.type, at: now}))));
                    await settle();
                }
            }
        }
        const row = {viewport: vp.join('×'), cases: caseNo, posts: [...gaps].map(([offset, g]) => ({offset, ...g}))};
        out.push(row);
        for (const p of row.posts) {
            console.log(
                `pipe ${row.viewport} post ${String(p.offset).padStart(3)}: min gap ${p.gap === Infinity ? '—' : p.gap} px (${p.cast}, ${p.state}; ${p.n} readings)`,
            );
            gate(p.n > 0 && p.gap >= PIPE_MIN, `AC-12: ${row.viewport} post ${p.offset} gap ${p.gap} px`);
        }
        gate(errors.length === 0, `pipe ${row.viewport}: page errors ${errors.join(' | ')}`);
        await context.close();
    }
    results.pipe = out;
}

// --- AC-13: the frame gate (the Windows host's, headed) ----------------------------------------
async function perf(browser) {
    const {context, page, errors} = await openPage(browser, {vp: [1440, 900]});
    await page.mouse.move(4, 4);
    const emit = (b) => page.evaluate((x) => window.__witness.emit(x), b);
    await emit(board([], []));
    await page.waitForTimeout(300);
    const now = await page.evaluate(() => Date.now());
    const cast = ['surgeon', 'librarian', 'scribe', 'chaos-monkey'];
    await emit(board(cast.map((type, i) => minion(`perf-${type}`, type, 'running', now + i)), []));
    await page.waitForTimeout(5000); // every arrival landed: three at their posts, the monkey hanging
    await page.evaluate(() => window.__witness.sample());
    await page.waitForTimeout(30_000);
    const st = await page.evaluate(() => window.__witness.stop());
    results.perf = {headed: HEADED, frames: st.frames, frameMaxMs: +st.frameMaxMs.toFixed(1), framesOver25: st.over25};
    console.log(`AC-13 ${HEADED ? 'headed' : 'HEADLESS (not the gate)'}: ${st.frames} frames over 30 s, max ${results.perf.frameMaxMs} ms, ${st.over25} over 25 ms`);
    gate(st.frameMaxMs <= 25 && st.over25 === 0, `AC-13: max frame ${results.perf.frameMaxMs} ms, ${st.over25} frames over 25 ms`);
    gate(errors.length === 0, `perf: page errors ${errors.join(' | ')}`);
    await context.close();
}

const browser = await chromium.launch({headless: !HEADED});
try {
    if (ONLY.includes('sweep')) await sweep(browser);
    if (ONLY.includes('provoke')) await provoke(browser);
    if (ONLY.includes('click')) await click(browser);
    if (ONLY.includes('kilroy')) await kilroy(browser);
    if (ONLY.includes('pipe')) await pipe(browser);
    if (ONLY.includes('perf')) await perf(browser);
} finally {
    await browser.close();
}
results.failures = failures;
const out = arg('--out');
if (out) writeFileSync(out, JSON.stringify(results, null, 1));
console.log(failures.length ? `\nFAILED (${failures.length}):\n- ${failures.join('\n- ')}` : '\nevery gate held');
process.exit(failures.length ? 1 : 0);
