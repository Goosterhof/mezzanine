// =============================================================================
// The Field Journal — the lab floor as a page (#00059).
//
// The pixel engine that lived here (lifted from the Pixel Lab in #00052,
// promoted to the permanent lower storey by #00057) retired in J-2 of the
// Field Journal arc. The floor no longer pretends to be a screen: it is a
// page from the Mad Scientist's journal, and on the page the Scientist
// draws what they see below the railing — boiling-ink figures, ink-drawn
// stations, watercolour activity washes, hand-written Caveat captions.
//
// What survived the renderer swap, unchanged:
//   - the controller surface: setRoster / setSelected / setStrip /
//     getStationPos / getFloorSize / pauseRaf / resumeRaf / destroy
//   - the projection module as the single geometric authority
//   - the character system: one character per dispatched scientist,
//     walk state machine toward POSITIONS stations, idle pacing,
//     spawn/despawn lifecycle
//
// What changed: every draw call. The SketchPen (src/observer/pen.ts) and
// the ink figure (src/observer/figure.ts) — ported from the ratified
// Atelier mock at prototypes/the-atelier/ — replace the fillRect tiles
// and the bitmap pixel font. The walk skeleton runs at 60fps; the ink
// re-jitters every BOIL_HOLD frames (~4.3 boils per second).
//
// Divergences from the approved mock, locked in the experiment log §10:
//   #1 positions come from projection.ts's stationTable, not fx*W
//   #2 uniform figure scale — no two-row depth (parked to §13)
//   #3 the empty voice is canvas-drawn, not a DOM overlay
//   #4 recall is a canvas hit-region riding the recallScientist:<id>
//      wire action (projection.ts owns both ends)
// Build divergence, recorded in §8: the four ink stations render as
// permanent fixtures at their POSITIONS anchors rather than once per
// scientist — two writers share one desk instead of double-inking it.
// The pixel-era LAB anchor table retired with the pixel furniture it
// anchored; POSITIONS is the only authority the ink consults.

import {drawScientist, figureHeadTop} from './figure';
import * as Core from './lab-core.js';
import {AMBER, INK, MINT, PAPER, PENCIL, RED, SHADE, SketchPen} from './pen';
// The geometric spine — station positions, minion offsets, the strip-row
// projection, floor size, and the select/recall wire formats — a pure,
// unit-tested module (#00057 §12, #00059 J-3). This file keeps the Canvas
// and the RAF loop; the arithmetic lives where vitest can reach it.
import * as Projection from './projection';

// How many 60fps frames each ink pose holds before re-jittering.
// 14 ≈ 4.3 redraws/sec — a calm, deliberate boil. Lower = more nervous.
const BOIL_HOLD = 14;

// The voice — locked at #00049, migrated venue (DOM plate → page) in J-3.
// These strings are verbatim from the retired DOM railing plate and
// LabFloor.vue's retired overlay; a paraphrase here is a voice-lock
// violation (§14).
const CRASH_VOICE = 'Mission ended in failure. Recall to clear.';
const IDLE_WARN_VOICE = 'Idle 1h+';
const RECALL_NOTE = '[ recall ]';
const EMPTY_VOICE_FULL = 'Balcony quiet. No scientists dispatched.';
const EMPTY_VOICE_STRIP = 'Balcony quiet.';

// Activity tint map — the margin-note dot and the watercolour pool share
// it. Ported from the mock's STATE_TINT; reading/waiting carry the two
// page-blues the mock minted inline.
const STATE_TINT = {
    idle: SHADE,
    thinking: AMBER,
    writing: MINT,
    reading: '#4a7ba6',
    running: MINT,
    waiting: '#8a8ba2',
    error: RED,
};

