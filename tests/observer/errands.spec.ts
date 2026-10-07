// The errand floor's state machine (#00067 AC-1, AC-2), replayed board by
// board through the FROZEN R2 casting scenario the investor ruled on
// (Pattern 041: the prototype's own fixture, copied, never re-authored).
//
// The receipt clock is the board's own second here (`at − t0`), so a step
// reads like the scenario's timeline; AC-2 then proves the floor never reads
// a board stamp as time. The log numbers boards from 1: its "board 8" is
// `boards[7]`.

import {describe, expect, it} from 'vitest';

import type {ScientistErrands, SemaphoreBoard, SemaphoreMinion} from '../../src/observer/types';

import {
    classOf,
    createErrandFloor,
    FILE_AFTER_S,
    POST_OFFSETS,
    sentenceCase,
    voiceName,
    type ErrandEvent,
    type ErrandFloor,
} from '../../src/observer/errands';
import {benchGeometry} from '../../src/observer/projection';
import scenario from './fixtures/scenario-casting-r2.json';

const BOARDS = scenario.boards as unknown as SemaphoreBoard[];
const T0 = scenario.t0Ms;
const W = 1440;
const GEO = benchGeometry(W, false);

const sec = (b: SemaphoreBoard): number => (b.at - T0) / 1000;
const errandsOf = (b: SemaphoreBoard): ScientistErrands => ({minions: b.minions, departed: b.departed, at: b.at});
/** The log's 1-based board number. */
const board = (n: number): SemaphoreBoard => {
    const b = BOARDS[n - 1];
    if (!b) throw new Error(`no board ${n}`);
    return b;
};
const idOf = (type: string): string => {
    for (const b of BOARDS) for (const m of b.minions) if (m.type === type) return m.id;
    throw new Error(`no ${type} in the scenario`);
};

/** Replay boards 1..n in order; returns the floor and every event it spoke. */
function replay(n: number, floor: ErrandFloor = createErrandFloor()): {floor: ErrandFloor; events: ErrandEvent[]} {
    const events: ErrandEvent[] = [];
    for (let i = 1; i <= n; i++) {
        const b = board(i);
        events.push(...floor.advance(sec(b)), ...floor.ingest(errandsOf(b), b.scientist.state, sec(b)));
    }
    return {floor, events};
}

function minion(id: string, over: Partial<SemaphoreMinion> = {}): SemaphoreMinion {
    return {
        id,
        type: 'surgeon',
        task: `task ${id}`,
        background: false,
        spawnedAt: 0,
        state: 'thinking',
        detail: 'Reading a.ts',
        since: 0,
        ...over,
    };
}
const live = (minions: SemaphoreMinion[], departed: ScientistErrands['departed'] = []): ScientistErrands => ({
    minions,
    departed,
    at: 0,
});

/** A floor already past its cold start, with nothing out. */
function warm(now = 0): ErrandFloor {
    const floor = createErrandFloor();
    floor.ingest(live([]), 'running', now);
    return floor;
}

describe('who is who (§7.2 names in the voice)', () => {
    it('should class the monkey bespoke, the lab its own, and everyone else Hired', () => {
        expect(classOf('chaos-monkey')).toBe('bespoke');
        expect(classOf('surgeon')).toBe('lab');
        expect(classOf('archivist')).toBe('lab');
        expect(classOf('Explore')).toBe('hired');
        expect(classOf('some-plugin:agent')).toBe('hired');
    });

    it('should name them in the voice, and sentence-case a line start', () => {
        expect(voiceName('chaos-monkey')).toBe('the Chaos Monkey');
        expect(voiceName('drill-sergeant')).toBe('the Drill Sergeant');
        expect(voiceName('Explore')).toBe('an Explore errand');
        expect(voiceName('general-purpose')).toBe('a general-purpose errand');
        expect(voiceName('Plan')).toBe('a Plan errand');
        expect(sentenceCase(voiceName('Explore'))).toBe('An Explore errand');
        expect(sentenceCase(voiceName('chaos-monkey'))).toBe('The Chaos Monkey');
    });
});

