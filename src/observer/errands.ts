// =============================================================================
// The Errand Floor — who the Mad Scientist sent out (#00067, wireframe
// #00042 Ruling R, cast #00043 R2 Lot 8 ★).
//
// The Semaphore's board says which minions are out, what each is doing and
// who just came home. This module folds those boards into errands and answers
// every question the bench asks of them: which post each holds, who is "+N",
// who is in the sill, whether the flask is corked, what the ledger says,
// where every figure is THIS frame. Pure: no DOM, no canvas, no clock of its
// own — the caller passes the time in, so vitest replays it board by board.
//
// RE-CAST from the ruled prototype (prototypes/mezzanine-minion-errand,
// `scenario.ts` + `specimens.ts` + `stage.ts`). The prototype was
// time-indexed: it knew every errand's future. The live app only knows the
// past, so every transition here is stamped with the Mezzanine's own RECEIPT
// clock (`receiptNowS`, seconds) — never the board's WSL-side clock, and
// never the scene's acting clock, which freezes under reduced motion. Board
// stamps only ORDER errands and group volleys inside one board history.
//
// No transit is ever replayed or frozen mid-arc: `land()` marks a moment, and
// a transit that began at or before it is drawn at its end state (the
// prototype's `eff`). Reduced motion lands continuously: minions snap, even
// though the colleagues still walk (#00042 §2.8).
//
// P1 scope: arrivals are a tier-0 hop out of the flask (no grip), a waiting
// minion keeps its post pose, and the Chaos Monkey lives in the ledger only.
// The Rail (P2) adds the grip, the permission sill and the monkey.
// =============================================================================

import type {Colleague} from '../roster/types';
import type {Pt} from './pen';
import type {Arms, Legs} from './specimen';
import type {ActivityState, ScientistErrands, SemaphoreMinion} from './types';

import {MONKEY_RATE, R2_MONKEY, type HangingTail} from './monkey';
import {benchStationX, type BenchGeometry} from './projection';
import {allowedX, type SillEnvelope} from './sill';
import {specimenFit} from './specimenFit';

export type MinionClass = 'bespoke' | 'lab' | 'hired';

/** D1 (#00067 §3 #1): two out → ±22, three out → centre and ±46. R2 ruled ±20/±40;
 *  the octopus and the goldfish are 43 px wide at a post. Settled 2026-10-07 by the
 *  prototype's pipe probe: ≥ 4.0 px of pipe clearance at 1440 and 1080. */
export const POST_OFFSETS: Readonly<Record<1 | 2 | 3, readonly number[]>> = {1: [0], 2: [-22, 22], 3: [0, -46, 46]};
/** §3 #3: a post pose never stands taller than this, 3.8 px under the colleagues' eye line. */
export const POST_POSE_MAX_PX = 52;
/** #00042 §7.1: spawns this close together are one volley, one voice line. */
export const VOLLEY_MS = 400;
/** #00042 §7.1: the arrival grip (P2). */
export const GRIP_S = 1.2;
/** #00042 §7.4: a wait enters the sill only after holding this long. */
export const PERMISSION_DEBOUNCE_S = 1.5;
/** #00042 §7.4: a keystroke this recent skips the arrival grip (P2). */
export const KEYSTROKE_QUIET_S = 1.5;
/** #00042 §7.3: the in-tray shows the last three slips. */
export const TRAY_SHEETS = 3;
/** #00042 §7.3: a slip is filed away after ten minutes. */
export const FILE_AFTER_S = 600;

/** The receipt clock, in SECONDS. Never the scene's `clockS`. */
export const receiptNowS = (): number => performance.now() / 1000;

// --- who is who -----------------------------------------------------------------

const HIRED = new Set(['general-purpose', 'Explore', 'Plan', 'claude-code-guide']);
const LAB = new Set([
    'surgeon',
    'librarian',
    'scribe',
    'synchronizer',
    'artisan',
    'muse',
    'enhancement-squad',
    'campaign',
    'ratifier',
    'inspector',
    'illusionist',
    'archivist',
    'drill-sergeant',
    'task-master',
    'inheritance',
    'cross-pollinator',
    'delivery-seal',
    'parliament',
    'parliament-simulated',
]);

/** The Chaos Monkey is bespoke, the lab's own minions are lab, everything else is Hired. */
export function classOf(type: string): MinionClass {
    if (type === 'chaos-monkey') return 'bespoke';
    if (LAB.has(type) && !HIRED.has(type)) return 'lab';
    return 'hired';
}

/** Names in the voice (#00042 §7.2): "the Chaos Monkey", "an Explore errand", "a Plan errand". */
export function voiceName(type: string): string {
    if (classOf(type) === 'hired') return `an ${type} errand`.replace(/^an ([^aeiouAEIOU])/, 'a $1');
    const pretty = type.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
    return `the ${pretty}`;
}

const moreOut = (n: number): string => (n === 1 ? '1 more is out on an errand.' : `${n} more are out on errands.`);

/** The live region's one line for an event (§6 Voice). Returns are silent: they make no event. */
export function voiceLine(ev: ErrandEvent): string {
    if (ev.kind === 'permission') return `${sentenceCase(ev.name)} · ${ev.detail}`;
    if (ev.kind === 'loose')
        return ev.others === 0 ? 'The Chaos Monkey is loose.' : `The Chaos Monkey is loose, and ${moreOut(ev.others)}`;
    const leader = sentenceCase(ev.names[0] ?? 'a minion');
    const more = ev.names.length - 1;
    if (/^an? /i.test(leader)) return more === 0 ? `${leader} went out.` : `${leader} and ${more} more went out.`;
    return more === 0 ? `${leader} is out on an errand.` : `${leader} and ${more} more are out on errands.`;
}

