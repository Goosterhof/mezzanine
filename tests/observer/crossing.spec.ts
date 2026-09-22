// The Crossing — the Long Bench's walk machine and its one narrative event
// (#00041 §5.4 – §5.6). Pure: every trip-wire the prototype measured by eye
// is pinned here by number.

import {describe, expect, it} from 'vitest';

import {
    DOUBLE_WAIT_S,
    FLIGHT_S,
    READ_S,
    SETTLE_S,
    WALK_FRACTION,
    archPath,
    createLongBench,
    flightEase,
    quadAt,
    settleOffset,
} from '../../src/observer/crossing';
import {benchStationX} from '../../src/observer/projection';

const W = 1440;
const FRAME = 1 / 60;

function bench() {
    const b = createLongBench(W);
    b.seat('mad-scientist', 'writing');
    b.seat('heretic', 'thinking');
    return b;
}

/** Advance in 60 fps steps until `done` or `limit` seconds pass. */
function run(b: ReturnType<typeof createLongBench>, seconds: number, done?: () => boolean): number {
    let t = 0;
    while (t < seconds) {
        b.advance(FRAME);
        t += FRAME;
        if (done?.()) break;
    }
    return t;
}

function x(b: ReturnType<typeof createLongBench>, id: 'mad-scientist' | 'heretic'): number {
    const a = b.actor(id);
    if (!a) throw new Error(`${id} is not on the bench`);
    return a.x;
}

describe('seating the two colleagues', () => {
    it('seats each at its own station, facing the middle', () => {
        const b = bench();
        expect(x(b, 'mad-scientist')).toBe(benchStationX(W, 'mad-scientist', 'writing'));
        expect(x(b, 'heretic')).toBe(benchStationX(W, 'heretic', 'thinking'));
        expect(b.actor('mad-scientist')?.faceDir).toBe(1);
        expect(b.actor('heretic')?.faceDir).toBe(-1);
        expect(b.actors().map((a) => a.id)).toStrictEqual(['mad-scientist', 'heretic']);
    });

    it('re-seating updates what the chronicle says without teleporting the figure', () => {
        const b = bench();
        const before = x(b, 'mad-scientist');
        b.seat('mad-scientist', 'reading');
        expect(x(b, 'mad-scientist')).toBe(before);
        expect(b.actor('mad-scientist')?.activity).toBe('reading');
    });

    it('unseats a closed bench, and a second unseat is harmless', () => {
        const b = bench();
        b.unseat('heretic');
        b.unseat('heretic');
        expect(b.actor('heretic')).toBeNull();
        expect(b.actors()).toHaveLength(1);
    });
});

describe('the walk — current position, never destination (D4)', () => {
    it('walks at 4.2 % of the page width per second', () => {
        const b = bench();
        b.seat('mad-scientist', 'waiting');
        const start = x(b, 'mad-scientist');
        b.advance(0.5);
        expect(start - x(b, 'mad-scientist')).toBeCloseTo(W * WALK_FRACTION * 0.5, 6);
    });

    it('reports the CURRENT x while walking — the figure is not yet where it is going', () => {
        const b = bench();
        b.seat('mad-scientist', 'waiting');
        b.advance(0.2);
        const a = b.actor('mad-scientist');
        expect(a?.walking).toBe(true);
        expect(a?.x).not.toBe(a?.targetX);
        expect(a?.targetX).toBe(benchStationX(W, 'mad-scientist', 'waiting'));
    });

    it('faces the walk while walking, and turns back to the middle on arrival', () => {
        const b = bench();
        b.seat('mad-scientist', 'waiting');
        b.advance(0.2);
        expect(b.actor('mad-scientist')?.faceDir).toBe(-1);
        run(b, 10, () => b.actor('mad-scientist')?.walking === false);
        expect(x(b, 'mad-scientist')).toBe(benchStationX(W, 'mad-scientist', 'waiting'));
        expect(b.actor('mad-scientist')?.faceDir).toBe(1);
    });

    it('holds a walk exactly where it stands while nothing advances it (a paused page)', () => {
        const b = bench();
        b.seat('heretic', 'reading');
        b.advance(0.4);
        const held = x(b, 'heretic');
        b.land();
        expect(x(b, 'heretic')).toBe(held);
        b.advance(0.1);
        expect(x(b, 'heretic')).toBeGreaterThan(held);
    });

    it('keeps every place on the bench when the width re-cuts', () => {
        const b = bench();
        b.seat('mad-scientist', 'waiting');
        b.advance(0.3);
        const fraction = x(b, 'mad-scientist') / W;
        b.resize(1080, true);
        expect(b.geometry.w).toBe(1080);
        expect(b.geometry.compact).toBe(true);
        expect(x(b, 'mad-scientist') / 1080).toBeCloseTo(fraction, 9);
    });
});

