// =============================================================================
// The Crossing — the Long Bench's walk machine and its one narrative event
// (#00041 §5.4 – §5.6)
//
// Two colleagues stand on one continuous bench, so the thing the old floor
// could not do is free: they can walk to each other. When mail arrives at a
// colleague's bench (a rise in the Speaking Tube's `last_received_id` for
// that identity — see `useColleagues.ts`), ONE crossing plays for that
// colleague as the RECEIVER:
//
//   flight   the capsule travels the arch to the receiver's bell (~700 ms,
//            a sharp cubic: fast out, hard stop, a small settle — never a
//            bounce)
//   fetch    the receiver walks the length of their third to the middle bell
//   read     they stand at the bell reading it (~3 s)
//   return   they walk back to whatever their own station says
//
// The sender never moves for it and no hand posts anything (trip-wire 1): the
// other colleague keeps answering their own station table, which is the
// honest version of "never moves" — nothing about the tube touches them.
//
// Where a figure stands IS the state (§5.5). So the two freezes — reduced
// motion and a page change — share one rule: a capsule IN THE PIPE has no
// place to be, so it LANDS (the receiver already at the bell, holding it);
// a colleague mid-walk DOES have a place, an x on the bench, so the walk
// holds exactly where it stands and resumes. Nothing is ever frozen in
// transit and nothing is ever replayed (trip-wire 6).
//
// Pure: no canvas, no clock. `scene.js` feeds it `dt` and draws what it says.
// =============================================================================

import type {Colleague} from '../roster/types';
import type {ActivityState} from './types';

import {COLLEAGUES} from '../roster/types';
import {type BenchGeometry, benchGeometry, benchStationX, restFacing} from './projection';

/** The walk, as a fraction of page width per second. The retired floor
 *  walked 2.4 %/s; at that rate one leg of the crossing took 3.5 s. At
 *  4.2 %/s the whole event — 0.7 s of arch, ~2 s out, 3 s reading, ~2 s
 *  back — lands inside §5.4's six to eight seconds. */
export const WALK_FRACTION = 0.042;
/** §5.4: the capsule takes ~700 ms of arch. */
export const FLIGHT_S = 0.7;
/** §5.4: the receiver stands at the bell and reads for ~3 s. */
export const READ_S = 3;
/** §5.4: both `waiting` for ten seconds turns them toward each other. */
export const DOUBLE_WAIT_S = 10;
/** How long the capsule's settle in the bell mouth rings after the stop. */
export const SETTLE_S = 0.26;

export type CrossingPhase = 'none' | 'flight' | 'fetch' | 'read' | 'return';

export type Pt = [number, number];

export interface BenchActor {
    readonly id: Colleague;
    /** The CURRENT position. This — never `targetX` — is what the plumb-line,
     *  the wash and the caption read. That sentence is the whole D4 fix. */
    x: number;
    targetX: number;
    walking: boolean;
    faceDir: 1 | -1;
    /** What is drawn right now; a crossing borrows it. */
    activity: ActivityState;
    /** What the chronicle says the colleague is doing. */
    base: ActivityState;
    /** The receiver has the letter in hand. */
    holding: boolean;
}

export interface CapsulePose {
    x: number;
    y: number;
    angle: number;
}

/** What `deliver` did with a rise: started a crossing, queued it behind
 *  the one in progress, or dropped it (no receiver on the bench, or the one
 *  pending slot already taken — guard (e): never a restart). */
export type DeliverOutcome = 'started' | 'queued' | 'dropped';

/** Fast out, a hard stop. A pneumatic tube does not glide; it goes (§10). */
export function flightEase(t: number): number {
    const u = Math.min(1, Math.max(0, t));
    return 1 - Math.pow(1 - u, 4);
}

/** A colleague has reached where they were walking to. */
function arrived(a: BenchActor): boolean {
    return !a.walking && a.x === a.targetX;
}

/** A point on a quadratic Bézier. */
export function quadAt(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
    const a = 1 - t;
    return [a * a * p0[0] + 2 * a * t * c[0] + t * t * p1[0], a * a * p0[1] + 2 * a * t * c[1] + t * t * p1[1]];
}

/** The brass arch, drawn from the Mad Scientist's bell to the Heretic's. */
export function archPath(geo: BenchGeometry): {p0: Pt; c: Pt; p1: Pt} {
    return {
        p0: [geo.bell['mad-scientist'], geo.bellTopY - 2],
        c: [geo.w / 2, 2 * geo.archApexY - geo.bellTopY],
        p1: [geo.bell.heretic, geo.bellTopY - 2],
    };
}

/** The small ring the hard stop owes: decays to nothing inside SETTLE_S. */
export function settleOffset(sinceLanded: number): number {
    if (sinceLanded < 0 || sinceLanded >= SETTLE_S) return 0;
    return Math.exp(-sinceLanded * 11) * Math.sin(sinceLanded * 30) * 2.2;
}

