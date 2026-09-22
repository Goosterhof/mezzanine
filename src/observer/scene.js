// =============================================================================
// The Long Bench — the page below the railing as an elevation (#00041 §5).
//
// "Bench Elevation Ink: a section drawing, not a floor plan." One workbench
// runs the full width, seen dead on, one ground line that everything stands
// on. The Mad Scientist works the left third under his own terminal, the
// Heretic the right third under hers, and the middle third is shared: the
// Speaking Tube's two brass bells rise out of the benchtop under an arch.
// The bench front is the label strip — the Caveat captions live on the
// woodwork, with the elapsed clock stamped in JetBrains Mono.
//
// Grafted from the ruled prototype at prototypes/mezzanine-first-page/
// (specimen 3, `long-bench.ts` + `long-bench/elevation.ts`) for v0.3.2.
// The pixel-era floor plan, the four scattered stations, the minion figure,
// `stripSlot`'s N-spacing and the wall clamps retired with it (§5.3).
//
// What this file owns: the canvas, the ink, the RAF loop and the hit
// regions. What it does NOT own: every coordinate (projection.ts) and the
// walk + crossing state machine (crossing.ts) — both pure, both where
// vitest can reach them.
//
// The controller surface is extended, not broken: setRoster / setSelected /
// setStrip / getStationPos / getFloorSize / pauseRaf / resumeRaf / destroy,
// plus resize / setTube / setVacant / deliver. `getStationPos` now answers
// with the figure's CURRENT position — the D4 fix (#00041 §2.3): the old
// seam returned the walk destination and the plumb-line led the figure by
// up to 223 px.
// =============================================================================

import {createLongBench, archPath, quadAt} from './crossing';
import {drawScientist} from './figure';
import {AMBER, INK, MINT, PAPER, PENCIL, RED, SHADE, SketchPen} from './pen';
import * as Projection from './projection';

// How many 60fps frames each ink pose holds before re-jittering.
// 14 ≈ 4.3 redraws/sec — a calm, deliberate boil.
const BOIL_HOLD = 14;

// §10: give the two colleagues different clocks. The Heretic breathes a
// little slower and blinks a little less — two figures breathing in unison
// read as one puppet with two heads.
const ACTING_RATE = {'mad-scientist': 1, heretic: 0.78};
const ACTING_OFFSET = {'mad-scientist': 0, heretic: 1};

// The voice — locked at #00049 (§ The Voice in CLAUDE.md). A paraphrase
// here is a voice-lock violation.
const CRASH_VOICE = 'Mission ended in failure. Recall to clear.';
const IDLE_WARN_VOICE = 'Idle 1h+';
const RECALL_NOTE = '[ recall ]';
// The empty voice, re-voiced for the one path that still reaches it (#00041
// §12 #8, ruled 2026-09-22): nothing is dispatched any more, so an empty end
// of the bench means that colleague's bench failed to open.
const VACANT_VOICE = 'Balcony quiet.';
const VACANT_RECOVERY = 'Retry from its nameplate above.';
const FOOTER = 'the long bench · a live page';

const COLLEAGUE_IDS = ['mad-scientist', 'heretic'];

// Activity tint — the caption dot and the wash share it. MINT and AMBER
// measure 2.54 and 2.49 on paper and never carry text (#00041 §2.4).
const STATE_TINT = {
    idle: SHADE,
    thinking: AMBER,
    writing: MINT,
    reading: '#4a7ba6',
    running: MINT,
    waiting: '#8a8ba2',
    error: RED,
};

// --- the paper -------------------------------------------------------------

/** The page, pre-rendered once per width at the drawing's full 200 px —
 *  the strip is a crop of it, so there is only ever one paper. Full width,
 *  full bleed: no integer SCALE, no centred 992 px island (D1), no crop
 *  that eats the page's own dressing (D2). */