describe('the errand floor, replayed through the R2 scenario (AC-1)', () => {
    it('(a) should stand one Surgeon alone dead centre under the apex', () => {
        const {floor} = replay(2);
        expect(floor.posts(W)).toStrictEqual([{id: idOf('surgeon'), x: W / 2}]);
    });

    it('(b) should stand two at the D1 offsets, ±22', () => {
        const {floor} = replay(5);
        floor.advance(sec(board(5)) + 1);
        expect(floor.posts(W).map((p) => p.x - W / 2)).toStrictEqual([...POST_OFFSETS[2]]);
    });

    it('(c) board 8: three posts, nothing over, and the monkey hanging — never a post', () => {
        const {floor} = replay(8);
        expect(floor.posts(W).map((p) => p.x - W / 2)).toStrictEqual([...POST_OFFSETS[3]]);
        expect(floor.overflow()).toBe(0);
        expect(floor.phaseOf(idOf('chaos-monkey'))).toBe('hanging');
        expect(floor.posts(W).map((p) => p.id)).not.toContain(idOf('chaos-monkey'));
    });

    it('(c) board 9: three posts, "+1", and the monkey still hanging', () => {
        const {floor} = replay(9);
        expect(floor.posts(W)).toHaveLength(3);
        expect(floor.overflow()).toBe(1);
        expect(floor.phaseOf(idOf('synchronizer'))).toBe('queued');
        expect(floor.phaseOf(idOf('chaos-monkey'))).toBe('hanging');
    });

    it('(d) should give spawns ≤ 400 ms apart one leader and one line, and a later spawn its own', () => {
        const floor = warm();
        const a = minion('a', {spawnedAt: 1000});
        const b = minion('b', {type: 'librarian', spawnedAt: 1300});
        expect(floor.ingest(live([a]), 'running', 10)).toStrictEqual([]);
        expect(floor.ingest(live([a, b]), 'running', 10.15)).toStrictEqual([]);
        const spoken = floor.advance(10.5);
        expect(spoken).toStrictEqual([{kind: 'volley', names: ['the Surgeon', 'the Librarian']}]);
        const c = minion('c', {type: 'Explore', spawnedAt: 1900});
        floor.ingest(live([a, b, c]), 'running', 11);
        expect(floor.advance(11.5)).toStrictEqual([{kind: 'volley', names: ['an Explore errand']}]);
    });

    it('(d) should speak the monkey as loose, once, folding a volley into its line', () => {
        // the monkey spawns 600 ms after the Librarian: alone, and spoken once its 400 ms hold ends
        const alone = replay(7).events.filter((e) => e.kind === 'loose');
        expect(alone).toStrictEqual([{kind: 'loose', others: 0}]);
        const floor = warm();
        floor.ingest(
            live([
                minion('m', {type: 'chaos-monkey', spawnedAt: 50}),
                minion('s', {spawnedAt: 0}),
                minion('o', {type: 'librarian', spawnedAt: 90}),
            ]),
            'running',
            1,
        );
        expect(floor.advance(2)).toStrictEqual([{kind: 'loose', others: 2}]);
    });

    it('(e) a departure lands one slip in the tray, carrying the task it was last seen on', () => {
        const {floor} = replay(14);
        expect(floor.tray()).toStrictEqual([]);
        floor.advance(sec(board(14)) + 0.8);
        const scribe = board(13).minions.find((m) => m.type === 'scribe');
        expect(floor.tray()).toStrictEqual([{at: sec(board(14)) + 0.8, task: scribe?.task, scorched: false}]);
    });

    it('(f) a flash errand — out and home between two boards — files a blank slip and draws nobody', () => {
        const floor = warm(1);
        floor.ingest(live([], [{id: 'flash', type: 'Explore', at: 5}]), 'running', 2);
        expect(floor.tray()).toStrictEqual([{at: 2, task: '', scorched: false}]);
        expect(floor.figures(GEO, 2)).toStrictEqual([]);
        floor.ingest(live([], [{id: 'flash', type: 'Explore', at: 5}]), 'running', 3);
        expect(floor.tray()).toHaveLength(1);
    });

    it('(g) should keep three sheets in the tray, and file every sheet ten minutes on', () => {
        const {floor} = replay(BOARDS.length);
        floor.advance(sec(board(BOARDS.length)) + 2);
        expect(floor.tray()).toHaveLength(3);
        floor.advance(sec(board(BOARDS.length)) + FILE_AFTER_S + 2);
        expect(floor.tray()).toStrictEqual([]);
    });

    it('(h) the cork is out while anyone is out — the monkey too — and the ledger names the monkey', () => {
        const floor = warm();
        expect(floor.corkOut()).toBe(false);
        floor.ingest(live([minion('m', {type: 'chaos-monkey', detail: 'Writing chaos.md', since: 5})]), 'running', 1);
        expect(floor.corkOut()).toBe(true);
        expect(floor.ledgerLine()).toBe('the Chaos Monkey · Writing chaos.md');
        const {floor: after} = replay(BOARDS.length);
        after.advance(sec(board(BOARDS.length)) + 2);
        expect(after.corkOut()).toBe(false);
        expect(after.ledgerLine()).toBeNull();
    });

    it('(h) the ledger leads with the most recent change and counts the rest', () => {
        // board 11: the Surgeon stops to ask, the newest change on the board
        const {floor} = replay(11);
        expect(floor.ledgerLine()).toBe(`the Surgeon · ${board(11).minions[0]?.detail} · 4 more out`);
    });

    it('(i) a null board sweeps everything, without a word', () => {
        const {floor} = replay(9);
        expect(floor.ingest(null, 'idle', 30)).toStrictEqual([]);
        expect(floor.posts(W)).toStrictEqual([]);
        expect(floor.corkOut()).toBe(false);
        expect(floor.ledgerLine()).toBeNull();
        // the next board is a cold start: it lands, silently
        expect(floor.ingest(errandsOf(board(9)), 'running', 31)).toStrictEqual([]);
        expect(floor.phaseOf(idOf('surgeon'))).toBe('post');
    });

    it('(j) land() leaves nobody born, hopping or on the way home', () => {
        const floor = warm();
        floor.ingest(live([minion('a')]), 'running', 1);
        floor.advance(1.1);
        expect(floor.phaseOf('a')).toBe('born');
        floor.advance(1.45);
        expect(floor.phaseOf('a')).toBe('hop');
        floor.land();
        expect(floor.phaseOf('a')).toBe('post');
        floor.ingest(live([], [{id: 'a', type: 'surgeon', at: 9}]), 'running', 5);
        expect(floor.phaseOf('a')).toBe('home');
        floor.land();
        expect(floor.phaseOf('a')).toBe('gone');
        expect(floor.figures(GEO, 5)).toStrictEqual([]);
    });

    it('(k) lights a pool only while he idles and a background errand is out', () => {
        const busy = replay(9).floor;
        expect(busy.lit()).toStrictEqual([]);
        const idle = replay(15).floor;
        idle.advance(sec(board(15)) + 1);
        expect(idle.lit()).toStrictEqual([idOf('synchronizer')]);
        expect(idle.furniture(GEO).pools).toHaveLength(1);
        expect(idle.figures(GEO, 0).find((f) => f.id === idOf('synchronizer'))?.lamp).toBe(true);
    });

    it('(l) a departure is silent', () => {
        const {events} = replay(18);
        const before = replay(12).events.length;
        // boards 13-18 only send errands home: not one new line
        expect(events).toHaveLength(before);
    });

    it('(m) a cold start onto board 9 is already landed, and says nothing', () => {
        const floor = createErrandFloor();
        expect(floor.ingest(errandsOf(board(9)), 'running', 100)).toStrictEqual([]);
        expect(floor.advance(101)).toStrictEqual([]);
        expect(floor.posts(W)).toHaveLength(3);
        expect(floor.phaseOf(idOf('chaos-monkey'))).toBe('hanging');
        for (const id of ['surgeon', 'librarian', 'scribe'].map(idOf)) expect(floor.phaseOf(id)).toBe('post');
    });

    it('(m) a cold start files nothing for errands that came home before it was watching', () => {
        const floor = createErrandFloor();
        floor.ingest(errandsOf(board(19)), 'idle', 100);
        floor.advance(110);
        expect(floor.tray()).toStrictEqual([]);
    });
});