export interface LongBench {
    readonly geometry: BenchGeometry;
    readonly phase: CrossingPhase;
    readonly receiver: Colleague | null;
    readonly pending: Colleague | null;
    /** Seat a colleague (or update what the chronicle says they are doing). */
    seat(id: Colleague, activity: ActivityState): void;
    /** A bench that closed: its figure leaves, and any crossing to it ends. */
    unseat(id: Colleague): void;
    actor(id: Colleague): BenchActor | null;
    actors(): BenchActor[];
    /** Re-cut for a new width or posture; every x keeps its place on the bench. */
    resize(width: number, compact: boolean): void;
    setReducedMotion(on: boolean): void;
    /** One rise of mail at `receiver`'s bench. `instant` lands it without the
     *  flight or the walk — the page is paused or the clamp is on. */
    deliver(receiver: Colleague, instant?: boolean): DeliverOutcome;
    /** Land a capsule that is in the pipe (the page is leaving), and mark a
     *  queued arrival to begin landed at its turn. */
    land(): void;
    advance(dt: number): void;
    capsule(): CapsulePose | null;
}

interface CrossingClock {
    phase: CrossingPhase;
    phaseT: number;
    sinceLanded: number;
    receiver: Colleague | null;
    pending: Colleague | null;
    /** The pending arrival was never witnessed in flight — it came in while
     *  the page was away, or was already queued when the page left — so at
     *  its turn it begins LANDED, never in the pipe (§5.6: no replay). */
    pendingLanded: boolean;
    bothWaitingFor: number;
    reduced: boolean;
}