function makePaper(w, dpr) {
    const h = Projection.BENCH_BAND_H;
    const page = document.createElement('canvas');
    page.width = Math.max(1, Math.round(w * dpr));
    page.height = Math.max(1, Math.round(h * dpr));
    const px = page.getContext('2d');
    if (!px) return page;
    px.scale(dpr, dpr);
    px.fillStyle = PAPER;
    px.fillRect(0, 0, w, h);
    px.strokeStyle = '#9fb4c4';
    px.globalAlpha = 0.16;
    px.lineWidth = 1;
    const cell = 18;
    for (let x = cell; x < w; x += cell) {
        px.beginPath();
        px.moveTo(x, 0);
        px.lineTo(x, h);
        px.stroke();
    }
    for (let y = cell; y < h; y += cell) {
        px.beginPath();
        px.moveTo(0, y);
        px.lineTo(w, y);
        px.stroke();
    }
    // The coffee ring and the footer never once reached the screen on the
    // old floor (D2 measured the crop that ate them).
    px.globalAlpha = 0.09;
    px.strokeStyle = '#6b4a2a';
    px.lineWidth = 4;
    px.beginPath();
    px.ellipse(w * 0.035, h * 0.16, 21, 19, 0.2, 0.4, Math.PI * 2.1);
    px.stroke();
    px.lineWidth = 1.6;
    px.globalAlpha = 0.06;
    px.beginPath();
    px.ellipse(w * 0.035, h * 0.16, 25, 22, 0.2, 1.2, Math.PI * 1.7);
    px.stroke();
    // Incidental lettering (WCAG 1.4.3's decoration exception) — the page's
    // own signature, not information.
    px.globalAlpha = 0.4;
    px.fillStyle = INK;
    px.font = '12px Caveat, cursive';
    px.textAlign = 'right';
    px.fillText(FOOTER, w - 14, h - 4);
    px.textAlign = 'left';
    px.globalAlpha = 1;
    return page;
}

// --- small ink instruments --------------------------------------------------

function quadPoints(p0, c, p1, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(quadAt(p0, c, p1, i / n));
    return pts;
}

/** Offset a polyline along its normals — how a pipe gets two edges. */
function offsetPolyline(pts, d) {
    return pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        return [p[0] + (-dy / len) * d, p[1] + (dx / len) * d];
    });
}

// --- the bench ---------------------------------------------------------------

/** One continuous top across the full width, an apron that doubles as the
 *  label strip, four legs, and the ground line. Drawn AFTER the figures:
 *  an elevation looks at the bench from in front, so the colleagues stand
 *  behind it and are cut off at the hip. */
function drawBench(pen, geo) {
    const ctx = pen.ctx;
    const {w, benchTopY, boardBottomY, apronBottomY, groundY} = geo;
    pen.s = 1;
    pen.jitter = 0.45;

    // The apron is a board, and a board is OPAQUE: at 0.92 the coats ghosted
    // through it and the elevation read as tracing paper (prototype render).
    // Below it the bench is open, so their shoes stay visible under it.
    ctx.fillStyle = '#ece1c9';
    ctx.fillRect(0, boardBottomY, w, apronBottomY - boardBottomY);
    ctx.fillStyle = '#e4d8bd';
    ctx.fillRect(0, benchTopY, w, boardBottomY - benchTopY);

    pen.line(0, benchTopY, w, benchTopY, 2.6);
    pen.line(0, boardBottomY, w, boardBottomY, 1.6, INK, 0.7);
    pen.line(0, apronBottomY, w, apronBottomY, 2.0, INK, 0.85);

    // Grain, sparse, and kept BELOW every caption baseline: at mid-apron one
    // stroke landed under "The Heretic" and read as an underline.
    pen.jitter = 0.9;
    for (const [i, f] of [0.36, 0.5, 0.64].entries()) {
        const gy = apronBottomY - 7;
        pen.line(w * f, gy, w * f + 74 + i * 22, gy + 1, 1.0, SHADE, 0.32);
    }

    pen.jitter = 0.5;
    for (const f of [0.05, 0.33, 0.67, 0.95]) {
        const lx = w * f;
        pen.tube(lx, apronBottomY - 2, lx + (f < 0.5 ? -1.5 : 1.5), groundY, 3.4, 2.0);
    }

    // A shop drawing dimensions itself: a pencil witness line from the
    // ground to the top of a colleague's hair, with the height stamped
    // beside it. PENCIL carries the LINE and never the letters (§2.4).
    const dimX = 15;
    pen.jitter = 0.35;
    pen.line(dimX, geo.headTopY, dimX, groundY, 1.1, PENCIL, 0.5);
    pen.line(dimX - 4, geo.headTopY, dimX + 4, geo.headTopY, 1.1, PENCIL, 0.5);
    pen.line(dimX - 4, groundY, dimX + 4, groundY, 1.1, PENCIL, 0.5);
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.5;
    ctx.fillText(`${Math.round(geo.figureH)}`, dimX + 7, geo.headTopY + 12);
    ctx.globalAlpha = 1;

    pen.jitter = 0.5;
    pen.line(0, groundY, w, groundY, 2.2, INK, 0.9);
    pen.jitter = 1;
    for (let i = 0; i < 26; i++) {
        const hx = (w / 26) * i + 8;
        pen.line(hx, groundY + 4, hx + 9, groundY + 7, 1.1, SHADE, 0.3);
    }
}

