// SketchPen — the Field Journal's ink toolkit (#00059 J-1).
//
// The pen is pure arithmetic over a CanvasRenderingContext2D interface;
// these specs drive it with a recording mock and assert the property
// the whole boiling-ink aesthetic stands on: a fixed boil seed produces
// a fixed wobble. Same seed, same points → identical path sequences.

import {describe, expect, it} from 'vitest';

import {AMBER, INK, MINT, PAPER, PENCIL, type Pt, RED, SHADE, SKIN, SketchPen} from '../../src/observer/pen';

interface RecordedCall {
    method: string;
    args: unknown[];
}

interface RecordingContext {
    ctx: CanvasRenderingContext2D;
    calls: RecordedCall[];
    of: (method: string) => RecordedCall[];
}

function makeRecordingContext(): RecordingContext {
    const calls: RecordedCall[] = [];
    const record =
        (method: string) =>
        (...args: unknown[]) => {
            calls.push({method, args});
        };
    const ctx = {
        beginPath: record('beginPath'),
        closePath: record('closePath'),
        moveTo: record('moveTo'),
        lineTo: record('lineTo'),
        stroke: record('stroke'),
        fill: record('fill'),
        fillRect: record('fillRect'),
        fillText: record('fillText'),
        measureText: (text: string) => ({width: text.length * 7}),
        save: record('save'),
        restore: record('restore'),
        translate: record('translate'),
        rotate: record('rotate'),
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 0,
        globalAlpha: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        font: '',
        textAlign: 'start',
    } as unknown as CanvasRenderingContext2D;
    return {ctx, calls, of: (method) => calls.filter((c) => c.method === method)};
}

const PATH_METHODS = new Set(['beginPath', 'moveTo', 'lineTo']);

function pathSequence(calls: RecordedCall[]): RecordedCall[] {
    return calls.filter((c) => PATH_METHODS.has(c.method));
}

