// The Chaos Monkey in ink (#00067 P2), through a recording context.

import {describe, expect, it} from 'vitest';

import {drawHangingTail, drawMonkey, type HangingTail, type MonkeyDraw} from '../../src/observer/monkey';
import {AMBER, RED, SketchPen} from '../../src/observer/pen';

function recorder(): {pen: SketchPen; ops: {op: string; stroke: string; fill: string}[]} {
    const ops: {op: string; stroke: string; fill: string}[] = [];
    const state: Record<string, unknown> = {strokeStyle: '', fillStyle: '', globalAlpha: 1, lineWidth: 1};
    const ctx = new Proxy(state, {
        get: (t, k: string) =>
            k in t ? t[k] : () => ops.push({op: k, stroke: String(t.strokeStyle), fill: String(t.fillStyle)}),
        set: (t, k: string, v: unknown) => {
            t[k] = v;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    const pen = new SketchPen(ctx);
    pen.beginFrame(0);
    return {pen, ops};
}

const base: MonkeyDraw = {legs: 'stand', arms: 'idle', t: 1.2, frame: 0, part: 'all', tail: true};
const strokes = (ops: {op: string}[]): number => ops.filter((o) => o.op === 'stroke').length;

describe('the Chaos Monkey', () => {
    it('should draw in every pose he takes on the floor', () => {
        const legs: MonkeyDraw['legs'][] = ['stand', 'dangle', 'tuck'];
        const arms: MonkeyDraw['arms'][] = [
            'idle',
            'thinking',
            'reading',
            'writing',
            'running',
            'waiting',
            'point',
            'grip',
        ];
        for (const l of legs)
            for (const a of arms) {
                const {pen, ops} = recorder();
                drawMonkey(pen, {...base, legs: l, arms: a});
                expect(strokes(ops)).toBeGreaterThan(5);
            }
    });

    it('should scrawl a RED detonation star while he writes', () => {
        const {pen, ops} = recorder();
        drawMonkey(pen, {...base, arms: 'writing'});
        expect(ops.some((o) => o.op === 'stroke' && o.stroke === RED)).toBe(true);
    });

    it('should put only his fingers over the brass in the hands pass of a grip', () => {
        const body = recorder();
        drawMonkey(body.pen, {...base, arms: 'grip', gripY: -40, part: 'body'});
        const hands = recorder();
        drawMonkey(hands.pen, {...base, arms: 'grip', gripY: -40, part: 'hands'});
        // two hands of three fingers, each double-stroked by the pen
        expect(strokes(hands.ops)).toBe(12);
        expect(strokes(body.ops)).toBeGreaterThan(strokes(hands.ops));
    });
});

describe('the hanging tail', () => {
    const tail: HangingTail = {mode: 'hang', rail: -40, topOK: -43, s: 0.75, burn: 0, dx: 0, coils: 2, t: 1};

    it('should coil twice round the brass at ×1.36, once in round one', () => {
        const two = recorder();
        drawHangingTail(two.pen, tail);
        const one = recorder();
        drawHangingTail(one.pen, {...tail, coils: 1});
        // three more curves, each double-stroked by the pen
        expect(strokes(two.ops) - strokes(one.ops)).toBe(6);
    });

    it('should spit a lit fuse while it burns down, and lose it at the POP', () => {
        const lit = recorder();
        drawHangingTail(lit.pen, {...tail, burn: 0.5});
        expect(lit.ops.filter((o) => o.op === 'fill' && o.fill === AMBER).length).toBeGreaterThan(1);
        const popped = recorder();
        drawHangingTail(popped.pen, {...tail, burn: 1});
        expect(popped.ops.some((o) => o.op === 'stroke' && o.stroke === RED)).toBe(false);
    });

    it('should sit on the torn edge in the compact posture', () => {
        const {pen, ops} = recorder();
        drawHangingTail(pen, {...tail, mode: 'seated', coils: 1});
        expect(ops.some((o) => o.op === 'stroke' && o.stroke === RED)).toBe(true);
    });
});