function drawDesk(pen, x, b) {
    for (let i = 0; i < 3; i++) {
        pen.stroke(
            [
                [x - 17 + i * 1.5, b - 2 - i * 3],
                [x + 13 + i * 1.5, b - 4 - i * 3],
                [x + 12 + i * 1.5, b - 20 - i * 3],
                [x - 18 + i * 1.5, b - 18 - i * 3],
                [x - 17 + i * 1.5, b - 2 - i * 3],
            ],
            1.6,
            INK,
            0.75,
        );
    }
    pen.line(x - 12, b - 15, x + 6, b - 16, 1.0, INK, 0.5);
    pen.line(x - 12, b - 11, x + 3, b - 12, 1.0, INK, 0.5);
    pen.stroke(
        [
            [x + 20, b],
            [x + 20, b - 9],
            [x + 30, b - 9],
            [x + 30, b],
        ],
        1.8,
    );
    pen.wash(x + 25, b - 5, 4.5, INK, 0.5);
}

function drawFlask(pen, x, b, frame) {
    pen.stroke(
        [
            [x - 4, b - 26],
            [x - 4, b - 16],
            [x - 12, b - 1],
            [x + 10, b - 1],
            [x + 2, b - 16],
            [x + 2, b - 26],
        ],
        1.8,
    );
    pen.line(x - 6, b - 26, x + 4, b - 26, 1.6);
    pen.wash(x - 1, b - 6, 7, MINT, 0.32);
    const bub = (frame % 90) / 90;
    pen.ellipse(x - 1, b - 8 - bub * 13, 1.6, 1.6, 1.2, INK, 0.5 * (1 - bub));
}

function drawShelf(pen, x, b) {
    for (let i = 0; i < 5; i++) {
        const bx = x - 16 + i * 7;
        const h = 18 + ((i * 5) % 3) * 4;
        const tilt = i === 3 ? 4 : 0;
        pen.stroke(
            [
                [bx, b],
                [bx + tilt, b - h],
                [bx + 5 + tilt, b - h],
                [bx + 5, b],
            ],
            1.6,
            INK,
            0.8,
        );
    }
    pen.line(x - 18, b, x + 16, b, 1.6, INK, 0.6);
}

function drawSlate(pen, x, b) {
    pen.stroke(
        [
            [x - 19, b],
            [x - 15, b - 30],
            [x + 17, b - 32],
            [x + 15, b],
            [x - 19, b],
        ],
        2.0,
    );
    pen.wash(x - 1, b - 16, 15, '#3a4540', 0.42);
    pen.line(x - 11, b - 24, x + 3, b - 25, 1.2, '#e8e4d0', 0.7);
    pen.line(x - 10, b - 19, x + 8, b - 20, 1.2, '#e8e4d0', 0.55);
    pen.scribble(x + 5, b - 12, 4.5, 6, '#e8e4d0', 1.0, 0.45);
}

/** Each colleague's props stand on the benchtop OUTBOARD of the station
 *  they name, so the colleague working there is never drawn behind their
 *  own furniture. The props belong to the bench, not to a live session:
 *  an end whose bench failed to open still has its desk. */
function drawProps(pen, geo, frame) {
    const b = geo.benchTopY;
    pen.s = 1;
    pen.jitter = 0.8;
    for (const id of COLLEAGUE_IDS) {
        const out = id === 'mad-scientist' ? -1 : 1;
        const at = (state) => Projection.benchStationX(geo.w, id, state);
        drawShelf(pen, at('reading') + out * 34, b);
        drawFlask(pen, at('running') + out * 34, b, frame);
        drawDesk(pen, at('writing') + out * 62, b);
        drawSlate(pen, at('thinking') + out * 48, b);
    }
    pen.ctx.globalAlpha = 1;
}

// --- the Speaking Tube --------------------------------------------------------
//
// §11.2: never a panel, card, strip, tile or drawer. It rises out of the bench
// the composition already has, in the one third neither colleague owns.

function drawArch(pen, geo) {
    const {p0, c, p1} = archPath(geo);
    const spine = quadPoints(p0, c, p1, 22);
    pen.s = 1;
    // The brass is the one MACHINED object on a hand-drawn page; it does not
    // boil like a sketched flask. At jitter 0.4 its own wobble buried the
    // capsule under the delivery measurement (prototype, 1.46 ratio).
    pen.jitter = 0.1;
    // A brass pipe is two edges and the metal between them. No gradient (§11.9).
    pen.stroke(offsetPolyline(spine, 3.4), 2.2, INK, 0.9);
    pen.stroke(offsetPolyline(spine, -3.4), 2.0, INK, 0.75);
    pen.stroke(offsetPolyline(spine, -1.2), 2.6, AMBER, 0.55);
    const normals = offsetPolyline(spine, 1);
    for (const t of [0.22, 0.5, 0.78]) {
        const m = quadAt(p0, c, p1, t);
        const n = normals[Math.round(t * 22)];
        const dx = n[0] - m[0];
        const dy = n[1] - m[1];
        const len = Math.hypot(dx, dy) || 1;
        pen.line(m[0] + (dx / len) * 5, m[1] + (dy / len) * 5, m[0] - (dx / len) * 5, m[1] - (dy / len) * 5, 2.0);
    }
}

