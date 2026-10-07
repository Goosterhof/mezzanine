// The Rail's envelope (#00067 AC-5, AC-7b), driven with measured rects.
//
// The 1440×900 rects are the R2 verdict organ's own measurement (barTop 628,
// textBottom 662.5, dividerTop 676, railY 679 — measurements.json sill[].env);
// the 1080×720 set is the same chrome at the smaller window.

import {describe, expect, it} from 'vitest';

import {
    allowedX,
    intersects,
    MIN_GRIP_H,
    type PageRect,
    type SillRects,
    sillEnvelope,
    sillRect,
    tier3Hits,
} from '../../src/observer/sill';

const rect = (name: string, [x, y, w, h]: [number, number, number, number]): PageRect => ({name, x, y, w, h});

function chrome(W: number, barTop: number): SillRects {
    return {
        bar: rect('command bar', [0, barTop, W, 48]),
        input: rect('command input', [96, barTop + 14, W - 300, 20.5]),
        stamps: [rect('DIRECT stamp', [24, barTop + 16, 60, 16]), rect('TO: stamp', [W - 190, barTop + 16, 166, 18.5])],
        divider: rect('divider', [0, barTop + 48, W, 16]),
        torn: rect('torn', [0, barTop + 64, W, 8]),
        bench: rect('bench', [0, barTop + 72, W, 200]),
        paneMs: rect('Mad Scientist pane', [0, 76, W / 2 - 0.5, barTop - 76]),
        paneHer: rect('Heretic pane', [W / 2 + 0.5, 76, W / 2 - 0.5, barTop - 76]),
    };
}

describe('the sill envelope (AC-5)', () => {
    it.each([
        ['1440×900', 1440, 628],
        ['1080×720', 1080, 448],
    ])('should seat the ceiling 3 px under the text and the rail in the divider at %s', (_label, W, barTop) => {
        const r = chrome(W, barTop);
        const env = sillEnvelope(r);
        expect(env).not.toBeNull();
        if (!env) return;
        expect(env.textBottom).toBe(barTop + 34.5);
        expect(env.ceiling).toBe(env.textBottom + 3);
        expect(env.barTop).toBe(barTop);
        expect(env.dividerTop).toBe(barTop + 48);
        expect(env.railY).toBe(env.dividerTop + 3);
        expect(env.top).toBe(env.ceiling);
        expect(env.xspan).toStrictEqual([0, W / 2 - 0.5 - 40]);
        // the sill canvas touches none of the five tier-3 rects
        expect(env.tier3).toHaveLength(5);
        expect(env.tier3.filter((t) => intersects(sillRect(env), t)).map((t) => t.name)).toStrictEqual([]);
    });

    it('should carry the measured 1440×900 numbers of the R2 organ', () => {
        const env = sillEnvelope(chrome(1440, 628));
        expect(env?.textBottom).toBe(662.5);
        expect(env?.dividerTop).toBe(676);
        expect(env?.railY).toBe(679);
    });

    it('should be null when a required rect is missing — a page mid-mount', () => {
        for (const missing of ['bar', 'input', 'divider', 'torn', 'bench', 'paneMs', 'paneHer'] as const) {
            const r: Partial<SillRects> = {...chrome(1440, 628)};
            delete r[missing];
            expect(sillEnvelope(r)).toBeNull();
        }
        expect(sillEnvelope({...chrome(1440, 628), stamps: []})).toBeNull();
    });

    it('should be null when the window leaves too little room between the ceiling and the rail', () => {
        const r = chrome(1440, 628);
        const tight = {...r, divider: {...r.divider, y: r.input.y + r.input.h + 3 + MIN_GRIP_H - 4}};
        expect(sillEnvelope(tight)).toBeNull();
    });
});

describe('the tier-3 alarm, provoked on synthetic alpha (AC-7b)', () => {
    const env = sillEnvelope(chrome(1440, 628));

    it('should name the command input when ink lands in it, and stay silent on a clean buffer', () => {
        // a buffer that DOES reach up into the bar (a deliberately wrong canvas), 2 device px per px
        const origin = {x: 0, y: 620, dpr: 2};
        const w = 1440 * 2;
        const h = 80 * 2;
        const clean = new Uint8ClampedArray(w * h);
        expect(tier3Hits({alpha: clean, w, h}, origin, env?.tier3 ?? [])).toStrictEqual([]);
        const dirty = new Uint8ClampedArray(w * h);
        // an opaque pixel inside the command input (x 300, y 650 section px)
        dirty[(650 - 620) * 2 * w + 300 * 2] = 255;
        expect(tier3Hits({alpha: dirty, w, h}, origin, env?.tier3 ?? [])).toStrictEqual(['command input']);
    });

    it('should ignore faint alpha (≤ 8): anti-aliasing is not a breach', () => {
        const w = 200;
        const h = 200;
        const faint = new Uint8ClampedArray(w * h).fill(8);
        expect(tier3Hits({alpha: faint, w, h}, {x: 0, y: 0, dpr: 1}, [rect('input', [10, 10, 50, 50])])).toStrictEqual(
            [],
        );
    });
});

describe('where a minion may climb', () => {
    const env = sillEnvelope(chrome(1440, 628));

    it('should keep the sill x inside the span, 12 px from its ends', () => {
        if (!env) throw new Error('no envelope');
        expect(allowedX(env, -50, [])).toBe(12);
        expect(allowedX(env, 5000, [])).toBe(env.xspan[1] - 12);
        expect(allowedX(env, 300, [])).toBe(300);
    });

    it('should step out of the plumb-line and the monkey to the nearer edge', () => {
        if (!env) throw new Error('no envelope');
        expect(allowedX(env, 300, [[280, 328]])).toBe(279);
        expect(allowedX(env, 320, [[280, 328]])).toBe(329);
    });
});
