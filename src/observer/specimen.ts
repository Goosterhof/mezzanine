// =============================================================================
// The Specimens — the minions in ink (#00043 R2 Lot 8 ★, ruled 2026-10-06).
//
// Every lab minion is an escaped specimen still in its jar: the Surgeon a
// heron in a graduated cylinder, the Librarian an owl wearing his bell jar as
// a helmet, the Scribe an octopus walking an inkwell on her arm-tips, the
// Synchronizer a snail in a caps-only hourglass whose shell is a pocket
// watch. Hired help is a Fairground Goldfish in a tied bag on pencil legs.
//
// MOVED from the ruled prototype (prototypes/mezzanine-minion-errand,
// `cast.ts` + `cast2.ts` + `minion.ts`), Lot 8 branches only (#00067 §2):
// Lots 1-7, the human heads and the Lot 4 slosh stayed behind. The drawing
// is unchanged, with two exceptions the log rules:
//   - the stature factors are baked (`specimenFit.ts`), never rasterised;
//   - D2: the owl's dome-and-head group rides 3 units higher in the sill
//     arms (grip / point / cling) so his magnified eyes clear the brass.
//
// Contract: GROUND origin (feet at y 0) in LOCAL units; the caller
// translates and scales. Colours only from pen.ts (Pattern 013). MINT means born of
// his flask; Hired carries none. The mechanism clock `mechT` is frozen by
// the caller while an errand waits (the Stopped Mechanism Rule).
// =============================================================================

import type {ActivityState} from './types';

import {AMBER, INK, MINT, PAPER, PENCIL, SHADE, SHEET, SKIN, type Pt, type SketchPen} from './pen';
import {LOT8_K, specimenFit} from './specimenFit';

/** The ink width of a limb — the Chaos Monkey's own (one home; the monkey imports it). */
export const WIDTH = 2.7;

export type Legs = 'stand' | 'dangle' | 'kneel' | 'hang';
export type Arms = ActivityState | 'grip' | 'point' | 'cling';
export type Role = 'surgeon' | 'librarian' | 'scribe' | 'synchronizer' | 'general' | 'explore' | 'plan' | 'lab';

export interface SpecimenDraw {
    type: string;
    cls: 'lab' | 'hired';
    legs: Legs;
    arms: Arms | 'post';
    /** grip: the hands' y in STAGE units (negative = above the origin) */
    gripY?: number;
    t: number;
    frame: number;
    part: 'all' | 'body' | 'hands';
    walking?: boolean;
    /** the mechanism clock — frozen by the caller while the errand waits */
    mechT?: number;
    /** 0..1 while being born out of the flask; undefined once formed */
    birth?: number;
    /** 0..1 while going home into the flask */
    home?: number;
    /** R5′: the errand works on in the background while he idles */
    lamp?: boolean;
    /** mid-hop */
    airborne?: boolean;
    /** the static end state (reduced motion) */
    still?: boolean;
    /** the errand's real state, for species habits (the lamp-lit sleep) */
    state?: ActivityState;
    /** the hourglass turns over (radians) before the Synchronizer goes home */
    flip?: number;
}

/** The eye of the most recent draw, LOCAL units (reset per draw). */
export const EYE = {x: 0, y: 0};
/** The eye of the most recent body pass, STAGE units about the origin (the Kilroy readout). */
export const EYE_STAGE = {x: 0, y: Number.NaN};

const W = WIDTH;

export function roleOf(type: string, cls: 'lab' | 'hired'): Role {
    if (cls === 'hired') {
        if (type === 'Explore') return 'explore';
        return type === 'Plan' ? 'plan' : 'general';
    }
    if (type === 'surgeon' || type === 'librarian' || type === 'scribe' || type === 'synchronizer') return type;
    return 'lab';
}

// --- the shared drawing kit ----------------------------------------------------

export function fillPoly(pen: SketchPen, pts: Pt[], color: string, alpha: number): void {
    const c = pen.ctx;
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.beginPath();
    for (const [i, [x, y]] of pts.entries()) {
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
    }
    c.closePath();
    c.fill();
    c.restore();
}

export function ellPts(cx: number, cy: number, rx: number, ry: number, n = 18, a0 = 0, a1 = Math.PI * 2): Pt[] {
    const out: Pt[] = [];
    for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return out;
}

export const lerpP = (a: Pt, b: Pt, u: number): Pt => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

/** A sheet in a hand, SHEET-filled. */
export function sheet(pen: SketchPen, cx: number, cy: number, w: number, h: number, lines = 2, tilt = 0): void {
    const pg: Pt[] = [
        [cx - w / 2, cy - h / 2 + tilt],
        [cx + w / 2, cy - h / 2 - tilt],
        [cx + w / 2 + 0.5, cy + h / 2],
        [cx - w / 2 + 0.5, cy + h / 2 + 0.6],
    ];
    fillPoly(pen, pg, SHEET, 1);
    pen.stroke([...pg, [cx - w / 2, cy - h / 2 + tilt]], 1.5);
    for (let i = 0; i < lines; i++)
        pen.line(cx - w / 2 + 2.5, cy - h / 2 + 3 + i * 3, cx + w / 2 - 3, cy - h / 2 + 2.8 + i * 3, 1.0, INK, 0.6);
}

/** Kilroy's fingers over the brass — the only ink that lies OVER the rail. */
export function fingers(pen: SketchPen, hx: number, gy: number, color = INK, alpha = 1): void {
    for (let f = -1; f <= 1; f++)
        pen.curve(
            [hx + f * 1.6 - 0.6, gy + 2.6],
            [hx + f * 1.6, gy - 1.6],
            [hx + f * 1.6 + 0.8, gy + 1.2],
            1.4,
            color,
            alpha,
        );
}

/** A slip held up at the in-tray. */
export function slipAt(pen: SketchPen, x: number, y: number): void {
    const pg: Pt[] = [
        [x - 5, y - 3],
        [x + 5, y - 2.6],
        [x + 5, y + 3],
        [x - 5, y + 2.8],
    ];
    fillPoly(pen, pg, SHEET, 1);
    pen.stroke([...pg, [x - 5, y - 3]], 1.1);
    pen.line(x - 5, y - 3, x, y + 0.4, 0.8, INK, 0.6);
    pen.line(x + 5, y - 2.6, x, y + 0.4, 0.8, INK, 0.6);
}

