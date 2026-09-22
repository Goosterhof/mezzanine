// =============================================================================
// The Bench Projection — the Long Bench's geometric spine (#00041 §5)
//
// The page below the railing is an ELEVATION now, not a floor plan: one
// workbench running the full width, seen dead on, one ground line that
// everything stands on. The Mad Scientist works the left third, under his
// own terminal; the Heretic works the right third, under hers; the middle
// third is shared, and the Speaking Tube's two bells rise out of the
// benchtop there under a brass arch.
//
// Every coordinate that elevation stands on lives here, in CSS pixels with
// the origin at the band's top-left as if the band were always 200 px tall.
// The 64 px posture is a CROP of that drawing (`cropTop`), never a second
// projection. Pure arithmetic — no Canvas context, no RAF loop, no DOM —
// so `scene.js` keeps the ink and vitest keeps the numbers.
//
// Retired with the floor plan (#00041 §5.3 "Struck"): the 2-D station table,
// `MINION_OFFSETS`, `clampToFloorWalls`, `stripSlot` and the logical-plan
// `floorSize`. Two colleagues on one bench need no roster arithmetic, and
// a crop keeps the compact posture continuous with the expanded one.
//
// The wire formats for figure-click selection and the `[ recall ]` note
// live here too, so the emitting end (scene.js) and the consuming end
// (LabScene.vue) can never drift apart.
// =============================================================================

import type {Colleague} from '../roster/types';
import type {ActivityState} from './types';

import {FIGURE_HEAD_CLEARANCE, FIGURE_HEAD_R, FIGURE_LEG, FIGURE_TORSO} from './figure';

/** A point in the bench drawing's CSS pixels. */
export interface FloorPoint {
    x: number;
    y: number;
}

/** The band, authored. §5.3: 200 px fixed — never `40vh`. */
export const BENCH_BAND_H = 200;

/** The compact posture — the same drawing, cropped (§5.7). */
export const BENCH_STRIP_H = 64;

/** Below this window height the band is the crop whatever the investor
 *  chose — the short-window posture is not a preference (§5.7). */
export const SHORT_WINDOW_H = 820;

/** §5.3: the ground line sits 10 px above the band's bottom. */
export const GROUND_INSET = 10;

/** `figure.ts`'s own proportions, summed — 173.45 sketch units. */
export const FIGURE_UNITS = FIGURE_LEG + FIGURE_TORSO + FIGURE_HEAD_CLEARANCE + FIGURE_HEAD_R * 1.55;

/** §5.3: `s = bandH × 0.70 / 173.45` — a 140 px colleague in a 200 px band. */
export const FIGURE_SCALE = (BENCH_BAND_H * 0.7) / FIGURE_UNITS;

const ACTIVITY_STATES: readonly ActivityState[] = [
    'idle',
    'thinking',
    'writing',
    'reading',
    'running',
    'waiting',
    'error',
];

/** Narrow an arbitrary activity string to the seven-state union. */
export function isActivityState(value: string): value is ActivityState {
    return (ACTIVITY_STATES as readonly string[]).includes(value);
}

/** §5.3's 1-D station table, as fractions of the page width, for the Mad
 *  Scientist's end; the Heretic's are mirrored into the right third. y is
 *  pinned to the ground line — that is the whole point of an elevation.
 *  `thinking` is the one state that walks a colleague toward the middle. */
export const BENCH_STATIONS: Readonly<Record<ActivityState, number>> = {
    waiting: 0.045, // own end, leaning
    error: 0.065, // own end
    reading: 0.105, // own shelf
    running: 0.175, // own flask
    writing: 0.25, // own desk — and the centre of their own pane
    idle: 0.25, // own desk
    thinking: 0.315, // toward the middle
};

/** Where a colleague stands for an activity, in CSS px across the bench.
 *  Unknown activities fall back to idle, as the floor always has. */
export function benchStationX(width: number, who: Colleague, activity: string): number {
    const f = BENCH_STATIONS[isActivityState(activity) ? activity : 'idle'];
    return who === 'mad-scientist' ? width * f : width * (1 - f);
}

/** The way each colleague faces when nothing is walking them: toward the
 *  shared middle. The art natively faces +1 (§2.6 licenses the turn-in —
 *  the Parlour's "never orient two figures at each other" is not inherited). */
export function restFacing(who: Colleague): 1 | -1 {
    return who === 'mad-scientist' ? 1 : -1;
}

export interface BenchGeometry {
    w: number;
    /** 200, or 64 in the compact posture. */
    bandH: number;
    compact: boolean;
    /** Drawing y of the crop's top edge. 0 when expanded. */
    cropTop: number;
    s: number;
    figureH: number;
    groundY: number;
    /** Drawing y of the benchtop line — elbow height; head and torso clear it. */
    benchTopY: number;
    boardBottomY: number;
    apronBottomY: number;
    archApexY: number;
    bellTopY: number;
    /** Drawing y of the top of a colleague's hair. */
    headTopY: number;
    bell: Record<Colleague, number>;
    /** Where the receiver STANDS to take the capsule off the bell: beside it,
     *  on their own side. On the bell's own x the bell vanished behind them
     *  and the arch appeared to plunge into their head (measured, prototype). */
    atBell: Record<Colleague, number>;
    home: Record<Colleague, number>;
    /** The inner edge of each colleague's own third. */
    innerEdge: Record<Colleague, number>;
}

