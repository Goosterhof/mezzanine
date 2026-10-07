// =============================================================================
// The Chaos Monkey — the specimen who got out (#00042 Ruling R, R4; #00043
// R2 §3). He never stands at a post and never queues: he hangs by his
// fuse-tail from the investor's own railing above the flask, the tail coiled
// twice round the brass, swinging while he works, and goes home with a POP
// that leaves an ink blot on the paper.
//
// MOVED from the ruled prototype (prototypes/mezzanine-minion-errand,
// `minion.ts` `drawMonkey` + `drawFuse`, `specimens.ts` `hangingTail` and
// `R2_MONKEY`). The drawing is unchanged; round 2 grew the whole figure by
// a transform only (×1.36), and gave the tail its second coil.
// =============================================================================

import {AMBER, FUR, INK, RED, SHEET, SKIN, type Pt, type SketchPen} from './pen';
import {WIDTH, type Arms} from './specimen';

/** R2 §3: the yardstick grows with the cast — the SAME drawing at ×1.36 (transform only). */
export const R2_MONKEY = 1.36;
/** His slower clock: the monkey acts at 0.78 of the bench's rate (§13). */
export const MONKEY_RATE = 0.78;

export interface MonkeyDraw {
    /** 'stand' at a post; 'dangle' in a hop or a grip; 'tuck' hanging (drawn upside down by the caller) */
    legs: 'stand' | 'dangle' | 'tuck';
    arms: Arms;
    /** grip: the hands' y in local units (negative = above the hip) */
    gripY?: number;
    t: number;
    frame: number;
    part: 'all' | 'body' | 'hands';
    /** draw the tail from the rump (the hanging tail is drawn by `drawHangingTail`) */
    tail: boolean;
}

function drawLegs(pen: SketchPen, legs: MonkeyDraw['legs'], t: number): void {
    if (legs === 'stand') {
        pen.line(-4, 4, -7, 14, WIDTH);
        pen.line(-7, 14, -5, 26.6, WIDTH);
        pen.line(4, 4, 7, 14, WIDTH);
        pen.line(7, 14, 5, 26.6, WIDTH);
        pen.line(-5, 26.6, -10, 26.6, WIDTH);
        pen.line(5, 26.6, 10, 26.6, WIDTH);
    } else if (legs === 'dangle') {
        const k = Math.sin(t * 1.1) * 1.5;
        pen.line(-4, 4, -5 + k, 22, WIDTH);
        pen.line(4, 4, 5 - k, 22, WIDTH);
    } else {
        pen.line(-4, 4, -9, 12, WIDTH);
        pen.line(-9, 12, -3, 16, WIDTH);
        pen.line(4, 4, 9, 12, WIDTH);
        pen.line(9, 12, 3, 16, WIDTH);
    }
}

/** Fur body, the rump's own tail (when asked), two big ears, the grin and one fang. */
function drawBodyAndHead(pen: SketchPen, d: MonkeyDraw, head: Pt): void {
    const R = 9.5;
    drawLegs(pen, d.legs, d.t);
    // fur body: an oval, scribble-hatched, the belly left open
    pen.wash(1, -8, 12, FUR, 0.2);
    pen.ellipse(1, -8, 9.5, 14, WIDTH);
    pen.ellipse(2, -6, 5, 8, 1.2, INK, 0.7);
    pen.scribble(-4, -12, 3, 5, INK, 1.0, 0.35);
    if (d.tail) {
        const tip: Pt = [-24, -40];
        pen.curve([-8, 2], [-30, 6], [-26, -18], WIDTH * 0.9);
        pen.curve([-26, -18], [-22, -34], tip, WIDTH * 0.9);
        drawFuse(pen, tip, d.t);
    }
    for (const ex of [-11, 16]) {
        pen.wash(head[0] + ex * 0.86, head[1] - 2, 5, SKIN, 0.3);
        pen.ellipse(head[0] + ex * 0.86, head[1] - 2, 6, 6.4, WIDTH * 0.9);
    }
    pen.wash(head[0], head[1], R * 0.8, FUR, 0.18);
    pen.ellipse(head[0], head[1], R, R, WIDTH);
    pen.ellipse(head[0] + 1, head[1] + 3.2, 6.4, 4.4, 1.4); // muzzle
    pen.ellipse(head[0] + 3.4, head[1] - 2.5, 1.0, 1.0, 1.8);
    pen.ellipse(head[0] - 2.2, head[1] - 2.5, 1.0, 1.0, 1.8);
    // the grin, 1.5× a mouth, and one fang tick
    pen.curve([head[0] - 4.6, head[1] + 3], [head[0] + 1, head[1] + 8.4], [head[0] + 6.4, head[1] + 2.6], 1.7);
    pen.line(head[0] + 3.2, head[1] + 5.2, head[0] + 3.0, head[1] + 7.6, 1.4);
}

