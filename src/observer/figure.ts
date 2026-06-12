// The Mad Scientist, drawn in ink — the Field Journal's figure (#00059
// J-1), ported from the ratified Atelier mock
// (`prototypes/the-atelier/src/sketch/figure.ts`). The caller owns the
// paper, the captions, and the boil seed; this module owns the anatomy
// and the acting.
//
// One production divergence from the mock: ghosts default OFF here.
// The mock drew construction ghosts unless told otherwise; on the
// production floor only the figure under study — the selected
// scientist — earns its pencil bones (#00059 §4, the signature).

import type {ActivityState} from './types';

import {AMBER, INK, MINT, PENCIL, type Pt, RED, SHADE, SKIN, type SketchPen} from './pen';

// ---- The Atelier figure proportions (in sketch units, × scale `s`) ----
// Exported so specs assert against the source of truth instead of magic
// numbers — a proportion tweak cannot silently hollow the contract.
/** Ground line → hip. */
export const FIGURE_LEG = 66;
/** Hip → shoulder. */
export const FIGURE_TORSO = 48;
/** Shoulder → head centre. */
export const FIGURE_HEAD_CLEARANCE = 30;
/** Head radius. */
export const FIGURE_HEAD_R = 19;

export interface FigurePose {
    /** feet-center x, in canvas px */
    x: number;
    /** ground line y, in canvas px */
    groundY: number;
    /** sketch unit scale */
    s: number;
    activity: ActivityState;
    walking: boolean;
    /** -1 | 1 — pacing direction, leans the body */
    facing: number;
    /** seconds since mount */
    t: number;
    /** 60fps frame counter */
    frame: number;
    /** pencil construction ghosts — only the figure being studied gets them */
    ghosts?: boolean;
}