describe('the receipt clock (AC-2)', () => {
    it('should give a board stamped ten minutes off a normal arrival — animation never reads board time', () => {
        for (const skew of [-600_000, 600_000]) {
            const floor = warm(50);
            floor.ingest(live([minion('a', {spawnedAt: Date.now() + skew, since: Date.now() + skew})]), 'running', 100);
            expect(floor.phaseOf('a')).toBe('born');
            floor.advance(100.4);
            expect(floor.phaseOf('a')).toBe('hop');
            floor.advance(100.7);
            expect(floor.phaseOf('a')).toBe('post');
        }
    });
});

describe('the permission wait (#00042 §7.4)', () => {
    it('should seat the earliest wait held 1.5 s in the sill and speak it once', () => {
        const {floor} = replay(11);
        expect(floor.sillOccupant()).toBeNull();
        const spoken = floor.advance(sec(board(11)) + 1.6);
        expect(spoken).toStrictEqual([{kind: 'permission', name: 'the Surgeon', detail: board(11).minions[0]?.detail}]);
        expect(floor.sillOccupant()).toStrictEqual({id: idOf('surgeon'), reason: 'permission'});
        expect(floor.advance(sec(board(11)) + 3)).toStrictEqual([]);
    });

    it('should never seat a wait shorter than 1.5 s, nor the monkey', () => {
        const floor = warm();
        floor.ingest(
            live([minion('a', {state: 'waiting'}), minion('m', {type: 'chaos-monkey', state: 'waiting'})]),
            'running',
            1,
        );
        floor.ingest(
            live([minion('a', {state: 'running'}), minion('m', {type: 'chaos-monkey', state: 'waiting'})]),
            'running',
            2,
        );
        floor.advance(9);
        expect(floor.sillOccupant()).toBeNull();
    });

    it('should hold the mechanism clock still while it waits (the Stopped Mechanism Rule)', () => {
        const {floor} = replay(11);
        floor.advance(sec(board(11)) + 1);
        const held = (act: number): number | undefined =>
            floor.figures(GEO, act).find((f) => f.id === idOf('surgeon'))?.mechT;
        expect(held(40)).toBe(40);
        expect(held(47)).toBe(40);
        floor.ingest(errandsOf(board(12)), 'thinking', sec(board(12)));
        expect(held(52)).toBe(52);
    });
});