/** Over the brass: both hands on the rail, fingers last (the only ink over the rail). */
function drawGrip(pen: SketchPen, d: MonkeyDraw, sL: Pt, sR: Pt): void {
    const gy = d.gripY ?? -45;
    if (d.part !== 'hands') {
        pen.line(sL[0], sL[1], -16, (sL[1] + gy) / 2, WIDTH * 0.9);
        pen.line(-16, (sL[1] + gy) / 2, -10, gy + 2, WIDTH * 0.9);
        pen.line(sR[0], sR[1], 18, (sR[1] + gy) / 2, WIDTH * 0.9);
        pen.line(18, (sR[1] + gy) / 2, 12, gy + 2, WIDTH * 0.9);
    }
    if (d.part === 'body') return;
    for (const hx of [-10, 12])
        for (let f = -1; f <= 1; f++)
            pen.curve([hx + f * 1.7 - 0.6, gy + 2.6], [hx + f * 1.7, gy - 1.8], [hx + f * 1.7 + 0.8, gy + 1.2], 1.5);
}

/** His page: a detonation star scrawled while he writes, two lines while he reads. */
function drawPage(pen: SketchPen, writing: boolean): void {
    const c = pen.ctx;
    const pg: Pt[] = [
        [-8, -6],
        [9, -7],
        [10, 7],
        [-7, 8],
    ];
    c.fillStyle = SHEET;
    c.beginPath();
    c.moveTo(-8, -6);
    for (const p of pg.slice(1)) c.lineTo(p[0], p[1]);
    c.closePath();
    c.fill();
    pen.stroke([...pg, [-8, -6]], 1.6);
    if (writing) {
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 + 0.3;
            pen.line(1, 0, 1 + Math.cos(a) * 5, Math.sin(a) * 5, 1.1, RED, 0.9);
        }
        return;
    }
    pen.line(-4, -2, 5, -2.5, 1.0, INK, 0.6);
    pen.line(-4, 2, 4, 1.6, 1.0, INK, 0.6);
}

/** 1.6× arms: the knuckles hang below the knee. */
function drawArms(pen: SketchPen, d: MonkeyDraw, sL: Pt, sR: Pt, head: Pt): void {
    const arm = (s: Pt, e: Pt, h: Pt): void => {
        pen.line(s[0], s[1], e[0], e[1], WIDTH * 0.9);
        pen.line(e[0], e[1], h[0], h[1], WIDTH * 0.9);
        pen.ellipse(h[0], h[1], 2.2, 2.2, 1.6);
    };
    const {t} = d;
    switch (d.arms) {
        case 'reading':
        case 'writing':
            drawPage(pen, d.arms === 'writing');
            arm(sL, [-14, -6], [-8, 2]);
            arm(sR, [16, -6], [9, 1]);
            return;
        case 'running':
            arm(sL, [-15, -6], [-17 + Math.sin(t * 9) * 3, 12]);
            arm(sR, [17, -6], [19 - Math.sin(t * 9) * 3, 12]);
            return;
        case 'thinking':
            arm(sL, [-14, -4], [-13, 16]);
            arm(sR, [17, -16], [head[0] + 8, head[1] - 7 + Math.sin(t * 5)]);
            return;
        case 'waiting':
        case 'point':
            arm(sL, [-14, -4], [-13, 16]);
            pen.line(sR[0], sR[1], 15, -30, WIDTH * 0.9);
            pen.line(15, -30, 14, -38, WIDTH * 0.9);
            pen.ellipse(14, -38, 2.2, 2.2, 1.6);
            pen.line(14, -40, 14, -44, 1.6);
            return;
        case 'idle':
        case 'error':
        case 'grip':
        case 'cling':
            // idle: arms crossed over the belly (a grip never reaches here: drawMonkey takes it first)
            pen.line(sL[0], sL[1], -6, -4, WIDTH * 0.9);
            pen.line(-6, -4, 10, -6, WIDTH * 0.9);
            pen.line(sR[0], sR[1], 12, -4, WIDTH * 0.9);
            pen.line(12, -4, -4, -7, WIDTH * 0.9);
    }
}