describe('both waiting for ten seconds turns them toward each other (§5.4)', () => {
    it('drifts both to the inner edge of their third', () => {
        const b = bench();
        b.seat('mad-scientist', 'waiting');
        b.seat('heretic', 'waiting');
        run(b, DOUBLE_WAIT_S - 1);
        expect(b.actor('mad-scientist')?.targetX).toBe(benchStationX(W, 'mad-scientist', 'waiting'));
        run(b, 16);
        expect(x(b, 'mad-scientist')).toBe(b.geometry.innerEdge['mad-scientist']);
        expect(x(b, 'heretic')).toBe(b.geometry.innerEdge.heretic);
        expect(b.actor('mad-scientist')?.faceDir).toBe(1);
        expect(b.actor('heretic')?.faceDir).toBe(-1);
    });

    it('never counts the wait with one colleague missing', () => {
        const b = bench();
        b.unseat('heretic');
        b.seat('mad-scientist', 'waiting');
        run(b, DOUBLE_WAIT_S + 4);
        expect(b.actor('mad-scientist')?.targetX).toBe(benchStationX(W, 'mad-scientist', 'waiting'));
    });
});

describe('the crossing (★ signature, §5.4)', () => {
    it('flies, fetches, reads, and returns — about seven seconds, inside six to eight', () => {
        const b = bench();
        const home = x(b, 'heretic');
        expect(b.deliver('heretic')).toBe('started');
        expect(b.phase).toBe('flight');
        expect(b.receiver).toBe('heretic');
        run(b, FLIGHT_S + FRAME);
        expect(b.phase).toBe('fetch');
        expect(b.actor('heretic')?.activity).toBe('idle');
        const fetchT = run(b, 10, () => b.phase === 'read');
        expect(x(b, 'heretic')).toBe(b.geometry.atBell.heretic);
        expect(b.actor('heretic')?.holding).toBe(true);
        expect(b.actor('heretic')?.activity).toBe('reading');
        run(b, READ_S + FRAME);
        expect(b.phase).toBe('return');
        const backT = run(b, 10, () => b.phase === 'none');
        expect(x(b, 'heretic')).toBe(home);
        expect(b.actor('heretic')?.holding).toBe(false);
        expect(b.actor('heretic')?.activity).toBe('thinking');
        expect(b.receiver).toBeNull();
        const total = FLIGHT_S + fetchT + READ_S + backT;
        expect(total).toBeGreaterThan(6);
        expect(total).toBeLessThan(8);
    });

    it('never moves the sender, and no hand posts the letter (trip-wire 1)', () => {
        const b = bench();
        const senderAt = x(b, 'mad-scientist');
        b.deliver('heretic');
        for (let i = 0; i < 60 * 9; i++) {
            b.advance(FRAME);
            expect(x(b, 'mad-scientist')).toBe(senderAt);
            expect(b.actor('mad-scientist')?.holding).toBe(false);
        }
    });

    it('travels from the sender’s bell to the receiver’s, riding above the pipe', () => {
        const b = bench();
        const arch = archPath(b.geometry);
        b.deliver('heretic');
        b.advance(0.01);
        const early = b.capsule();
        b.advance(0.3);
        const late = b.capsule();
        expect(early && late).toBeTruthy();
        expect(early?.x).toBeGreaterThan(arch.p0[0] - 10);
        expect(late?.x).toBeGreaterThan(early?.x ?? Infinity);
        const onSpine = quadAt(arch.p0, arch.c, arch.p1, flightEase(0.31 / FLIGHT_S));
        expect(late?.y).toBeLessThan(onSpine[1]);
    });

    it('flies the other way for a letter to the Mad Scientist, still above the pipe', () => {
        const b = bench();
        const arch = archPath(b.geometry);
        b.deliver('mad-scientist');
        b.advance(0.01);
        const early = b.capsule();
        b.advance(0.3);
        const late = b.capsule();
        expect(early?.x).toBeLessThan(arch.p1[0] + 10);
        expect(late?.x).toBeLessThan(early?.x ?? -Infinity);
        const onSpine = quadAt(arch.p1, arch.c, arch.p0, flightEase(0.31 / FLIGHT_S));
        expect(late?.y).toBeLessThan(onSpine[1]);
        run(b, 10, () => b.phase === 'read');
        expect(x(b, 'mad-scientist')).toBe(b.geometry.atBell['mad-scientist']);
        expect(x(b, 'heretic')).toBe(benchStationX(W, 'heretic', 'thinking'));
    });

    it('rests the capsule in the receiver’s bell mouth during the fetch, and in their hand after', () => {
        const b = bench();
        b.deliver('heretic');
        run(b, FLIGHT_S + FRAME);
        expect(b.capsule()?.x).toBe(b.geometry.bell.heretic);
        run(b, 10, () => b.phase === 'read');
        const held = b.capsule();
        expect(held?.x).toBeLessThan(x(b, 'heretic'));
        run(b, READ_S + FRAME);
        expect(b.phase).toBe('return');
        expect(b.capsule()).not.toBeNull();
        run(b, 10, () => b.phase === 'none');
        expect(b.capsule()).toBeNull();
    });

    it('drops a rise for a colleague who is not on the bench', () => {
        const b = bench();
        b.unseat('heretic');
        expect(b.deliver('heretic')).toBe('dropped');
        expect(b.phase).toBe('none');
    });
});