function drawBell(pen, geo, x) {
    const top = geo.bellTopY;
    pen.s = 1;
    pen.jitter = 0.14;
    pen.tube(x, geo.benchTopY, x, top + 7, 2.6, 2.0);
    pen.line(x - 9, top, x - 2.5, top + 8, 2.0);
    pen.line(x + 9, top, x + 2.5, top + 8, 2.0);
    pen.ellipse(x, top, 9, 2.8, 2.0);
    pen.wash(x, top + 1, 6.5, AMBER, 0.22);
}

/** A folded paper capsule. No hand posts it and no hand catches it (§11.1). */
function drawCapsule(pen, pose) {
    const ctx = pen.ctx;
    const k = 1.7;
    const corners = [
        [-6 * k, -4.2 * k],
        [6 * k, -3.4 * k],
        [5.4 * k, 4.4 * k],
        [-6.2 * k, 3.6 * k],
    ];
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.angle);
    ctx.fillStyle = '#fffdf2';
    ctx.globalAlpha = 0.96;
    ctx.beginPath();
    ctx.moveTo(corners[0][0], corners[0][1]);
    for (const [cx, cy] of corners.slice(1)) ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    pen.s = k;
    pen.jitter = 0.7;
    pen.stroke([...corners, corners[0]], 1.5);
    pen.line(-6 * k, -4.2 * k, 0.4 * k, 0.6 * k, 1.2, INK, 0.65);
    pen.s = 1;
    ctx.restore();
}

// --- the cast ----------------------------------------------------------------

/** The wash that replaced the CSS light pools, drawn INSIDE the tick that
 *  places the figure (§5.3): the light and the thing it lights can no longer
 *  disagree, because there is no second system for D4 to travel through. */
function drawFigure(pen, geo, v) {
    const ctx = pen.ctx;
    const k = Projection.washStrength(v.activity, v.selected);
    pen.s = 1;
    pen.jitter = 1;
    pen.wash(v.x, geo.groundY - 46, 62, AMBER, 0.055 * k);
    pen.wash(v.x + 4, geo.groundY - 30, 40, STATE_TINT[v.activity] ?? SHADE, 0.07 * k);

    ctx.save();
    if (v.mirrored) {
        ctx.translate(v.x, 0);
        ctx.scale(-1, 1);
        ctx.translate(-v.x, 0);
    }
    drawScientist(pen, {
        x: v.x,
        groundY: geo.groundY,
        s: geo.s,
        activity: v.activity,
        walking: v.walking,
        facing: v.facing,
        t: v.t,
        frame: v.frame,
        ghosts: v.selected,
        heretic: v.id === 'heretic',
    });
    ctx.restore();
}

/** §5.4 + §10: `thinking` walks them toward each other, and the thought goes
 *  where they are going — a dotted trail from the figure's own `?` to the
 *  empty air over the arch, so two thinking colleagues converge there. */
function drawThoughtTrail(pen, geo, v) {
    if (v.activity !== 'thinking') return;
    const s = geo.s;
    const headY = geo.groundY - (66 + 48 + 30) * s;
    const dir = v.mirrored ? -1 : 1;
    const from = [v.x + dir * 34 * s, headY - 32 * s];
    const to = [geo.w / 2, geo.archApexY - 16];
    const c = [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - 22];
    pen.s = 1;
    pen.jitter = 1.1;
    for (let i = 1; i <= 4; i++) {
        const p = quadAt(from, c, to, i / 5);
        pen.ellipse(p[0], p[1], 2.2 + i * 0.5, 2.0 + i * 0.5, 1.2, INK, 0.34);
    }
    pen.wash(to[0], to[1], 13, AMBER, 0.14);
    pen.scribble(to[0], to[1], 7, 9, INK, 1.1, 0.4);
}

// --- the label strip ------------------------------------------------------------
//
// §10's collision: a hand-written label carrying a stamped serial number —
// Caveat for the name and the state, JetBrains Mono for the elapsed clock.
// Every run is INK or RED on paper at alpha >= 0.75 (>= 6:1 and 4.62:1).

function applyFont(ctx, run) {
    ctx.font =
        run.font === 'mono'
            ? `${run.weight ?? 400} ${run.size}px "JetBrains Mono", monospace`
            : `${run.weight ?? 500} ${run.size}px Caveat, cursive`;
}