describe('the figures and the furniture', () => {
    it('should stand a posted minion on the benchtop in its seated post pose', () => {
        const {floor} = replay(3);
        const [fig] = floor.figures(GEO, 3);
        expect(fig).toMatchObject({x: W / 2, y: GEO.benchTopY, legs: 'kneel', arms: 'reading', cls: 'lab'});
    });

    it('should glide a post when the layout changes, and land the glide', () => {
        const {floor} = replay(4);
        floor.advance(sec(board(4)) + 1);
        floor.ingest(errandsOf(board(5)), 'running', sec(board(5)));
        floor.advance(sec(board(5)) + 0.2);
        const x = floor.figures(GEO, 0).find((f) => f.id === idOf('surgeon'))?.x ?? 0;
        expect(x).toBeLessThan(W / 2);
        expect(x).toBeGreaterThan(W / 2 - 22);
        floor.land();
        expect(floor.figures(GEO, 0).find((f) => f.id === idOf('surgeon'))?.x).toBe(W / 2 - 22);
    });

    it('should hop a newborn out of the flask mouth, small, then full size at its post', () => {
        const floor = warm();
        floor.ingest(live([minion('a')]), 'running', 1);
        floor.advance(1.05);
        const [born] = floor.figures(GEO, 1);
        expect(born?.birth).toBeLessThan(1);
        expect(born?.s).toBeLessThan(GEO.s * 0.6875);
        expect(born?.walking).toBe(true);
        floor.advance(2);
        expect(floor.figures(GEO, 2)[0]?.birth).toBeUndefined();
    });

    it('should send a departure to the tray, hand in the slip, and shrink it home into the flask', () => {
        const floor = warm();
        floor.ingest(live([minion('s', {type: 'synchronizer'})]), 'running', 1);
        floor.land();
        floor.ingest(live([], [{id: 's', type: 'synchronizer', at: 0}]), 'running', 10);
        floor.advance(10.25);
        expect(floor.figures(GEO, 0)[0]).toMatchObject({arms: 'running', walking: true});
        floor.advance(10.65);
        expect(floor.figures(GEO, 0)[0]?.arms).toBe('post');
        floor.advance(11.1);
        const home = floor.figures(GEO, 0)[0];
        expect(home?.home).toBeGreaterThan(0);
        expect(home?.flip).toBe(Math.PI);
        expect(home?.s).toBeLessThan(GEO.s * 0.6875);
        floor.advance(11.4);
        expect(floor.figures(GEO, 0)).toStrictEqual([]);
    });

    it('should foam a birth and burp a homecoming, and play neither once landed or under the clamp', () => {
        const floor = warm();
        floor.ingest(live([minion('a')]), 'running', 1);
        floor.advance(1.2);
        expect(floor.furniture(GEO).foam).toStrictEqual([1]);
        floor.ingest(live([], [{id: 'a', type: 'surgeon', at: 0}]), 'running', 5);
        floor.advance(6.4);
        expect(floor.furniture(GEO).burps).toStrictEqual([6.3]);
        floor.land();
        expect(floor.furniture(GEO).burps).toStrictEqual([]);
        const clamped = createErrandFloor(true);
        clamped.ingest(live([]), 'running', 0);
        clamped.ingest(live([minion('b')]), 'running', 1);
        clamped.advance(1.1);
        expect(clamped.furniture(GEO).foam).toStrictEqual([]);
        expect(clamped.phaseOf('b')).toBe('post');
    });

    it('should land every transit when the clamp turns on mid-arc', () => {
        const floor = warm();
        floor.ingest(live([minion('a')]), 'running', 1);
        floor.advance(1.45);
        expect(floor.phaseOf('a')).toBe('hop');
        floor.setReducedMotion(true);
        expect(floor.phaseOf('a')).toBe('post');
        floor.setReducedMotion(false);
        floor.ingest(live([minion('a'), minion('b', {spawnedAt: 5000})]), 'running', 4);
        expect(floor.phaseOf('b')).toBe('born');
    });

    it('should count the cork out until the last errand is home, and roll its pop time', () => {
        const floor = warm();
        floor.ingest(live([minion('a')]), 'running', 3);
        expect(floor.furniture(GEO)).toMatchObject({corkOut: true, corkAt: 3, overflow: 0});
        floor.ingest(live([], [{id: 'a', type: 'surgeon', at: 0}]), 'running', 8);
        floor.advance(8.5);
        expect(floor.corkOut()).toBe(true);
        floor.advance(9.4);
        expect(floor.corkOut()).toBe(false);
    });

    it('should treat a minion gone from the board without a departure row as gone home', () => {
        const floor = warm();
        floor.ingest(live([minion('a')]), 'running', 1);
        floor.ingest(live([]), 'running', 4);
        floor.advance(4.9);
        expect(floor.tray()).toHaveLength(1);
    });
});