export function initScene(opts) {
    'use strict';

    const canvas = opts.canvas;
    const onInteraction = typeof opts.onInteraction === 'function' ? opts.onInteraction : () => {};

    // --- Logical floor plan (the unchanged geometric spine) ---
    const TILE = Core.TILE ?? 16;
    const COLS = Core.COLS ?? 28;
    const ROWS = Core.ROWS ?? 16;
    const LW = COLS * TILE; // logical floor width
    const LH = ROWS * TILE; // logical floor height
    const FLOOR_PLAN = {tile: TILE, w: LW, h: LH};
    const POSITIONS = Projection.stationTable(TILE);

    // Sprite-anchor → ground-line offsets, inherited from the pixel
    // sprites' feet rows so getStationPos coordinates stay comparable.
    const SCIENTIST_FEET = 14;
    const MINION_FEET = 9;

    // --- Canvas setup (full-DPR backing store; the ink draws in device px) ---
    // J-2 blit decision (§8): the paper offscreen buffer renders at the
    // canvas's full backing-store resolution and blits 1:1 — no scaling
    // pass exists for image smoothing to ruin, so the pixel-era
    // `imageSmoothingEnabled = false` is retired along with the tiles
    // it protected.
    const ctx = canvas.getContext('2d');
    const DPR = window.devicePixelRatio || 1;
    const maxCSSWidth = window.innerWidth - 20;
    const maxCSSHeight = window.innerHeight - 40;
    const SCALE = Math.max(1, Math.floor(Math.min(maxCSSWidth / LW, maxCSSHeight / LH)));
    const K = SCALE * DPR; // logical px → device px
    canvas.width = LW * SCALE * DPR;
    canvas.height = LH * SCALE * DPR;
    canvas.style.width = `${LW * SCALE}px`;
    canvas.style.height = `${LH * SCALE}px`;

    let W = canvas.width;
    let H = canvas.height;

    // Figure scale units — uniform per figure class (§10 divergence #2).
    const SCI_S = 0.16 * K;
    const MINION_S = 0.11 * K;

    if (!ctx) {
        // jsdom (or a hostile host) — no 2D context, no page. Honour the
        // controller contract with inert methods so the Vue seam holds.
        const noop = () => {};
        return {
            setRoster: noop,
            setSelected: noop,
            setStrip: noop,
            getStationPos: () => ({x: POSITIONS.idle.x, y: POSITIONS.idle.y}),
            getFloorSize: () => Projection.floorSize(false, FLOOR_PLAN),
            pauseRaf: noop,
            resumeRaf: noop,
            destroy: noop,
        };
    }

    const pen = new SketchPen(ctx);

    // --- Host messaging (Mezzanine controller surface) ---
    function sendToExtension(msg) {
        onInteraction(msg);
    }

    // --- The paper (pre-rendered once per geometry, blitted per frame) ---
    // Ported from the Atelier's renderPaper: graph-paper grid, a coffee
    // ring banished to the bottom-left margin, two pieces of tape, and a
    // hand-written footer. Initialised in initScene; re-rendered only
    // when setStrip changes the canvas geometry — never per frame.
    function makePaper(w, h) {
        const page = document.createElement('canvas');
        page.width = Math.max(1, w);
        page.height = Math.max(1, h);
        const px = page.getContext('2d');
        if (!px) return page; // jsdom — a blank page still blits 1:1
        const s = Math.min(w / 900, h / 420);
        px.fillStyle = PAPER;
        px.fillRect(0, 0, w, h);
        // graph-paper grid
        px.strokeStyle = '#9fb4c4';
        px.globalAlpha = 0.16;
        px.lineWidth = 1;
        const cell = Math.max(14, Math.round(18 * s));
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
        if (h > Projection.STRIP_CSS_HEIGHT * DPR) {
            // coffee ring — bottom-left margin, off the station band
            px.globalAlpha = 0.09;
            px.strokeStyle = '#6b4a2a';
            px.lineWidth = 5 * s;
            px.beginPath();
            px.ellipse(w * 0.05, h * 0.88, 26 * s, 24 * s, 0.2, 0.4, Math.PI * 2.1);
            px.stroke();
            px.lineWidth = 2 * s;
            px.globalAlpha = 0.06;
            px.beginPath();
            px.ellipse(w * 0.05, h * 0.88, 31 * s, 28 * s, 0.2, 1.2, Math.PI * 1.7);
            px.stroke();
            // tape holding the page to the railing
            px.globalAlpha = 0.5;
            for (const [tx, rot] of [
                [w * 0.06, -0.18],
                [w * 0.82, 0.14],
            ]) {
                px.save();
                px.translate(tx, h * 0.045);
                px.rotate(rot);
                px.fillStyle = '#fffdf2';
                px.fillRect(0, 0, 52 * s, 16 * s);
                px.globalAlpha = 0.12;
                px.fillStyle = '#6b5a3a';
                px.fillRect(0, 14 * s, 52 * s, 2 * s);
                px.restore();
                px.globalAlpha = 0.5;
            }
            // footer
            px.globalAlpha = 0.45;
            px.fillStyle = INK;
            px.font = `${Math.round(13 * s)}px Caveat, cursive`;
            px.textAlign = 'right';
            px.fillText('the lab floor · a live page', w - 12 * s, h - 10 * s);
        }
        px.globalAlpha = 1;
        return page;
    }

    let paper = makePaper(W, H);

    // --- Character system (unchanged walk spine) ---
    const createCharacter =
        Core.createCharacter ??
        function createCharacter(id, type, x, y, activity, detail, color) {
            return {
                id,
                type,
                x,
                y,
                targetX: x,
                targetY: y,
                facing: 1,
                walkFrame: 0,
                activity: activity ?? 'idle',
                detail: detail ?? '',
                idleTimer: 0,
                bubbleAlpha: 0,
                speechText: '',
                color: color ?? null,
                spawnPhase: type === 'minion' ? 0 : 5,
                despawning: false,
                _remove: false,
            };
        };

    let characters = [
        createCharacter(
            'scientist',
            'scientist',
            POSITIONS.idle.x,
            POSITIONS.idle.y,
            'idle',
            'Waiting for experiments...',
        ),
    ];

    // --- Idle sub-state system (positional pacing survives the swap) ---
    const IDLE_SUBSTATES = ['standing', 'pacing', 'fidgeting', 'looking', 'standing'];
    const IDLE_SUBSTATE_DURATION = 240; // 4 seconds on the 60fps skeleton

    const IDLE_WAYPOINTS = [
        {x: 7 * TILE, y: 7 * TILE},
        {x: 11 * TILE, y: 7 * TILE},
        {x: 9 * TILE, y: 6 * TILE},
        {x: 9 * TILE, y: 8 * TILE},
        {x: 6 * TILE, y: 8 * TILE},
        {x: 12 * TILE, y: 6 * TILE},
        {x: 22 * TILE, y: 7 * TILE},
        {x: 23 * TILE, y: 11 * TILE},
    ];

    let idleSubstateIndex = 0;
    let idleSubstateTimer = 0;
    let idleWaypointIndex = 0;

    // --- State ---
    let frame = 0;
    let stripMode = false;
    let selectedId = null;
    let destroyed = false;

    // Margin-note hit regions, registered at draw time (§11): the page
    // has no DOM, so the nameplate and its [ recall ] note carry their
    // own measured rectangles in device pixels.
    let nameplateHits = [];

    // --- Reduced-Motion Gate (WCAG 2.3.3 AAA, gadget protocol) ---
    // The boil freezes to a single seeded pose; the plumb appears
    // instantly upstairs; but figures still WALK between stations —
    // locomotion is positional state, not decorative animation (§4).
    // The RAF loop therefore keeps running under reduced motion; only
    // the time-derived acting (boil seed, breathe, blink) is pinned.
    const reducedMotionQuery =
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-reduced-motion: reduce)')
            : null;
    let reducedMotion = reducedMotionQuery ? reducedMotionQuery.matches : false;
    if (reducedMotionQuery) {
        reducedMotionQuery.addEventListener('change', (e) => {
            reducedMotion = e.matches;
        });
    }

    function boilSeed() {
        return reducedMotion ? 0 : Math.floor(frame / BOIL_HOLD);
    }

    function actingTime(idx) {
        // de-synced per figure so the floor never breathes in unison
        return reducedMotion ? idx * 1.7 : frame / 60 + idx * 1.7;
    }

    function actingFrame(idx) {
        return reducedMotion ? idx * 37 : frame + idx * 37;
    }

    // --- Character update (the walk state machine, 60fps skeleton) ---
    function updateCharacter(char) {
        const pos = POSITIONS[char.activity] ?? POSITIONS.idle;

        if (char.type === 'minion') {
            const minionIndex = characters.indexOf(char) - 1;
            const station = Projection.minionStation(char.activity, minionIndex, FLOOR_PLAN);
            char.targetX = station.x;
            char.targetY = station.y;
        } else if (char.activity === 'idle') {
            idleSubstateTimer++;
            if (idleSubstateTimer >= IDLE_SUBSTATE_DURATION) {
                idleSubstateTimer = 0;
                idleSubstateIndex = (idleSubstateIndex + 1) % IDLE_SUBSTATES.length;
            }
            const idleSub = IDLE_SUBSTATES[idleSubstateIndex % IDLE_SUBSTATES.length];
            if (idleSub === 'pacing') {
                const wp = IDLE_WAYPOINTS[idleWaypointIndex % IDLE_WAYPOINTS.length];
                char.targetX = wp.x;
                char.targetY = wp.y;
                if (Math.hypot(wp.x - char.x, wp.y - char.y) < 3) {
                    idleWaypointIndex = (idleWaypointIndex + 1) % IDLE_WAYPOINTS.length;
                }
            } else {
                char.targetX = pos.x;
                char.targetY = pos.y;
            }
        } else {
            idleSubstateIndex = 0;
            idleSubstateTimer = 0;
            char.targetX = pos.x;
            char.targetY = pos.y;
        }

        const dx = char.targetX - char.x;
        const dy = char.targetY - char.y;
        const dist = Math.hypot(dx, dy);

        // 12/10 logical px-per-second — the pixel engine's walking pace,
        // re-expressed on the 60fps skeleton (it ticked at 10fps).
        const speed = (char.type === 'minion' ? 1.0 : 1.2) * (10 / 60);
        if (dist > 1.5) {
            char.x += (dx / dist) * speed;
            char.y += (dy / dist) * speed;
            char.facing = dx > 0 ? 1 : dx < 0 ? -1 : char.facing;
            char.walking = true;
        } else {
            char.walking = false;
        }

        // Spawn/despawn — figures grow onto the page over ~0.5s and
        // shrink off it; the ink scales rather than the old pixel poof.
        if (char.despawning) {
            char.spawnPhase = Math.max(0, char.spawnPhase - 1 / 6);
            if (char.spawnPhase <= 0) {
                char._remove = true;
            }
        } else if (char.spawnPhase < 5) {
            char.spawnPhase = Math.min(5, char.spawnPhase + 1 / 6);
        }
    }

    function update() {
        for (const char of characters) {
            updateCharacter(char);
        }
        characters = characters.filter((c) => !c._remove);
    }

    // --- The figures on the page ---
    function activeStripCharacters() {
        return characters.filter((c) => c.scientistId && !c.despawning);
    }

    function drawnCharacters() {
        // dispatched scientists, plus despawning figures still fading off
        return characters.filter((c) => (c.scientistId || c.despawning) && c.spawnPhase > 0);
    }

    function figureScale(char) {
        const base = char.type === 'minion' ? MINION_S : SCI_S;
        return base * Math.min(1, Math.max(0, char.spawnPhase / 5));
    }

    function groundYFor(char) {
        return (char.y + (char.type === 'minion' ? MINION_FEET : SCIENTIST_FEET)) * K;
    }

    /** The minion in ink — a deliberately simpler figure than the full
     *  scientist: smaller scale, a smock instead of the flapping coat,
     *  four hair strokes instead of nine, no goggles, no acting arms. */
    function drawMinionFigure(p) {
        const {x, groundY, s, activity, walking, t} = p;
        pen.s = s;
        pen.jitter = activity === 'error' ? 1.6 : 1;
        const tint = STATE_TINT[activity] ?? SHADE;
        const step = walking ? Math.sin(t * 9) : 0;
        const hipY = groundY - 40 * s;
        const headY = hipY - 30 * s;

        if (p.ghosts === true) {
            pen.jitter = 0.8;
            pen.ellipse(x, headY, 12 * s, 13 * s, 1.0, PENCIL, 0.22);
            pen.line(x, headY + 10 * s, x, hipY + 6 * s, 1.0, PENCIL, 0.18);
            pen.jitter = activity === 'error' ? 1.6 : 1;
        }

        // shadow + activity-tinted smock wash
        pen.wash(x, groundY + 4 * s, 16 * s, SHADE, 0.12);
        pen.wash(x, hipY - 6 * s, 9 * s, tint, 0.14);
        // legs
        pen.line(x - 5 * s + step * 6 * s, groundY, x - 3 * s, hipY + 4 * s, 1.8);
        pen.line(x + 5 * s - step * 6 * s, groundY, x + 3 * s, hipY + 4 * s, 1.8);
        // the smock
        pen.stroke(
            [
                [x - 9 * s, hipY + 6 * s],
                [x - 5 * s, headY + 12 * s],
                [x + 5 * s, headY + 12 * s],
                [x + 9 * s, hipY + 6 * s],
                [x - 9 * s, hipY + 6 * s],
            ],
            1.8,
        );
        // arms
        pen.line(x - 6 * s, headY + 16 * s, x - 10 * s, hipY + 2 * s, 1.6);
        pen.line(x + 6 * s, headY + 16 * s, x + 10 * s, hipY + 2 * s, 1.6);
        // head + a modest four strokes of hair
        pen.ellipse(x, headY, 11 * s, 12 * s, 1.8);
        for (let i = 0; i < 4; i++) {
            const a = -2.4 + i * 0.5;
            pen.line(
                x + Math.cos(a) * 10 * s,
                headY + Math.sin(a) * 10 * s,
                x + Math.cos(a) * 15 * s,
                headY + Math.sin(a) * 15 * s,
                1.4,
            );
        }
        // eyes + mouth
        ctx.fillStyle = INK;
        ctx.fillRect(x - 4 * s, headY + 1 * s, 1.6 * s, 1.6 * s);
        ctx.fillRect(x + 2.4 * s, headY + 1 * s, 1.6 * s, 1.6 * s);
        pen.line(x - 2 * s, headY + 7 * s, x + 2 * s, headY + 7 * s, 1.2);
    }

    // --- The four ink stations (J-2, permanent fixtures) ---
    // desk-with-terminal · flask bench · bookshelf · chalkboard — ported
    // from the mock's drawStation, anchored at the POSITIONS stations
    // the walk machine sends figures to. The furniture sits beside the
    // figure, exactly as the mock placed it.
    function drawStation(type, station, fr) {
        const s = SCI_S;
        const gy = (station.y + SCIENTIST_FEET) * K;
        const x = station.x * K + 52 * s;
        if (type === 'desk') {
            pen.line(x - 26 * s, gy, x + 26 * s, gy - 2 * s, 2.2); // tabletop
            pen.tube(x - 20 * s, gy, x - 18 * s, gy + 26 * s, 1.6 * s, 1.6);
            pen.tube(x + 20 * s, gy - 2 * s, x + 22 * s, gy + 24 * s, 1.6 * s, 1.6);
            // terminal on the desk — the one machine allowed on the page
            pen.stroke(
                [
                    [x - 14 * s, gy - 4 * s],
                    [x + 12 * s, gy - 6 * s],
                    [x + 11 * s, gy - 26 * s],
                    [x - 15 * s, gy - 24 * s],
                    [x - 14 * s, gy - 4 * s],
                ],
                2.0,
            );
            pen.wash(x - 2 * s, gy - 15 * s, 11 * s, MINT, 0.12);
            for (let i = 0; i < 3; i++) {
                const flick = Math.floor(fr / 30 + i) % 3 === 0 ? 2 * s : 0;
                pen.line(x - 10 * s, gy - (20 - i * 5) * s, x + 4 * s + flick, gy - (21 - i * 5) * s, 1.1, MINT, 0.55);
            }
        } else if (type === 'bench') {
            pen.line(x - 24 * s, gy - 2 * s, x + 24 * s, gy, 2.2);
            pen.tube(x - 18 * s, gy - 2 * s, x - 16 * s, gy + 22 * s, 1.6 * s, 1.6);
            pen.tube(x + 18 * s, gy, x + 20 * s, gy + 20 * s, 1.6 * s, 1.6);
            // the flask
            pen.stroke(
                [
                    [x - 4 * s, gy - 22 * s],
                    [x - 4 * s, gy - 14 * s],
                    [x - 12 * s, gy - 3 * s],
                    [x + 8 * s, gy - 3 * s],
                    [x + 1 * s, gy - 14 * s],
                    [x + 1 * s, gy - 22 * s],
                ],
                1.8,
            );
            pen.wash(x - 2 * s, gy - 7 * s, 7 * s, MINT, 0.3);
            const bub = (fr % 90) / 90;
            pen.ellipse(x - 2 * s, gy - 8 * s - bub * 14 * s, 1.6 * s, 1.6 * s, 1.2, INK, 0.5 * (1 - bub));
        } else if (type === 'shelf') {
            pen.stroke(
                [
                    [x - 16 * s, gy],
                    [x - 14 * s, gy - 46 * s],
                    [x + 16 * s, gy - 48 * s],
                    [x + 18 * s, gy + 1 * s],
                    [x - 16 * s, gy],
                ],
                2.2,
            );
            pen.line(x - 15 * s, gy - 16 * s, x + 17 * s, gy - 17 * s, 1.8);
            pen.line(x - 14 * s, gy - 31 * s, x + 16 * s, gy - 33 * s, 1.8);
            for (let i = 0; i < 4; i++) {
                pen.line(x - 10 * s + i * 6 * s, gy - 18 * s, x - 10 * s + i * 6 * s, gy - (28 + (i % 2) * 2) * s, 2.4);
            }
            pen.line(x + 8 * s, gy - 34 * s, x + 13 * s, gy - 44 * s, 2.4); // the tilted book
        } else {
            // the chalkboard
            pen.stroke(
                [
                    [x - 22 * s, gy - 44 * s],
                    [x + 22 * s, gy - 46 * s],
                    [x + 24 * s, gy - 12 * s],
                    [x - 24 * s, gy - 10 * s],
                    [x - 22 * s, gy - 44 * s],
                ],
                2.2,
            );
            pen.wash(x, gy - 28 * s, 22 * s, '#3a4540', 0.5);
            pen.tube(x - 16 * s, gy - 10 * s, x - 20 * s, gy + 12 * s, 1.4 * s, 1.6);
            pen.tube(x + 16 * s, gy - 12 * s, x + 20 * s, gy + 10 * s, 1.4 * s, 1.6);
            pen.line(x - 14 * s, gy - 36 * s, x + 2 * s, gy - 38 * s, 1.3, '#e8e4d0', 0.7);
            pen.line(x - 12 * s, gy - 30 * s, x + 10 * s, gy - 31 * s, 1.3, '#e8e4d0', 0.6);
            pen.scribble(x + 8 * s, gy - 22 * s, 6 * s, 6, '#e8e4d0', 1.1, 0.5);
            ctx.font = `${Math.round(11 * s)}px Caveat, cursive`;
            ctx.fillStyle = '#e8e4d0';
            ctx.globalAlpha = 0.75;
            ctx.fillText('η = 9/10', x - 14 * s, gy - 20 * s);
            ctx.globalAlpha = 1;
        }
    }

    function drawStations(fr) {
        drawStation('desk', POSITIONS.writing, fr);
        drawStation('bench', POSITIONS.running, fr);
        drawStation('shelf', POSITIONS.reading, fr);
        drawStation('board', POSITIONS.thinking, fr);
    }

    // --- Elapsed time, in the plates' retired vocabulary ---
    function elapsedFor(char) {
        if (typeof char.startedAtMs !== 'number' || Number.isNaN(char.startedAtMs)) {
            return '—';
        }
        const seconds = Math.max(0, Math.floor((Date.now() - char.startedAtMs) / 1000));
        if (seconds < 60) {
            return `${seconds}s`;
        }
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
            return `${minutes}m ${seconds % 60}s`;
        }
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m`;
    }

    // --- The margin-note nameplate (J-3) ---
    // state-tinted ink dot · target in Caveat 700 · mission + elapsed in
    // Caveat 500 · pencil underline on the selected figure · and the
    // hand-written [ recall ] note (always on crashed figures, on the
    // selected one otherwise). Hit rects are measured with measureText
    // and registered at draw time — the only honest way to hit-test
    // hand-written text on a canvas (§11).
    function drawNameplate(char, idx) {
        if (!char.scientistId) return;
        const s = SCI_S; // captions stay legible regardless of figure class
        const x = char.x * K;
        const gy = groundYFor(char);
        const isSel = char.scientistId === selectedId;
        const baseY = gy + 22 * s;

        ctx.save();
        ctx.translate(x, baseY);
        ctx.rotate(-0.012);
        ctx.textAlign = 'center';
        ctx.font = `700 ${Math.round(15 * s)}px Caveat, cursive`;
        const target = char.target || '—';
        const targetW = ctx.measureText(target).width;
        // the state dot — pulses on error, like the page is wincing
        const tint = STATE_TINT[char.activity] ?? SHADE;
        const pulse = char.activity === 'error' ? (actingFrame(idx) % 30 < 15 ? 1 : 0.4) : 0.9;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = tint;
        ctx.beginPath();
        ctx.arc(-targetW / 2 - 9 * s, -5 * s, 3.2 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = INK;
        ctx.fillText(target, 0, 0);

        // second line — crash voice > idle warning > mission · elapsed
        ctx.font = `500 ${Math.round(12 * s)}px Caveat, cursive`;
        let secondW = targetW;
        if (char.crashed === true) {
            secondW = ctx.measureText(CRASH_VOICE).width;
            ctx.fillStyle = RED;
            ctx.globalAlpha = 0.92;
            ctx.fillText(CRASH_VOICE, 0, 14 * s);
            ctx.globalAlpha = 1;
        } else if (char.idleWarn === true) {
            const missionPart = `${char.mission || '—'} · `;
            const missionW = ctx.measureText(missionPart).width;
            const warnW = ctx.measureText(IDLE_WARN_VOICE).width;
            secondW = missionW + warnW;
            ctx.textAlign = 'left';
            ctx.globalAlpha = 0.75;
            ctx.fillStyle = INK;
            ctx.fillText(missionPart, -secondW / 2, 14 * s);
            ctx.globalAlpha = 0.6; // dim pencil — the warning whispers
            ctx.fillStyle = PENCIL;
            ctx.fillText(IDLE_WARN_VOICE, -secondW / 2 + missionW, 14 * s);
            ctx.globalAlpha = 1;
            ctx.textAlign = 'center';
        } else {
            const line = `${char.mission || '—'} · ${elapsedFor(char)}`;
            secondW = ctx.measureText(line).width;
            ctx.globalAlpha = 0.75;
            ctx.fillStyle = INK;
            ctx.fillText(line, 0, 14 * s);
            ctx.globalAlpha = 1;
        }

        // the [ recall ] note — always visible on a crashed figure,
        // never hover-gated; the page does not hide exits.
        let recallRect = null;
        const showRecall = char.crashed === true || isSel;
        if (showRecall) {
            ctx.font = `500 ${Math.round(13 * s)}px Caveat, cursive`;
            const noteW = ctx.measureText(RECALL_NOTE).width;
            ctx.fillStyle = char.crashed === true ? RED : INK;
            ctx.globalAlpha = 0.85;
            ctx.fillText(RECALL_NOTE, 0, 29 * s);
            ctx.globalAlpha = 1;
            recallRect = {x: x - noteW / 2 - 4 * s, y: baseY + 29 * s - 13 * s, w: noteW + 8 * s, h: 18 * s};
        }
        ctx.restore();

        // pencil underline — only under the figure being studied
        if (isSel) {
            const uw = targetW * 0.7 + 8 * s;
            pen.s = s;
            pen.curve([x - uw, baseY + 4 * s], [x, baseY + 7 * s], [x + uw * 0.94, baseY + 3 * s], 1.4, INK, 0.8);
        }

        // hit regions — the caption itself selects; the note recalls
        const plateW = Math.max(targetW, secondW) + 16 * s;
        nameplateHits.push({
            id: char.scientistId,
            kind: 'plate',
            rect: {x: x - plateW / 2, y: baseY - 14 * s, w: plateW, h: (showRecall ? 36 : 20) * s},
        });
        if (recallRect) {
            nameplateHits.push({id: char.scientistId, kind: 'recall', rect: recallRect});
        }
    }

    // --- The empty voice (J-3, §10 divergence #3) ---
    // The absence is felt downstairs, written on the page itself.
    function drawEmptyVoice() {
        const msg = stripMode ? EMPTY_VOICE_STRIP : EMPTY_VOICE_FULL;
        const fontPx = stripMode ? Math.max(13, Math.round(H * 0.34)) : Math.max(16, Math.round(H * 0.06));
        ctx.font = `500 ${fontPx}px Caveat, cursive`;
        ctx.fillStyle = INK;
        ctx.globalAlpha = 0.55;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(msg, W / 2, H / 2);
        ctx.globalAlpha = 1;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'start';
    }

    // --- Strip projection (final dressing J-4) ---
    // One 64px row on paper: the figures and only the figures — no
    // furniture, no washes, no captions. stripSlot governs x; the
    // selected figure keeps its construction ghosts.
    function renderStrip() {
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(paper, 0, 0, W, H);
        pen.beginFrame(boilSeed());
        nameplateHits = [];
        const active = activeStripCharacters();
        if (active.length === 0) {
            drawEmptyVoice();
            return;
        }
        const sStrip = (H * 0.82) / 170; // the full figure fits the row
        for (const [i, c] of active.entries()) {
            const slot = Projection.stripSlot(i, active.length, LW);
            const sx = (slot.x / LW) * W;
            const gy = H * 0.88;
            const pose = {
                x: sx,
                groundY: gy,
                s: c.type === 'minion' ? sStrip * 0.72 : sStrip,
                activity: c.activity,
                walking: false,
                facing: 1,
                t: actingTime(i),
                frame: actingFrame(i),
                ghosts: c.scientistId === selectedId,
            };
            if (c.type === 'minion') {
                drawMinionFigure(pose);
            } else {
                drawScientist(pen, pose);
            }
        }
    }

    // --- Render (the page, repainted) ---
    function render() {
        if (stripMode) {
            renderStrip();
            return;
        }
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(paper, 0, 0, W, H);
        pen.beginFrame(boilSeed());
        nameplateHits = [];

        const fr = reducedMotion ? 0 : frame;
        const drawn = drawnCharacters();

        // watercolour activity pools first — they sit under everything
        for (const c of drawn) {
            if (!c.scientistId) continue;
            const s = figureScale(c);
            pen.s = s;
            pen.wash(
                c.x * K,
                groundYFor(c) + 3 * s,
                38 * s,
                STATE_TINT[c.activity] ?? SHADE,
                c.activity === 'error' ? 0.14 : 0.09,
            );
        }

        // the four ink stations — permanent fixtures on the page
        drawStations(fr);

        // figures, then their margin notes
        for (const [idx, c] of drawn.entries()) {
            const s = figureScale(c);
            if (s <= 0) continue;
            const pose = {
                x: c.x * K,
                groundY: groundYFor(c),
                s,
                activity: c.activity,
                walking: c.walking === true,
                facing: c.facing || 1,
                t: actingTime(idx),
                frame: actingFrame(idx),
                ghosts: c.scientistId === selectedId,
            };
            if (c.type === 'minion') {
                drawMinionFigure(pose);
            } else {
                drawScientist(pen, pose);
            }
        }
        for (const [idx, c] of drawn.entries()) {
            drawNameplate(c, idx);
        }

        if (activeStripCharacters().length === 0) {
            drawEmptyVoice();
        }
    }

    // --- Game loop (60fps skeleton; the boil holds at BOIL_HOLD) ---
    let rafPaused = false;
    let rafHandle = 0;

    function gameLoop() {
        if (rafPaused || destroyed) return;
        rafHandle = requestAnimationFrame(gameLoop);
        update();
        render();
        frame++;
    }

    function startLoop() {
        if (destroyed) return;
        // one immediate frame so the page is never blank behind the RAF
        update();
        render();
        frame++;
        rafHandle = requestAnimationFrame(gameLoop);
    }

    // Caveat guard (#00059 §12): wait for both hand-written weights before
    // the first caption lands — a fallback-font flash on a Tauri webview
    // is exactly the kind of seam this arc exists to remove. jsdom (and
    // any host without the Font Loading API) starts immediately.
    const fontsApi = typeof document !== 'undefined' ? document.fonts : undefined;
    if (fontsApi && typeof fontsApi.load === 'function') {
        Promise.all([fontsApi.load('500 16px Caveat'), fontsApi.load('700 16px Caveat')])
            .catch(() => {})
            .then(() => {
                startLoop();
            });
    } else {
        startLoop();
    }

    // --- Pointer handling (canvas hit regions, §11) ---
    function deviceCoords(event) {
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        return {
            x: ((event.clientX - r.left) * canvas.width) / r.width,
            y: ((event.clientY - r.top) * canvas.height) / r.height,
        };
    }

    function rectContains(rect, pt) {
        return pt.x >= rect.x && pt.x <= rect.x + rect.w && pt.y >= rect.y && pt.y <= rect.y + rect.h;
    }

    function hitFigure(pt) {
        const active = activeStripCharacters();
        for (let i = active.length - 1; i >= 0; i--) {
            const c = active[i];
            let cx;
            let gy;
            let s;
            if (stripMode) {
                const slot = Projection.stripSlot(i, active.length, LW);
                cx = (slot.x / LW) * W;
                gy = H * 0.88;
                s = (H * 0.82) / 170;
                if (c.type === 'minion') s *= 0.72;
            } else {
                cx = c.x * K;
                gy = groundYFor(c);
                s = figureScale(c);
            }
            if (s <= 0) continue;
            const top = c.type === 'minion' ? gy - 90 * s : figureHeadTop(gy, s) - 6 * s;
            const halfW = 30 * s;
            if (pt.x >= cx - halfW && pt.x <= cx + halfW && pt.y >= top && pt.y <= gy + 8 * s) {
                return c;
            }
        }
        return null;
    }

    function hitAnything(pt) {
        return nameplateHits.some((hit) => rectContains(hit.rect, pt)) || hitFigure(pt) !== null;
    }

    function onClick(event) {
        const pt = deviceCoords(event);
        if (!pt) return;
        // the [ recall ] note outranks the caption it sits inside
        for (const hit of nameplateHits) {
            if (hit.kind === 'recall' && rectContains(hit.rect, pt)) {
                sendToExtension({type: 'interaction', action: Projection.recallScientistAction(hit.id)});
                return;
            }
        }
        for (const hit of nameplateHits) {
            if (hit.kind === 'plate' && rectContains(hit.rect, pt)) {
                sendToExtension({type: 'interaction', action: Projection.selectScientistAction(hit.id)});
                return;
            }
        }
        const fig = hitFigure(pt);
        if (fig && fig.scientistId) {
            sendToExtension({type: 'interaction', action: Projection.selectScientistAction(fig.scientistId)});
        }
    }

    function onMouseMove(event) {
        const pt = deviceCoords(event);
        canvas.style.cursor = pt && hitAnything(pt) ? 'pointer' : 'default';
    }

    function onMouseLeave() {
        canvas.style.cursor = 'default';
    }

    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);

    // --- Controller surface (Mezzanine roster bridge — unchanged seam) ---
    // One roster entry per dispatched scientist becomes one character on
    // the page: the first re-uses the resident figure at index 0;
    // additional scientists become minion figures stationed through the
    // projection's offset table. J-3 widened the entry shape with the
    // caption fields (target / mission / startedAtMs / idleWarn /
    // crashed) the margin notes carry now the DOM plates are gone.
    function bindEntry(char, entry) {
        if (char.activity !== entry.activity) {
            char.idleTimer = 0;
        }
        char.activity = entry.activity;
        char.detail = entry.detail;
        char.scientistId = entry.id;
        char.target = entry.target ?? '';
        char.mission = entry.mission ?? '';
        char.startedAtMs = typeof entry.startedAtMs === 'number' ? entry.startedAtMs : null;
        char.idleWarn = entry.idleWarn === true;
        char.crashed = entry.crashed === true;
    }

    function spawnMinionCharacter(id, entry) {
        if (characters.find((c) => c.id === id)) return;
        const minionIndex = characters.filter((c) => c.type === 'minion').length;
        const {x, y} = Projection.minionStation(entry.activity, minionIndex, FLOOR_PLAN);
        const char = createCharacter(id, 'minion', x, y, entry.activity, entry.detail, null);
        bindEntry(char, entry);
        characters.push(char);
    }

    function setRoster(rosterEntries) {
        const list = Array.isArray(rosterEntries) ? rosterEntries : [];
        // Despawn characters whose scientist left the roster.
        const survivingIds = new Set(list.map((entry) => entry.id));
        for (const c of characters) {
            if (c.scientistId && !survivingIds.has(c.scientistId)) {
                if (c.type === 'minion') {
                    c.despawning = true;
                } else {
                    // The resident figure at index 0 is never removed —
                    // it unbinds and the page reads as quiet until the
                    // next dispatch re-binds it.
                    c.scientistId = null;
                    c.activity = 'idle';
                    c.detail = '...';
                    c.crashed = false;
                    c.idleWarn = false;
                }
            }
        }
        // Bind / create one character per roster scientist.
        for (const [index, entry] of list.entries()) {
            if (index === 0) {
                bindEntry(characters[0], entry);
                continue;
            }
            const minionId = `mz-${entry.id}`;
            const existing = characters.find((c) => c.id === minionId);
            if (existing) {
                bindEntry(existing, entry);
                existing.despawning = false;
            } else {
                spawnMinionCharacter(minionId, entry);
            }
        }
    }

    function setSelected(scientistId) {
        selectedId = scientistId;
    }

    // --- Station position seam (#00057 — consumed by plumb + pools) ---
    function getStationPos(scientistId) {
        const active = activeStripCharacters();
        const char = active.find((c) => c.scientistId === scientistId);
        if (stripMode) {
            const idx = char ? active.indexOf(char) : 0;
            return Projection.stripSlot(idx, active.length, LW);
        }
        if (!char) {
            return {x: POSITIONS.idle.x, y: POSITIONS.idle.y};
        }
        // targetX/targetY hold the character's current station — the
        // plumb-line re-targets when the scientist walks; it is never
        // pinned to selection-time x.
        return {x: char.targetX, y: char.targetY};
    }

    /** Logical floor dimensions for the active projection — consumers
     *  divide a getBoundingClientRect() by these to get the CSS scale. */
    function getFloorSize() {
        return Projection.floorSize(stripMode, FLOOR_PLAN);
    }

    // --- Strip mode (#00057 O-4; ink dressing #00059 J-4) ---
    // Resizing the canvas resets the 2D context state; the paper is
    // re-rendered for the new geometry (still init-time work, never
    // per-frame) and one frame draws immediately so a paused loop never
    // leaves a blank strip behind the resize.
    function setStrip(on) {
        const next = Boolean(on);
        if (next === stripMode) {
            return;
        }
        stripMode = next;
        if (stripMode) {
            canvas.height = Projection.STRIP_CSS_HEIGHT * DPR;
            canvas.style.height = `${Projection.STRIP_CSS_HEIGHT}px`;
        } else {
            canvas.height = LH * SCALE * DPR;
            canvas.style.height = `${LH * SCALE}px`;
        }
        W = canvas.width;
        H = canvas.height;
        paper = makePaper(W, H);
        render();
    }

    // --- Lifecycle (pause / resume / destroy) ---
    function pauseRaf() {
        rafPaused = true;
    }
    function resumeRaf() {
        if (rafPaused) {
            rafPaused = false;
            rafHandle = requestAnimationFrame(gameLoop);
        }
    }
    function destroy() {
        destroyed = true;
        rafPaused = true;
        if (rafHandle) {
            cancelAnimationFrame(rafHandle);
        }
        canvas.removeEventListener('click', onClick);
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mouseleave', onMouseLeave);
        characters.length = 0;
    }

    return {setRoster, setSelected, setStrip, getStationPos, getFloorSize, pauseRaf, resumeRaf, destroy};
}
