// =============================================================================
// The Floor Projection — the Observer's geometric spine, extracted (#00057 §12)
//
// Every coordinate the lab floor stands on lives here: where each activity's
// station sits, where a minion sprite lines up beside it, how the 64px strip
// lays the roster out in a single row, and how a logical floor point projects
// onto the CSS-scaled canvas the investor actually sees. Pure arithmetic — no
// Canvas context, no RAF loop, no DOM. That purity is the point: the Overlook
// (#00057) shipped this math inside the coverage-excluded `scene.js`, where
// the only test it had was the Windows runtime checklist (§9 items 3–5).
// The centerpiece never again ships on checklist faith alone — `scene.js`
// consumes these functions; `tests/observer/projection.spec.ts` proves them.
//
// The wire format for sprite-click selection lives here too, so the emitting
// end (scene.js) and the consuming end (LabScene.vue) can never drift apart.
// =============================================================================

import type {ActivityState} from './types';

/** The logical floor plan — tile size and full-floor dimensions in logical
 *  pixels. `scene.js` derives these from `lab-core.js` (`COLS * TILE` etc.)
 *  and passes them in; this module hardcodes nothing it could drift on. */
export interface FloorPlan {
    tile: number;
    w: number;
    h: number;
}

/** A point in logical floor pixels. */
export interface FloorPoint {
    x: number;
    y: number;
}

/** Strip projection height in logical pixels (the Overlook #00057 O-4). */
export const STRIP_H = 32;

/** The strip blits at exactly this many CSS pixels — twice the logical
 *  height, asserted as `STRIP_H * 2` so the contract cannot silently bend. */
export const STRIP_CSS_HEIGHT = STRIP_H * 2;

/** Where sprites sit vertically inside the strip row. */
export const STRIP_SPRITE_Y = 12;

/** Minion sprites stand at these offsets from their activity's station —
 *  two flanking, two behind. Rosters beyond four wrap around the table. */
export const MINION_OFFSETS: ReadonlyArray<{readonly dx: number; readonly dy: number}> = [
    {dx: -20, dy: 8},
    {dx: 20, dy: 8},
    {dx: -12, dy: 16},
    {dx: 12, dy: 16},
];

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

/** The station each activity walks its sprite to, in logical floor pixels.
 *  One entry per `ActivityState` — the type makes the totality structural. */
export function stationTable(tile: number): Record<ActivityState, FloorPoint> {
    return {
        idle: {x: 9 * tile, y: 7 * tile},
        thinking: {x: 6 * tile, y: 5 * tile},
        writing: {x: 13 * tile, y: 5 * tile},
        reading: {x: 3 * tile, y: 5 * tile},
        running: {x: 10 * tile, y: 8 * tile},
        waiting: {x: 9 * tile, y: 10 * tile},
        error: {x: 15 * tile, y: 8 * tile},
    };
}

/** The station for an activity — unknown activities fall back to idle,
 *  exactly as the floor has always treated them. */
export function stationFor(activity: string, tile: number): FloorPoint {
    const table = stationTable(tile);
    return isActivityState(activity) ? table[activity] : table.idle;
}

/** Clamp a point inside the floor's walls — sprites never stand inside
 *  the wainscoting. The margins are the scene's historical constants. */
export function clampToFloorWalls(point: FloorPoint, plan: FloorPlan): FloorPoint {
    return {
        x: Math.max(plan.tile + 4, Math.min(plan.w - plan.tile - 10, point.x)),
        y: Math.max(plan.tile * 3 + 4, Math.min(plan.h - plan.tile * 2 - 14, point.y)),
    };
}

/** Where the Nth minion sprite stands for an activity: the activity's
 *  station, offset through the modular wrap of `MINION_OFFSETS`, clamped
 *  to the floor walls. Indices are normalized Euclidean so a defensive
 *  caller can never produce NaN coordinates from a negative index. */
export function minionStation(activity: string, minionIndex: number, plan: FloorPlan): FloorPoint {
    const base = stationFor(activity, plan.tile);
    const len = MINION_OFFSETS.length;
    const offset = MINION_OFFSETS[((minionIndex % len) + len) % len] ?? {dx: 0, dy: 0};
    return clampToFloorWalls({x: base.x + offset.dx, y: base.y + offset.dy}, plan);
}

/** The strip projection: N sprites in one 64px row, evenly spaced along
 *  the floor width — slot i of count sits at `round(W / (count+1) * (i+1))`. */
export function stripSlot(index: number, count: number, floorW: number): FloorPoint {
    const gap = floorW / (count + 1);
    return {x: Math.round(gap * (index + 1)), y: STRIP_SPRITE_Y};
}

/** Logical floor dimensions for the active projection — consumers divide
 *  a `getBoundingClientRect()` by these to recover the CSS scale. */
export function floorSize(strip: boolean, plan: FloorPlan): {w: number; h: number} {
    return {w: plan.w, h: strip ? STRIP_H : plan.h};
}

/** Project a logical floor point into page coordinates through the canvas's
 *  measured rect — the CSS-scale correction the plumb-line and the light
 *  pools both ride on (experiment log #00057 §11). */
export function floorPointToPage(
    point: FloorPoint,
    size: {w: number; h: number},
    rect: {left: number; top: number; width: number; height: number},
): FloorPoint {
    return {x: rect.left + (point.x / size.w) * rect.width, y: rect.top + (point.y / size.h) * rect.height};
}

/** The sprite-click selection wire format — one definition, two ends. */
export const SELECT_SCIENTIST_PREFIX = 'selectScientist:';

/** Build the interaction action a sprite click emits. */
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