/** The elevation for a bench `width` CSS px wide. `compact` crops the same
 *  drawing to 64 px. The crop is anchored on the HEADS, not the benchtop:
 *  at the ruled scale the hair crown sits ~82 px above the benchtop, so the
 *  benchtop, the arch and both faces cannot share a 64 px strip, and cutting
 *  the goggles and the quiff would cut the two silhouettes the page is for.
 *  The crop keeps both heads, the whole arch and both bell mouths, and loses
 *  the benchtop line itself (a deviation from §5.7, measured in the audition). */
export function benchGeometry(width: number, compact: boolean): BenchGeometry {
    const w = Math.max(1, width);
    const s = FIGURE_SCALE;
    const figureH = FIGURE_UNITS * s;
    const groundY = BENCH_BAND_H - GROUND_INSET;
    const benchTopY = groundY - 0.42 * figureH;
    const bellTopY = benchTopY - 26;
    return {
        w,
        bandH: compact ? BENCH_STRIP_H : BENCH_BAND_H,
        compact,
        cropTop: compact ? bellTopY + 12 - BENCH_STRIP_H : 0,
        s,
        figureH,
        groundY,
        benchTopY,
        boardBottomY: benchTopY + 6,
        apronBottomY: benchTopY + 41,
        archApexY: 62,
        bellTopY,
        headTopY: groundY - figureH,
        bell: {'mad-scientist': w * 0.4, heretic: w * 0.6},
        atBell: {'mad-scientist': w * 0.4 - 44, heretic: w * 0.6 + 44},
        home: {'mad-scientist': w * 0.25, heretic: w * 0.75},
        innerEdge: {'mad-scientist': w * 0.315, heretic: w * 0.685},
    };
}

/** The plumb-line's landing point for a colleague standing at `x`, in the
 *  CANVAS's own CSS coordinates (crop already subtracted). It lands on the
 *  top of the VISIBLE head: in the crop the hair crown sits above the
 *  strip, and a line that stops in the torn edge has landed on nothing. */
export function plumbLanding(geo: BenchGeometry, x: number): FloorPoint {
    return {x, y: Math.max(geo.headTopY, geo.cropTop + 3) - geo.cropTop};
}

/** The wash behind a figure — a total function of ActivityState, lifted
 *  verbatim from the struck CSS light pools (#00041 §5.4). Every member of
 *  the union has a declared output; the crash burns, it does not dim. */
export function washOpacity(state: ActivityState): number {
    switch (state) {
        case 'idle':
        case 'waiting':
            return 0.4;
        case 'thinking':
        case 'writing':
        case 'reading':
        case 'running':
        case 'error':
            return 0.85;
        default: {
            const _exhaustive: never = state;
            throw new Error(`unreachable activity state: ${String(_exhaustive)}`);
        }
    }
}

/** Selection lifts the wash — the figure under study is the lit one. */
export function washStrength(state: ActivityState, selected: boolean): number {
    return washOpacity(state) * (selected ? 1.4 : 1);
}

/** Project a canvas point into page coordinates through the canvas's
 *  measured rect. The bench canvas renders 1:1, so `size` is its CSS size
 *  and the scale is unity — kept general so a scaled host cannot lie. */
export function floorPointToPage(
    point: FloorPoint,
    size: {w: number; h: number},
    rect: {left: number; top: number; width: number; height: number},
): FloorPoint {
    return {x: rect.left + (point.x / size.w) * rect.width, y: rect.top + (point.y / size.h) * rect.height};
}

/** The figure-click selection wire format — one definition, two ends. */
export const SELECT_SCIENTIST_PREFIX = 'selectScientist:';

/** Build the interaction action a figure click emits. */
export function selectScientistAction(scientistId: string): string {
    return `${SELECT_SCIENTIST_PREFIX}${scientistId}`;
}

/** Parse an interaction action back into a scientist id — null when the
 *  action is absent, foreign, or carries an empty id (an empty selection
 *  is a no-op, never a phantom `roster.select('')`). */
export function parseSelectScientistAction(action: string | undefined): string | null {
    if (action === undefined || !action.startsWith(SELECT_SCIENTIST_PREFIX)) {
        return null;
    }
    const id = action.slice(SELECT_SCIENTIST_PREFIX.length);
    return id.length > 0 ? id : null;
}

/** The canvas-recall wire format (#00059 J-3) — the `[ recall ]` note on
 *  the bench front emits this; `LabScene.vue` parses it into
 *  `backend.recall(id)`. Same one-definition-two-ends discipline as the
 *  selection action above: the page and its reader cannot drift. */
export const RECALL_SCIENTIST_PREFIX = 'recallScientist:';

/** Build the interaction action a `[ recall ]` note click emits. */
export function recallScientistAction(scientistId: string): string {
    return `${RECALL_SCIENTIST_PREFIX}${scientistId}`;
}

/** Parse an interaction action back into the scientist id to recall —
 *  null when the action is absent, foreign, or carries an empty id (an
 *  empty recall is a no-op, never a phantom `backend.recall('')`). */
export function parseRecallScientistAction(action: string | undefined): string | null {
    if (action === undefined || !action.startsWith(RECALL_SCIENTIST_PREFIX)) {
        return null;
    }
    const id = action.slice(RECALL_SCIENTIST_PREFIX.length);
    return id.length > 0 ? id : null;
}