export function createLongBench(width: number, compact = false): LongBench {
    let geo = benchGeometry(width, compact);
    const seated = new Map<Colleague, BenchActor>();
    const clock: CrossingClock = {
        phase: 'none',
        phaseT: 0,
        sinceLanded: Number.POSITIVE_INFINITY,
        receiver: null,
        pending: null,
        pendingLanded: false,
        bothWaitingFor: 0,
        reduced: false,
    };

    const doubleWait = (): boolean => clock.bothWaitingFor > DOUBLE_WAIT_S;

    /** Where this colleague belongs when nothing is happening to them. */
    function stationTarget(a: BenchActor): number {
        return doubleWait() ? geo.innerEdge[a.id] : benchStationX(geo.w, a.id, a.base);
    }

    function stepWalk(a: BenchActor, dt: number): void {
        const dx = a.targetX - a.x;
        const step = geo.w * WALK_FRACTION * dt;
        if (Math.abs(dx) <= Math.max(step, 0.5)) {
            a.x = a.targetX;
            if (a.walking) a.faceDir = restFacing(a.id);
            a.walking = false;
            return;
        }
        a.walking = true;
        a.faceDir = dx > 0 ? 1 : -1;
        a.x += Math.sign(dx) * step;
    }

    function receiverActor(): BenchActor | null {
        return clock.receiver === null ? null : (seated.get(clock.receiver) ?? null);
    }

    /** The clamp's end state for a delivery, reached without passing through
     *  the pipe: the letter is in the receiver's hands and the receiver is at
     *  the bell (§5.5; §2.7 makes the page return the same rule). */
    function snapToLanded(r: BenchActor): void {
        clock.phase = 'read';
        clock.phaseT = 0;
        clock.sinceLanded = SETTLE_S;
        r.x = geo.atBell[r.id];
        r.targetX = r.x;
        r.walking = false;
        r.faceDir = restFacing(r.id);
        r.activity = 'reading';
        r.holding = true;
    }

    function finishCrossing(r: BenchActor | null): void {
        clock.phase = 'none';
        clock.phaseT = 0;
        clock.receiver = null;
        if (r) {
            r.activity = r.base;
            r.holding = false;
        }
        const next = clock.pending;
        const landed = clock.pendingLanded;
        clock.pending = null;
        clock.pendingLanded = false;
        if (next !== null) start(next, landed || clock.reduced);
    }

    function start(receiver: Colleague, instant: boolean): boolean {
        const r = seated.get(receiver);
        if (!r) return false;
        clock.receiver = receiver;
        if (instant) {
            snapToLanded(r);
            return true;
        }
        clock.phase = 'flight';
        clock.phaseT = 0;
        clock.sinceLanded = Number.POSITIVE_INFINITY;
        return true;
    }

    function advancePhase(r: BenchActor): void {
        switch (clock.phase) {
            case 'flight':
                r.targetX = stationTarget(r);
                if (clock.phaseT >= FLIGHT_S) {
                    clock.phase = 'fetch';
                    clock.phaseT = 0;
                    clock.sinceLanded = 0;
                    // The thought is dropped the moment the bell takes the
                    // letter; `idle` is the neutral carriage for the walk.
                    r.activity = 'idle';
                }
                break;
            case 'fetch':
                r.targetX = geo.atBell[r.id];
                if (arrived(r)) {
                    clock.phase = 'read';
                    clock.phaseT = 0;
                    r.activity = 'reading';
                    r.holding = true;
                }
                break;
            case 'read':
                if (clock.phaseT >= READ_S) {
                    clock.phase = 'return';
                    clock.phaseT = 0;
                    r.activity = 'idle';
                }
                break;
            case 'return':
                r.targetX = stationTarget(r);
                if (arrived(r)) finishCrossing(r);
                break;
            case 'none':
                break;
        }
    }

    function tickDoubleWait(dt: number): void {
        const all = [...seated.values()];
        const bothWaiting = all.length === COLLEAGUES.length && all.every((a) => a.base === 'waiting');
        clock.bothWaitingFor = bothWaiting ? clock.bothWaitingFor + dt : 0;
    }

    function holdingPose(r: BenchActor): CapsulePose {
        const dir = r.faceDir;
        const shoulderY = geo.groundY - (66 + 48) * geo.s;
        if (clock.phase === 'read') {
            // Held out on the bell side, clear of the face: at chest height it
            // merged with the reading pose's own book; at face height it
            // covered the amber eyeglass, which is the acting (prototype).
            return {x: r.x + dir * 30, y: shoulderY + 8, angle: dir * 0.22};
        }
        return {x: r.x + dir * 6, y: shoulderY + 22 * geo.s, angle: dir * -0.18};
    }

    function flightPose(r: BenchActor): CapsulePose {
        const arch = archPath(geo);
        // From the sender's bell to the receiver's.
        const [p0, p1] = r.id === 'heretic' ? [arch.p0, arch.p1] : [arch.p1, arch.p0];
        const t = flightEase(clock.phaseT / FLIGHT_S);
        const p = quadAt(p0, arch.c, p1, t);
        const q = quadAt(p0, arch.c, p1, Math.min(1, t + 0.02));
        const angle = Math.atan2(q[1] - p[1], q[0] - p[0]);
        // Riding ON the pipe, not inside it: on the centreline the brass ran
        // straight through the folded paper. The normal points away from the
        // arch's centre whichever way the capsule travels.
        const side = r.id === 'heretic' ? 1 : -1;
        return {x: p[0] + Math.sin(angle) * 8 * side, y: p[1] - Math.cos(angle) * 8 * side, angle};
    }

    const bench: LongBench = {
        get geometry() {
            return geo;
        },
        get phase() {
            return clock.phase;
        },
        get receiver() {
            return clock.receiver;
        },
        get pending() {
            return clock.pending;
        },
        seat(id, activity) {
            const existing = seated.get(id);
            if (existing) {
                existing.base = activity;
                if (clock.receiver !== id) existing.activity = activity;
                return;
            }
            const x = benchStationX(geo.w, id, activity);
            seated.set(id, {
                id,
                x,
                targetX: x,
                walking: false,
                faceDir: restFacing(id),
                activity,
                base: activity,
                holding: false,
            });
        },
        unseat(id) {
            if (!seated.delete(id)) return;
            if (clock.pending === id) {
                clock.pending = null;
                clock.pendingLanded = false;
            }
            if (clock.receiver === id) finishCrossing(null);
        },
        actor: (id) => seated.get(id) ?? null,
        actors: () => COLLEAGUES.flatMap((id) => seated.get(id) ?? []),
        resize(width, nextCompact) {
            const ratio = Math.max(1, width) / geo.w;
            geo = benchGeometry(width, nextCompact);
            for (const a of seated.values()) {
                a.x *= ratio;
                a.targetX *= ratio;
            }
        },
        setReducedMotion(on) {
            clock.reduced = on;
            if (on) bench.land();
        },
        deliver(receiver, instant = false) {
            if (!seated.has(receiver)) return 'dropped';
            if (clock.phase !== 'none') {
                if (clock.pending !== null) return 'dropped';
                clock.pending = receiver;
                clock.pendingLanded = instant;
                return 'queued';
            }
            start(receiver, instant || clock.reduced);
            return 'started';
        },
        land() {
            const r = receiverActor();
            if (clock.phase === 'flight' && r) snapToLanded(r);
            // A letter already waiting its turn is settled too: the investor
            // will not be shown a flight they left the page during.
            if (clock.pending !== null) clock.pendingLanded = true;
        },
        advance(dt) {
            tickDoubleWait(dt);
            clock.phaseT += dt;
            clock.sinceLanded += dt;
            const r = receiverActor();
            if (r) advancePhase(r);
            // Re-read: finishing one crossing may have started the queued one,
            // and its receiver's target belongs to the crossing, not the table.
            const receiving = receiverActor();
            for (const a of seated.values()) {
                if (a !== receiving) a.targetX = stationTarget(a);
                if (doubleWait() && !a.walking) a.faceDir = restFacing(a.id);
                stepWalk(a, dt);
            }
        },
        capsule() {
            const r = receiverActor();
            if (!r) return null;
            if (clock.phase === 'flight') return flightPose(r);
            if (clock.phase === 'fetch') {
                // Resting in the receiver's bell mouth, with the settle.
                return {x: geo.bell[r.id], y: geo.bellTopY - 5 + settleOffset(clock.sinceLanded), angle: 0.12};
            }
            return r.holding ? holdingPose(r) : null;
        },
    };
    return bench;
}
