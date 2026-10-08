// =============================================================================
// The Rail's painter (#00067 P2): one sill frame from the errand floor's
// border-layer figures, painted inside the bench's own tick, and only when its
// content changed (#00042 §7.6: no loop of its own).
//
// MOVED from the ruled prototype's compositor (prototypes/mezzanine-minion-errand
// `stage.ts` `drawPlacement`, `dilate`, `restrokeBrass`), with the prototype's
// MZ chrome colours replaced by the balcony's own brass (src/shell/brass.ts):
//   - paper travels with ink: a 3 px PAPER die-cut with a 0.6 px INK hairline,
//     only above the torn edge (on the page itself, the paper IS the page);
//   - a body behind the balustrade gets the brass re-stroked over it, and its
//     fingers drawn after — the only ink that lies OVER the rail;
//   - under import.meta.env.DEV, the tier-3 alarm reads the painted pixels and
//     names any that landed in the investor's text or a terminal pane.
//
// Excluded from v8 coverage, like scene.js: jsdom gives no Canvas 2D (its
// getContext returns null, tests/setup.ts), so the raster paths cannot run
// there. The pure parts — the envelope and the alarm's core — live in sill.ts.
// =============================================================================

import type {ErrandFigure} from './errands';
import type {BenchGeometry} from './projection';
import type {SillEnvelope} from './sill';

import {BRASS, BRASS_DIM} from '../shell/brass';
import {drawSlip} from './errandFurniture';
import {drawHangingTail, drawMonkey} from './monkey';
import {INK, PAPER, SketchPen} from './pen';
import {tier3Hits} from './sill';
import {drawSpecimen, EYE_STAGE} from './specimen';

/** One border figure's eye against the brass, as the last sill paint placed it. */
export interface KilroyReading {
    id: string;
    type: string;
    kind: ErrandFigure['kind'];
    arms: ErrandFigure['arms'];
    /** the brass top-rail's y minus the eye-centre's y, section px (+ = the eye clears the rail) */
    eyeAboveRailPx: number;
}

/**
 * DEV only: what the sill's paints held, for the P3 witness (scripts/witness-errand.mjs,
 * #00067 AC-7c and AC-11). Paints and breaching paints are counted, and each border
 * figure's eye is read off the same body pass that drew it. Production never writes it.
 */
export const sillReadout = {paints: 0, breachPaints: 0, breaches: [] as string[], kilroy: [] as KilroyReading[]};

/** The monkey's eyes, local units about his hip: head centre (2.5, −29), eyes 2.5 above it (monkey.ts). */
const MONKEY_EYE = {x: 2.5 + 0.6, y: -29 - 2.5};

/** One figure in ink at the current transform (its hip/feet at the origin). */
export function inkFigure(
    pen: SketchPen,
    fig: ErrandFigure,
    clock: {t: number; still: boolean; part: 'all' | 'body' | 'hands'},
): void {
    const ctx = pen.ctx;
    const {t, still, part} = clock;
    if (fig.kind === 'slip') {
        drawSlip(pen, [0, 0], fig.angle ?? 0);
        return;
    }
    ctx.save();
    ctx.rotate(fig.rot ?? 0);
    ctx.scale(fig.s, fig.s);
    if (fig.kind === 'monkey') inkMonkey(pen, fig, part);
    else
        drawSpecimen(pen, {
            ...fig,
            legs: fig.legs === 'tuck' ? 'hang' : fig.legs,
            t,
            frame: still ? 0 : Math.floor(t * 60),
            part,
            still,
        });
    ctx.restore();
    if (fig.tail && part !== 'body') {
        pen.s = 1;
        drawHangingTail(pen, fig.tail);
    }
    pen.s = 1;
}

function inkMonkey(pen: SketchPen, fig: ErrandFigure, part: 'all' | 'body' | 'hands'): void {
    const legs = fig.legs === 'tuck' || fig.legs === 'dangle' ? fig.legs : 'stand';
    const arms = fig.arms === 'post' ? 'running' : fig.arms;
    const t = fig.mechT;
    drawMonkey(pen, {
        legs,
        arms,
        gripY: fig.gripY,
        t,
        frame: Math.floor(t * 60),
        part,
        tail: fig.tailFromRump === true,
    });
}