/** Crouched torso 0.8×, arms 1.6×, legs 0.7×, two big round ears, a grin 1.5× wide with one fang, a tail ending in a fuse. */
export function drawMonkey(pen: SketchPen, d: MonkeyDraw): void {
    pen.s = 1;
    pen.jitter = 0.85;
    const sh: Pt = [1, -19];
    const head: Pt = [2.5, -29];
    if (d.part !== 'hands') drawBodyAndHead(pen, d, head);
    const sL: Pt = [sh[0] - 7, sh[1] + 2];
    const sR: Pt = [sh[0] + 7, sh[1] + 2];
    if (d.arms === 'grip' || d.arms === 'cling') {
        drawGrip(pen, d, sL, sR);
        return;
    }
    if (d.part !== 'hands') drawArms(pen, d, sL, sR, head);
}

/** The lit fuse: an AMBER spark wash and three RED spark ticks. */
export function drawFuse(pen: SketchPen, tip: Pt, t: number): void {
    pen.wash(tip[0], tip[1], 4.5 + Math.sin(t * 13) * 0.8, AMBER, 0.55);
    for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * 0.8 + Math.sin(t * 17 + i) * 0.25;
        pen.line(
            tip[0] + Math.cos(a) * 2.5,
            tip[1] + Math.sin(a) * 2.5,
            tip[0] + Math.cos(a) * 6.5,
            tip[1] + Math.sin(a) * 6.5,
            1.3,
            RED,
            0.95,
        );
    }
}

/** The hanging tail's geometry, in PAGE px relative to the hip. */
export interface HangingTail {
    mode: 'hang' | 'climb' | 'seated';
    /** the brass, relative to the hip: railY + 1 − hipY */
    rail: number;
    /** the divider's top edge, relative to the hip: never coil above it */
    topOK: number;
    /** the figure's scale */
    s: number;
    /** 0..1: the spark running down the tail before the POP */
    burn: number;
    /** the swing: the hip's x offset from the pivot */
    dx: number;
    coils: number;
    /** his acting clock (the fuse's flicker) */
    t: number;
}

/** Up to the brass, two coils round the top-rail (never above the divider's
 *  top edge), and down the front to the lit fuse. */
export function drawHangingTail(pen: SketchPen, tail: HangingTail): void {
    const {rail, topOK, s, burn, coils, t} = tail;
    const w = WIDTH * s;
    if (tail.mode === 'seated') {
        pen.curve([-4 * s, 2 * s], [-10 * s, 14 * s], [-6 * s, 26 * s], w);
        pen.curve([-6 * s, 26 * s], [-1 * s, 34 * s], [-8 * s, 40 * s], w);
        pen.s = s;
        drawFuse(pen, [-8 * s, 43 * s], t);
        pen.s = 1;
        return;
    }
    const sx = tail.mode === 'hang' ? 5 * s : -6 * s;
    const sy = tail.mode === 'hang' ? -3 * s : 3 * s;
    const ax = -tail.dx;
    pen.curve([sx, sy], [ax + 6, (sy + rail) / 2], [ax + 2, rail + 2], w);
    // the coil over the brass
    pen.curve([ax + 2, rail + 2], [ax + 1, Math.max(topOK, rail - 3.5)], [ax - 4, rail + 1], w);
    pen.curve([ax - 4, rail + 1], [ax - 6, rail + 6], [ax - 3, rail + 9], w);
    let tip: Pt = [ax - 3, rail + 10];
    if (coils > 1) {
        // R2 §3: at ×1.36 the tail coils TWICE round the brass — a shorter drop, a better grip
        pen.curve([ax - 3, rail + 9], [ax + 3, rail + 8], [ax + 3, rail + 2], w);
        pen.curve([ax + 3, rail + 2], [ax + 2, Math.max(topOK, rail - 3.5)], [ax - 1, rail + 1], w);
        pen.curve([ax - 1, rail + 1], [ax - 3, rail + 5], [ax + 1, rail + 8], w);
        tip = [ax + 1, rail + 9];
    }
    if (burn < 1) {
        pen.s = s;
        drawFuse(pen, tip, t);
        pen.s = 1;
    }
    if (burn > 0 && burn < 1) {
        // the spark runs down the tail toward the monkey
        pen.wash(tip[0] + (sx - tip[0]) * burn, tip[1] + (sy - tip[1]) * burn, 4, AMBER, 0.8);
    }
}