describe('SketchPen — the ink toolkit (#00059 J-1)', () => {
    describe('the palette — colour truth lives with the pen', () => {
        it('exports the eight inks of the approved mock, verbatim', () => {
            expect(INK).toBe('#2b2620');
            expect(PENCIL).toBe('#7a8088');
            expect(RED).toBe('#c0392b');
            expect(MINT).toBe('#1fa97a');
            expect(AMBER).toBe('#c98a2d');
            expect(SKIN).toBe('#e0b886');
            expect(SHADE).toBe('#8a8273');
        });

        it('exports PAPER — the shared page colour the torn edge cannot drift from', () => {
            expect(PAPER).toBe('#f3ecdc');
        });
    });

    describe('stroke determinism — the boil is seeded, never random', () => {
        const pts: Pt[] = [
            [10, 10],
            [40, 22],
            [70, 18],
        ];

        it('produces identical beginPath/moveTo/lineTo sequences for the same seed', () => {
            const a = makeRecordingContext();
            const penA = new SketchPen(a.ctx);
            penA.beginFrame(42);
            penA.stroke(pts);

            const b = makeRecordingContext();
            const penB = new SketchPen(b.ctx);
            penB.beginFrame(42);
            penB.stroke(pts);

            expect(pathSequence(a.calls)).toStrictEqual(pathSequence(b.calls));
            expect(pathSequence(a.calls).length).toBeGreaterThan(0);
        });

        it('produces a different wobble for a different seed — the ink boils', () => {
            const a = makeRecordingContext();
            const penA = new SketchPen(a.ctx);
            penA.beginFrame(42);
            penA.stroke(pts);

            const b = makeRecordingContext();
            const penB = new SketchPen(b.ctx);
            penB.beginFrame(43);
            penB.stroke(pts);

            expect(pathSequence(a.calls)).not.toStrictEqual(pathSequence(b.calls));
        });

        it('double-passes every stroke — two beginPath/stroke pairs per call', () => {
            const rec = makeRecordingContext();
            const pen = new SketchPen(rec.ctx);
            pen.beginFrame(1);
            pen.stroke(pts);
            expect(rec.of('beginPath')).toHaveLength(2);
            expect(rec.of('stroke')).toHaveLength(2);
        });

        it('advances the shape index — consecutive strokes wobble independently', () => {
            const rec = makeRecordingContext();
            const pen = new SketchPen(rec.ctx);
            pen.beginFrame(7);
            pen.stroke(pts);
            const first = pathSequence(rec.calls);
            rec.calls.length = 0;
            pen.stroke(pts);
            const second = pathSequence(rec.calls);
            expect(first).not.toStrictEqual(second);
        });

        it('resets the shape index on beginFrame — frames replay from the same ink', () => {
            const rec = makeRecordingContext();
            const pen = new SketchPen(rec.ctx);
            pen.beginFrame(9);
            pen.stroke(pts);
            const first = pathSequence(rec.calls);
            rec.calls.length = 0;
            pen.beginFrame(9);
            pen.stroke(pts);
            expect(pathSequence(rec.calls)).toStrictEqual(first);
        });
    });

    describe('the drawing vocabulary', () => {
        it('sub() subdivides a segment into n+1 points', () => {
            const pen = new SketchPen(makeRecordingContext().ctx);
            const pts = pen.sub(0, 0, 100, 0, 5);
            expect(pts).toHaveLength(6);
            expect(pts[0]).toStrictEqual([0, 0]);
            expect(pts[5]).toStrictEqual([100, 0]);
            expect(pts[2]).toStrictEqual([40, 0]);
        });

        it('line() gives long strokes more subdivisions so the boil stays organic', () => {
            const short = makeRecordingContext();
            const penShort = new SketchPen(short.ctx);
            penShort.beginFrame(0);
            penShort.line(0, 0, 30, 0);
            // 5 subdivisions → 6 points → 1 moveTo + 5 lineTo per pass.
            expect(short.of('lineTo')).toHaveLength(10);

            const long = makeRecordingContext();
            const penLong = new SketchPen(long.ctx);
            penLong.beginFrame(0);
            penLong.line(0, 0, 200, 0);
            // 10 subdivisions → 11 points → 1 moveTo + 10 lineTo per pass.
            expect(long.of('lineTo')).toHaveLength(20);
        });

        it('curve() samples the quadratic into nine points per pass', () => {
            const rec = makeRecordingContext();
            const pen = new SketchPen(rec.ctx);
            pen.beginFrame(0);
            pen.curve([0, 0], [50, -20], [100, 0]);
            expect(rec.of('moveTo')).toHaveLength(2);
            expect(rec.of('lineTo')).toHaveLength(16);
        });

        it('ellipse() closes the loop — first and last sampled points coincide', () => {
            const rec = makeRecordingContext();
            const pen = new SketchPen(rec.ctx);
            pen.beginFrame(0);
            pen.ellipse(50, 50, 10, 12);
            expect(rec.of('moveTo')).toHaveLength(2);
            expect(rec.of('lineTo')).toHaveLength(28);
        });

        it('tube() draws two parallel lines — a limb with volume', () => {
            const rec = makeRecordingContext();
            const pen = new SketchPen(rec.ctx);
            pen.beginFrame(0);
            pen.tube(0, 0, 0, 40, 3);
            // Two line() calls, each double-passed.
            expect(rec.of('stroke')).toHaveLength(4);
        });

        it('tube() survives a zero-length segment without NaN coordinates', () => {
            const rec = makeRecordingContext();
            const pen = new SketchPen(rec.ctx);
            pen.beginFrame(0);
            pen.tube(10, 10, 10, 10, 3);
            for (const call of rec.of('lineTo')) {
                expect(Number.isNaN(call.args[0])).toBe(false);
                expect(Number.isNaN(call.args[1])).toBe(false);
            }
        });

        it('arm() composes two tubes, a cuff, and a hand', () => {
            const rec = makeRecordingContext();
            const pen = new SketchPen(rec.ctx);
            pen.beginFrame(0);
            pen.arm([0, 0], [10, 20], [25, 30]);
            // 2 tubes × 2 lines + cuff line + hand ellipse = 6 strokes, double-passed.
            expect(rec.of('stroke')).toHaveLength(12);
        });

        it('scribble() draws a single seeded polyline', () => {
            const rec = makeRecordingContext();
            const pen = new SketchPen(rec.ctx);
            pen.beginFrame(0);
            pen.scribble(20, 20, 6, 8);
            expect(rec.of('beginPath')).toHaveLength(1);
            expect(rec.of('lineTo')).toHaveLength(8);
            expect(rec.of('stroke')).toHaveLength(1);
        });

        it('wash() fills a closed irregular blob', () => {
            const rec = makeRecordingContext();
            const pen = new SketchPen(rec.ctx);
            pen.beginFrame(0);
            pen.wash(30, 30, 12, '#1fa97a', 0.2);
            expect(rec.of('closePath')).toHaveLength(1);
            expect(rec.of('fill')).toHaveLength(1);
        });

        it('wash() rides the slow seed — adjacent boil frames share a shimmer', () => {
            const a = makeRecordingContext();
            const penA = new SketchPen(a.ctx);
            penA.beginFrame(4);
            penA.wash(30, 30, 12, '#1fa97a', 0.2);

            const b = makeRecordingContext();
            const penB = new SketchPen(b.ctx);
            penB.beginFrame(5); // floor(5/2) === floor(4/2) — same slow seed
            penB.wash(30, 30, 12, '#1fa97a', 0.2);

            expect(pathSequence(a.calls)).toStrictEqual(pathSequence(b.calls));
        });

        it('splat() scatters a blob and five droplets — six fills', () => {
            const rec = makeRecordingContext();
            const pen = new SketchPen(rec.ctx);
            pen.beginFrame(0);
            pen.splat(40, 40, 5);
            expect(rec.of('fill')).toHaveLength(6);
        });
    });
});
