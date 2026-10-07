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

import {benchStationX, type BenchGeometry} from './projection';
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
}

export type ErrandPhase = 'born' | 'hop' | 'post' | 'queued' | 'hanging' | 'home' | 'gone';

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
    id: string;
    type: string;
    cls: 'lab' | 'hired';
    /** the figure's feet */
    x: number;
    y: number;
    /** px per local unit */
    s: number;
    legs: Legs;
    arms: Arms | 'post';
    mechT: number;
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
    /** One occupant: the earliest-started wait held ≥ 1.5 s. Never the monkey. (The grip joins in P2.) */
    sillOccupant(): {id: string; reason: 'grip' | 'permission'} | null;
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
    landedAt: number;
    now: number;
    reduced: boolean;
}

function freshState(reduced: boolean): FloorState {
    return {
        errands: new Map(),
        slips: [],
        homeIds: new Map(),
        pending: [],
        scientistState: 'idle',
        cold: true,
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
}

function baseFigure(c: FigureCtx, e: Errand, p: Pt): ErrandFigure {
    return {
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

function figureOf(c: FigureCtx, e: Errand): ErrandFigure | null {
    if (isMonkey(e)) return null; // P1: the Chaos Monkey is in the ledger only
    if (e.departedAt !== null) return departing(c, e, e.departedAt);
    const {x, arriveAt} = slotOf(c.st, e, c.geo.w);
    if (x === null || arriveAt === null || c.st.now < arriveAt) return null; // out, but only as "+N"
    const post: Pt = [x, c.geo.benchTopY];
    const arrival = arriving(c, e, post, arriveAt);
    if (arrival) return arrival;
    // at its post: the POST POSE — seated, ≤ 52 px
    const lamp = e.background && c.st.scientistState === 'idle';
    return {...baseFigure(c, e, post), legs: 'kneel', arms: e.state, lamp};
}

function phaseAt(st: FloorState, e: Errand, w: number): ErrandPhase {
    if (isMonkey(e))
        return e.departedAt === null || eff(st, e.departedAt, e.departedAt + MONKEY_POP_S) < e.departedAt + MONKEY_POP_S
            ? 'hanging'
            : 'gone';
    if (e.departedAt !== null) return eff(st, e.departedAt, e.departedAt + DEP) < e.departedAt + DEP ? 'home' : 'gone';
    const {x, arriveAt} = slotOf(st, e, w);
    if (x === null || arriveAt === null) return 'queued';
    const te = eff(st, arriveAt, arriveAt + ARRIVE_S);
    if (te >= arriveAt + ARRIVE_S) return 'post';
    return te < arriveAt + BIRTH_S ? 'born' : 'hop';
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
        if (x === null || arriveAt === null || eff(st, arriveAt, arriveAt + ARRIVE_S) < arriveAt + ARRIVE_S) continue;
        out.push({x: x - 3, rx: (specimenFit(e.type).postFootPx * 1.4) / 2});
    }
    return out;
}

/** One occupant for the sill: the earliest-started wait held ≥ 1.5 s. Never the monkey. */
function occupantOf(st: FloorState): Errand | null {
    let best: {e: Errand; w0: number} | null = null;
    for (const e of st.errands.values()) {
        const w = openWait(e);
        if (isMonkey(e) || !isOut(e) || !w || st.now < w[0] + PERMISSION_DEBOUNCE_S) continue;
        if (!best || w[0] < best.w0) best = {e, w0: w[0]};
    }
    return best?.e ?? null;
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
    for (const [id, at] of st.homeIds) if (st.now > at + FORGET_HOME_AFTER_S) st.homeIds.delete(id);
    st.slips = st.slips.filter((s) => st.now < s.at + FILE_AFTER_S);
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
    };
}

/** Fold one live board in (never null, never cold). */
function foldBoard(st: FloorState, board: ScientistErrands): ErrandEvent[] {
    for (const m of board.minions) {
        const fresh = foldMinion(st, m);
        const e = st.errands.get(m.id);
        if (fresh && e && !st.cold) queueVolley(st, e);
    }
    foldDepartures(st, board);
    if (st.cold) {
        landCold(st);
        return [];
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
            st = freshState(st.reduced);
            st.now = nowS;
            return [];
        },
        advance(nowS) {
            st.now = Math.max(st.now, nowS);
            compact(st);
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
            const e = occupantOf(st);
            return e ? {id: e.id, reason: 'permission'} : null;
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
            const moving = new Set<ErrandPhase>(['born', 'hop', 'home']);
            return [...st.errands.values()].filter((e) => moving.has(phaseAt(st, e, 1))).length;
        },
        figures(geo, act) {
            const c: FigureCtx = {st, geo, s: minionScale(geo), act};
            return [...st.errands.values()].map((e) => figureOf(c, e)).filter((f): f is ErrandFigure => f !== null);
        },
        furniture: (geo) => furnitureOf(st, geo),
    };
}