/** Two-segment ink arms ending in a ball hand — the monkey's limb vocabulary. */
export interface Rig {
    sL: Pt;
    sR: Pt;
    head: Pt;
    R: number;
    /** centre of a page held at the chest */
    chest: Pt;
    /** shoulder → hand at rest */
    reach: number;
    /** right forearm multiplier */
    foreR?: number;
    /** arms held still when running ("steady hands") */
    still?: boolean;
    /** Hired: the right arm is pencil construction */
    pencilR?: boolean;
    /** the pointing fingertip's y — kept under the crown (the Sill Rule) */
    pointTop: number;
    page?: 'sheet' | 'none';
    /** how far the arms swing out from the body (1 = the monkey's) */
    spread?: number;
}

interface Hands {
    hL: Pt;
    hR: Pt;
}

export function rigArms(pen: SketchPen, d: SpecimenDraw, g: Rig): Hands {
    const a = d.arms;
    const t = d.t;
    const up = g.reach * 0.5;
    const fo = g.reach * 0.5;
    const fr = g.foreR ?? 1;
    const sp = g.spread ?? 1;
    const style = (right: boolean): [number, string, number] =>
        right && g.pencilR ? [1.3, PENCIL, 0.85] : [W * 0.9, INK, 1];
    const arm = (s: Pt, e: Pt, h: Pt, right: boolean, ball = true): void => {
        const [w, col, al] = style(right);
        pen.line(s[0], s[1], e[0], e[1], w, col, al);
        pen.line(e[0], e[1], h[0], h[1], w, col, al);
        if (ball) pen.ellipse(h[0], h[1], 2.0, 2.0, 1.5, col, al);
    };
    if (a === 'grip' || a === 'cling') {
        const gy = d.gripY ?? -50;
        const xl = g.sL[0] - 1;
        const xr = g.sR[0] + 1;
        if (d.part !== 'hands') {
            arm(g.sL, [g.sL[0] - 4.5, (g.sL[1] + gy) / 2], [xl, gy + 2], false, false);
            arm(g.sR, [g.sR[0] + 4.5, (g.sR[1] + gy) / 2], [xr, gy + 2], true, false);
        }
        if (d.part !== 'body') {
            fingers(pen, xl, gy);
            fingers(pen, xr, gy, g.pencilR ? PENCIL : INK, g.pencilR ? 0.9 : 1);
        }
        return {hL: [xl, gy], hR: [xr, gy]};
    }
    const hangL: Pt = [g.sL[0] - 4 * sp, g.sL[1] + up + fo];
    const hangR: Pt = [g.sR[0] + 4 * sp - (fr - 1) * 4, g.sR[1] + up + fo * fr];
    if (d.part === 'hands') return {hL: hangL, hR: hangR};
    const restL = (): Pt => {
        arm(g.sL, [g.sL[0] - 3 * sp, g.sL[1] + up], hangL, false);
        return hangL;
    };
    switch (a) {
        case 'thinking': {
            const hL = restL();
            const hR: Pt = [g.head[0] + g.R * 0.45, g.head[1] + g.R * 0.85 + Math.sin(t * 5) * 0.6];
            arm(g.sR, [g.sR[0] + 6, g.sR[1] + up * 0.6], hR, true);
            return {hL, hR};
        }
        case 'reading':
        case 'writing': {
            const [cx, cy] = g.chest;
            if (g.page !== 'none') sheet(pen, cx, cy, 13, 11, 2);
            const hL: Pt = [cx - 6, cy + 3];
            arm(g.sL, [g.sL[0] - 4, cy + 1], hL, false);
            if (a === 'writing') {
                const sc = Math.sin(d.frame * 0.7) * 2;
                const hR: Pt = [cx + 1 + sc, cy + 1];
                arm(g.sR, [g.sR[0] + 4, cy + 2], hR, true);
                pen.line(hR[0], hR[1], hR[0] + 3, hR[1] - 6, 1.2);
                return {hL, hR};
            }
            const hR: Pt = [cx + 6, cy + 3];
            arm(g.sR, [g.sR[0] + 4, cy + 1], hR, true);
            return {hL, hR};
        }
        case 'running': {
            if (g.still) {
                const hL: Pt = [g.sL[0] + 0.5, g.sL[1] + up + 3];
                const hR: Pt = [g.sR[0] - 0.5, g.sR[1] + up + 3];
                arm(g.sL, [g.sL[0] - 5, g.sL[1] + up * 0.7], hL, false);
                arm(g.sR, [g.sR[0] + 5, g.sR[1] + up * 0.7], hR, true);
                return {hL, hR};
            }
            const w = Math.sin(t * 9) * 2.4;
            const hL: Pt = [g.sL[0] - 2.5 * sp + w, g.sL[1] - 11];
            const hR: Pt = [g.sR[0] + 2.5 * sp - w, g.sR[1] - 11];
            arm(g.sL, [g.sL[0] - 4.5 * sp, g.sL[1] - 2], hL, false);
            arm(g.sR, [g.sR[0] + 4.5 * sp, g.sR[1] - 2], hR, true);
            return {hL, hR};
        }
        case 'waiting':
        case 'point': {
            // one finger UP at the Mad Scientist's terminal, never above the crown
            const hL = restL();
            const hR: Pt = [g.sR[0] + 2, g.pointTop + 5.5];
            const [w, col, al] = style(true);
            pen.line(g.sR[0], g.sR[1], g.sR[0] + 5, g.sR[1] - 3, w, col, al);
            pen.line(g.sR[0] + 5, g.sR[1] - 3, hR[0], hR[1], w, col, al);
            pen.ellipse(hR[0], hR[1], 2.0, 2.0, 1.5, col, al);
            pen.line(hR[0] - 0.3, hR[1] - 1.5, hR[0] - 1.2, g.pointTop, 1.5, col, al);
            return {hL, hR};
        }
        case 'post': {
            const hL = restL();
            const hR: Pt = [g.sL[0] - 9, g.sL[1] + up + 2];
            arm(g.sR, [g.sR[0] + 1, g.sR[1] + up], hR, true);
            slipAt(pen, hR[0] - 3, hR[1] + 2);
            return {hL, hR};
        }
        case 'idle':
        case 'error': {
            const hL = restL();
            arm(g.sR, [g.sR[0] + 3 * sp, g.sR[1] + up], hangR, true);
            return {hL, hR: hangR};
        }
    }
}