describe('guard (e): never restarted, at most one pending', () => {
    it('queues one rise behind the crossing in progress and drops the rest', () => {
        const b = bench();
        b.deliver('heretic');
        b.advance(0.2);
        const inFlight = b.capsule();
        expect(b.deliver('heretic')).toBe('queued');
        expect(b.deliver('mad-scientist')).toBe('dropped');
        expect(b.deliver('heretic')).toBe('dropped');
        expect(b.phase).toBe('flight');
        expect(b.capsule()).toStrictEqual(inFlight);
        expect(b.pending).toBe('heretic');
    });

    it('plays the pending crossing once the first one is home, and only once', () => {
        const b = bench();
        b.deliver('heretic');
        b.advance(0.1);
        b.deliver('mad-scientist');
        run(b, 12, () => b.receiver === 'mad-scientist');
        expect(b.phase).toBe('flight');
        expect(b.pending).toBeNull();
        run(b, 12, () => b.phase === 'none');
        expect(b.phase).toBe('none');
        run(b, 2);
        expect(b.phase).toBe('none');
    });

    it('forgets the pending crossing if its bench closes', () => {
        const b = bench();
        b.deliver('heretic');
        b.deliver('mad-scientist');
        b.unseat('mad-scientist');
        expect(b.pending).toBeNull();
    });

    it('ends the crossing when the receiver’s bench closes mid-walk, and starts the pending one', () => {
        const b = bench();
        b.deliver('heretic');
        b.deliver('mad-scientist');
        run(b, FLIGHT_S + 0.5);
        b.unseat('heretic');
        expect(b.receiver).toBe('mad-scientist');
        expect(b.phase).toBe('flight');
    });
});