/** Lay out a mixed-typeface line on one baseline; returns each run's x. */
function layoutRuns(ctx, x, runs, align) {
    const widths = runs.map((run) => {
        applyFont(ctx, run);
        return ctx.measureText(run.text).width;
    });
    const total = widths.reduce((a, b) => a + b, 0);
    let cursor = align === 'left' ? x : align === 'right' ? x - total : x - total / 2;
    const starts = widths.map((width) => {
        const at = cursor;
        cursor += width;
        return at;
    });
    return {total, starts, widths};
}

function drawRuns(ctx, x, y, runs, align = 'left') {
    const layout = layoutRuns(ctx, x, runs, align);
    ctx.textAlign = 'left';
    for (const [i, run] of runs.entries()) {
        applyFont(ctx, run);
        ctx.fillStyle = run.colour ?? INK;
        ctx.globalAlpha = run.alpha ?? 1;
        ctx.fillText(run.text, layout.starts[i], y);
    }
    ctx.globalAlpha = 1;
    return layout;
}

function stateDot(ctx, x, y, state, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = STATE_TINT[state] ?? SHADE;
    ctx.beginPath();
    ctx.arc(x, y, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
}

function elapsedFor(startedAtMs) {
    if (typeof startedAtMs !== 'number' || Number.isNaN(startedAtMs)) return '—';
    const seconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}

/** Line one: name · state · clock — or the idle warning in INK at reduced
 *  weight in place of the clock (§2.4: never PENCIL on paper). */
function captionRuns(note, activity) {
    const runs = [
        {text: note.target || '—', font: 'caveat', size: 17, weight: 700},
        {text: ` · ${activity} · `, font: 'caveat', size: 16, alpha: 0.8},
    ];
    if (note.idleWarn === true) runs.push({text: IDLE_WARN_VOICE, font: 'caveat', size: 16, alpha: 0.8});
    else runs.push({text: elapsedFor(note.startedAtMs), font: 'mono', size: 11, alpha: 0.78});
    return runs;
}

/** Line two: the crash voice in RED (4.62:1 on paper, legal) with its
 *  always-visible `[ recall ]`, or the selected colleague's `[ recall ]`. */
function secondLineRuns(note, selected) {
    if (note.crashed === true) {
        return [
            {text: `${CRASH_VOICE}  `, font: 'caveat', size: 15, colour: RED},
            {text: RECALL_NOTE, font: 'caveat', size: 15, colour: RED, recall: true},
        ];
    }
    return selected ? [{text: RECALL_NOTE, font: 'caveat', size: 15, alpha: 0.85, recall: true}] : [];
}

export function initScene(opts) {
    'use strict';

    const canvas = opts.canvas;
    const onInteraction = typeof opts.onInteraction === 'function' ? opts.onInteraction : () => {};
    const onPlaced = typeof opts.onPlaced === 'function' ? opts.onPlaced : () => {};

    const ctx = canvas.getContext('2d');
    const DPR = window.devicePixelRatio || 1;
    const hostWidth = canvas.parentElement?.clientWidth || window.innerWidth || 1;

    const bench = createLongBench(hostWidth, false);
    let geo = bench.geometry;
    let stripMode = false;
    let selectedId = null;
    let destroyed = false;
    let rafPaused = false;
    let rafHandle = 0;
    let lastTs = null;
    let clockS = 0;
    let lastPlacedKey = '';

    /** Caption notes per colleague: target label, startedAtMs, idle, crash. */
    const notes = new Map();
    const scientistIdOf = new Map();
    let tubeWords = {'mad-scientist': '', heretic: ''};
    let vacant = [];
    let hits = [];

    const pen = ctx ? new SketchPen(ctx) : null;
    let paper = ctx ? makePaper(geo.w, DPR) : null;

    // --- Reduced-Motion Gate (WCAG 2.3.3 AAA, gadget protocol) ---
    // The boil pins to one seeded pose and the acting clock stops, but the
    // figures still WALK: locomotion is positional state (#00059 §4), and
    // where a figure stands on the bench IS the state (#00041 §5.5).
    const reducedMotionQuery =
        typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let reducedMotion = reducedMotionQuery ? reducedMotionQuery.matches : false;
    bench.setReducedMotion(reducedMotion);
    function onReducedMotionChange(e) {
        reducedMotion = e.matches;
        bench.setReducedMotion(reducedMotion);
    }
    reducedMotionQuery?.addEventListener('change', onReducedMotionChange);

    const boilSeed = () => (reducedMotion ? 0 : Math.floor((clockS * 60) / BOIL_HOLD));
    const actingTime = (id) =>
        reducedMotion ? ACTING_OFFSET[id] * 1.7 : clockS * ACTING_RATE[id] + ACTING_OFFSET[id] * 1.7;
    const actingFrame = (id) =>
        reducedMotion ? ACTING_OFFSET[id] * 37 : Math.floor(clockS * 60 * ACTING_RATE[id]) + ACTING_OFFSET[id] * 37;

    function sizeCanvas() {
        canvas.width = Math.max(1, Math.round(geo.w * DPR));
        canvas.height = Math.max(1, Math.round(geo.bandH * DPR));
        canvas.style.width = `${geo.w}px`;
        canvas.style.height = `${geo.bandH}px`;
    }
    sizeCanvas();

    function viewOf(a) {
        // `figure.ts` writes real glyphs for `thinking` (?) and `error` (!!);
        // a mirrored context reverses them into nonsense, so those two states
        // keep the art's native facing. Every other state turns.
        const mirrored = a.faceDir < 0 && a.activity !== 'thinking' && a.activity !== 'error';
        return {
            id: a.id,
            x: a.x,
            activity: a.activity,
            // A paused page never holds a figure mid-stride: the place is
            // honest, the stride would not be (trip-wire 6).
            walking: a.walking && !rafPaused,
            // Lean is expressed in the ART's frame: a mirrored figure walking
            // left leans "forward" in its own coordinates.
            facing: mirrored ? -a.faceDir : a.faceDir,
            mirrored,
            selected: scientistIdOf.get(a.id) === selectedId && selectedId !== null,
            t: actingTime(a.id),
            frame: actingFrame(a.id),
        };
    }

    function visibleY(y) {
        return y >= geo.cropTop && y <= geo.cropTop + geo.bandH;
    }

    function drawCaptions() {
        const base1 = geo.benchTopY + 22;
        const base2 = geo.benchTopY + 37;
        for (const a of bench.actors()) {
            const note = notes.get(a.id);
            if (!note) continue;
            const left = a.id === 'mad-scientist';
            const anchor = left ? 26 : geo.w - 26;
            const align = left ? 'left' : 'right';
            const selected = scientistIdOf.get(a.id) === selectedId && selectedId !== null;
            const line1 = drawRuns(ctx, left ? anchor + 13 : anchor, base1, captionRuns(note, a.activity), align);
            const dotX = left ? anchor + 4 : anchor - line1.total - 9;
            const pulse =
                a.activity === 'error' && !reducedMotion ? (Math.floor(clockS * 2) % 2 === 0 ? 1 : 0.4) : 0.92;
            stateDot(ctx, dotX, base1 - 5, a.activity, pulse);
            const runs2 = secondLineRuns(note, selected);
            const line2 = runs2.length > 0 ? drawRuns(ctx, left ? anchor + 13 : anchor, base2, runs2, align) : null;
            const id = scientistIdOf.get(a.id);
            if (!id || !visibleY(base1)) continue;
            const x0 = Math.min(dotX - 6, line1.starts[0]);
            hits.push({
                id,
                kind: 'plate',
                rect: {x: x0, y: base1 - 17, w: line1.total + (line1.starts[0] - x0), h: 22},
            });
            if (!line2) continue;
            const r = runs2.findIndex((run) => run.recall === true);
            hits.push({
                id,
                kind: 'recall',
                rect: {x: line2.starts[r] - 4, y: base2 - 15, w: line2.widths[r] + 8, h: 20},
            });
        }
    }

    function drawTubeWords() {
        const ids = COLLEAGUE_IDS.filter((id) => tubeWords[id]);
        if (!stripMode) {
            // §11.3: never a tooltip — written on the woodwork under its own bell.
            for (const id of ids) {
                drawRuns(
                    ctx,
                    geo.bell[id],
                    geo.benchTopY + 22,
                    [{text: tubeWords[id], font: 'caveat', size: 15, alpha: 0.85}],
                    'center',
                );
            }
            return;
        }
        // The strip's crop loses the apron, so the two strings re-home INSIDE
        // the arch, stacked under its crown between the bells (prototype
        // deviation 2: the alternative was losing the tube's voice at 64 px).
        for (const [i, id] of ids.entries()) {
            drawRuns(
                ctx,
                geo.w / 2,
                geo.bellTopY - 6 + i * 13,
                [{text: tubeWords[id], font: 'caveat', size: 14, alpha: 0.85}],
                'center',
            );
        }
    }

    /** The one path that still reaches an empty end of the bench. */
    function drawVacancies() {
        for (const v of vacant) {
            if (bench.actor(v.colleague)) continue;
            const x = geo.home[v.colleague];
            if (stripMode) {
                drawRuns(
                    ctx,
                    x,
                    geo.cropTop + 38,
                    [{text: VACANT_VOICE, font: 'caveat', size: 18, alpha: 0.85}],
                    'center',
                );
                continue;
            }
            const y = geo.groundY - 104;
            drawRuns(ctx, x, y, [{text: VACANT_VOICE, font: 'caveat', size: 20, weight: 700, alpha: 0.9}], 'center');
            drawRuns(
                ctx,
                x,
                y + 20,
                [{text: `${v.label}'s bench did not open.`, font: 'caveat', size: 17, alpha: 0.85}],
                'center',
            );
            drawRuns(ctx, x, y + 38, [{text: VACANT_RECOVERY, font: 'caveat', size: 16, alpha: 0.8}], 'center');
        }
    }

    function render() {
        if (!ctx || !pen || destroyed) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(DPR, 0, 0, DPR, 0, -geo.cropTop * DPR);
        if (paper) ctx.drawImage(paper, 0, 0, geo.w, Projection.BENCH_BAND_H);
        pen.beginFrame(boilSeed());
        hits = [];
        const fr = reducedMotion ? 0 : Math.floor(clockS * 60);

        const views = bench.actors().map(viewOf);
        for (const v of views) drawFigure(pen, geo, v);
        for (const v of views) drawThoughtTrail(pen, geo, v);
        drawBench(pen, geo);
        drawProps(pen, geo, fr);
        drawArch(pen, geo);
        drawBell(pen, geo, geo.bell['mad-scientist']);
        drawBell(pen, geo, geo.bell.heretic);
        const capsule = bench.capsule();
        if (capsule) drawCapsule(pen, capsule);
        drawCaptions();
        drawTubeWords();
        drawVacancies();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /** Tell the host the selected figure moved (or the drawing re-cut), so the
     *  plumb-line re-reads the CURRENT x in the same frame the figure moved.
     *  Only fires on change — a standing figure costs nothing. */
    function reportPlacement() {
        const selected = COLLEAGUE_IDS.find((id) => scientistIdOf.get(id) === selectedId && selectedId !== null);
        const a = selected ? bench.actor(selected) : null;
        const key = `${a ? Math.round(a.x * 4) : 'none'}|${geo.w}|${geo.cropTop}`;
        if (key === lastPlacedKey) return;
        lastPlacedKey = key;
        onPlaced();
    }

    function markPhase() {
        if (canvas.dataset && canvas.dataset.benchPhase !== bench.phase) canvas.dataset.benchPhase = bench.phase;
    }

    function tick(dt) {
        clockS += reducedMotion ? 0 : dt;
        bench.advance(dt);
        render();
        markPhase();
        reportPlacement();
    }

    function gameLoop(ts) {
        if (rafPaused || destroyed) return;
        rafHandle = requestAnimationFrame(gameLoop);
        // Real elapsed time, clamped: a crossing takes the same seconds on a
        // 144 Hz panel and under a software renderer, and a long stall never
        // teleports a figure across the bench.
        const dt = lastTs === null ? 0 : Math.min(0.05, Math.max(0, (ts - lastTs) / 1000));
        lastTs = ts;
        tick(dt);
    }

    function startLoop() {
        if (destroyed || !ctx) return;
        tick(0);
        if (!rafPaused) rafHandle = requestAnimationFrame(gameLoop);
    }

    // Font guard (#00059 §12): wait for the hand-written weights AND the
    // stamped mono before the first caption lands — a fallback-font flash is
    // exactly the seam this page exists to remove.
    const fontsApi = typeof document !== 'undefined' ? document.fonts : undefined;
    if (ctx && fontsApi && typeof fontsApi.load === 'function') {
        Promise.all([
            fontsApi.load('500 16px Caveat'),
            fontsApi.load('700 16px Caveat'),
            fontsApi.load('400 11px "JetBrains Mono"'),
        ])
            .catch(() => {})
            .then(startLoop);
    } else {
        startLoop();
    }

    // --- Pointer handling (canvas hit regions) ---
    function drawingCoords(event) {
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        return {
            x: ((event.clientX - r.left) * geo.w) / r.width,
            y: ((event.clientY - r.top) * geo.bandH) / r.height + geo.cropTop,
        };
    }

    function rectContains(rect, pt) {
        return pt.x >= rect.x && pt.x <= rect.x + rect.w && pt.y >= rect.y && pt.y <= rect.y + rect.h;
    }

    function hitFigure(pt) {
        for (const a of bench.actors()) {
            const halfW = 30 * geo.s;
            if (pt.x >= a.x - halfW && pt.x <= a.x + halfW && pt.y >= geo.headTopY - 6 && pt.y <= geo.groundY + 6) {
                return scientistIdOf.get(a.id) ?? null;
            }
        }
        return null;
    }

    function onClick(event) {
        const pt = drawingCoords(event);
        if (!pt) return;
        // the [ recall ] note outranks the caption it sits inside
        const recall = hits.find((hit) => hit.kind === 'recall' && rectContains(hit.rect, pt));
        if (recall) {
            onInteraction({type: 'interaction', action: Projection.recallScientistAction(recall.id)});
            return;
        }
        const plate = hits.find((hit) => hit.kind === 'plate' && rectContains(hit.rect, pt));
        const id = plate ? plate.id : hitFigure(pt);
        if (id) onInteraction({type: 'interaction', action: Projection.selectScientistAction(id)});
    }

    function onMouseMove(event) {
        const pt = drawingCoords(event);
        const over = pt && (hits.some((hit) => rectContains(hit.rect, pt)) || hitFigure(pt) !== null);
        canvas.style.cursor = over ? 'pointer' : 'default';
    }

    function onMouseLeave() {
        canvas.style.cursor = 'default';
    }

    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);

    /** Re-cut the drawing (width or posture) without losing a single place. */
    function recut(width, strip) {
        bench.resize(width, strip);
        geo = bench.geometry;
        stripMode = strip;
        if (ctx) paper = makePaper(geo.w, DPR);
        sizeCanvas();
        render();
        reportPlacement();
    }

    // --- Controller surface ---

    /** Exactly two figures, ever (trip-wire 4): only the two colleagues are
     *  seated. A roster row with no colleague draws nothing. */
    function setRoster(rosterEntries) {
        const list = Array.isArray(rosterEntries) ? rosterEntries : [];
        for (const id of COLLEAGUE_IDS) {
            const entry = list.find((e) => e.colleague === id);
            if (entry) {
                bench.seat(id, Projection.isActivityState(entry.activity) ? entry.activity : 'idle');
                notes.set(id, entry);
                scientistIdOf.set(id, entry.id);
            } else {
                bench.unseat(id);
                notes.delete(id);
                scientistIdOf.delete(id);
            }
        }
    }

    function setSelected(scientistId) {
        selectedId = scientistId ?? null;
        reportPlacement();
    }

    function setStrip(on) {
        const next = Boolean(on);
        if (next === stripMode) return;
        recut(geo.w, next);
    }

    function resize(width) {
        if (!(width >= 2) || Math.round(width) === Math.round(geo.w)) return;
        recut(Math.round(width), stripMode);
    }

    function setTube(labels) {
        tubeWords = {'mad-scientist': labels?.['mad-scientist'] ?? '', heretic: labels?.heretic ?? ''};
    }

    function setVacant(list) {
        vacant = Array.isArray(list) ? list : [];
    }

    /** One rise of mail at `colleague`'s bench. A paused page (another page
     *  showing, or the window unfocused) lands it at once: the investor did
     *  not witness the flight, so it is never replayed for them (§2.7). */
    function deliver(colleague) {
        const outcome = bench.deliver(colleague, rafPaused || reducedMotion);
        if (rafPaused) {
            render();
            markPhase();
            reportPlacement();
        }
        return outcome;
    }

    function getStationPos(scientistId) {
        const id = COLLEAGUE_IDS.find((c) => scientistIdOf.get(c) === scientistId);
        const a = id ? bench.actor(id) : null;
        return a ? Projection.plumbLanding(geo, a.x) : null;
    }

    function getFloorSize() {
        return {w: geo.w, h: geo.bandH};
    }

    function pauseRaf() {
        rafPaused = true;
        if (rafHandle) cancelAnimationFrame(rafHandle);
        rafHandle = 0;
        // A capsule in the pipe has no place to be, so it lands; a walk holds
        // exactly where it stands (§5.6). Redraw once so a visible-but-
        // unfocused window never shows either frozen in transit.
        bench.land();
        render();
        markPhase();
    }

    function resumeRaf() {
        if (!rafPaused || destroyed) return;
        rafPaused = false;
        lastTs = null;
        if (ctx) rafHandle = requestAnimationFrame(gameLoop);
    }

    function destroy() {
        destroyed = true;
        rafPaused = true;
        if (rafHandle) cancelAnimationFrame(rafHandle);
        reducedMotionQuery?.removeEventListener('change', onReducedMotionChange);
        canvas.removeEventListener('click', onClick);
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mouseleave', onMouseLeave);
    }

    return {
        setRoster,
        setSelected,
        setStrip,
        setTube,
        setVacant,
        deliver,
        resize,
        getStationPos,
        getFloorSize,
        pauseRaf,
        resumeRaf,
        destroy,
    };
}