/** Resample a closed outline to n points by arc length, starting at its topmost point. */
function resample(pts: Pt[], n: number): Pt[] {
    let k0 = 0;
    for (const [i, p] of pts.entries()) if (p[1] < (pts[k0]?.[1] ?? Infinity)) k0 = i;
    const start = pts[k0] ?? [0, 0];
    const ring: Pt[] = [...pts.slice(k0), ...pts.slice(0, k0), start];
    const lens = [0];
    for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1] ?? start;
        const b = ring[i] ?? start;
        lens.push((lens[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = lens.at(-1) ?? 0;
    const out: Pt[] = [];
    let j = 1;
    for (let i = 0; i < n; i++) {
        const want = (i / n) * total;
        while (j < lens.length - 1 && (lens[j] ?? 0) < want) j++;
        const l0 = lens[j - 1] ?? 0;
        const u = (want - l0) / Math.max(1e-6, (lens[j] ?? l0) - l0);
        out.push(lerpP(ring[j - 1] ?? start, ring[j] ?? start, u));
    }
    return out;
}

/** Glassblowing: the foam bubble's outline MORPHS into the vessel path — no fade. */
export function morph(pen: SketchPen, outline: Pt[], m: number): void {
    const N = 40;
    const v = resample(outline, N);
    let area = 0;
    for (const [i, [x1, y1]] of v.entries()) {
        const [x2, y2] = v[(i + 1) % N] ?? [x1, y1];
        area += x1 * y2 - x2 * y1;
    }
    const cx = v.reduce((s, p) => s + p[0], 0) / N;
    const cy = v.reduce((s, p) => s + p[1], 0) / N;
    const r = 11;
    const dir = area > 0 ? 1 : -1;
    const pts: Pt[] = v.map((p, i) => {
        const an = -Math.PI / 2 + dir * (i / N) * Math.PI * 2;
        return lerpP([cx + Math.cos(an) * r, cy + Math.sin(an) * r], p, m);
    });
    if (m < 0.85) pen.wash(cx, cy, r * 0.9, MINT, 0.5 * (1 - m * 0.8)); // the flask's foam, hardening
    pen.stroke([...pts, pts[0] ?? [cx, cy]], W * 0.9);
}

/** The glass itself: an ink outline — Hired glass is half-inked (left INK, right pencil). */
export function glass(pen: SketchPen, pts: Pt[], hired: boolean, closed = true): void {
    const first = pts[0];
    const path = closed && first ? [...pts, first] : pts;
    if (!hired) {
        pen.stroke(path, W * 0.85);
        return;
    }
    const c = pen.ctx;
    c.save();
    c.beginPath();
    c.rect(-60, -90, 60, 160);
    c.clip();
    pen.stroke(path, W * 0.85);
    c.restore();
    c.save();
    c.beginPath();
    c.rect(0, -90, 60, 160);
    c.clip();
    pen.stroke(path, 1.2, PENCIL, 0.9);
    c.restore();
}

// --- the acting prelude -----------------------------------------------------------

type Mood = 'idle' | 'think' | 'read' | 'work' | 'run' | 'up' | 'sleep';

interface P2 {
    t: number;
    mt: number;
    a: Arms | 'post';
    seated: boolean;
    hang: boolean;
    walk: boolean;
    mood: Mood;
    still: boolean;
    hired: boolean;
    part: 'all' | 'body' | 'hands';
    d: SpecimenDraw;
}

const MOOD_OF: Partial<Record<Arms | 'post', Mood>> = {
    waiting: 'up',
    point: 'up',
    grip: 'up',
    cling: 'up',
    thinking: 'think',
    reading: 'read',
    writing: 'work',
    running: 'run',
};

function prelude(d: SpecimenDraw): P2 {
    const asleep = !!d.lamp && d.state === 'idle';
    return {
        t: d.t,
        mt: d.mechT ?? d.t,
        a: d.arms,
        seated: d.legs === 'kneel',
        hang: d.legs === 'hang' || d.legs === 'dangle',
        walk: !!d.walking && d.legs === 'stand',
        mood: asleep ? 'sleep' : (MOOD_OF[d.arms] ?? 'idle'),
        still: !!d.still,
        hired: d.cls === 'hired',
        part: d.part,
        d,
    };
}

const BUSY = (p: P2): boolean => !p.still && p.a !== 'waiting' && p.a !== 'point';
/** a writing/reading tick counter that STOPS on a wait (mechT is frozen by the caller) */
const tick = (p: P2, rate: number, mod: number): number => (p.still ? 1 : Math.floor(p.mt * rate) % mod);

// --- the face kit -------------------------------------------------------------------

const PUPIL_OFF: Partial<Record<Mood, Pt>> = {
    up: [-0.3, -0.52],
    read: [-0.15, 0.48],
    think: [0.42, -0.38],
    work: [-0.38, 0.32],
    idle: [0, 0.3],
};

function eye2(pen: SketchPen, x: number, y: number, r: number, mood: Mood, look: Pt = [0, 0], lid = 0): void {
    if (mood === 'sleep') {
        pen.curve([x - r, y], [x, y + r * 0.7], [x + r, y], 1.3);
        return;
    }
    fillPoly(pen, ellPts(x, y, r, r, 12), SHEET, 1);
    pen.ellipse(x, y, r, r, 1.2);
    const off = PUPIL_OFF[mood] ?? [0, 0];
    const px = x + (off[0] + look[0]) * r;
    const py = y + (off[1] + look[1]) * r;
    fillPoly(pen, ellPts(px, py, r * 0.46, r * 0.46, 8), INK, 1);
    const l = mood === 'idle' ? 0.45 : lid;
    if (l > 0) {
        fillPoly(
            pen,
            [
                [x - r, y - r],
                [x + r, y - r],
                [x + r, y - r + 2 * r * l],
                [x - r, y - r + 2 * r * l],
            ],
            SKIN,
            0.9,
        );
        pen.line(x - r, y - r + 2 * r * l, x + r, y - r + 2 * r * l, 1.2);
    }
}

/** Two-segment monkey arms + the pointing finger and thumb. */
function arms2(pen: SketchPen, p: P2, g: Rig): Hands {
    const h = rigArms(pen, p.d, g);
    if ((p.a === 'waiting' || p.a === 'point') && p.part !== 'hands')
        pen.line(h.hR[0] + 1.3, h.hR[1] + 0.2, h.hR[0] + 3, h.hR[1] - 1.4, 1.3, g.pencilR ? PENCIL : INK, 1);
    return h;
}

/** Monkey legs from the base B: standing, dangling (sill, grip, hop) or folded forward (seated). */
function legs2(pen: SketchPen, p: P2, B: number, len: number, hipX = 4.5, pencilR = false): void {
    if (p.part === 'hands') return;
    const R = (right: boolean): [number, string, number] => (right && pencilR ? [1.3, PENCIL, 0.9] : [W, INK, 1]);
    if (p.seated) {
        // sitting on the bench, legs out toward his terminal
        for (const [i, s] of [-1, 1].entries()) {
            const [w, c, a] = R(s > 0);
            pen.line(s * hipX * 0.6, B - 2, -10 - i * 2, -3.5, w, c, a);
            pen.line(-10 - i * 2, -3.5, -16 - i * 2, -0.8, w, c, a);
            pen.line(-16 - i * 2, -0.8, -16 - i * 2, -5, w * 0.8, c, a);
        }
        return;
    }
    if (p.hang) {
        const k = p.d.legs === 'dangle' ? Math.sin(p.t * 1.3) : 0;
        for (const s of [-1, 1]) {
            const [w, c, a] = R(s > 0);
            pen.line(s * hipX, B, s * (hipX + 1) + k, B + len * 0.9, w, c, a);
        }
        return;
    }
    const step = p.walk ? Math.sin(p.t * 10) * 4 : 0;
    for (const s of [-1, 1]) {
        const st = s * step;
        const [w, c, a] = R(s > 0);
        pen.line(s * hipX, B, s * (hipX + 3) - st, B + len * 0.45, w, c, a);
        pen.line(s * (hipX + 3) - st, B + len * 0.45, s * (hipX + 1) - st, 0, w, c, a);
        pen.line(s * (hipX + 1) - st, 0, s * (hipX + 6) - st, 0, w, c, a);
    }
}

/** MINT: born of his flask. Hired help never carries it. */
function sealBand(pen: SketchPen, x0: number, x1: number, y: number): void {
    pen.line(x0, y, x1, y, 2.2, MINT, 1);
}

/** R5′: a glint of the AMBER pool on the glass while it works on in the background. */
function lampGlint(pen: SketchPen, d: SpecimenDraw, x: number, y: number): void {
    if (d.lamp) {
        pen.wash(x, y, 4, AMBER, 0.3);
        pen.line(x - 1, y - 2, x + 1, y + 2, 1.2, AMBER, 0.9);
    }
}

/** the sand of an hourglass — grains on a line; three hang on a wait */
function sand(pen: SketchPen, p: P2, waistY: number, bottomY: number, rx: number): void {
    const pile = p.still ? 4 : 3 + ((p.mt * 0.7) % 4);
    fillPoly(
        pen,
        [
            [-rx * 0.8, bottomY],
            [-rx * 0.5, bottomY - pile * 0.55],
            [0, bottomY - pile],
            [rx * 0.5, bottomY - pile * 0.55],
            [rx * 0.8, bottomY],
        ],
        SKIN,
        0.9,
    );
    const fall = bottomY - pile - waistY;
    if (p.a === 'waiting' || p.a === 'point') {
        for (const f of [0.22, 0.5, 0.78]) pen.ellipse(0, waistY + fall * f, 0.6, 0.6, 1.4);
        return;
    }
    pen.line(0, waistY, 0, waistY + fall, 0.9, SKIN, 1);
    pen.line(0, waistY, 0, waistY + fall, 0.5, INK, 0.45);
    for (let i = 0; i < 4; i++) {
        const u = p.still ? (i + 0.5) / 4 : ((p.mt * 18) / Math.max(4, fall) + i / 4) % 1;
        pen.ellipse(0, waistY + fall * u, 0.55, 0.55, 1.3);
    }
}

/** the hourglass with CAPS ONLY (the waist stays open in silhouette) */
function hourglassBody(pen: SketchPen, p: P2, B: number, rx: number, bulb: number): {top: number; waist: number} {
    const waist = B - 3 - bulb;
    const top = waist - bulb;
    const w = Math.max(1.6, rx * 0.15);
    const prof = (y: number): number => {
        const u = Math.abs((y - waist) / bulb);
        return w + (rx - w) * Math.sin(Math.min(1, u) * Math.PI * 0.6) * (u > 0.82 ? 1 - (u - 0.82) * 2.2 : 1);
    };
    const o: Pt[] = [];
    for (let y = top; y <= B - 3; y += 2) o.push([prof(y), y]);
    for (let y = B - 3; y >= top; y -= 2) o.push([-prof(y), y]);
    fillPoly(
        pen,
        [
            [-rx * 0.62, waist - 4],
            [rx * 0.62, waist - 4],
            [w, waist],
            [-w, waist],
        ],
        SKIN,
        0.8,
    );
    sand(pen, p, waist, B - 3.5, rx);
    glass(pen, o, false);
    for (const y of [B - 3, top - 3]) {
        fillPoly(
            pen,
            [
                [-rx - 2, y],
                [rx + 2, y],
                [rx + 2, y + 3],
                [-rx - 2, y + 3],
            ],
            SHADE,
            0.4,
        );
        pen.stroke(
            [
                [-rx - 2, y],
                [rx + 2, y],
                [rx + 2, y + 3],
                [-rx - 2, y + 3],
                [-rx - 2, y],
            ],
            1.7,
        );
    }
    sealBand(pen, -w - 2, w + 2, waist);
    return {top: top - 3, waist};
}

// --- the species kit ------------------------------------------------------------

function heronHead(pen: SketchPen, p: P2, x: number, y: number, snip: number): void {
    pen.wash(x, y, 4.6, SHADE, 0.18);
    pen.ellipse(x, y, 6, 5, W * 0.85);
    // the surgical cap
    pen.curve([x - 6, y - 1.4], [x, y - 8.4], [x + 6, y - 1.4], 1.8);
    for (let i = 0; i < 3; i++)
        pen.curve([x + 4, y - 2.5 + i * 1.2], [x + 8, y - 4.6 + i * 2.2], [x + 10 - i * 1.2, y - 2 + i * 3], 1.3);
    eye2(pen, x - 2, y - 1.6, 1.9, p.mood === 'idle' ? 'run' : p.mood); // a cold, round eye
    EYE.x = x - 2;
    EYE.y = y - 1.6;
    pen.line(x - 5.6, y - 0.6, x - 23, y + 0.6, 1.8);
    pen.line(x - 5.4, y + 1.6, x - 22, y + 1.2 + snip, 1.5);
}

function owlHead(pen: SketchPen, p: P2, x: number, y: number, R: number, mag: number): void {
    const pts = ellPts(x, y, R, R * 0.92, 20);
    fillPoly(pen, pts, PAPER, 1);
    pen.wash(x, y, R * 0.8, SHADE, 0.24);
    pen.stroke(pts, W * 0.95);
    pen.line(x - R * 0.7, y - R * 0.74, x - R * 0.78, y - R * 0.98, 1.8); // short ear tufts
    pen.line(x + R * 0.7, y - R * 0.74, x + R * 0.78, y - R * 0.98, 1.8);
    const er = Math.min(R * 0.36 * (mag > 1 ? 1.15 : 1), R * 0.48); // the dome magnifies
    const ey = y - R * 0.5;
    const blink = p.mood === 'idle' && !p.still && Math.floor(p.t * 0.6) % 3 === 0 ? 0.9 : 0;
    eye2(pen, x - R * 0.45, ey, er, p.mood, [0, 0], blink);
    eye2(pen, x + R * 0.45, ey, er, p.mood);
    EYE.x = x;
    EYE.y = ey;
    // his spectacles
    pen.ellipse(x - R * 0.45, ey + 0.4, er + 1.2, er + 1.0, 1.2);
    pen.ellipse(x + R * 0.45, ey + 0.4, er + 1.2, er + 1.0, 1.2);
    pen.curve([x - 1.6, ey + er + 0.6], [x, ey + er + 4.6], [x + 1.4, ey + er + 0.8], 1.6); // the hooked beak
}

function octoMantle(pen: SketchPen, p: P2, x: number, y: number, rx: number, ry: number): void {
    const mp: Pt[] = [];
    for (let i = 0; i <= 18; i++) {
        const an = Math.PI + (i / 18) * Math.PI;
        mp.push([x + Math.cos(an) * rx, y + Math.sin(an) * ry]);
    }
    mp.push([x + rx * 0.85, y + ry * 0.35], [x - rx * 0.85, y + ry * 0.35]);
    fillPoly(pen, mp, PAPER, 1);
    pen.wash(x, y - ry * 0.3, rx * 0.8, SHADE, 0.24);
    pen.stroke([...mp, mp[0] ?? [x - rx, y]], W * 0.95);
    pen.scribble(x + 3, y - ry * 0.2, 3, 5, INK, 1.0, 0.3);
    // her bun, and the pencil through it
    pen.ellipse(x + rx * 0.82, y - ry * 0.5, 3.2, 3, 1.8);
    pen.line(x + rx * 0.4, y - ry * 0.4, x + rx * 1.2, y - ry * 0.95, 1.4);
    const ey = y - ry * 0.72; // eyes on TOP of the mantle (Kilroy)
    eye2(pen, x - rx * 0.36, ey, 2.4, p.mood);
    eye2(pen, x + rx * 0.36, ey, 2.4, p.mood);
    EYE.x = x;
    EYE.y = ey;
}

/** one of the octopus's arms: a curl, with an optional quill */
function tentacle(pen: SketchPen, from: Pt, to: Pt, curl: number, quill = false): void {
    const mid: Pt = [(from[0] + to[0]) / 2 + curl * 0.5, (from[1] + to[1]) / 2 - Math.abs(curl) * 0.4];
    pen.curve(from, mid, to, W * 0.85);
    if (quill) {
        pen.line(to[0], to[1], to[0] + 3, to[1] - 9, 1.3);
        pen.curve([to[0] + 2, to[1] - 6], [to[0] + 5, to[1] - 7], [to[0] + 5.5, to[1] - 4.5], 1.0);
    } else pen.curve(to, [to[0] + curl * 0.3, to[1] + 2.4], [to[0] + curl * 0.25, to[1] - 2], 1.5);
}

function snailWatch(pen: SketchPen, p: P2, x: number, y: number, r: number): void {
    fillPoly(pen, ellPts(x, y, r, r, 20), SHEET, 1);
    pen.wash(x + 3, y + 3, r * 0.6, SHADE, 0.16);
    pen.ellipse(x, y, r, r, W * 0.9);
    pen.ellipse(x, y, r * 0.82, r * 0.82, 1.0, INK, 0.75);
    for (let i = 0; i < 12; i++) {
        const an = (i / 12) * Math.PI * 2;
        pen.line(
            x + Math.cos(an) * r * 0.68,
            y + Math.sin(an) * r * 0.68,
            x + Math.cos(an) * r * 0.8,
            y + Math.sin(an) * r * 0.8,
            i % 3 ? 0.8 : 1.3,
        );
    }
    let rate = 1.6;
    if (p.a === 'running') rate = 5;
    else if (p.a === 'idle') rate = 0.6;
    const hand = p.still ? -0.5 : -Math.PI / 2 + p.mt * rate; // stops dead on a wait (mechT frozen)
    pen.line(x, y, x + Math.cos(hand) * r * 0.66, y + Math.sin(hand) * r * 0.66, 1.4);
    pen.line(x, y, x + r * 0.36, y + r * 0.14, 1.6);
    pen.stroke(
        [
            [x - 1.6, y - r],
            [x - 1.6, y - r - 2.4],
            [x + 1.6, y - r - 2.4],
            [x + 1.6, y - r],
        ],
        1.4,
    );
    // her braid, coiled round the watch
    for (let i = 0; i < 10; i++) {
        const an = -0.4 + (i / 10) * Math.PI * 1.3;
        pen.ellipse(x + Math.cos(an) * (r + 1.8), y + Math.sin(an) * (r + 1.8), 1.0, 1.2, 0.9, INK, 0.85);
    }
}

function stalks(pen: SketchPen, p: P2, base: Pt, tipY: number, watch: Pt): void {
    const sway = p.still ? 0 : Math.sin(p.t * 2.2) * 1.2;
    const cross = p.a === 'thinking' ? 3 : 0;
    const t1: Pt = [base[0] - 4 + sway + cross, tipY];
    // one on the watch, one on you
    const t2: Pt = p.mood !== 'up' ? [watch[0] - 2, tipY + 6] : [base[0] + 3 + sway - cross, tipY - 1];
    pen.curve(base, [base[0] - 3, (base[1] + tipY) / 2], t1, 1.8);
    pen.curve([base[0] + 2, base[1]], [base[0] + 4, (base[1] + tipY) / 2], t2, 1.8);
    for (const tp of [t1, t2]) {
        fillPoly(pen, ellPts(tp[0], tp[1], 1.9, 1.9, 8), SHEET, 1);
        pen.ellipse(tp[0], tp[1], 1.9, 1.9, 1.4);
        if (p.mood !== 'sleep') pen.ellipse(tp[0] - 0.4, tp[1] - (p.mood === 'up' ? 0.7 : 0), 0.7, 0.7, 1.3);
    }
    EYE.x = t1[0];
    EYE.y = Math.min(t1[1], t2[1]);
}

// --- the five specimens -----------------------------------------------------------

/** The Surgeon: a heron in a graduated cylinder. MINT drops one graduation per cut. */
function heron(pen: SketchPen, p: P2, d: SpecimenDraw, unfurl: number): void {
    const legLen = 20;
    const B = p.seated ? 0 : -legLen;
    legs2(pen, p, B, legLen, 6);
    const top = B - 46;
    if (p.part !== 'hands') {
        const level = top + 10 + tick(p, 1.4, 5) * 3.4;
        fillPoly(
            pen,
            [
                [-9, level],
                [9, level],
                [9, B],
                [-9, B],
            ],
            MINT,
            0.42,
        );
        pen.wash(0, B - 18, 6.5, SHADE, 0.3); // her folded body in the cylinder
        pen.ellipse(0, B - 18, 6, 9, 1.4, INK, 0.75);
        pen.curve([-3, B - 22], [2, B - 18], [4, B - 12], 1.0, INK, 0.6);
        glass(
            pen,
            [
                [-10, top],
                [10, top],
                [10, B],
                [-10, B],
            ],
            false,
        );
        pen.stroke(
            [
                [-13, B],
                [13, B],
                [13, B + 1.6],
            ],
            1.5,
        );
        for (let y = top + 4; y < B - 2; y += 4) pen.line(5.6, y, 9, y, y % 8 === 0 ? 1.1 : 0.8, INK, 0.7);
        sealBand(pen, -10, 10, top + 2.5);
        pen.line(-7.4, top + 6, -7.4, top + 22, 1.6, SHEET, 1);
        // the neck and beak break out of the mouth; the neck stays perfectly still in a hop
        const up = p.hang || p.a === 'grip' || p.a === 'cling';
        let head: Pt = [-4, top - 20 * unfurl];
        if (p.seated) head = [-6, top - 12 * unfurl];
        else if (up) head = [-2, top - 22 * unfurl];
        pen.curve([0, top + 6], [p.seated ? 2 : 5, (top + head[1]) / 2], [head[0] + 3, head[1] + 3], W * 0.95);
        pen.curve([-3, top + 6], [p.seated ? -1 : 2.5, (top + head[1]) / 2], [head[0] + 1, head[1] + 4.4], 1.5);
        const snip = p.a === 'writing' && BUSY(p) && Math.floor(p.mt * 2.4) % 2 === 0 ? 2.4 : 0;
        heronHead(pen, p, head[0], head[1], snip);
        lampGlint(pen, d, 7, top + 12);
    }
    arms2(pen, p, {
        sL: [-10, B - 26],
        sR: [10, B - 26],
        head: [-4, top - 20],
        R: 6,
        chest: [0, B - 18],
        reach: 18,
        pointTop: top - 14,
        still: true,
        spread: 0.2,
    });
}

/** D2 (#00067 §3 #2): in the sill arms the owl's dome-and-head group rides
 *  3 units higher, so both magnified eyes clear the brass (−1.16 px → ≈ +1.9). */
const OWL_SILL_LIFT = 3;

/** The Librarian: an owl who outgrew his bell jar and wears the dome as a helmet; it magnifies his eyes. */
function owl(pen: SketchPen, p: P2, d: SpecimenDraw): void {
    const leg = 14;
    const Bo = p.seated ? 3 : -leg; // seated, he sinks onto the book
    if (p.part !== 'hands') {
        if (!p.seated)
            for (const s of [-1, 1]) {
                pen.line(s * 4, Bo, s * 4.5, -1, W);
                for (const tx of [-2, 0, 2]) pen.line(s * 4.5, -1, s * 4.5 + tx, 0.6, 1.2);
            }
        pen.wash(0, Bo - 12, 11, SHADE, 0.26);
        pen.ellipse(0, Bo - 13, 12, 14, W * 0.9);
        pen.scribble(-3, Bo - 9, 4, 6, INK, 1.0, 0.35);
        const lift = p.a === 'grip' || p.a === 'point' || p.a === 'cling' ? OWL_SILL_LIFT : 0;
        const domeBase = Bo - 20 - lift;
        const domeTop = domeBase - 30;
        owlHead(pen, p, 0, domeTop + 13.5, 13, p.a === 'reading' ? 2.4 : 2);
        const dome: Pt[] = [[-16, domeBase]];
        for (let i = 1; i < 12; i++) {
            const an = Math.PI + (i / 12) * Math.PI;
            dome.push([Math.cos(an) * 16, domeBase - 12 + Math.sin(an) * 18]);
        }
        dome.push([16, domeBase]);
        if (p.a === 'thinking') fillPoly(pen, dome, SHEET, 0.55); // the glass fogs while he thinks
        glass(pen, dome, false, false);
        pen.curve([-17, domeBase], [0, domeBase + 3], [17, domeBase], W * 0.8);
        sealBand(pen, -15, 15, domeBase - 1.5);
        pen.line(-12, domeBase - 18, -10, domeBase - 6, 1.6, SHEET, 1);
        lampGlint(pen, d, 11, domeBase - 14);
    }
    arms2(pen, p, {
        sL: [-11, Bo - 16],
        sR: [11, Bo - 16],
        head: [0, Bo - 36],
        R: 12,
        chest: [0, Bo - 8],
        reach: 15,
        pointTop: Bo - 40,
        spread: 0.2,
    });
    if (p.part !== 'hands' && p.seated && p.a !== 'grip') sheet(pen, -4, -4, 13, 6, 1);
}

/** The Scribe's free arms: three quills over a sheet, one up at a wait, one at rest, and one always tapping. */
function scribeArms(pen: SketchPen, p: P2, rim: number): void {
    const tap = p.still ? 0 : Math.sin(p.t * 8) * 1.8;
    if (p.a === 'writing' || p.a === 'reading') {
        for (let i = 0; i < 3; i++)
            tentacle(
                pen,
                [-10 + i * 2, rim - 2],
                [-19 + i * 4, rim + 12 + i * 2 + (BUSY(p) ? Math.sin(p.d.frame * 0.5 + i) : 0)],
                -4,
                true,
            );
        sheet(pen, -14, rim + 18, 12, 6, p.a === 'reading' ? 2 : 1);
    } else if (p.a === 'waiting' || p.a === 'point') tentacle(pen, [-9, rim - 2], [-13, rim - 20], -4);
    else tentacle(pen, [-10, rim - 2], [-19, rim + 6], -5);
    tentacle(pen, [10, rim - 2], [18, rim + 10 + tap], 5);
}

/** The Scribe: an octopus walking an inkwell on her arm-tips like stilts. */
function octopus(pen: SketchPen, p: P2, d: SpecimenDraw, unfurl: number): void {
    const B = p.seated ? 0 : -20;
    const rim = B - 26;
    const gripping = p.a === 'grip' || p.a === 'cling';
    if (p.part !== 'hands') {
        if (!p.seated)
            for (const [i, x] of [-7, 7].entries()) {
                const k = p.walk ? Math.sin(p.t * 8 + i * 3) * 3 : 0;
                pen.curve([x, B], [x * 1.5 + k, B / 2], [x * 1.1 + k, -0.5], W * 0.85);
            }
        const level = rim + 4 + tick(p, 1.3, 6) * 2.4;
        octoMantle(pen, p, 0, rim - 8, 11, 14 * (0.6 + 0.4 * unfurl));
        fillPoly(
            pen,
            [
                [-14, level],
                [14, level],
                [14, B - 0.8],
                [-14, B - 0.8],
            ],
            INK,
            0.82,
        );
        glass(
            pen,
            [
                [-15, rim],
                [15, rim],
                [15, B],
                [-15, B],
            ],
            false,
        );
        const lip: Pt[] = [
            [-17, rim - 3.5],
            [17, rim - 3.5],
            [17, rim],
            [-17, rim],
        ];
        fillPoly(pen, lip, SHADE, 0.4);
        pen.stroke([...lip, [-17, rim - 3.5]], 1.6);
        sealBand(pen, -14, 14, rim + 1.5);
        pen.line(-12, rim + 8, -12, B - 4, 1.6, SHEET, 1);
        if (!gripping) scribeArms(pen, p, rim);
        lampGlint(pen, d, 11, rim + 8);
    }
    if (gripping)
        arms2(pen, p, {
            sL: [-12, rim],
            sR: [12, rim],
            head: [0, rim - 8],
            R: 10,
            chest: [0, rim + 6],
            reach: 20,
            pointTop: rim - 20,
        });
}

/** The Synchronizer: a snail in a caps-only hourglass, her shell a pocket watch, stalk-eyes up through the cap. */
function snail(pen: SketchPen, p: P2, d: SpecimenDraw, unfurl: number): void {
    const legLen = 20;
    const B = p.seated ? 0 : -legLen;
    const c = pen.ctx;
    c.save();
    if (p.seated) {
        c.translate(0, 1.5);
        c.rotate(0.12);
    }
    if (d.flip) {
        c.translate(0, B - 22);
        c.rotate(d.flip);
        c.translate(0, -(B - 22));
    }
    legs2(pen, p, B, legLen, 6);
    let top = B - 42;
    if (p.part !== 'hands') {
        const hg = hourglassBody(pen, p, B, 12, 18);
        top = hg.top;
        snailWatch(pen, p, 2.5, hg.waist - 10, 5.6);
        pen.ellipse(-4.6, hg.waist - 7, 2.6, 2.2, 1.4);
        stalks(pen, p, [-4, top + 1], p.hang || p.a === 'grip' ? top - 22 * unfurl : top - 20 * unfurl, [
            2.5,
            hg.waist - 10,
        ]);
        lampGlint(pen, d, 9, B - 16);
    }
    arms2(pen, p, {
        sL: [-13, top + 18],
        sR: [13, top + 18],
        head: [0, top - 8],
        R: 6,
        chest: [0, top + 22],
        reach: 18,
        pointTop: top - 10,
        spread: 0.6,
    });
    c.restore();
}

/** Hired help: the Fairground Goldfish — a tied plastic bag on two pencil legs. */
function goldfish(pen: SketchPen, p: P2, role: Role): void {
    const legLen = 20;
    const B = p.seated ? 0 : -legLen;
    legs2(pen, p, B, legLen, 5, true);
    if (p.part !== 'hands') {
        const neck = B - 34;
        const bag: Pt[] = [
            [-3, neck],
            [-9, neck + 10],
            [-12, B - 12],
            [-10, B - 2],
            [0, B + 1],
            [10, B - 2],
            [12, B - 12],
            [9, neck + 10],
            [3, neck],
        ];
        fillPoly(pen, bag, SHEET, 0.35);
        pen.line(-12, neck + 13, 12, neck + 12, 0.9, PENCIL, 0.8); // the water line
        glass(pen, bag, p.hired, false);
        // the tied knot is its skyline: a tuft, not a stopper
        pen.ellipse(-2, neck - 3, 2.6, 2.2, 1.6);
        pen.ellipse(2.4, neck - 3.4, 2.6, 2.2, 1.6, p.hired ? PENCIL : INK, 1);
        pen.line(0, neck, 0, neck - 6, 1.4);
        const spin = role === 'general' && !p.still ? Math.sin(p.mt * 2) : 1;
        const fx = role === 'explore' ? -7 : 0;
        const fy = B - 16;
        pen.ellipse(fx, fy, 5.6 * Math.abs(spin) + 1, 3.6, W * 0.8);
        pen.stroke(
            [
                [fx + 5.6 * spin, fy],
                [fx + 9.6 * spin, fy - 3.6],
                [fx + 9.6 * spin, fy + 3.6],
                [fx + 5.6 * spin, fy],
            ],
            1.4,
        );
        pen.ellipse(fx - 2.6 * spin, fy - 1, 1.0, 1.0, 1.6);
        EYE.x = 0;
        EYE.y = neck - 3;
        if (role === 'plan') {
            pen.stroke(
                [
                    [-8, neck + 16],
                    [-1, neck + 15],
                    [-1, neck + 22],
                    [-8, neck + 22.5],
                    [-8, neck + 16],
                ],
                1.0,
                PENCIL,
                0.95,
            );
            pen.line(-4.6, neck + 15.6, -4.4, neck + 22.2, 0.6, PENCIL, 0.9);
        }
        // a lab type with no species yet is still born of his flask (#00067 OQ-2)
        if (!p.hired) sealBand(pen, -3, 3, neck + 1.5);
    }
    arms2(pen, p, {
        sL: [-11, B - 16],
        sR: [11, B - 16],
        head: [0, B - 34],
        R: 6,
        chest: [0, B - 10],
        reach: 16,
        pointTop: B - 34,
        pencilR: p.hired,
        spread: 0.2,
    });
}

function lot8(pen: SketchPen, d: SpecimenDraw, role: Role): void {
    const p = prelude(d);
    // the pushed part unfurls after the birth bubble hardens, and tucks in mid-hop
    let unfurl = d.airborne ? 0.55 : 1;
    if (d.birth !== undefined) unfurl = Math.min(1, Math.max(0, (d.birth - 0.6) / 0.4));
    if (role === 'surgeon') heron(pen, p, d, unfurl);
    else if (role === 'librarian') owl(pen, p, d);
    else if (role === 'scribe') octopus(pen, p, d, unfurl);
    else if (role === 'synchronizer') snail(pen, p, d, unfurl);
    else goldfish(pen, p, role);
}

// --- the dispatcher: the birth and home morphs, then the specimen -------------------

/** A body outline per role, for the bubble morph (the birth out of the flask, the burp home). */
function outline(role: Role): Pt[] {
    if (role === 'surgeon')
        return [
            [-10, -66],
            [10, -66],
            [10, -20],
            [-10, -20],
        ];
    if (role === 'librarian') return ellPts(0, -40, 15, 20, 20);
    if (role === 'scribe')
        return [
            [-16, -50],
            [16, -50],
            [16, -20],
            [-16, -20],
        ];
    if (role === 'synchronizer')
        return [
            [-12, -62],
            [12, -62],
            [3, -42],
            [12, -23],
            [-12, -23],
            [-3, -42],
        ];
    return [
        [-14, -52],
        [14, -52],
        [10, -20],
        [-10, -20],
    ];
}

function drawFormed(pen: SketchPen, d: SpecimenDraw, role: Role): void {
    EYE.x = 0;
    EYE.y = Number.NaN;
    pen.s = 1;
    pen.jitter = 0.8;
    if (d.birth !== undefined && d.birth < 0.55) {
        if (d.part !== 'hands') morph(pen, outline(role), Math.pow(d.birth / 0.55, 1.3));
        return;
    }
    if (d.home !== undefined && d.home > 0.45) {
        if (d.part !== 'hands') morph(pen, outline(role), 1 - (d.home - 0.45) / 0.55);
        return;
    }
    lot8(pen, d, role);
}

/** One Specimen in ink, ground origin, LOCAL units. The caller translates to
 *  the figure's feet and scales by the stage's one minion scale. */
export function drawSpecimen(pen: SketchPen, d: SpecimenDraw): void {
    const c = pen.ctx;
    const k = LOT8_K * specimenFit(d.type).fit;
    c.save();
    c.scale(k, k);
    drawFormed(pen, {...d, gripY: d.gripY === undefined ? undefined : d.gripY / k}, roleOf(d.type, d.cls));
    if (d.part !== 'hands') {
        // the hands pass draws no head: keep the body pass's eye (the Kilroy readout)
        EYE_STAGE.x = EYE.x * k;
        EYE_STAGE.y = EYE.y * k;
    }
    c.restore();
}