describe('nothing frozen in transit — the clamp and the page return are one rule (§2.7, §5.5)', () => {
    it('lands a capsule that is in the pipe: the receiver already at the bell, holding it', () => {
        const b = bench();
        b.deliver('heretic');
        b.advance(0.2);
        b.land();
        expect(b.phase).toBe('read');
        expect(x(b, 'heretic')).toBe(b.geometry.atBell.heretic);
        expect(b.actor('heretic')?.walking).toBe(false);
        expect(b.actor('heretic')?.holding).toBe(true);
        expect(b.actor('heretic')?.faceDir).toBe(-1);
    });

    it('holds a receiver mid-crossing where they stand — no reset, no replay', () => {
        const b = bench();
        b.deliver('heretic');
        run(b, FLIGHT_S + 0.6);
        expect(b.phase).toBe('fetch');
        const mid = x(b, 'heretic');
        b.land();
        expect(b.phase).toBe('fetch');
        expect(x(b, 'heretic')).toBe(mid);
    });

    it('lands an instant delivery without the flight or the walk', () => {
        const b = bench();
        expect(b.deliver('heretic', true)).toBe('started');
        expect(b.phase).toBe('read');
        expect(b.capsule()?.x).toBeLessThan(x(b, 'heretic'));
    });

    it('under reduced motion lands every delivery — and lands one already in flight', () => {
        const b = bench();
        b.deliver('mad-scientist');
        b.advance(0.1);
        b.setReducedMotion(true);
        expect(b.phase).toBe('read');
        expect(x(b, 'mad-scientist')).toBe(b.geometry.atBell['mad-scientist']);
        run(b, 12, () => b.phase === 'none');
        expect(b.deliver('heretic')).toBe('started');
        expect(b.phase).toBe('read');
    });

    it('still WALKS home under reduced motion — where a figure stands is the state', () => {
        const b = bench();
        b.setReducedMotion(true);
        b.deliver('heretic');
        run(b, READ_S + FRAME);
        expect(b.phase).toBe('return');
        b.advance(0.2);
        expect(b.actor('heretic')?.walking).toBe(true);
    });

    it('does nothing when asked to land with no capsule in the pipe', () => {
        const b = bench();
        b.land();
        expect(b.phase).toBe('none');
        b.setReducedMotion(false);
        expect(b.phase).toBe('none');
    });

    it('starts a queued crossing already landed while the clamp is on', () => {
        const b = bench();
        b.deliver('heretic');
        b.deliver('mad-scientist');
        b.setReducedMotion(true);
        run(b, 12, () => b.receiver === 'mad-scientist');
        expect(b.phase).toBe('read');
    });
});

describe('the pneumatic easing — fast out, a hard stop, never a bounce (§10)', () => {
    it('is monotone, starts at 0 and stops dead at 1 with no overshoot', () => {
        let last = -1;
        for (let i = 0; i <= 100; i++) {
            const v = flightEase(i / 100);
            expect(v).toBeGreaterThanOrEqual(last);
            expect(v).toBeLessThanOrEqual(1);
            last = v;
        }
        expect(flightEase(0)).toBe(0);
        expect(flightEase(1)).toBe(1);
        expect(flightEase(2)).toBe(1);
        expect(flightEase(-1)).toBe(0);
        // fast out: more than half the arch in the first fifth of the time
        expect(flightEase(0.2)).toBeGreaterThan(0.5);
    });

    it('settles in the bell mouth once, small, and is still by SETTLE_S', () => {
        let peak = 0;
        for (let t = 0; t < SETTLE_S; t += 0.01) peak = Math.max(peak, Math.abs(settleOffset(t)));
        expect(peak).toBeGreaterThan(0.5);
        expect(peak).toBeLessThan(2.5);
        expect(settleOffset(SETTLE_S)).toBe(0);
        expect(settleOffset(-1)).toBe(0);
    });
});