const offBody = typeof document === 'undefined' ? null : document.createElement('canvas');
const offHands = typeof document === 'undefined' ? null : document.createElement('canvas');
const offTmp = typeof document === 'undefined' ? null : document.createElement('canvas');
const offTmp2 = typeof document === 'undefined' ? null : document.createElement('canvas');

function prep(c: HTMLCanvasElement, size: number, dpr: number): CanvasRenderingContext2D | null {
    const px = Math.ceil(size * dpr);
    if (c.width !== px) c.width = px;
    if (c.height !== px) c.height = px;
    const x = c.getContext('2d');
    if (!x) return null;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, px, px);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return x;
}

/** The die-cut: the source's alpha grown by `r` px, filled with one colour. */
function dilate(src: HTMLCanvasElement, dst: HTMLCanvasElement, cut: {r: number; colour: string}, dpr: number): void {
    const {r, colour} = cut;
    const x = dst.getContext('2d');
    if (!x) return;
    if (dst.width !== src.width) dst.width = src.width;
    if (dst.height !== src.height) dst.height = src.height;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, dst.width, dst.height);
    const n = 16;
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        x.drawImage(src, Math.cos(a) * r * dpr, Math.sin(a) * r * dpr);
    }
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = colour;
    x.fillRect(0, 0, dst.width, dst.height);
    x.globalCompositeOperation = 'source-over';
}

/** The brass top-rail and its posts, re-stroked over a body that is behind the balustrade
 *  (the same geometry RailingDivider draws: the rail at +2, posts every 48 px). */
function restrokeBrass(s: CanvasRenderingContext2D, env: SillEnvelope, span: [number, number]): void {
    const [x0, x1] = span;
    s.save();
    s.beginPath();
    s.rect(x0, env.dividerTop + 1, x1 - x0, env.tornTop - env.dividerTop - 1);
    s.clip();
    s.fillStyle = BRASS;
    s.fillRect(x0, env.railY, x1 - x0, 2);
    s.fillStyle = BRASS_DIM;
    s.fillRect(x0, env.railY + 2, x1 - x0, 1);
    const start = Math.floor(x0 / 48) * 48;
    for (let px = start; px < x1 + 48; px += 48) {
        s.fillStyle = BRASS_DIM;
        s.fillRect(px + 23, env.dividerTop + 1 + 4, 2, 12);
        s.fillStyle = BRASS;
        s.fillRect(px + 22, env.dividerTop + 1 + 4, 2, 12);
    }
    s.restore();
}

interface PaintCtx {
    sill: CanvasRenderingContext2D;
    env: SillEnvelope;
    geo: BenchGeometry;
    dpr: number;
    seed: number;
    clock: {t: number; still: boolean};
}

function paintOff(target: HTMLCanvasElement, fig: ErrandFigure, p: PaintCtx, part: 'all' | 'body' | 'hands'): number {
    const half = Math.ceil((fig.kind === 'specimen' ? 150 : 90) * fig.s) + 10;
    const x = prep(target, half * 2, p.dpr);
    if (!x) return half;
    const pen = new SketchPen(x);
    pen.beginFrame(p.seed);
    x.save();
    x.translate(half, half);
    inkFigure(pen, fig, {...p.clock, part});
    x.restore();
    return half;
}

/** Paper travels with ink: the die-cut margin, only above the torn edge. */
function margin(p: PaintCtx, src: HTMLCanvasElement, at: {ox: number; oy: number; size: number}): void {
    if (!offTmp || !offTmp2) return;
    const {sill: s, env} = p;
    s.save();
    s.beginPath();
    s.rect(0, 0, env.W, env.benchTop);
    s.clip();
    dilate(src, offTmp, {r: 3.6, colour: INK}, p.dpr);
    s.globalAlpha = 0.55;
    s.drawImage(offTmp, at.ox, at.oy, at.size, at.size);
    s.globalAlpha = 1;
    dilate(src, offTmp2, {r: 3, colour: PAPER}, p.dpr);
    s.drawImage(offTmp2, at.ox, at.oy, at.size, at.size);
    s.restore();
}

