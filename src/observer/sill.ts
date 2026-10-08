// The Rail's envelope (#00067 P2, #00042 §7.4): where a minion may stand when
// it climbs out of the bench and over the brass, measured from the page every
// time the layout moves, never hard-coded.
//
// The command bar is TIER 3: the investor's own writing (the input and its two
// stamps) and both terminal panes. Nothing of a minion may ever paint there.
// The sill canvas's top edge IS the ceiling (the lowest bottom of the input
// and both stamps, + 3), so the canvas physically cannot reach the investor's
// text; `tier3Hits` is the alarm that proves it on real pixels.
//
// MOVED from the ruled prototype (prototypes/mezzanine-minion-errand,
// `stage.ts` `measureEnv` + `tier3Breaches`, `specimens.ts` `allowedX`), split
// into a pure envelope over measured rects (here) and the DOM read
// (ConversationPage.vue). No canvas, no `getImageData`: jsdom can drive it.

/** A rect in the conversation section's own coordinates (px). */
export interface PageRect {
    x: number;
    y: number;
    w: number;
    h: number;
    name: string;
}

export interface SillRects {
    bar: PageRect;
    input: PageRect;
    stamps: PageRect[];
    divider: PageRect;
    torn: PageRect;
    bench: PageRect;
    paneMs: PageRect;
    paneHer: PageRect;
}

export interface SillEnvelope {
    /** the sill canvas's placement: its top edge is the ceiling */
    x: number;
    top: number;
    w: number;
    h: number;
    W: number;
    H: number;
    barTop: number;
    dividerTop: number;
    /** the brass top-rail's upper edge */
    railY: number;
    tornTop: number;
    benchTop: number;
    benchBottom: number;
    /** the bench canvas's left edge (its drawing x 0) */
    benchLeft: number;
    /** the lowest bottom of the command input and both stamps */
    textBottom: number;
    /** textBottom + 3: no minion ink above this line */
    ceiling: number;
    /** where a minion may climb: the Mad Scientist's pane, minus 40 px at the gap */
    xspan: [number, number];
    tier3: PageRect[];
}

/** The rail sits 3 px into the divider: its border, then the 2 px top-rail. */
const RAIL_INSET = 3;
/** Below this much room between the ceiling and the rail, nothing grips: the sill is skipped. */
export const MIN_GRIP_H = 8;

const REQUIRED = ['bar', 'input', 'divider', 'torn', 'bench', 'paneMs', 'paneHer'] as const;

/**
 * The envelope, or null — a legitimate state, never an error: a required rect
 * is absent (a page mid-mount), or the window leaves too little room between
 * the ceiling and the rail. A null sill skips the grip (never replayed), keeps
 * a permission waiter at its post, and puts the Chaos Monkey in its compact
 * posture.
 */
export function sillEnvelope(r: Partial<SillRects>): SillEnvelope | null {
    if (REQUIRED.some((k) => r[k] === undefined) || !r.stamps || r.stamps.length < 2) return null;
    const {bar, input, divider, torn, bench, paneMs, paneHer} = r as SillRects;
    const textBottom = Math.max(input.y + input.h, ...r.stamps.map((s) => s.y + s.h));
    const ceiling = textBottom + 3;
    const railY = divider.y + RAIL_INSET;
    if (railY - ceiling < MIN_GRIP_H) return null;
    const W = Math.max(bar.x + bar.w, bench.x + bench.w);
    const benchBottom = bench.y + bench.h;
    return {
        x: 0,
        top: ceiling,
        w: W,
        h: benchBottom - ceiling,
        W,
        H: benchBottom,
        barTop: bar.y,
        dividerTop: divider.y,
        railY,
        tornTop: torn.y,
        benchTop: bench.y,
        benchBottom,
        benchLeft: bench.x,
        textBottom,
        ceiling,
        xspan: [paneMs.x, paneMs.x + paneMs.w - 40],
        tier3: [input, ...r.stamps, paneMs, paneHer],
    };
}

export function intersects(a: PageRect, b: PageRect): boolean {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The sill canvas itself, as a rect. */
export function sillRect(env: SillEnvelope): PageRect {
    return {x: env.x, y: env.top, w: env.w, h: env.h, name: 'sill'};
}

/**
 * The tier-3 alarm's pure core: the names of the tier-3 rects that hold any
 * pixel with alpha > 8 in an alpha buffer (one byte per pixel, `w` × `h`,
 * DEVICE px) whose top-left sits at `origin` (section px) and covers `dpr`
 * device px per section px.
 */
export function tier3Hits(
    buf: {alpha: Uint8ClampedArray; w: number; h: number},
    origin: {x: number; y: number; dpr: number},
    rects: PageRect[],
): string[] {
    const hits: string[] = [];
    for (const r of rects) {
        const x0 = Math.max(0, Math.floor((r.x - origin.x) * origin.dpr));
        const y0 = Math.max(0, Math.floor((r.y - origin.y) * origin.dpr));
        const x1 = Math.min(buf.w, Math.ceil((r.x + r.w - origin.x) * origin.dpr));
        const y1 = Math.min(buf.h, Math.ceil((r.y + r.h - origin.y) * origin.dpr));
        if (anyInk(buf, {x0, y0, x1, y1})) hits.push(r.name);
    }
    return hits;
}

function anyInk(
    buf: {alpha: Uint8ClampedArray; w: number},
    box: {x0: number; y0: number; x1: number; y1: number},
): boolean {
    for (let y = box.y0; y < box.y1; y++)
        for (let x = box.x0; x < box.x1; x++) if ((buf.alpha[y * buf.w + x] ?? 0) > 8) return true;
    return false;
}

/**
 * A sill x for `want` inside the climbable span, nudged out of each avoided
 * band (±24 at the plumb-line, ±32 at the monkey's hang) to its nearer edge.
 */
export function allowedX(env: SillEnvelope, want: number, avoid: [number, number][]): number {
    const [lo, hi] = env.xspan;
    let x = Math.max(lo + 12, Math.min(hi - 12, want));
    for (let guard = 0; guard < 4; guard++) {
        const band = avoid.find(([a, z]) => x > a && x < z);
        if (!band) break;
        x = x - band[0] < band[1] - x ? band[0] - 1 : band[1] + 1;
        if (x > hi - 12) x = band[0] - 1;
    }
    return x;
}
