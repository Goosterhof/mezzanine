// The Specimens in ink (#00067 AC-3).
//
// jsdom has no Canvas 2D, so the figure draws into a recording context that
// TRACKS THE TRANSFORM: every path point is stored where it lands on the
// page. A post pose's height is then read off the drawing itself (the bbox of
// its recorded ink), never off a hand-copied constant — the same reason the
// prototype measured with a raster. Paths carry no stroke width, so they read
// a hair under the raster's 45.4-51.4 px; the cap is 52.

import {describe, expect, it} from 'vitest';

import {POST_POSE_MAX_PX} from '../../src/observer/errands';
import {SketchPen} from '../../src/observer/pen';
import {FIGURE_SCALE} from '../../src/observer/projection';
import {drawSpecimen, EYE_STAGE, roleOf, type SpecimenDraw} from '../../src/observer/specimen';
import {specimenFit} from '../../src/observer/specimenFit';

type M = [number, number, number, number, number, number];

interface Recording {
    ctx: CanvasRenderingContext2D;
    ops: string[];
    points: [number, number][];
}

const apply = (m: M, x: number, y: number): [number, number] => [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
];
const mul = (a: M, b: M): M => [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
];

function recordingContext(): Recording {
    const ops: string[] = [];
    const points: [number, number][] = [];
    let m: M = [1, 0, 0, 1, 0, 0];
    const stack: M[] = [];
    const at = (x: number, y: number): void => {
        points.push(apply(m, x, y));
    };
    const state: Record<string, unknown> = {globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1};
    const methods: Record<string, (...a: number[]) => void> = {
        save: () => stack.push(m),
        restore: () => {
            m = stack.pop() ?? [1, 0, 0, 1, 0, 0];
        },
        translate: (x, y) => {
            m = mul(m, [1, 0, 0, 1, x, y]);
        },
        scale: (x, y) => {
            m = mul(m, [x, 0, 0, y, 0, 0]);
        },
        rotate: (a) => {
            m = mul(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
        },
        moveTo: (x, y) => at(x, y),
        lineTo: (x, y) => at(x, y),
        fillRect: (x, y, w, h) => {
            at(x, y);
            at(x + w, y + h);
        },
    };
    const ctx = new Proxy(state, {
        get: (target, key: string) => {
            if (key in methods) {
                return (...a: number[]) => {
                    ops.push(`${key}(${a.map((v) => v.toFixed(3)).join(',')})`);
                    methods[key]?.(...a);
                };
            }
            if (key in target) return target[key];
            return (...a: unknown[]) => ops.push(`${key}(${a.length})`);
        },
        set: (target, key: string, value: unknown) => {
            target[key] = value;
            ops.push(`${key}=${String(value)}`);
            return true;
        },
    });
    return {ctx: ctx as unknown as CanvasRenderingContext2D, ops, points};
}

const TYPES: [string, 'lab' | 'hired'][] = [
    ['surgeon', 'lab'],
    ['librarian', 'lab'],
    ['scribe', 'lab'],
    ['synchronizer', 'lab'],
    ['general-purpose', 'hired'],
    ['Explore', 'hired'],
    ['Plan', 'hired'],
];
/** The casting row's moments (prototype casting.ts:19), mapped as its `closeup` maps them for Lot 8. */
const MOMENTS: Record<string, Partial<SpecimenDraw>> = {
    standing: {legs: 'stand', arms: 'idle'},
    idle: {legs: 'kneel', arms: 'idle'},
    thinking: {legs: 'kneel', arms: 'thinking'},
    reading: {legs: 'kneel', arms: 'reading'},
    writing: {legs: 'kneel', arms: 'writing'},
    running: {legs: 'kneel', arms: 'running', walking: true},
    waiting: {legs: 'kneel', arms: 'waiting', mechT: 3.1},
    born: {legs: 'stand', arms: 'running', birth: 0.42},
    hop: {legs: 'stand', arms: 'running', walking: true, airborne: true},
    grip: {legs: 'hang', arms: 'grip', gripY: -70},
    sill: {legs: 'hang', arms: 'point', mechT: 3.1},
    lamp: {legs: 'kneel', arms: 'idle', lamp: true, state: 'idle'},
    slip: {legs: 'stand', arms: 'post'},
    flask: {legs: 'stand', arms: 'running', home: 0.55},
    static: {legs: 'kneel', arms: 'writing', still: true},
};
const POST_ARMS = ['idle', 'thinking', 'reading', 'writing', 'running', 'waiting'] as const;
/** The stage's one minion scale: a colleague's FIGURE_SCALE × 0.6875. */
const S = FIGURE_SCALE * 0.6875;

function draw(d: SpecimenDraw, seed = 0): Recording {
    const rec = recordingContext();
    const pen = new SketchPen(rec.ctx);
    pen.beginFrame(seed);
    rec.ctx.scale(S, S);
    drawSpecimen(pen, d);
    return rec;
}

/** The owl's eye height after one draw, stage units (the Kilroy readout). */
function owlEyeY(arms: SpecimenDraw['arms'], legs: SpecimenDraw['legs']): number {
    draw({...base('librarian', 'lab'), arms, legs});
    return EYE_STAGE.y;
}

const base = (type: string, cls: 'lab' | 'hired'): SpecimenDraw => ({
    type,
    cls,
    legs: 'stand',
    arms: 'idle',
    t: 2.35,
    mechT: 2.35,
    frame: 0,
    part: 'all',
    state: 'running',
});

describe('the Specimens in ink (AC-3)', () => {
    it.each(TYPES)('should draw %s in all 15 casting moments', (type, cls) => {
        const blank: string[] = [];
        for (const [moment, over] of Object.entries(MOMENTS)) {
            const rec = draw({...base(type, cls), ...over});
            const inked = rec.ops.some((op) => op.startsWith('stroke') || op.startsWith('fill'));
            if (!inked) blank.push(`${type} · ${moment}`);
        }
        expect(Object.keys(MOMENTS)).toHaveLength(15);
        expect(blank).toStrictEqual([]);
    });

    it('should draw identically twice at the same boil seed, and boil at another', () => {
        for (const [type, cls] of TYPES) {
            const d = {...base(type, cls), legs: 'kneel' as const, arms: 'writing' as const};
            expect(draw(d, 7).ops).toStrictEqual(draw(d, 7).ops);
            expect(draw(d, 8).ops).not.toStrictEqual(draw(d, 7).ops);
        }
    });

    it.each(TYPES)('should keep %s’s post pose at or under 52 px, read off its own ink', (type, cls) => {
        let top = 0;
        for (const arms of POST_ARMS) {
            for (const t of [0.3, 1.15, 2.7]) {
                const rec = draw({...base(type, cls), legs: 'kneel', arms, t, mechT: t * 1.7});
                for (const [, y] of rec.points) top = Math.min(top, y);
            }
        }
        const inkPx = -top;
        expect(inkPx).toBeLessThanOrEqual(POST_POSE_MAX_PX);
        // and it is the figure the prototype measured, not a shrunken one: within 4 px of its raster height
        expect(inkPx).toBeGreaterThan(specimenFit(type).postPx - 4);
    });

    it('should stand every type 70 px tall, the stature the fits were baked for (R2 §2.5)', () => {
        const stature: [string, number][] = [];
        for (const [type, cls] of TYPES) {
            let top = 0;
            for (const arms of ['idle', 'running', 'reading', 'waiting'] as const) {
                const rec = draw({...base(type, cls), arms});
                for (const [, y] of rec.points) top = Math.min(top, y);
            }
            stature.push([type, Math.round(-top)]);
        }
        // paths carry no stroke width: a hair under the raster's 70 ± 2
        expect(stature.filter(([, px]) => px < 65 || px > 71)).toStrictEqual([]);
    });

    it('should split a grip into a body pass and a hands pass, and keep the eye from the body pass', () => {
        const d = {...base('librarian', 'lab'), ...MOMENTS.grip};
        const body = draw({...d, part: 'body'});
        const eye = {...EYE_STAGE};
        const hands = draw({...d, part: 'hands'});
        expect(body.ops.length).toBeGreaterThan(hands.ops.length);
        expect(hands.ops.length).toBeGreaterThan(0);
        expect(EYE_STAGE).toStrictEqual(eye);
        expect(Number.isFinite(eye.y)).toBe(true);
    });

    it('D2: should lift the owl’s dome and eyes 3 units in the sill arms, and nowhere else', () => {
        const k = 1.3 * specimenFit('librarian').fit;
        expect(owlEyeY('point', 'hang') - owlEyeY('idle', 'hang')).toBeCloseTo(-3 * k, 5);
        expect(owlEyeY('waiting', 'kneel')).toBeCloseTo(owlEyeY('idle', 'kneel'), 5);
    });

    it('should draw a lab type with no species yet as a sealed goldfish, and Hired help without the seal', () => {
        expect(roleOf('archivist', 'lab')).toBe('lab');
        const sealed = draw(base('archivist', 'lab')).ops.filter((op) => op === 'strokeStyle=#1fa97a');
        const hired = draw(base('Explore', 'hired')).ops.filter((op) => op === 'strokeStyle=#1fa97a');
        expect(sealed.length).toBeGreaterThan(0);
        expect(hired).toHaveLength(0);
    });

    it('should turn the Synchronizer’s hourglass over before she goes home', () => {
        const d = {...base('synchronizer', 'lab'), arms: 'post' as const};
        expect(draw({...d, flip: Math.PI}).points).not.toStrictEqual(draw(d).points);
    });

    it('should hold no raw hex in the errand floor’s modules — colour truth lives in pen.ts (§3 #6)', () => {
        // P2 adds sill.ts, monkey.ts and sillPainter.ts to this sweep.
        const sources = import.meta.glob<string>(
            '../../src/observer/{specimen,specimenFit,errands,errandFurniture}.ts',
            {query: '?raw', import: 'default', eager: true},
        );
        expect(Object.keys(sources)).toHaveLength(4);
        const hexes = Object.entries(sources).flatMap(([file, src]) =>
            (src.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((hex) => `${file}: ${hex}`),
        );
        expect(hexes).toStrictEqual([]);
    });
});