function paintFigure(p: PaintCtx, fig: ErrandFigure): void {
    if (!offBody || !offHands) return;
    const split = fig.behindRail === true;
    const half = paintOff(offBody, fig, p, split ? 'body' : 'all');
    if (split) paintOff(offHands, fig, p, 'hands');
    // the figure lives in the bench's drawing coordinates; the sill canvas is section px
    const px = fig.x + p.env.benchLeft;
    const py = fig.y - p.geo.cropTop + p.env.benchTop;
    const at = {ox: px - half, oy: py - half, size: half * 2};
    if (import.meta.env.DEV) readKilroy(p.env, fig, [px, py]);
    margin(p, offBody, at);
    p.sill.drawImage(offBody, at.ox, at.oy, at.size, at.size);
    if (!split) return;
    restrokeBrass(p.sill, p.env, [px - half * 0.7, px + half * 0.7]);
    margin(p, offHands, at);
    p.sill.drawImage(offHands, at.ox, at.oy, at.size, at.size);
}

/** DEV only: where the body pass put this figure's eye (inkFigure: rotate, then scale by s). */
function readKilroy(env: SillEnvelope, fig: ErrandFigure, at: [number, number]): void {
    if (fig.kind === 'slip') return;
    const e = fig.kind === 'monkey' ? MONKEY_EYE : EYE_STAGE;
    if (!Number.isFinite(e.y)) return;
    const rot = fig.rot ?? 0;
    const eyeY = at[1] + fig.s * (e.x * Math.sin(rot) + e.y * Math.cos(rot));
    sillReadout.kilroy.push({
        id: fig.id,
        type: fig.type,
        kind: fig.kind,
        arms: fig.arms,
        eyeAboveRailPx: env.railY - eyeY,
    });
}

/** Size the sill canvas to its envelope and paint every border figure into it. */
export function paintSill(
    canvas: HTMLCanvasElement,
    frame: {env: SillEnvelope; geo: BenchGeometry; dpr: number},
    figures: ErrandFigure[],
    clock: {t: number; still: boolean; seed: number},
): void {
    const {env, geo, dpr} = frame;
    const w = Math.max(1, Math.round(env.w * dpr));
    const h = Math.max(1, Math.round(env.h * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const sill = canvas.getContext('2d');
    if (!sill) return;
    sill.setTransform(1, 0, 0, 1, 0, 0);
    sill.clearRect(0, 0, w, h);
    // section px → this canvas: its top-left sits at (env.x, env.top)
    sill.setTransform(dpr, 0, 0, dpr, -env.x * dpr, -env.top * dpr);
    const p: PaintCtx = {sill, env, geo, dpr, seed: clock.seed, clock};
    if (import.meta.env.DEV) sillReadout.kilroy = [];
    for (const fig of figures) paintFigure(p, fig);
    sill.setTransform(1, 0, 0, 1, 0, 0);
    if (import.meta.env.DEV) tier3Alarm(sill, env, dpr);
}

/** DEV only: any sill pixel inside a tier-3 rect is a breach, and says so. */
function tier3Alarm(sill: CanvasRenderingContext2D, env: SillEnvelope, dpr: number): void {
    const {width: w, height: h} = sill.canvas;
    const rgba = sill.getImageData(0, 0, w, h).data;
    const alpha = new Uint8ClampedArray(w * h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3] ?? 0;
    const hits = tier3Hits({alpha, w, h}, {x: env.x, y: env.top, dpr}, env.tier3);
    sillReadout.paints++;
    if (hits.length > 0) sillReadout.breachPaints++;
    for (const name of hits) {
        if (!sillReadout.breaches.includes(name)) sillReadout.breaches.push(name);
        // oxlint-disable-next-line no-console -- the alarm IS a console line, in dev only
        console.error(`TIER 3 BREACH: ${name}`);
    }
}