export function drawScientist(pen: SketchPen, f: FigurePose): void {
    const {x: cx, groundY, s, activity, walking, t, frame} = f;
    const ctx = pen.ctx;
    pen.s = s;
    const baseJitter = activity === 'error' ? 1.9 : 1;
    pen.jitter = baseJitter;

    let lean = 0;
    if (walking) {
        lean = f.facing * 5 * s;
    } else if (activity === 'running') {
        lean = Math.sin(t * 6) * 2 * s;
    }
    const breathe = Math.sin(t * 2.2) * 1.4 * s;
    const slump = activity === 'waiting' ? 9 * s : 0;
    const bounce = activity === 'running' ? -Math.abs(Math.sin(t * 7)) * 7 * s : 0;
    const stepA = walking ? Math.sin(t * 9) : 0;

    const hipY = groundY - FIGURE_LEG * s + bounce;
    const hipX = cx;
    const shoulderY = hipY - FIGURE_TORSO * s + breathe * 0.4 + slump * 0.55;
    const shoulderX = cx + lean;
    const headR = FIGURE_HEAD_R * s;
    let headLean = lean * 0.7;
    if (activity === 'thinking') {
        headLean = -6 * s;
    } else if (activity === 'reading' || activity === 'writing') {
        headLean = 5 * s;
    }
    const headX = cx + headLean;
    const headY = shoulderY - FIGURE_HEAD_CLEARANCE * s + breathe * 0.6 + slump * 0.5;

    // ---- pencil construction ghosts (the under-drawing) ----
    if (f.ghosts === true) {
        pen.jitter = baseJitter * 0.6;
        pen.ellipse(headX, headY, headR * 1.12, headR * 1.18, 1.1, PENCIL, 0.22);
        pen.line(shoulderX, shoulderY - 6 * s, hipX, hipY + 8 * s, 1.1, PENCIL, 0.18); // spine
        pen.line(shoulderX - 18 * s, shoulderY, shoulderX + 18 * s, shoulderY, 1.1, PENCIL, 0.16); // shoulder axis
        pen.line(headX - headR, headY + 2 * s, headX + headR, headY + 2 * s, 1.0, PENCIL, 0.14); // eye line
        pen.jitter = baseJitter;
    }

    // ---- washes under the ink ----
    pen.wash(headX + 3 * s, headY, headR * 0.92, SKIN, 0.22);
    pen.wash(hipX - 8 * s, (shoulderY + hipY) / 2 + 4 * s, 16 * s, SHADE, 0.1);
    // hatched shadow under feet
    for (let i = 0; i < 4; i++) {
        pen.line(
            cx - 20 * s + i * 9 * s,
            groundY + 6 * s + (i % 2) * 1.5 * s,
            cx - 12 * s + i * 9 * s,
            groundY + 8 * s,
            1.3,
            SHADE,
            0.35,
        );
    }

    // ---- legs (trousers peek under the coat hem) ----
    const tap = activity === 'waiting' && Math.floor(frame / 14) % 2 === 0 ? -3 * s : 0;
    const lFootX = cx - 9 * s + stepA * 10 * s;
    const rFootX = cx + 9 * s - stepA * 10 * s;
    pen.tube(hipX - 7 * s, hipY + 8 * s, lFootX, groundY, 2.6 * s, 2.0);
    pen.tube(hipX + 7 * s, hipY + 8 * s, rFootX, groundY + tap, 2.6 * s, 2.0);
    pen.line(lFootX - 2 * s, groundY, lFootX - 11 * s, groundY, 2.6);
    pen.curve([lFootX - 11 * s, groundY], [lFootX - 11 * s, groundY - 4 * s], [lFootX - 5 * s, groundY - 4 * s], 1.8);
    pen.line(rFootX + 2 * s, groundY + tap, rFootX + 11 * s, groundY + tap, 2.6);
    pen.curve(
        [rFootX + 11 * s, groundY + tap],
        [rFootX + 11 * s, groundY - 4 * s + tap],
        [rFootX + 5 * s, groundY - 4 * s + tap],
        1.8,
    );

    // ---- the lab coat ----
    const flap = walking ? Math.sin(t * 9) * 5 * s : Math.sin(t * 1.5) * 1.2 * s;
    pen.curve(
        [shoulderX - 16 * s, shoulderY + 2 * s],
        [shoulderX, shoulderY - 6 * s],
        [shoulderX + 16 * s, shoulderY + 2 * s],
        2.6,
    );
    pen.line(shoulderX - 16 * s, shoulderY + 2 * s, hipX - 21 * s - flap, hipY + 16 * s, 2.6);
    pen.line(shoulderX + 16 * s, shoulderY + 2 * s, hipX + 21 * s + flap, hipY + 16 * s, 2.6);
    pen.curve([hipX - 21 * s - flap, hipY + 16 * s], [hipX - 8 * s, hipY + 11 * s], [hipX - 2 * s, hipY + 13 * s], 2.2);
    pen.curve([hipX + 21 * s + flap, hipY + 16 * s], [hipX + 8 * s, hipY + 11 * s], [hipX + 2 * s, hipY + 13 * s], 2.2);
    pen.line(shoulderX - 7 * s, shoulderY, shoulderX - 2 * s, shoulderY + 9 * s, 2.2);
    pen.line(shoulderX + 7 * s, shoulderY, shoulderX + 2 * s, shoulderY + 9 * s, 2.2);
    pen.line(shoulderX - 2 * s, shoulderY + 9 * s, hipX - 2 * s, hipY + 13 * s, 1.8);
    pen.line(shoulderX + 2 * s, shoulderY + 9 * s, hipX + 2 * s, hipY + 13 * s, 1.8);
    pen.line(shoulderX - 13 * s, shoulderY + 16 * s, shoulderX - 6 * s, shoulderY + 17 * s, 1.6);
    pen.line(shoulderX - 11 * s, shoulderY + 12 * s, shoulderX - 10 * s, shoulderY + 17 * s, 2.0, MINT);

    // ---- arms per state ----
    const shL: Pt = [shoulderX - 15 * s, shoulderY + 5 * s];
    const shR: Pt = [shoulderX + 15 * s, shoulderY + 5 * s];
    if (walking) {
        pen.arm(shL, [shoulderX - 19 * s, shoulderY + 22 * s], [cx - 12 * s + stepA * 11 * s, hipY + 4 * s]);
        pen.arm(shR, [shoulderX + 19 * s, shoulderY + 22 * s], [cx + 12 * s - stepA * 11 * s, hipY + 4 * s]);
    } else if (activity === 'thinking') {
        pen.arm(shL, [shoulderX - 19 * s, shoulderY + 22 * s], [cx - 15 * s, hipY + 2 * s]);
        const scratch = Math.sin(t * 5) * 2 * s;
        pen.arm(shR, [shoulderX + 24 * s, shoulderY + 8 * s], [headX + 13 * s, headY - headR - 2 * s + scratch]);
        const sp = 8 * s + Math.sin(t * 2) * 3 * s;
        pen.scribble(headX + 34 * s, headY - 32 * s, sp, 12, INK, 1.4);
        pen.wash(headX + 34 * s, headY - 32 * s, sp * 0.7, AMBER, 0.18);
        ctx.font = `${Math.round(19 * s)}px Caveat, cursive`;
        ctx.fillStyle = INK;
        ctx.fillText('?', headX + 30 * s, headY - 26 * s);
    } else if (activity === 'writing') {
        const scrib = Math.sin(frame * 0.7) * 4 * s;
        pen.arm(shL, [shoulderX - 24 * s, shoulderY + 16 * s], [cx - 22 * s, shoulderY + 30 * s]);
        pen.stroke(
            [
                [cx - 31 * s, shoulderY + 24 * s],
                [cx - 8 * s, shoulderY + 31 * s],
                [cx - 10 * s, shoulderY + 45 * s],
                [cx - 33 * s, shoulderY + 38 * s],
                [cx - 31 * s, shoulderY + 24 * s],
            ],
            2.0,
        );
        const written = Math.floor((frame % 240) / 60) + 1;
        for (let i = 0; i < written; i++) {
            pen.line(
                cx - 28 * s,
                shoulderY + (29 + i * 4) * s,
                cx - 14 * s + (i === written - 1 ? scrib : 0),
                shoulderY + (31 + i * 4) * s,
                1.2,
                INK,
                0.6,
            );
        }
        pen.arm(shR, [shoulderX + 18 * s, shoulderY + 22 * s], [cx - 12 * s + scrib, shoulderY + 33 * s]);
        pen.line(cx - 12 * s + scrib, shoulderY + 33 * s, cx - 8 * s + scrib, shoulderY + 26 * s, 1.8, MINT);
    } else if (activity === 'reading') {
        pen.arm(shL, [shoulderX - 21 * s, shoulderY + 18 * s], [cx - 12 * s, shoulderY + 27 * s]);
        pen.arm(shR, [shoulderX + 21 * s, shoulderY + 18 * s], [cx + 12 * s, shoulderY + 27 * s]);
        const flip = (frame % 150) / 150;
        pen.stroke(
            [
                [cx - 17 * s, shoulderY + 21 * s],
                [cx, shoulderY + 27 * s],
                [cx + 17 * s, shoulderY + 21 * s],
                [cx + 17 * s, shoulderY + 35 * s],
                [cx, shoulderY + 41 * s],
                [cx - 17 * s, shoulderY + 35 * s],
                [cx - 17 * s, shoulderY + 21 * s],
            ],
            2.2,
        );
        pen.line(cx, shoulderY + 27 * s, cx, shoulderY + 41 * s, 1.6);
        if (flip > 0.82) {
            const ang = (flip - 0.82) / 0.18;
            pen.curve(
                [cx, shoulderY + 27 * s],
                [cx - 10 * s * ang, shoulderY + (20 - 6 * ang) * s],
                [cx - 16 * s * ang, shoulderY + 24 * s],
                1.4,
                INK,
                0.7,
            );
        }
        for (let i = 0; i < 3; i++) {
            pen.line(
                cx - 13 * s,
                shoulderY + (25 + i * 4) * s,
                cx - 4 * s,
                shoulderY + (27 + i * 4) * s,
                1.0,
                INK,
                0.5,
            );
            pen.line(
                cx + 4 * s,
                shoulderY + (27 + i * 4) * s,
                cx + 13 * s,
                shoulderY + (25 + i * 4) * s,
                1.0,
                INK,
                0.5,
            );
        }
    } else if (activity === 'running' || activity === 'error') {
        const wave = Math.sin(t * (activity === 'error' ? 14 : 7)) * 5 * s;
        const spread = activity === 'error' ? 37 * s : 28 * s;
        const reach = activity === 'error' ? 22 * s : 26 * s;
        pen.arm(shL, [shoulderX - 25 * s, shoulderY - 6 * s], [shoulderX - spread, shoulderY - reach + wave]);
        pen.arm(shR, [shoulderX + 25 * s, shoulderY - 6 * s], [shoulderX + spread, shoulderY - reach - wave]);
        if (activity === 'running') {
            for (let i = 0; i < 3; i++) {
                pen.line(
                    cx - 52 * s,
                    shoulderY + (i * 16 - 4) * s,
                    cx - 34 * s,
                    shoulderY + (i * 16 - 4) * s,
                    1.5,
                    MINT,
                    0.7,
                );
            }
            pen.wash(cx + 38 * s, shoulderY - 10 * s, 4 * s, MINT, 0.4);
            pen.wash(cx - 40 * s, hipY, 3 * s, MINT, 0.35);
        }
    } else {
        pen.arm(shL, [shoulderX - 19 * s, shoulderY + 23 * s], [cx - 15 * s, hipY + 5 * s]);
        if (activity === 'waiting') {
            pen.arm(shR, [shoulderX + 22 * s, shoulderY + 18 * s], [cx + 10 * s, shoulderY + 26 * s]);
            pen.ellipse(cx + 10 * s, shoulderY + 30 * s, 4.5 * s, 4.5 * s, 1.8);
            pen.line(cx + 10 * s, shoulderY + 28 * s, cx + 10 * s, shoulderY + 30 * s, 1.2);
            pen.line(cx + 11 * s, shoulderY + 30 * s, cx + 13 * s, shoulderY + 32 * s, 1.2);
            pen.curve(
                [cx + 13 * s, shoulderY + 26 * s],
                [cx + 18 * s, shoulderY + 22 * s],
                [cx + 16 * s, shoulderY + 17 * s],
                1.2,
                INK,
                0.7,
            );
        } else {
            const sway = Math.sin(t * 1.1) * 1.5 * s;
            pen.arm(shR, [shoulderX + 19 * s, shoulderY + 23 * s], [cx + 15 * s + sway, hipY + 5 * s]);
        }
    }

    // ---- head ----
    pen.ellipse(headX, headY, headR, headR * 1.06, 2.6);
    const hairBoost = activity === 'error' ? 0.45 : 0;
    for (let i = 0; i < 9; i++) {
        const a = -2.75 + i * 0.31;
        const r1 = headR * 0.9;
        const r2 = headR * (1.35 + ((i * 7) % 3) * 0.18 + hairBoost);
        pen.line(
            headX + Math.cos(a) * r1,
            headY + Math.sin(a) * r1 - 2 * s,
            headX + Math.cos(a + 0.16) * r2,
            headY + Math.sin(a + 0.16) * r2 - 2 * s,
            1.9,
        );
    }
    pen.line(headX - headR * 1.3, headY - headR * 0.9, headX - headR * 1.6, headY - headR * 1.15, 1.2, INK, 0.6);
    pen.line(headX + headR * 1.25, headY - headR, headX + headR * 1.55, headY - headR * 1.2, 1.2, INK, 0.6);

    // goggles up on the forehead
    const gy = headY - headR * 0.58;
    const glassTint = activity === 'error' ? RED : MINT;
    pen.wash(headX - 7.5 * s, gy, 5.5 * s, glassTint, 0.3);
    pen.wash(headX + 7.5 * s, gy, 5.5 * s, glassTint, 0.3);
    pen.ellipse(headX - 7.5 * s, gy, 6 * s, 5.5 * s, 2.0);
    pen.ellipse(headX + 7.5 * s, gy, 6 * s, 5.5 * s, 2.0);
    pen.line(headX - 13.5 * s, gy, headX - headR, gy + 1 * s, 1.8);
    pen.line(headX + 13.5 * s, gy, headX + headR, gy + 1 * s, 1.8);
    pen.line(headX - 1.5 * s, gy, headX + 1.5 * s, gy, 1.8);

    // ---- the face: brows carry the acting ----
    const ey = headY + 2 * s;
    const browY = ey - 5 * s;
    if (activity === 'error') {
        pen.line(headX - 11 * s, browY - 3 * s, headX - 3 * s, browY - 1 * s, 2.2);
        pen.line(headX + 3 * s, browY - 1 * s, headX + 11 * s, browY - 3 * s, 2.2);
    } else if (activity === 'thinking') {
        pen.line(headX - 10 * s, browY, headX - 3 * s, browY + 1 * s, 2.0);
        pen.line(headX + 3 * s, browY - 2.5 * s, headX + 10 * s, browY - 1 * s, 2.0);
    } else if (activity === 'waiting') {
        pen.line(headX - 10 * s, browY + 1.5 * s, headX - 3 * s, browY + 1.5 * s, 2.0);
        pen.line(headX + 3 * s, browY + 1.5 * s, headX + 10 * s, browY + 1.5 * s, 2.0);
    } else if (activity === 'running') {
        pen.line(headX - 10 * s, browY - 2 * s, headX - 3 * s, browY - 3 * s, 2.0);
        pen.line(headX + 3 * s, browY - 3 * s, headX + 10 * s, browY - 2 * s, 2.0);
    } else {
        pen.line(headX - 9 * s, browY, headX - 3 * s, browY - 0.5 * s, 1.8);
        pen.line(headX + 3 * s, browY - 0.5 * s, headX + 9 * s, browY, 1.8);
    }

    // eyes
    const blink = frame % 190 > 184;
    if (activity === 'error') {
        pen.line(headX - 9 * s, ey - 2.5 * s, headX - 4 * s, ey + 2.5 * s, 2.2);
        pen.line(headX - 4 * s, ey - 2.5 * s, headX - 9 * s, ey + 2.5 * s, 2.2);
        pen.line(headX + 4 * s, ey - 2.5 * s, headX + 9 * s, ey + 2.5 * s, 2.2);
        pen.line(headX + 9 * s, ey - 2.5 * s, headX + 4 * s, ey + 2.5 * s, 2.2);
    } else if (blink) {
        pen.line(headX - 9 * s, ey, headX - 4 * s, ey, 2);
        pen.line(headX + 4 * s, ey, headX + 9 * s, ey, 2);
    } else if (activity === 'waiting') {
        pen.line(headX - 9 * s, ey - 1 * s, headX - 4 * s, ey - 1 * s, 1.8);
        pen.line(headX + 4 * s, ey - 1 * s, headX + 9 * s, ey - 1 * s, 1.8);
        ctx.fillStyle = INK;
        ctx.fillRect(headX - 7 * s, ey, 2 * s, 2 * s);
        ctx.fillRect(headX + 6 * s, ey, 2 * s, 2 * s);
    } else if (activity === 'running') {
        pen.ellipse(headX - 6.5 * s, ey, 3 * s, 3.4 * s, 1.8);
        pen.ellipse(headX + 6.5 * s, ey, 3 * s, 3.4 * s, 1.8);
        ctx.fillStyle = INK;
        ctx.fillRect(headX - 7 * s, ey - 1 * s, 1.8 * s, 1.8 * s);
        ctx.fillRect(headX + 6 * s, ey - 1 * s, 1.8 * s, 1.8 * s);
    } else {
        const look = activity === 'reading' || activity === 'writing' ? 2 * s : 0;
        pen.ellipse(headX - 6.5 * s, ey, 2.2 * s, 2.6 * s, 1.7);
        pen.ellipse(headX + 6.5 * s, ey, 2.2 * s, 2.6 * s, 1.7);
        ctx.fillStyle = INK;
        ctx.fillRect(headX - 7 * s + look, ey + 0.4 * s, 1.7 * s, 1.7 * s);
        ctx.fillRect(headX + 6 * s + look, ey + 0.4 * s, 1.7 * s, 1.7 * s);
    }

    // nose + mouth
    pen.curve([headX, ey + 2 * s], [headX - 3 * s, ey + 5 * s], [headX - 1 * s, ey + 7.5 * s], 1.8);
    const my = headY + 12 * s;
    if (activity === 'error') {
        pen.ellipse(headX, my, 4 * s, 5.5 * s, 2.2);
        pen.scribble(headX, my, 2.6 * s, 5, RED, 1.1);
    } else if (activity === 'running') {
        pen.curve([headX - 6 * s, my - 2 * s], [headX, my + 4 * s], [headX + 6 * s, my - 2.5 * s], 2.0);
    } else if (activity === 'thinking') {
        pen.line(headX - 2 * s, my + 0.5 * s, headX + 4 * s, my, 2.0);
    } else if (activity === 'waiting') {
        pen.curve([headX - 4 * s, my + 1 * s], [headX, my - 1.5 * s], [headX + 4 * s, my + 1 * s], 2.0);
    } else {
        pen.curve([headX - 4 * s, my - 0.5 * s], [headX, my + 1.5 * s], [headX + 4 * s, my - 0.5 * s], 2.0);
    }

    // ---- state dressing ----
    if (activity === 'waiting') {
        const dy = (frame % 80) * 0.4 * s;
        pen.ellipse(headX + headR + 5 * s, headY - 4 * s + dy, 1.8 * s, 2.8 * s, 1.5, '#4a7ba6', 0.8);
    }
    if (activity === 'error') {
        pen.splat(headX - headR - 22 * s, headY - 14 * s, 5 * s);
        pen.splat(cx + 40 * s, hipY - 6 * s, 4 * s, RED);
        for (let i = 0; i < 5; i++) {
            const a = -1.1 + i * 0.28;
            pen.line(
                headX + Math.cos(a) * (headR + 14 * s),
                headY - 6 * s + Math.sin(a) * (headR + 14 * s),
                headX + Math.cos(a) * (headR + 22 * s),
                headY - 6 * s + Math.sin(a) * (headR + 22 * s),
                2.0,
                RED,
                0.8,
            );
        }
        ctx.font = `700 ${Math.round(24 * s)}px Caveat, cursive`;
        ctx.fillStyle = RED;
        ctx.fillText('!!', headX + headR + 12 * s, headY - 10 * s);
    }
}

/** Approximate top-of-hair y for a figure — the plumb-line's landing pad. */
export function figureHeadTop(groundY: number, s: number): number {
    return groundY - FIGURE_LEG * s - FIGURE_TORSO * s - FIGURE_HEAD_CLEARANCE * s - FIGURE_HEAD_R * s * 1.55;
}
