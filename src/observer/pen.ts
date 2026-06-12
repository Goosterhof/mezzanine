// The ink toolkit — the Field Journal's pen (#00059 J-1), ported from
// the ratified Atelier mock (`prototypes/the-atelier/src/sketch/pen.ts`).
// Every stroke is subdivided, jittered by a seeded rng, and double-passed;
// the seed advances at the boil rate (caller's BOIL_HOLD), so the ink
// wobbles while the skeleton underneath moves at 60fps.
//
// Colour truth lives here. The palette constants below are the page's
// single source of ink: `scene.js` draws with them, and `src/shell/`
// components import them across the slice boundary (blessed in #00059
// §6 — constants cross the boundary; logic does not).

export const INK = '#2b2620';
export const PENCIL = '#7a8088';
export const RED = '#c0392b';
export const MINT = '#1fa97a';
export const AMBER = '#c98a2d';
export const SKIN = '#e0b886';
export const SHADE = '#8a8273';
/** The page itself — shared by the scene's paper pre-render and
 *  `TornPaperEdge.vue`'s SVG fill so the two surfaces cannot drift
 *  (#00059 §10 divergence #6). */
export const PAPER = '#f3ecdc';

export type Pt = [number, number];

/** Deterministic chaos — inlined from the Atelier's
 *  `prototypes/util.ts` (`lab-core.js` was grepped pre-inscription and
 *  carries no `mulberry32`; #00059 §10 divergence #5). */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class SketchPen {
    /** scale unit — multiplies stroke widths and jitter amplitude */
    s = 1;
    /** jitter multiplier — error states crank this up */
    jitter = 1;
    private shapeIdx = 0;
    private seed = 0;

    constructor(readonly ctx: CanvasRenderingContext2D) {}

    /** Call once per rendered frame with the current boil seed. */
    beginFrame(seed: number): void {
        this.seed = seed;
        this.shapeIdx = 0;
    }

    private rngFor(pass: number, slow = false): () => number {
        const sd = slow ? Math.floor(this.seed / 2) : this.seed;
        return mulberry32(sd * 7919 + this.shapeIdx * 131 + pass * 17);
    }

    /** Jittered polyline, double-stroked — the boiling ink workhorse. */
    stroke(pts: Pt[], width = 2.2, color = INK, alpha = 1): void {
        const {ctx} = this;
        for (let pass = 0; pass < 2; pass++) {
            const rng = this.rngFor(pass);
            const J = 2.4 * this.s * this.jitter;
            ctx.strokeStyle = color;
            ctx.lineWidth = width * this.s * (pass === 0 ? 1 : 0.65);
            ctx.globalAlpha = alpha * (pass === 0 ? 0.9 : 0.4);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            for (const [i, [x, y]] of pts.entries()) {
                const jx = x + (rng() - 0.5) * J;
                const jy = y + (rng() - 0.5) * J;
                if (i === 0) ctx.moveTo(jx, jy);
                else ctx.lineTo(jx, jy);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        this.shapeIdx++;
    }

    sub(x1: number, y1: number, x2: number, y2: number, n = 5): Pt[] {
        const pts: Pt[] = [];
        for (let i = 0; i <= n; i++) pts.push([x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
        return pts;
    }

    line(x1: number, y1: number, x2: number, y2: number, width = 2.2, color = INK, alpha = 1): void {
        // long strokes get more subdivisions so the boil stays organic
        const n = Math.hypot(x2 - x1, y2 - y1) > 90 * this.s ? 10 : 5;
        this.stroke(this.sub(x1, y1, x2, y2, n), width, color, alpha);
    }

    /** Quadratic curve, sampled then jittered. */
    curve(p0: Pt, p1: Pt, p2: Pt, width = 2.2, color = INK, alpha = 1): void {
        const pts: Pt[] = [];
        for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            const a = 1 - t;
            pts.push([
                a * a * p0[0] + 2 * a * t * p1[0] + t * t * p2[0],
                a * a * p0[1] + 2 * a * t * p1[1] + t * t * p2[1],
            ]);
        }
        this.stroke(pts, width, color, alpha);
    }

    ellipse(ex: number, ey: number, rx: number, ry: number, width = 2.2, color = INK, alpha = 1): void {
        const pts: Pt[] = [];
        for (let i = 0; i <= 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            pts.push([ex + Math.cos(a) * rx, ey + Math.sin(a) * ry]);
        }
        this.stroke(pts, width, color, alpha);
    }

    /** Two parallel jittered lines — a limb (or table leg) with volume. */
    tube(x1: number, y1: number, x2: number, y2: number, gap: number, width = 2.0): void {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * gap;
        const ny = (dx / len) * gap;
        this.line(x1 + nx, y1 + ny, x2 + nx, y2 + ny, width);
        this.line(x1 - nx, y1 - ny, x2 - nx, y2 - ny, width);
    }

    /** A two-segment sleeve: shoulder → elbow → hand, with cuff + hand. */
    arm(sh: Pt, el: Pt, hd: Pt): void {
        const g = 3.2 * this.s;
        this.tube(sh[0], sh[1], el[0], el[1], g);
        this.tube(el[0], el[1], hd[0], hd[1], g);
        const dx = hd[0] - el[0];
        const dy = hd[1] - el[1];
        const len = Math.hypot(dx, dy) || 1;
        const cufX = hd[0] - (dx / len) * 6 * this.s;
        const cufY = hd[1] - (dy / len) * 6 * this.s;
        this.line(cufX - (-dy / len) * g, cufY - (dx / len) * g, cufX + (-dy / len) * g, cufY + (dx / len) * g, 1.8);
        this.ellipse(hd[0], hd[1], 3.6 * this.s, 3.6 * this.s, 1.8);
    }

    scribble(sx: number, sy: number, r: number, n: number, color = INK, width = 1.5, alpha = 0.85): void {
        const {ctx} = this;
        const rng = this.rngFor(0);
        ctx.strokeStyle = color;
        ctx.lineWidth = width * this.s;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(sx + (rng() - 0.5) * r, sy + (rng() - 0.5) * r);
        for (let i = 0; i < n; i++) ctx.lineTo(sx + (rng() - 0.5) * 2 * r, sy + (rng() - 0.5) * 2 * r);
        ctx.stroke();
        ctx.globalAlpha = 1;
        this.shapeIdx++;
    }

    /** Irregular watercolour blob — slow seed so washes shimmer, not flicker. */
    wash(wx: number, wy: number, r: number, color: string, alpha: number): void {
        const {ctx} = this;
        const rng = this.rngFor(0, true);
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const rr = r * (0.78 + rng() * 0.4);
            const xx = wx + Math.cos(a) * rr;
            const yy = wy + Math.sin(a) * rr * 0.88;
            if (i === 0) ctx.moveTo(xx, yy);
            else ctx.lineTo(xx, yy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        this.shapeIdx++;
    }

    /** Ink splatter: blob + droplet tails. */
    splat(sx: number, sy: number, r: number, color = INK): void {
        this.wash(sx, sy, r, color, 0.65);
        const rng = this.rngFor(1);
        for (let i = 0; i < 5; i++) {
            const a = rng() * Math.PI * 2;
            const d = r * (1.1 + rng() * 1.6);
            this.wash(sx + Math.cos(a) * d, sy + Math.sin(a) * d, r * (0.12 + rng() * 0.2), color, 0.6);
        }
    }
}