/** Sentence case at the start of a line: capitalise the first letter only. */
export function sentenceCase(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

// --- the tween kit (prototype stage.ts) ------------------------------------------------

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export const prog = (t: number, s: number, d: number): number => clamp01((t - s) / d);
export const easeOut = (u: number): number => 1 - (1 - u) * (1 - u) * (1 - u);
export const easeIn = (u: number): number => u * u;
export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

/** A quadratic hop whose highest point is EXACTLY `apexY` (or the higher endpoint).
 *  The control point solves the extreme of the quadratic, cy = a − √((a − y0)(a − y1)):
 *  the prototype's first version overshot an uneven hop by up to 14 px. */
export function hop(from: Pt, to: Pt, apexY: number, u: number): Pt {
    const a = Math.min(apexY, from[1], to[1]);
    const cy = a - Math.sqrt(Math.max(0, (a - from[1]) * (a - to[1])));
    const c: Pt = [(from[0] + to[0]) / 2, cy];
    const k = 1 - u;
    return [k * k * from[0] + 2 * k * u * c[0] + u * u * to[0], k * k * from[1] + 2 * k * u * c[1] + u * u * to[1]];
}

// --- the errand --------------------------------------------------------------------

export interface Errand {
    id: string;
    type: string;
    cls: MinionClass;
    /** remembered from the last board it appeared on, so its slip carries it home */
    task: string;
    background: boolean;
    state: ActivityState;
    detail: string;
    /** board clock (ms): ordering only — who changed most recently */
    since: number;
    /** board clock (ms): ordering and volley grouping only */
    spawnedAtBoard: number;
    /** receipt clock (s): when the Mezzanine first saw it */
    seenAt: number;
    /** receipt clock (s): when the Mezzanine saw it leave; null while out */
    departedAt: number | null;
    /** every permission wait seen so far, receipt clock: [start, end | null] */
    waits: [number, number | null][];
    /** the mechanism clock held while it waits (the Stopped Mechanism Rule) */
    mechHeld: number | null;
    /** receipt clock (s): when it first won a post (memoised; null while only "+N") */
    postedAt: number | null;
    /** the start of the wait already spoken, so each wait speaks once */
    spokenWait: number | null;
    /** decided ONCE, when it arrives: does it grip the brass on the way to its post? (never replayed) */
    grip: boolean;
}

export type ErrandPhase = 'born' | 'hop' | 'grip' | 'post' | 'queued' | 'hanging' | 'home' | 'gone';

export type ErrandEvent =
    | {kind: 'volley'; names: string[]}
    | {kind: 'loose'; others: number}
    | {kind: 'permission'; name: string; detail: string};

export interface TraySlip {
    at: number;
    task: string;
    scorched: boolean;
}

/** One minion to draw this frame, in the bench's own drawing coordinates. */
export interface ErrandFigure {
    /** a Specimen, the Chaos Monkey, or his scorecard fluttering into the tray */
    kind: 'specimen' | 'monkey' | 'slip';
    /** 'band' = on the bench canvas; 'border' = the sill canvas, over the brass (P2) */
    layer: 'band' | 'border';
    /** the body is behind the balustrade: the brass is re-stroked over it, the fingers after */
    behindRail?: boolean;
    id: string;
    type: string;
    cls: 'lab' | 'hired';
    /** the figure's feet (a Specimen) or hip (the monkey), in the BENCH's drawing coordinates */
    x: number;
    y: number;
    /** px per local unit */
    s: number;
    /** a Specimen's legs, or the monkey's ('tuck' while he hangs) */
    legs: Legs | 'tuck';
    arms: Arms | 'post';
    mechT: number;
    /** grip: the hands' y in stage units (negative = above the feet) */
    gripY?: number;
    /** the monkey hangs upside down: radians */
    rot?: number;
    /** the monkey's tail drawn from his rump (a hop), or coiled on the brass */
    tailFromRump?: boolean;
    tail?: HangingTail;
    /** the scorecard's tilt */
    angle?: number;
    birth?: number;
    home?: number;
    walking?: boolean;
    airborne?: boolean;
    lamp?: boolean;
    flip?: number;
    state: ActivityState;
}

/** What the flask and the in-tray need this frame. */
export interface ErrandFurnitureState {
    /** the receipt clock the furniture was read at */
    now: number;
    corkOut: boolean;
    /** receipt time the cork popped (its roll) */
    corkAt: number;
    /** arrivals whose foam still rises */
    foam: number[];
    /** homecomings whose burp still rises */
    burps: number[];
    tray: TraySlip[];
    /** R5′: the pools under background errands while he idles, as x + half-width */
    pools: {x: number; rx: number}[];
    /** errands out beyond the three posts */
    overflow: number;
    /** the monkey's dry blots where he hung (bench drawing coordinates) */
    blots: {x: number; y: number}[];
}

/** The Rail as the floor needs it: the measured envelope and the plumb-line's x (section px). */
export interface ErrandRail {
    env: SillEnvelope;
    plumbX: number | null;
}

export interface ErrandGate {
    keystrokeQuietS: number;
    pageActive: boolean;
}

export interface ErrandFloor {
    /** Fold one board in. null = the session ended or exited → sweep, silently.
     *  The FIRST board after mount (or after a sweep) lands directly: no fling, 0 events. */
    ingest(board: ScientistErrands | null, scientistState: ActivityState, nowS: number): ErrandEvent[];
    /** Time passes: a held volley speaks, a wait that held 1.5 s speaks. */
    advance(nowS: number, gate?: ErrandGate): ErrandEvent[];
    /** Page return / reduced motion: every transit lands, nothing replays. */
    land(): void;
    setReducedMotion(on: boolean): void;
    /** ≤ 3 posts, the Chaos Monkey excluded (it hangs, it never queues). */
    posts(width: number): {id: string; x: number}[];
    /** out beyond the three posts, the monkey excluded */
    overflow(): number;
    /** One occupant: the earliest-started wait held ≥ 1.5 s, else whoever is gripping the brass. Never a monkey's wait. */
    sillOccupant(): {id: string; reason: 'grip' | 'permission'} | null;
    /** The measured Rail, or null: no sill (no grip, a waiter keeps its post, the monkey sits). */
    setRail(rail: ErrandRail | null): void;
    /** ≤ TRAY_SHEETS slips, newest last; filed after FILE_AFTER_S */
    tray(): TraySlip[];
    /** true while any errand is out or still on its way home — the monkey counts */
    corkOut(): boolean;
    /** "the Surgeon · Reading crossing.ts · 2 more out" — the most recent change leads */
    ledgerLine(): string | null;
    /** R5′: background errands at a post while he idles */
    lit(): string[];
    phaseOf(id: string): ErrandPhase;
    /** errands born, hopping or on the way home right now — 0 once landed */
    inTransit(): number;
    /** errands the floor still remembers (out, or home less than RETIRE_AFTER_S ago) */
    retained(): number;
    figures(geo: BenchGeometry, act: number): ErrandFigure[];
    furniture(geo: BenchGeometry): ErrandFurnitureState;
}

// --- the bench's own places (drawing coordinates) ---------------------------------------

const MS: Colleague = 'mad-scientist';
/** the departure: 0.5 s to the tray, 0.3 s there, 0.5 s home into the flask */
const DEP = 1.3;
/** the arrival hop out of the flask, tier 0 (no grip) */
const ARRIVE_S = 0.6;
/** the birth: the bubble hardens into a specimen */
const BIRTH_S = 0.35;
/** a post change glides */
const GLIDE_S = 0.45;
/** the monkey's homecoming (pop) and its scorecard's flutter into the tray */
const MONKEY_POP_S = 0.6;
const MONKEY_SLIP_S = 1.6;
const SLIP_AT_TRAY_S = 0.8;
/** an arrival that grips the brass: the hop, the grip, the drop to its post */
const GRIP_ARRIVE_S = 2.05;
/** the hop from the flask up behind the rail */
const GRIP_HOP_S = 0.35;
/** the hands come off the brass */
const GRIP_HOLD_END_S = 1.55;
/** the climb from a post into the sill on a held wait, and the walk back down */
const SILL_RISE_S = 0.6;
const SILL_RETURN_S = 0.4;
/** a minion's ink stays this far under the ceiling in the sill */
const SILL_GAP = 5;
/** no keystroke yet, the page watched: the gate a fresh floor starts with */
const OPEN_GATE: ErrandGate = {keystrokeQuietS: Number.POSITIVE_INFINITY, pageActive: true};
const FOAM_S = 0.9;
const BURP_S = 0.6;

const minionScale = (geo: BenchGeometry): number => geo.s * 0.6875;
export const flaskX = (geo: BenchGeometry): number => benchStationX(geo.w, MS, 'running') - 34;
const deskX = (geo: BenchGeometry): number => benchStationX(geo.w, MS, 'writing') - 62;
export const trayX = (geo: BenchGeometry): number => (flaskX(geo) + 12 + deskX(geo) - 17) / 2;
const mouth = (geo: BenchGeometry): Pt => [flaskX(geo) - 1, geo.benchTopY - 27];
/** Trip-wire 5: minions never touch the Speaking Tube — they pass under the pipe at a gate outboard of his bell. */
const archGateX = (geo: BenchGeometry): number => geo.bell[MS] - 26;

/** A hop between two benchtop places, in a low hop under the arch and an `apex` hop outside it. */
function route(geo: BenchGeometry, leg: {from: Pt; to: Pt; apex: number}, u: number): Pt {
    const {from, to, apex} = leg;
    const gate: Pt = [archGateX(geo), geo.benchTopY];
    const low = geo.benchTopY - 7;
    const fi = from[0] > gate[0] + 1;
    const ti = to[0] > gate[0] + 1;
    if (fi === ti) return hop(from, to, fi ? low : apex, u);
    const d1 = Math.hypot(gate[0] - from[0], gate[1] - from[1]);
    const d2 = Math.hypot(to[0] - gate[0], to[1] - gate[1]);
    const k = d1 / Math.max(1, d1 + d2);
    if (!fi) return u < k ? hop(from, gate, apex, u / k) : hop(gate, to, low, (u - k) / (1 - k));
    return u < 1 - k ? hop(from, gate, low, u / (1 - k)) : hop(gate, to, apex, (u - (1 - k)) / k);
}

const isMonkey = (e: {type: string}): boolean => e.type === 'chaos-monkey';
const isOut = (e: Errand): boolean => e.departedAt === null;
const bySpawn = (a: Errand, b: Errand): number => a.spawnedAtBoard - b.spawnedAtBoard || a.id.localeCompare(b.id);

function offsetsFor(n: number): readonly number[] {
    if (n <= 0) return [];
    return POST_OFFSETS[Math.min(n, 3) as 1 | 2 | 3];
}

// --- the floor ---------------------------------------------------------------------------

interface PendingVolley {
    leaderSpawn: number;
    ids: string[];
    dueAt: number;
}

/** A slip, with the receipt time of the departure that sent it (its transit's start). */
interface FiledSlip extends TraySlip {
    origin: number;
}

interface FloorState {
    errands: Map<string, Errand>;
    slips: FiledSlip[];
    /** departures already handled, by receipt time (the board keeps `departed` for 30 s) */
    homeIds: Map<string, number>;
    pending: PendingVolley[];
    scientistState: ActivityState;
    cold: boolean;
    /** board clock (ms) of the last board folded in: an older or repeated board never re-folds */
    boardAt: number;
    /** departure rows on that board: still on the board, still remembered */
    boardDeparted: Set<string>;
    landedAt: number;
    now: number;
    reduced: boolean;
    /** the measured Rail; null = no sill (no grip, a waiter keeps its post, the monkey sits) */
    rail: ErrandRail | null;
    /** the last gate the scene reported: keystroke quiet time and whether the page is watched */
    gate: ErrandGate;
    /** the monkey's dry blots: each lands at his POP and is filed with the slips */
    blots: FiledSlip[];
    /** who is in the sill, why, and since when — a RECORDED place, one occupant at a time */
    sill: SillHold | null;
    /** when the sill last came free (an occupant entered no earlier) */
    sillFreeAt: number;
    /** when each errand left the sill after a held wait: the walk back down starts there */
    sillExits: Map<string, number>;
}

/** The sill's occupant: a grip reserves it from arrival; a held wait owns it until answered. */
interface SillHold {
    id: string;
    reason: 'grip' | 'permission';
    /** receipt clock: when it took the sill (a permission rise starts here) */
    since: number;
    /** the held wait's start (permission only) */
    w0: number;
}

function freshState(
    reduced: boolean,
    carry: {rail: ErrandRail | null; gate: ErrandGate} = {rail: null, gate: OPEN_GATE},
): FloorState {
    return {
        rail: carry.rail,
        gate: carry.gate,
        blots: [],
        sill: null,
        sillFreeAt: Number.NEGATIVE_INFINITY,
        sillExits: new Map(),
        errands: new Map(),
        slips: [],
        homeIds: new Map(),
        pending: [],
        scientistState: 'idle',
        cold: true,
        boardAt: Number.NEGATIVE_INFINITY,
        boardDeparted: new Set(),
        landedAt: Number.NEGATIVE_INFINITY,
        now: 0,
        reduced,
    };
}

/** A transit that began at `s` is settled: the clamp is on, or it began before the floor last landed. */
const settled = (st: FloorState, s: number): boolean => st.reduced || s <= st.landedAt;

/** The effective time at `tt` of a transit over [s, e]: snapped to `e` once settled (§2.8: no replay). */
function effAt(st: FloorState, s: number, e: number, tt: number): number {
    return settled(st, s) ? e : Math.min(tt, e);
}

const eff = (st: FloorState, s: number, e: number): number => effAt(st, s, e, st.now);

function openWait(e: Errand): [number, number | null] | undefined {
    const w = e.waits.at(-1);
    return w?.[1] === null ? w : undefined;
}

function closeWait(e: Errand, at: number): void {
    const w = openWait(e);
    if (w) w[1] = at;
}

function newErrand(m: SemaphoreMinion, nowS: number): Errand {
    return {
        id: m.id,
        type: m.type,
        cls: classOf(m.type),
        task: m.task,
        background: m.background,
        state: m.state,
        detail: m.detail,
        since: m.since,
        spawnedAtBoard: m.spawnedAt,
        seenAt: nowS,
        departedAt: null,
        waits: [],
        mechHeld: null,
        postedAt: null,
        spokenWait: null,
        grip: false,
    };
}

/** Fold one minion's row in; true when it is new to the floor. */
function foldMinion(st: FloorState, m: SemaphoreMinion): boolean {
    let e = st.errands.get(m.id);
    const fresh = e === undefined;
    if (!e) {
        e = newErrand(m, st.now);
        st.errands.set(m.id, e);
    }
    const waiting = m.state === 'waiting';
    if (waiting && !openWait(e)) e.waits.push([st.now, null]);
    if (!waiting) closeWait(e, st.now);
    e.task = m.task;
    e.state = m.state;
    e.detail = m.detail;
    e.since = m.since;
    return fresh;
}

/** An errand leaves: its slip lands at the tray once it gets there. */
function sendHome(st: FloorState, e: Errand): void {
    e.departedAt = st.now;
    closeWait(e, st.now);
    st.homeIds.set(e.id, st.now);
    const lands = st.now + (isMonkey(e) ? MONKEY_SLIP_S : SLIP_AT_TRAY_S);
    st.slips.push({at: lands, origin: st.now, task: e.task, scorched: false});
    // the monkey leaves a dry blot where he hung (the receiving surface), filed with the slips
    if (isMonkey(e)) st.blots.push({at: st.now + MONKEY_POP_S, origin: st.now, task: '', scorched: false});
}

function foldDepartures(st: FloorState, board: ScientistErrands): void {
    for (const d of board.departed) {
        if (st.homeIds.has(d.id)) continue;
        if (st.cold) {
            // cold start: these came home before the floor was watching
            st.homeIds.set(d.id, st.now);
            continue;
        }
        const e = st.errands.get(d.id);
        if (e) sendHome(st, e);
        else {
            // a flash errand: out and home between two boards — a blank slip, no figure
            st.homeIds.set(d.id, st.now);
            st.slips.push({at: st.now, origin: st.now, task: '', scorched: false});
        }
    }
    // robustness: a minion gone from the board without a departure row still went home
    const present = new Set(board.minions.map((m) => m.id));
    for (const e of st.errands.values()) if (isOut(e) && !present.has(e.id)) sendHome(st, e);
}

/** Volley grouping (#00042 §7.1): spawns within 400 ms of the leader share one line. */
function queueVolley(st: FloorState, e: Errand): void {
    const joined = st.pending.find((v) => Math.abs(e.spawnedAtBoard - v.leaderSpawn) <= VOLLEY_MS);
    if (joined) {
        joined.ids.push(e.id);
        return;
    }
    st.pending.push({leaderSpawn: e.spawnedAtBoard, ids: [e.id], dueAt: st.now + VOLLEY_MS / 1000});
}

function volleyEvent(st: FloorState, v: PendingVolley): ErrandEvent | null {
    const members = v.ids
        .map((id) => st.errands.get(id))
        .filter((e): e is Errand => e !== undefined)
        .sort(bySpawn);
    if (members.length === 0) return null;
    const others = members.filter((e) => !isMonkey(e));
    if (others.length < members.length) return {kind: 'loose', others: others.length};
    return {kind: 'volley', names: others.map((e) => voiceName(e.type))};
}

function flushVolleys(st: FloorState): ErrandEvent[] {
    const due = st.pending.filter((v) => v.dueAt <= st.now);
    st.pending = st.pending.filter((v) => v.dueAt > st.now);
    return due.map((v) => volleyEvent(st, v)).filter((ev): ev is ErrandEvent => ev !== null);
}

function permissionEvents(st: FloorState): ErrandEvent[] {
    const out: ErrandEvent[] = [];
    for (const e of st.errands.values()) {
        const w = openWait(e);
        if (!w || st.now < w[0] + PERMISSION_DEBOUNCE_S || e.spokenWait === w[0]) continue;
        e.spokenWait = w[0];
        out.push({kind: 'permission', name: voiceName(e.type), detail: e.detail});
    }
    return out;
}

/** Cold start: a board that already existed is not a volley, and its waits are not news. */
function landCold(st: FloorState): void {
    st.cold = false;
    st.landedAt = st.now;
    st.pending = [];
    for (const e of st.errands.values()) {
        const w = openWait(e);
        if (w) e.spokenWait = w[0];
    }
}

// --- the arrival grip (P2) -------------------------------------------------------------------

/** When an arrival's transit ends: a grip takes the long way, over the brass. */
const arrivalEnd = (e: Errand): number => (e.grip ? GRIP_ARRIVE_S : ARRIVE_S);

/** A posted minion's wait that is still maturing (< 1.5 s): it will want the sill. */
function waitPending(st: FloorState): boolean {
    return [...st.errands.values()].some(
        (e) => !isMonkey(e) && isOut(e) && openWait(e) !== undefined && postXAt(st, e, st.now, 1) !== null,
    );
}

/** The arrival grip's gates (#00042 §7.4), decided once, at arrival: a measured sill, a watched
 *  page, no keystroke in the last 1.5 s, no clamp, an EMPTY sill, and no posted wait maturing
 *  toward it (a held wait outranks a grip, even one that matures mid-grip). A skipped grip is
 *  never replayed. A granted grip reserves the sill from its arrival. */
function canGrip(st: FloorState, e: Errand): boolean {
    if (st.rail === null || st.reduced || !st.gate.pageActive) return false;
    if (st.gate.keystrokeQuietS < KEYSTROKE_QUIET_S) return false;
    if (st.sill !== null || waitPending(st)) return false;
    return isMonkey(e) || postXAt(st, e, st.now, 1) !== null;
}

/** When the holder let go of the sill, or null while it still holds it. */
function releasedAt(st: FloorState, hold: SillHold): number | null {
    const e = st.errands.get(hold.id);
    if (!e) return st.now;
    if (hold.reason === 'grip') {
        if (settled(st, e.seenAt)) return Math.max(e.seenAt, Math.min(st.now, st.landedAt));
        const end = e.seenAt + GRIP_HOLD_END_S;
        return st.now >= end ? end : null;
    }
    const w = e.waits.find((x) => x[0] === hold.w0);
    return w?.[1] ?? null;
}

/** The earliest-started wait held ≥ 1.5 s among minions that HOLD A POST (a "+N" has no place to climb from). */
function heldWaiter(st: FloorState): {e: Errand; w0: number} | null {
    let best: {e: Errand; w0: number} | null = null;
    for (const e of st.errands.values()) {
        const w = openWait(e);
        if (isMonkey(e) || !isOut(e) || !w || st.now < w[0] + PERMISSION_DEBOUNCE_S) continue;
        if (postXAt(st, e, st.now, 1) === null) continue;
        if (!best || w[0] < best.w0) best = {e, w0: w[0]};
    }
    return best;
}

/** Keep the sill's ledger: release a holder that let go, then seat the next held wait — never
 *  before its 1.5 s, never before the sill came free. Deterministic in receipt time, so a coarse
 *  tick and a fine one record the same entry. */
function updateSill(st: FloorState): void {
    if (st.sill) {
        const at = releasedAt(st, st.sill);
        if (at === null) return;
        if (st.sill.reason === 'permission') st.sillExits.set(st.sill.id, at);
        st.sillFreeAt = at;
        st.sill = null;
    }
    const next = heldWaiter(st);
    if (next)
        st.sill = {
            id: next.e.id,
            reason: 'permission',
            since: Math.max(next.w0 + PERMISSION_DEBOUNCE_S, st.sillFreeAt),
            w0: next.w0,
        };
}

// --- placements -----------------------------------------------------------------------------

/** the errands holding a post or "+N" at receipt time tt, in spawn order (the monkey excluded) */
function outAt(st: FloorState, tt: number): Errand[] {
    return [...st.errands.values()]
        .filter((e) => !isMonkey(e) && e.seenAt <= tt && (e.departedAt === null || tt < e.departedAt))
        .sort(bySpawn);
}

function postXAt(st: FloorState, e: Errand, tt: number, w: number): number | null {
    const out = outAt(st, tt);
    const rank = out.findIndex((x) => x.id === e.id);
    if (rank < 0) return null;
    const off = offsetsFor(out.length)[rank];
    return off === undefined ? null : w / 2 + off;
}

/** every arrival and departure of a post-holder up to now, ascending */
function layoutChanges(st: FloorState): number[] {
    const ev = new Set<number>();
    for (const e of st.errands.values()) {
        if (isMonkey(e)) continue;
        ev.add(e.seenAt);
        if (e.departedAt !== null) ev.add(e.departedAt);
    }
    return [...ev].filter((v) => v <= st.now).sort((a, b) => a - b);
}

/** When the errand first won a post (memoised once found; it was "+N" until then). */
function arrivalOf(st: FloorState, e: Errand, w: number): number | null {
    if (e.postedAt !== null) return e.postedAt;
    const changes = layoutChanges(st).filter((v) => v > e.seenAt);
    const at = [e.seenAt, ...changes].find((tt) => postXAt(st, e, tt + 1e-6, w) !== null);
    if (at !== undefined) e.postedAt = at;
    return at ?? null;
}

/** The last change in (tt − GLIDE_S, tt] that MOVED this errand's post — an arrival or an
 *  overflow change elsewhere does not restart its glide. null when it has none in flight. */
function lastRetarget(st: FloorState, e: Errand, w: number, tt: number): number | null {
    const recent = layoutChanges(st).filter((v) => v <= tt && v > tt - GLIDE_S);
    for (const tc of recent.toReversed()) {
        const before = postXAt(st, e, tc - 1e-6, w);
        if (before !== null && before !== postXAt(st, e, tc, w)) return tc;
    }
    return null;
}

/** Where the errand's post is DRAWN at tt: a glide always starts from where it was drawn
 *  when the layout moved again, never from the old target (no jump on an interrupted glide). */
function shownX(st: FloorState, e: Errand, w: number, tt: number): number | null {
    const target = postXAt(st, e, tt, w);
    if (target === null) return null;
    const tc = lastRetarget(st, e, w, tt);
    if (tc === null) return target;
    const u = prog(effAt(st, tc, tc + GLIDE_S, tt), tc, GLIDE_S);
    if (u >= 1) return target;
    const from = shownX(st, e, w, tc - 1e-6) ?? target;
    return lerp(from, target, u * u * (3 - 2 * u));
}

/** The post an errand holds now, as drawn, and when it first got one. */
function slotOf(st: FloorState, e: Errand, w: number): {x: number | null; arriveAt: number | null} {
    return {x: shownX(st, e, w, st.now), arriveAt: arrivalOf(st, e, w)};
}

/** The mechanism stops dead while the errand waits (the Stopped Mechanism Rule). */
function mechTOf(e: Errand, act: number): number {
    if (e.state !== 'waiting') {
        e.mechHeld = null;
        return act;
    }
    e.mechHeld ??= act;
    return e.mechHeld;
}

interface FigureCtx {
    st: FloorState;
    geo: BenchGeometry;
    s: number;
    act: number;
    rail: ErrandRail | null;
}

function baseFigure(c: FigureCtx, e: Errand, p: Pt): ErrandFigure {
    return {
        kind: 'specimen',
        layer: 'band',
        id: e.id,
        type: e.type,
        cls: e.cls === 'hired' ? 'hired' : 'lab',
        x: p[0],
        y: p[1],
        s: c.s,
        legs: 'stand',
        arms: 'running',
        mechT: mechTOf(e, c.act),
        state: e.state,
    };
}

/** The departure: run to the in-tray, hand in the slip, hop home into the flask. */
function departing(c: FigureCtx, e: Errand, d: number): ErrandFigure | null {
    const {st, geo, s} = c;
    // a finished transit is rejected before any lookup into the post history
    const te = eff(st, d, d + DEP);
    if (te >= d + DEP) return null;
    const from = postXAt(st, e, d - 1e-6, geo.w);
    if (from === null) return null; // it was only ever "+N"
    const ground = geo.benchTopY;
    const tray: Pt = [trayX(geo), ground];
    const apex = geo.benchTopY - 52;
    const f = baseFigure(c, e, tray);
    const turn = e.type === 'synchronizer' ? Math.PI : 0;
    if (te < d + 0.5) {
        const p = route(geo, {from: [from, ground], to: tray, apex}, easeOut(prog(te, d, 0.5)));
        return {...f, x: p[0], y: p[1], walking: true, airborne: p[1] < ground - 3};
    }
    if (te < d + 0.8) return {...f, arms: 'post', flip: turn * easeOut(prog(te, d + 0.5, 0.3))};
    const u = prog(te, d + 0.8, 0.5);
    const m = mouth(geo);
    const p = hop(tray, [m[0], m[1] + 10 * s], apex, u);
    return {
        ...f,
        x: p[0],
        y: p[1],
        s: s * lerp(1, 0.15, easeIn(u)),
        home: easeIn(u),
        flip: turn,
        airborne: p[1] < ground - 3,
    };
}

/** The arrival, tier 0: born out of the flask mouth and hopped to the post. */
function arriving(c: FigureCtx, e: Errand, post: Pt, s0: number): ErrandFigure | null {
    if (e.grip && hasRail(c)) return gripArrival(c, e, post, s0);
    const {st, geo, s} = c;
    const te = eff(st, s0, s0 + ARRIVE_S);
    if (te >= s0 + ARRIVE_S) return null;
    const fit = specimenFit(e.type);
    const apex = Math.max(geo.cropTop + 2, 22) + Math.max(fit.standTop, fit.sillTop) * s;
    const p = route(geo, {from: mouth(geo), to: post, apex}, prog(te, s0, ARRIVE_S));
    const bu = prog(te, s0, BIRTH_S);
    const born = bu < 1 ? {birth: bu, s: s * lerp(0.15, 1, easeOut(bu))} : {};
    return {...baseFigure(c, e, p), walking: true, airborne: p[1] < post[1] - 3, ...born};
}

// --- the Rail: the sill, measured on the page, mapped into the bench's own coordinates ---------

type RailCtx = FigureCtx & {rail: ErrandRail};
const hasRail = (c: FigureCtx): c is RailCtx => c.rail !== null;
const pageX = (c: RailCtx, x: number): number => x + c.rail.env.benchLeft;
const benchX = (c: RailCtx, x: number): number => x - c.rail.env.benchLeft;
const benchY = (c: RailCtx, y: number): number => y - c.rail.env.benchTop + c.geo.cropTop;
/** The hip y that puts a figure's ink SILL_GAP under the ceiling. */
const sillHip = (c: RailCtx, topU: number, s: number): number => benchY(c, c.rail.env.ceiling + SILL_GAP + topU * s);
/** Ink that rises above the bench canvas belongs on the sill canvas (border by geometry). */
const layerFor = (c: FigureCtx, hipY: number, topU: number, s: number): 'band' | 'border' =>
    c.rail !== null && hipY - topU * s < c.geo.cropTop ? 'border' : 'band';

/** The sill x for a minion from `postX`: in the climbable span, outboard of the arch,
 *  clear of the plumb-line (±24) and the monkey's hang (±32). */
function sillX(c: RailCtx, postX: number): number {
    const {env, plumbX} = c.rail;
    const flask = pageX(c, flaskX(c.geo));
    const avoid: [number, number][] = [[flask - 32, flask + 32]];
    if (plumbX !== null) avoid.push([plumbX - 24, plumbX + 24]);
    return benchX(c, allowedX(env, Math.min(pageX(c, postX), pageX(c, archGateX(c.geo)) - 12), avoid));
}

/** The arrival that grips: up behind the rail, Kilroy over the brass for 1.2 s, then down to its post. */
function gripArrival(c: RailCtx, e: Errand, post: Pt, s0: number): ErrandFigure | null {
    const {st, geo, s} = c;
    const te = eff(st, s0, s0 + GRIP_ARRIVE_S);
    if (te >= s0 + GRIP_ARRIVE_S) return null;
    const fit = specimenFit(e.type);
    const top = Math.max(fit.standTop, fit.sillTop);
    const gx = sillX(c, post[0]);
    const hipUp = sillHip(c, fit.sillTop, s);
    const hipDown = hipUp + 12;
    const f = baseFigure(c, e, post);
    if (te < s0 + GRIP_HOP_S) {
        const p = hop(mouth(geo), [gx, hipDown], hipDown - 6, easeOut(prog(te, s0, GRIP_HOP_S)));
        const bu = prog(te, s0, BIRTH_S);
        const born = bu < 1 ? {birth: bu, s: s * lerp(0.15, 1, easeOut(bu))} : {};
        return {...f, x: p[0], y: p[1], airborne: true, layer: layerFor(c, p[1], top, s), ...born};
    }
    if (te < s0 + GRIP_HOLD_END_S) {
        // fingers first, head 60 ms later, a sharp rise, and the drop faster than the rise
        const rise = easeOut(prog(te, s0 + 0.41, 0.22));
        const fall = easeIn(prog(te, s0 + 1.43, 0.12));
        const hip = lerp(hipDown, hipUp, rise * (1 - fall));
        const gripY = (benchY(c, c.rail.env.railY + 1) - hip) / s;
        return {...f, x: gx, y: hip, arms: 'grip', legs: 'hang', layer: 'border', behindRail: true, gripY};
    }
    const p = route(geo, {from: [gx, hipDown], to: post, apex: hipDown}, easeIn(prog(te, s0 + GRIP_HOLD_END_S, 0.5)));
    return {
        ...f,
        x: p[0],
        y: p[1],
        arms: 'idle',
        walking: true,
        airborne: p[1] < post[1] - 3,
        layer: layerFor(c, p[1], top, s),
    };
}

/** A wait held 1.5 s: it climbs into the sill and points at his terminal, finger up — a place, so it holds. */
function sillRise(c: RailCtx, e: Errand, post: Pt): ErrandFigure | null {
    const hold = c.st.sill;
    if (hold?.id !== e.id || hold.reason !== 'permission') return null;
    const {st, s} = c;
    const fit = specimenFit(e.type);
    const r0 = hold.since;
    const tr = eff(st, r0, r0 + SILL_RISE_S);
    const hip = sillHip(c, fit.sillTop, s);
    const p = route(c.geo, {from: post, to: [sillX(c, post[0]), hip], apex: hip}, easeOut(prog(tr, r0, SILL_RISE_S)));
    // compare times, not the progress: (4.1 − 3.5) / 0.6 is 0.9999999999999998
    const up = tr >= r0 + SILL_RISE_S;
    const layer = layerFor(c, p[1], Math.max(fit.standTop, fit.sillTop), s);
    return {
        ...baseFigure(c, e, p),
        arms: up ? 'point' : 'idle',
        legs: up ? 'hang' : 'stand',
        walking: !up,
        behindRail: up,
        layer,
    };
}

/** The wait answered: back down from the sill to its post. */
function sillReturn(c: RailCtx, e: Errand, post: Pt): ErrandFigure | null {
    // only from a RECORDED exit: a waiter that never took the sill never walks back from it
    const end = c.st.sillExits.get(e.id);
    if (end === undefined) return null;
    const tr = eff(c.st, end, end + SILL_RETURN_S);
    if (tr >= end + SILL_RETURN_S) return null;
    const fit = specimenFit(e.type);
    const from: Pt = [sillX(c, post[0]), sillHip(c, fit.sillTop, c.s)];
    const p = route(c.geo, {from, to: post, apex: from[1]}, easeIn(prog(tr, end, SILL_RETURN_S)));
    return {
        ...baseFigure(c, e, p),
        arms: 'idle',
        walking: true,
        layer: layerFor(c, p[1], Math.max(fit.standTop, fit.sillTop), c.s),
    };
}

// --- the Chaos Monkey (P2): hanging by his fuse-tail from the investor's own railing ----------

function monkeyBase(c: FigureCtx, e: Errand, p: Pt, s: number): ErrandFigure {
    const arms: ErrandFigure['arms'] = e.state === 'waiting' ? 'point' : e.state;
    return {
        ...baseFigure(c, e, p),
        kind: 'monkey',
        s,
        arms,
        layer: 'border',
        behindRail: true,
        rot: 0,
        mechT: c.act * MONKEY_RATE,
    };
}

/** Where he hangs: the head ≤ drawing y 30, the pivot on the brass above the flask. */
function hangGeometry(c: RailCtx): {pivot: Pt; hipY: number; s: number} {
    const s = c.s * R2_MONKEY;
    return {pivot: [flaskX(c.geo), benchY(c, c.rail.env.railY + 1)], hipY: 30 - 39.5 * s, s};
}

function tailFor(
    c: RailCtx,
    t: {s: number; hipY: number; mode: HangingTail['mode']; burn: number; dx: number},
): HangingTail {
    const {env} = c.rail;
    return {
        mode: t.mode,
        rail: benchY(c, env.railY + 1) - t.hipY,
        topOK: benchY(c, env.dividerTop + 1.2) - t.hipY,
        s: t.s,
        burn: t.burn,
        dx: t.dx,
        coils: 2,
        t: c.act * MONKEY_RATE,
    };
}

/** No sill, or the compact posture: he sits on the torn edge, head at the brass (or, with no
 *  sill at all, on the top of the band) — §7.5's posture. */
function seatedMonkey(c: FigureCtx, e: Errand): ErrandFigure | null {
    const d = e.departedAt;
    if (d !== null && eff(c.st, d, d + MONKEY_POP_S) >= d + MONKEY_POP_S) return null;
    const s = c.s * R2_MONKEY;
    const seated = (sb: number): HangingTail => ({
        mode: 'seated',
        rail: 0,
        topOK: 0,
        s: sb,
        burn: 0,
        dx: 0,
        coils: 1,
        t: c.act * MONKEY_RATE,
    });
    if (!hasRail(c)) {
        const hip = c.geo.cropTop + 40 * s + 2;
        return {
            ...monkeyBase(c, e, [flaskX(c.geo), hip], s),
            legs: 'dangle',
            layer: 'band',
            behindRail: false,
            tail: seated(s),
        };
    }
    const {env} = c.rail;
    const hipPage = env.benchTop - 4;
    const sb = Math.min(s, (hipPage - (env.dividerTop + 1.5)) / 40);
    return {...monkeyBase(c, e, [flaskX(c.geo), benchY(c, hipPage)], sb), legs: 'dangle', tail: seated(sb)};
}

/** Out of the flask, a grip over the brass if he earned one, then over and down onto his tail. */
function monkeyArriving(c: RailCtx, e: Errand, te: number): ErrandFigure {
    const {pivot, hipY, s} = hangGeometry(c);
    const s0 = e.seenAt;
    const gripHip = sillHip(c, 40, s);
    const hx = pivot[0];
    if (te < s0 + GRIP_HOP_S) {
        const y = lerp(mouth(c.geo)[1], gripHip + 12, easeOut(prog(te, s0, GRIP_HOP_S)));
        return {
            ...monkeyBase(c, e, [hx, y], s),
            legs: 'dangle',
            arms: 'running',
            tailFromRump: true,
            behindRail: false,
            layer: layerFor(c, y, 40, s),
        };
    }
    if (e.grip && te < s0 + GRIP_HOLD_END_S) {
        const rise = easeOut(prog(te, s0 + 0.41, 0.22));
        const fall = easeIn(prog(te, s0 + 1.43, 0.12));
        const hip = lerp(gripHip + 12, gripHip, rise * (1 - fall));
        return {
            ...monkeyBase(c, e, [hx, hip], s),
            legs: 'dangle',
            arms: 'grip',
            gripY: (pivot[1] - hip) / s,
            tail: tailFor(c, {s, hipY: hip, mode: 'climb', burn: 0, dx: 0}),
        };
    }
    const from = e.grip ? s0 + GRIP_HOLD_END_S : s0 + GRIP_HOP_S;
    const u = easeIn(prog(te, from, s0 + arrivalEnd(e) - from));
    const y = lerp(gripHip + 12, hipY, u);
    return {
        ...monkeyBase(c, e, [hx, y], s),
        legs: 'tuck',
        arms: 'idle',
        rot: Math.PI * u,
        tail: tailFor(c, {s, hipY: y, mode: 'hang', burn: 0, dx: 0}),
    };
}

/** Hanging: he swings ±8° about the rail while he runs, and the fuse spits. */
function monkeyOut(c: RailCtx, e: Errand): ErrandFigure {
    const s0 = e.seenAt;
    const te = eff(c.st, s0, s0 + arrivalEnd(e));
    if (te < s0 + arrivalEnd(e)) return monkeyArriving(c, e, te);
    const {pivot, hipY, s} = hangGeometry(c);
    const swing =
        e.state === 'running' && !c.st.reduced ? (Math.sin(c.act * MONKEY_RATE * 3.2) * 8 * Math.PI) / 180 : 0;
    const dy = hipY - pivot[1];
    const hip: Pt = [pivot[0] - Math.sin(swing) * dy, pivot[1] + Math.cos(swing) * dy];
    const tail = tailFor(c, {s, hipY: hip[1], mode: 'hang', burn: 0, dx: hip[0] - pivot[0]});
    return {...monkeyBase(c, e, hip, s), legs: 'tuck', rot: Math.PI + swing, tail};
}

/** The POP: the spark runs down the tail, he's gone, and his scorecard flutters into the in-tray. */
function monkeyHome(c: RailCtx, e: Errand, d: number): ErrandFigure | null {
    const tp = eff(c.st, d, d + MONKEY_SLIP_S);
    if (tp >= d + MONKEY_SLIP_S) return null;
    const {pivot, hipY, s} = hangGeometry(c);
    if (tp < d + MONKEY_POP_S) {
        const burn = prog(tp, d, MONKEY_POP_S);
        return {
            ...monkeyBase(c, e, [pivot[0], hipY], s),
            legs: 'tuck',
            rot: Math.PI,
            tail: tailFor(c, {s, hipY, mode: 'hang', burn, dx: 0}),
        };
    }
    const u = prog(tp, d + MONKEY_POP_S, MONKEY_SLIP_S - MONKEY_POP_S);
    const to: Pt = [trayX(c.geo), c.geo.benchTopY - 4];
    const p: Pt = [lerp(pivot[0], to[0], u) + Math.sin(u * 9) * 6, lerp(hipY, to[1], easeIn(u))];
    return {...baseFigure(c, e, p), kind: 'slip', angle: Math.sin(u * 7) * 0.6};
}

function monkeyFigure(c: FigureCtx, e: Errand): ErrandFigure | null {
    if (!hasRail(c) || c.geo.compact) return seatedMonkey(c, e);
    return e.departedAt === null ? monkeyOut(c, e) : monkeyHome(c, e, e.departedAt);
}

/** Holding a post: arriving, in the sill or back from it, or seated in its POST POSE (≤ 52 px). */
function atPost(c: FigureCtx, e: Errand, post: Pt, arriveAt: number): ErrandFigure {
    const moving =
        arriving(c, e, post, arriveAt) ?? (hasRail(c) ? (sillRise(c, e, post) ?? sillReturn(c, e, post)) : null);
    if (moving) return moving;
    const lamp = e.background && c.st.scientistState === 'idle';
    return {...baseFigure(c, e, post), legs: 'kneel', arms: e.state, lamp};
}

function figureOf(c: FigureCtx, e: Errand): ErrandFigure | null {
    if (isMonkey(e)) return monkeyFigure(c, e);
    if (e.departedAt !== null) return departing(c, e, e.departedAt);
    const {x, arriveAt} = slotOf(c.st, e, c.geo.w);
    if (x === null || arriveAt === null || c.st.now < arriveAt) return null; // out, but only as "+N"
    return atPost(c, e, [x, c.geo.benchTopY], arriveAt);
}

/** A departure's phase: on its way home until its transit (or the monkey's pop) ends. */
function goingPhase(st: FloorState, e: Errand, d: number): ErrandPhase {
    if (isMonkey(e)) return eff(st, d, d + MONKEY_POP_S) < d + MONKEY_POP_S ? 'hanging' : 'gone';
    return eff(st, d, d + DEP) < d + DEP ? 'home' : 'gone';
}

function phaseAt(st: FloorState, e: Errand, w: number): ErrandPhase {
    if (e.departedAt !== null) return goingPhase(st, e, e.departedAt);
    if (isMonkey(e)) return 'hanging';
    const {x, arriveAt} = slotOf(st, e, w);
    if (x === null || arriveAt === null) return 'queued';
    const end = arriveAt + arrivalEnd(e);
    const te = eff(st, arriveAt, end);
    if (te >= end) return 'post';
    if (te < arriveAt + BIRTH_S) return 'born';
    return e.grip && te < arriveAt + GRIP_HOLD_END_S ? 'grip' : 'hop';
}

/** still on its way home: the cork stays out until the last one is in */
function homeward(st: FloorState, e: Errand): boolean {
    if (e.departedAt === null) return true;
    const home = e.departedAt + (isMonkey(e) ? MONKEY_POP_S : DEP);
    return eff(st, e.departedAt, home) < home;
}

/** A transient that plays over [at, at + len], belonging to a transit that began at
 *  `origin`: it plays only while that transit is unsettled — a landed homecoming never burps. */
const playing = (st: FloorState, span: {origin: number; at: number}, len: number): boolean =>
    !settled(st, span.origin) && st.now >= span.at && st.now < span.at + len;

function poolsOf(st: FloorState, geo: BenchGeometry): {x: number; rx: number}[] {
    if (st.scientistState !== 'idle') return [];
    const out: {x: number; rx: number}[] = [];
    for (const e of outAt(st, st.now)) {
        if (!e.background) continue;
        const {x, arriveAt} = slotOf(st, e, geo.w);
        if (x === null || arriveAt === null || eff(st, arriveAt, arriveAt + arrivalEnd(e)) < arriveAt + arrivalEnd(e))
            continue;
        out.push({x: x - 3, rx: (specimenFit(e.type).postFootPx * 1.4) / 2});
    }
    return out;
}

/** A slip lands when its runner reaches the tray — at once, if that departure has settled. */
function trayOf(st: FloorState): TraySlip[] {
    return st.slips
        .filter((s) => (s.at <= st.now || settled(st, s.origin)) && st.now < s.at + FILE_AFTER_S)
        .slice(-TRAY_SHEETS)
        .map(({at, task, scorched}) => ({at, task, scorched}));
}

/** Errands this long gone no longer move anyone's post, and are forgotten. */
const RETIRE_AFTER_S = 5;
/** The board keeps a departure row for 30 s; remember having handled one a while longer. */
const FORGET_HOME_AFTER_S = 60;

/** Bound the history: retire long-gone errands, forget old departures, drop filed slips. */
function compact(st: FloorState): void {
    for (const [id, e] of st.errands)
        if (e.departedAt !== null && st.now > e.departedAt + RETIRE_AFTER_S) st.errands.delete(id);
    for (const [id, at] of st.homeIds)
        if (st.now > at + FORGET_HOME_AFTER_S && !st.boardDeparted.has(id)) st.homeIds.delete(id);
    st.slips = st.slips.filter((s) => st.now < s.at + FILE_AFTER_S);
    st.blots = st.blots.filter((b) => st.now < b.at + FILE_AFTER_S);
    for (const [id, at] of st.sillExits) if (st.now > at + SILL_RETURN_S + 1) st.sillExits.delete(id);
}

function ledgerOf(st: FloorState): string | null {
    const out = [...st.errands.values()].filter(isOut).sort((a, b) => b.since - a.since);
    const top = out[0];
    if (!top) return null;
    const more = out.length - 1;
    return `${voiceName(top.type)} · ${top.detail}${more > 0 ? ` · ${more} more out` : ''}`;
}

function furnitureOf(st: FloorState, geo: BenchGeometry): ErrandFurnitureState {
    const all = [...st.errands.values()];
    const live = all.filter((e) => homeward(st, e));
    return {
        now: st.now,
        corkOut: live.length > 0,
        corkAt: Math.min(...live.map((e) => e.seenAt)),
        foam: all.map((e) => e.seenAt).filter((at) => playing(st, {origin: at, at}, FOAM_S)),
        burps: all
            .filter((e) => !isMonkey(e) && e.departedAt !== null)
            .map((e) => ({origin: e.departedAt ?? 0, at: (e.departedAt ?? 0) + DEP}))
            .filter((span) => playing(st, span, BURP_S))
            .map((span) => span.at),
        tray: trayOf(st),
        pools: poolsOf(st, geo),
        overflow: Math.max(0, outAt(st, st.now).length - 3),
        blots: st.blots
            .filter((b) => (b.at <= st.now || settled(st, b.origin)) && st.now < b.at + FILE_AFTER_S)
            .map(() => ({x: flaskX(geo), y: Math.max(geo.cropTop + 8, 16)})),
    };
}

/** Fold one live board in (never null, never cold). */
function foldBoard(st: FloorState, board: ScientistErrands): ErrandEvent[] {
    // The host re-pushes the SAME cached board whenever anything else on the page changes, and
    // the mod rewrites its file only on a new board. A board no newer than the last one folded
    // changes nothing: re-folding it once its departures were forgotten would fabricate them.
    if (board.at <= st.boardAt) return [...flushVolleys(st), ...permissionEvents(st)];
    st.boardAt = board.at;
    st.boardDeparted = new Set(board.departed.map((d) => d.id));
    const fresh: Errand[] = [];
    for (const m of board.minions) {
        const e = foldMinion(st, m) ? st.errands.get(m.id) : undefined;
        if (e) fresh.push(e);
    }
    foldDepartures(st, board);
    if (st.cold) {
        landCold(st);
        return [];
    }
    updateSill(st);
    for (const e of fresh.sort(bySpawn)) {
        queueVolley(st, e);
        e.grip = canGrip(st, e);
        if (e.grip) st.sill = {id: e.id, reason: 'grip', since: e.seenAt, w0: e.seenAt};
    }
    return [...flushVolleys(st), ...permissionEvents(st)];
}

export function createErrandFloor(reducedMotion = false): ErrandFloor {
    let st = freshState(reducedMotion);
    const land = (): void => {
        st.landedAt = st.now;
        for (const v of st.pending) v.dueAt = st.now;
    };
    return {
        ingest(board, scientistState, nowS) {
            st.now = Math.max(st.now, nowS);
            st.scientistState = scientistState;
            compact(st);
            if (board !== null) return foldBoard(st, board);
            // the session ended or exited: every errand swept, silently; the next board is a cold start
            st = freshState(st.reduced, {rail: st.rail, gate: st.gate});
            st.now = nowS;
            return [];
        },
        advance(nowS, gate) {
            st.now = Math.max(st.now, nowS);
            if (gate) st.gate = gate;
            compact(st);
            updateSill(st);
            return [...flushVolleys(st), ...permissionEvents(st)];
        },
        land,
        setReducedMotion(on) {
            st.reduced = on;
            if (on) land();
        },
        posts(width) {
            return outAt(st, st.now)
                .map((e) => ({id: e.id, x: postXAt(st, e, st.now, width)}))
                .filter((p): p is {id: string; x: number} => p.x !== null);
        },
        overflow: () => Math.max(0, outAt(st, st.now).length - 3),
        sillOccupant() {
            return st.sill ? {id: st.sill.id, reason: st.sill.reason} : null;
        },
        setRail(rail) {
            st.rail = rail;
        },
        tray: () => trayOf(st),
        corkOut: () => [...st.errands.values()].some((e) => homeward(st, e)),
        ledgerLine: () => ledgerOf(st),
        lit() {
            if (st.scientistState !== 'idle') return [];
            return outAt(st, st.now)
                .slice(0, 3)
                .filter((e) => e.background)
                .map((e) => e.id);
        },
        phaseOf(id) {
            const e = st.errands.get(id);
            // the width only moves a post's x, never whether it has one
            return e ? phaseAt(st, e, 1) : 'gone';
        },
        retained: () => st.errands.size,
        inTransit() {
            const moving = new Set<ErrandPhase>(['born', 'hop', 'grip', 'home']);
            return [...st.errands.values()].filter((e) => moving.has(phaseAt(st, e, 1))).length;
        },
        figures(geo, act) {
            const c: FigureCtx = {st, geo, s: minionScale(geo), act, rail: st.rail};
            return [...st.errands.values()].map((e) => figureOf(c, e)).filter((f): f is ErrandFigure => f !== null);
        },
        furniture: (geo) => furnitureOf(st, geo),
    };
}
