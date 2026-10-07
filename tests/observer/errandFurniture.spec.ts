// The errand floor's receiving surfaces (#00067 §2): cork, foam, in-tray,
// slip, light pool, "+N" and the ledger — each drawn through a recording
// context that keeps every op with the ink it was drawn in.

import {describe, expect, it} from 'vitest';

import {
    corkRoll,
    drawCork,
    drawLedger,
    drawSlip,
    flaskFoam,
    inTray,
    lightPool,
    overflowGlyph,
} from '../../src/observer/errandFurniture';
import {AMBER, CORK, INK, MINT, SCORCH, SHEET, SketchPen} from '../../src/observer/pen';

interface Op {
    op: string;
    fill: string;
    stroke: string;
    alpha: number;
    args: unknown[];
}

function recorder(): {pen: SketchPen; ctx: CanvasRenderingContext2D; ops: Op[]} {
    const ops: Op[] = [];
    const state: Record<string, unknown> = {
        fillStyle: '',
        strokeStyle: '',
        globalAlpha: 1,
        font: '',
        textAlign: 'start',
    };
    const ctx = new Proxy(state, {
        get: (target, key: string) =>
            key in target
                ? target[key]
                : (...args: unknown[]) =>
                      ops.push({
                          op: key,
                          fill: String(target.fillStyle),
                          stroke: String(target.strokeStyle),
                          alpha: Number(target.globalAlpha),
                          args,
                      }),
        set: (target, key: string, value: unknown) => {
            target[key] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    const pen = new SketchPen(ctx);
    pen.beginFrame(0);
    return {pen, ctx, ops};
}

const FLASK = {x: 200, b: 120};

describe('the cork', () => {
    it('should sit in the flask mouth while nobody is out', () => {
        const {pen, ops} = recorder();
        drawCork(pen, FLASK, false, 0);
        expect(ops.some((o) => o.op === 'fill' && o.fill === CORK)).toBe(true);
        const ys = ops.filter((o) => o.op === 'moveTo').map((o) => o.args[1] as number);
        expect(Math.min(...ys)).toBeLessThan(FLASK.b - 26);
    });

    it('should lie on the bench beside the flask, rolled, while anyone is out', () => {
        const {pen, ops} = recorder();
        drawCork(pen, FLASK, true, 2);
        const xs = ops.filter((o) => o.op === 'moveTo').map((o) => o.args[0] as number);
        expect(Math.min(...xs)).toBeGreaterThan(FLASK.x + 8);
    });

    it('should roll 2 px over 0.35 s, and not at all under the clamp', () => {
        expect(corkRoll(10, 10, false)).toBe(0);
        expect(corkRoll(10.35, 10, false)).toBe(2);
        expect(corkRoll(10.35, 10, true)).toBe(0);
    });
});

describe('the foam and the burp', () => {
    it('should foam MINT for 0.9 s after a birth and burp one INK bubble for 0.6 s after a homecoming', () => {
        const live = recorder();
        flaskFoam(live.pen, FLASK, 5.3, {foam: [5], burps: [5]});
        expect(live.ops.some((o) => o.op === 'fill' && o.fill === MINT)).toBe(true);
        expect(live.ops.some((o) => o.op === 'stroke' && o.stroke === INK)).toBe(true);
        const done = recorder();
        flaskFoam(done.pen, FLASK, 7, {foam: [5], burps: [5]});
        expect(done.ops).toStrictEqual([]);
    });
});

describe('the in-tray and its slips', () => {
    it('should draw the tray and one SHEET slip per sheet, newest on top', () => {
        const {pen, ops} = recorder();
        inTray(pen, FLASK, [{scorched: false}, {scorched: false}, {scorched: false}]);
        expect(ops.filter((o) => o.op === 'fillRect' && o.fill === SHEET)).toHaveLength(3);
    });

    it('should draw a scorched slip in SCORCH — reachable only once the Semaphore reports an outcome (§5)', () => {
        const {pen, ops} = recorder();
        drawSlip(pen, [0, 0], 0.1, true);
        expect(ops.filter((o) => o.op === 'fillRect').map((o) => o.fill)).toStrictEqual([SCORCH]);
    });
});

describe('the pool, the overflow and the ledger', () => {
    it('should pool AMBER light at a quarter strength under a background errand (R5′)', () => {
        const {ctx, ops} = recorder();
        lightPool(ctx, 300, 120, 25);
        const fill = ops.find((o) => o.op === 'fill');
        expect(fill).toMatchObject({fill: AMBER, alpha: 0.25});
        expect(ops.find((o) => o.op === 'ellipse')?.args.slice(0, 3)).toStrictEqual([300, 119.5, 25]);
    });

    it('should write "+N" only when something is over, in INK at 0.85', () => {
        const none = recorder();
        overflowGlyph(none.ctx, [800, 115], 0);
        expect(none.ops).toStrictEqual([]);
        const two = recorder();
        overflowGlyph(two.ctx, [800, 115], 2);
        expect(two.ops.find((o) => o.op === 'fillText')).toMatchObject({
            fill: INK,
            alpha: 0.85,
            args: ['+2', 800, 115],
        });
    });

    it('should write the ledger centred, clipped to the shared middle third', () => {
        const {ctx, ops} = recorder();
        drawLedger(ctx, 'the Surgeon · Reading crossing.ts · 2 more out', {w: 1440, y: 160});
        expect(ops.find((o) => o.op === 'rect')?.args).toStrictEqual([504, 0, 432, 300]);
        expect(ops.find((o) => o.op === 'fillText')).toMatchObject({
            fill: INK,
            alpha: 0.85,
            args: ['the Surgeon · Reading crossing.ts · 2 more out', 720, 160],
        });
    });
});
