// The errand floor's receiving surfaces (#00067 §2, Ruling R): the cork that
// pops when the first minion leaves the flask and goes back in when the last
// one is home, the foam of a birth and the burp of a homecoming, the in-tray
// beside his desk with its last three slips, the R5′ pool of AMBER light under
// an errand still working while he idles, the "+N" of errands past the three
// posts, and the errand ledger on the bench front.
//
// MOVED from the ruled prototype (prototypes/mezzanine-minion-errand,
// `specimens.ts` `drawCorkedFlask` / `flaskFoam` / `inTray` / `r2Bench` /
// `ledger`, and `minion.ts` `drawSlip`). The flask itself stays in scene.js;
// these draw over it. Every colour comes from pen.ts (Pattern 013).

import {easeOut, prog} from './errands';
import {AMBER, CORK, INK, MINT, SCORCH, SHEET, type Pt, type SketchPen} from './pen';

/** The cork: in the flask's mouth while no errand is out, rolled onto the bench while any is. */
export function drawCork(pen: SketchPen, at: {x: number; b: number}, out: boolean, roll: number): void {
    const {x, b} = at;
    pen.s = 1;
    pen.jitter = 0.6;
    if (!out) {
        pen.stroke(
            [
                [x - 4.5, b - 26],
                [x - 4, b - 31],
                [x + 2, b - 31],
                [x + 2.5, b - 26],
            ],
            1.6,
        );
        pen.wash(x - 1, b - 28.5, 3, CORK, 0.5);
        return;
    }
    const cx = x + 14 + roll;
    pen.stroke(
        [
            [cx - 2.5, b],
            [cx - 3, b - 5],
            [cx + 3, b - 5.5],
            [cx + 2.5, b],
            [cx - 2.5, b],
        ],
        1.5,
    );
    pen.wash(cx, b - 2.6, 2.8, CORK, 0.5);
}

/** How far the cork has rolled since it popped: 2 px over 0.35 s, none under the clamp. */
export function corkRoll(now: number, corkAt: number, reduced: boolean): number {
    return reduced ? 0 : 2 * easeOut(prog(now, corkAt, 0.35));
}

/** A birth foams out of the mouth; a homecoming burps one bubble back up. */
export function flaskFoam(
    pen: SketchPen,
    at: {x: number; b: number},
    now: number,
    times: {foam: number[]; burps: number[]},
): void {
    const {x, b} = at;
    for (const s of times.foam) {
        const u = now - s;
        if (u < 0 || u > 0.9) continue;
        pen.wash(x - 1, b - 29 - u * 6, 6 + u * 4, MINT, 0.45 * (1 - u / 0.9));
        pen.scribble(x - 1, b - 30 - u * 8, 4 + u * 3, 6, INK, 1.0, 0.5 * (1 - u / 0.9));
    }
    for (const s of times.burps) {
        const u = (now - s) / 0.6;
        if (u < 0 || u > 1) continue;
        pen.ellipse(x - 1, b - 30 - u * 14, 2.4, 2.4, 1.2, INK, 0.7 * (1 - u));
    }
}

/** A folded slip (the same paper object as the tube's capsule). Scorched: the errand came home burnt. */
export function drawSlip(pen: SketchPen, p: Pt, angle: number, scorched = false): void {
    const c = pen.ctx;
    c.save();
    c.translate(p[0], p[1]);
    c.rotate(angle);
    c.fillStyle = scorched ? SCORCH : SHEET;
    c.fillRect(-6, -3.5, 12, 7);
    pen.s = 1;
    pen.jitter = 0.6;
    pen.stroke(
        [
            [-6, -3.5],
            [6, -3.2],
            [6, 3.5],
            [-6, 3.3],
            [-6, -3.5],
        ],
        1.2,
    );
    pen.line(-6, -3.5, 0, 0.5, 0.9, INK, 0.6);
    pen.line(6, -3.2, 0, 0.5, 0.9, INK, 0.6);
    c.restore();
}

/** The in-tray beside his desk, and the slips in it (newest on top). */
export function inTray(pen: SketchPen, at: {x: number; b: number}, slips: {scorched: boolean}[]): void {
    const {x, b} = at;
    pen.s = 1;
    pen.jitter = 0.5;
    pen.stroke(
        [
            [x - 13, b - 6],
            [x - 11, b],
            [x + 11, b],
            [x + 13, b - 6],
        ],
        1.6,
    );
    for (const [i, slip] of slips.entries())
        drawSlip(pen, [x + (i - 1) * 2, b - 3 - i * 2.2], (i - 1) * 0.08, slip.scorched);
}

/** R5′: no lamp object — a pool of AMBER light under the minion still working. */
export function lightPool(ctx: CanvasRenderingContext2D, x: number, b: number, rx: number): void {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.ellipse(x, b - 0.5, rx, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

/** Caveat on the woodwork, INK at 0.85 — the bench front's own hand (§6 Voice). */
function writeCaveat(
    ctx: CanvasRenderingContext2D,
    text: string,
    at: Pt,
    opts: {align: CanvasTextAlign; weight: number},
): void {
    ctx.save();
    ctx.font = `${opts.weight} 15px Caveat, cursive`;
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.85;
    ctx.textAlign = opts.align;
    ctx.fillText(text, at[0], at[1]);
    ctx.restore();
}

/** "+2": a glyph on the benchtop 30 px right of the last post, never an object. */
export function overflowGlyph(ctx: CanvasRenderingContext2D, at: Pt, n: number): void {
    if (n > 0) writeCaveat(ctx, `+${n}`, at, {align: 'left', weight: 700});
}

/** The errand ledger: the bench front's second line, kept inside the shared middle third. */
export function drawLedger(ctx: CanvasRenderingContext2D, line: string, at: {w: number; y: number}): void {
    const {w, y} = at;
    ctx.save();
    ctx.beginPath();
    ctx.rect(w / 3 + 24, 0, w / 3 - 48, 300);
    ctx.clip();
    writeCaveat(ctx, line, [w / 2, y], {align: 'center', weight: 500});
    ctx.restore();
}