// The Heretic's review of PR #176 at 0582cb4, each counterexample kept as a regression.
describe('the review round (PR #176)', () => {
    it('should settle a landed homecoming’s furniture too: the slip is in the tray now, and no burp replays', () => {
        const floor = warm();
        floor.ingest(live([minion('a')]), 'running', 0.5);
        floor.land();
        floor.ingest(live([], [{id: 'a', type: 'surgeon', at: 0}]), 'running', 5);
        floor.advance(5.1);
        floor.land();
        expect(floor.phaseOf('a')).toBe('gone');
        expect(floor.corkOut()).toBe(false);
        expect(floor.tray()).toHaveLength(1);
        floor.advance(6.4);
        expect(floor.furniture(GEO).burps).toStrictEqual([]);
    });

    it('should continue an interrupted glide from where the post is drawn, never from its old target', () => {
        const floor = warm();
        floor.ingest(live([minion('a', {spawnedAt: 0})]), 'running', 1);
        floor.land();
        floor.ingest(
            live([minion('a', {spawnedAt: 0}), minion('b', {type: 'librarian', spawnedAt: 9000})]),
            'running',
            10,
        );
        floor.advance(10.2);
        const drawn = (): number => floor.figures(GEO, 0).find((f) => f.id === 'a')?.x ?? Number.NaN;
        const mid = drawn();
        expect(mid).toBeLessThan(W / 2);
        expect(mid).toBeGreaterThan(W / 2 - 22);
        floor.ingest(
            live([
                minion('a', {spawnedAt: 0}),
                minion('b', {type: 'librarian', spawnedAt: 9000}),
                minion('c', {type: 'scribe', spawnedAt: 9500}),
            ]),
            'running',
            10.2,
        );
        expect(drawn()).toBeCloseTo(mid, 3);
        floor.advance(10.4);
        expect(drawn()).toBeGreaterThan(mid);
        floor.advance(11);
        expect(drawn()).toBe(W / 2);
    });

    it('should not restart a glide for a change that does not move this post (one more into "+N")', () => {
        const floor = warm();
        const three = [
            minion('a', {spawnedAt: 0}),
            minion('b', {type: 'librarian', spawnedAt: 1}),
            minion('c', {type: 'scribe', spawnedAt: 2}),
        ];
        floor.ingest(live(three.slice(0, 2)), 'running', 1);
        floor.land();
        floor.ingest(live(three), 'running', 10);
        floor.advance(10.2);
        const drawn = (): number => floor.figures(GEO, 0).find((f) => f.id === 'b')?.x ?? Number.NaN;
        const before = drawn();
        floor.ingest(live([...three, minion('d', {type: 'synchronizer', spawnedAt: 3})]), 'running', 10.2);
        expect(drawn()).toBeCloseTo(before, 3);
        floor.advance(10.5);
        expect(drawn()).toBe(W / 2 - 46);
    });

    it('should keep its history bounded: long-gone errands retire, and a thousand homecomings cost nothing per frame', () => {
        const floor = warm();
        let t = 1;
        for (let i = 0; i < 1000; i++) {
            floor.ingest(live([minion(`m${i}`, {spawnedAt: i})]), 'running', t);
            floor.ingest(live([], [{id: `m${i}`, type: 'surgeon', at: i}]), 'running', t + 0.1);
            t += 0.2;
        }
        floor.advance(t + 10);
        expect(floor.retained()).toBe(0);
        expect(floor.phaseOf('m0')).toBe('gone');
        floor.ingest(live([minion('now', {spawnedAt: 5000})]), 'running', t + 11);
        floor.land();
        expect(floor.retained()).toBe(1);
        expect(floor.figures(GEO, 0)).toHaveLength(1);
        expect(floor.tray()).toHaveLength(3);
    });
});
