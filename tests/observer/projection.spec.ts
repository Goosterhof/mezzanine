import {describe, expect, it} from 'vitest';

import type {ActivityState} from '../../src/observer/types';

import {FIGURE_HEAD_CLEARANCE, FIGURE_HEAD_R, FIGURE_LEG, FIGURE_TORSO} from '../../src/observer/figure';
import {
    BENCH_BAND_H,
    BENCH_STATIONS,
    BENCH_STRIP_H,
    FIGURE_SCALE,
    FIGURE_UNITS,
    GROUND_INSET,
    SHORT_WINDOW_H,
    benchGeometry,
    benchStationX,
    floorPointToPage,
    isActivityState,
    parseRecallScientistAction,
    parseSelectScientistAction,
    plumbLanding,
    recallScientistAction,
    restFacing,
    selectScientistAction,
    washOpacity,
    washStrength,
} from '../../src/observer/projection';

/** A geometry without its posture fields — what the drawing itself is. */
function drawing(geo: ReturnType<typeof benchGeometry>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(geo).filter(([key]) => !['bandH', 'cropTop', 'compact'].includes(key)));
}

const STATES: ActivityState[] = ['idle', 'thinking', 'writing', 'reading', 'running', 'waiting', 'error'];

describe('the band — 200 px authored, 64 px cropped (#00041 §5.3)', () => {
    it('fixes the band at 200 px and the compact posture at 64 px — never 40vh', () => {
        expect(BENCH_BAND_H).toBe(200);
        expect(BENCH_STRIP_H).toBe(64);
        expect(SHORT_WINDOW_H).toBe(820);
    });

    it('draws a 140 px colleague: s = bandH × 0.70 / 173.45', () => {
        expect(FIGURE_UNITS).toBeCloseTo(FIGURE_LEG + FIGURE_TORSO + FIGURE_HEAD_CLEARANCE + FIGURE_HEAD_R * 1.55);
        expect(FIGURE_UNITS).toBeCloseTo(173.45, 2);
        expect(FIGURE_SCALE * FIGURE_UNITS).toBeCloseTo(140, 6);
        expect(benchGeometry(1440, false).figureH).toBeCloseTo(140, 6);
    });

    it('stands everything on one ground line 10 px above the band bottom, the benchtop at elbow height', () => {
        const geo = benchGeometry(1440, false);
        expect(geo.groundY).toBe(BENCH_BAND_H - GROUND_INSET);
        expect(geo.groundY - geo.benchTopY).toBeCloseTo(0.42 * 140, 6);
        // head and torso clear the benchtop
        expect(geo.headTopY).toBeLessThan(geo.benchTopY - 60);
    });

    it('is the same drawing in both postures — the crop only moves the window (§5.7)', () => {
        const full = benchGeometry(1440, false);
        const crop = benchGeometry(1440, true);
        expect(full.cropTop).toBe(0);
        expect(full.bandH).toBe(200);
        expect(crop.bandH).toBe(64);
        const fullDrawing = drawing(full);
        const cropDrawing = drawing(crop);
        expect(cropDrawing).toStrictEqual(fullDrawing);
    });

    it('anchors the crop on the heads: both bell mouths inside, the hair crown within 4 px of the top', () => {
        const crop = benchGeometry(1440, true);
        expect(crop.bellTopY - crop.cropTop).toBeGreaterThan(0);
        expect(crop.bellTopY + 8).toBeLessThanOrEqual(crop.cropTop + crop.bandH);
        expect(crop.cropTop - crop.headTopY).toBeLessThan(4);
        expect(crop.archApexY).toBeGreaterThanOrEqual(crop.cropTop);
    });

    it('never produces a zero-width geometry', () => {
        expect(benchGeometry(0, false).w).toBe(1);
    });
});

describe('the thirds and the shared middle', () => {
    const geo = benchGeometry(1200, false);

    it("centres each colleague's home under their own pane", () => {
        expect(geo.home['mad-scientist']).toBe(300);
        expect(geo.home.heretic).toBe(900);
    });

    it('raises the two bells in the middle third, and has the receiver stand beside — never on — its bell', () => {
        expect(geo.bell['mad-scientist']).toBe(480);
        expect(geo.bell.heretic).toBe(720);
        expect(geo.atBell['mad-scientist']).toBeLessThan(geo.bell['mad-scientist']);
        expect(geo.atBell.heretic).toBeGreaterThan(geo.bell.heretic);
    });

    it('faces each colleague toward the middle at rest', () => {
        expect(restFacing('mad-scientist')).toBe(1);
        expect(restFacing('heretic')).toBe(-1);
    });
});

describe('the 1-D station table (§5.3)', () => {
    it('carries a station for every activity state, all inside their own half', () => {
        for (const state of STATES) {
            expect(benchStationX(1000, 'mad-scientist', state)).toBeLessThan(500);
            expect(benchStationX(1000, 'heretic', state)).toBeGreaterThan(500);
        }
    });

    it("mirrors the Heretic's stations into the right third", () => {
        for (const state of STATES) {
            expect(benchStationX(1000, 'heretic', state)).toBeCloseTo(
                1000 - benchStationX(1000, 'mad-scientist', state),
            );
        }
    });

    it('walks `thinking` toward the middle — the one state that brings them closer', () => {
        const toward = BENCH_STATIONS.thinking;
        for (const state of STATES.filter((s) => s !== 'thinking')) {
            expect(BENCH_STATIONS[state]).toBeLessThan(toward);
        }
    });

    it('puts `writing` and `idle` at the desk under the pane centre', () => {
        expect(benchStationX(1440, 'mad-scientist', 'writing')).toBe(360);
        expect(benchStationX(1440, 'mad-scientist', 'idle')).toBe(360);
    });

    it('falls back to the idle station for an unknown activity', () => {
        expect(benchStationX(1440, 'heretic', 'exploding')).toBe(benchStationX(1440, 'heretic', 'idle'));
    });

    it('narrows activity strings to the seven-state union', () => {
        for (const state of STATES) expect(isActivityState(state)).toBe(true);
        expect(isActivityState('exploding')).toBe(false);
        expect(isActivityState('')).toBe(false);
    });
});

describe('the plumb-line lands on the figure (trip-wire 8)', () => {
    it('lands on the top of the head at the x it is given, in canvas coordinates', () => {
        const geo = benchGeometry(1440, false);
        expect(plumbLanding(geo, 412.5)).toStrictEqual({x: 412.5, y: geo.headTopY});
    });

    it('lands on the VISIBLE head in the crop, never above the strip', () => {
        const crop = benchGeometry(1440, true);
        const point = plumbLanding(crop, 300);
        expect(point.x).toBe(300);
        expect(point.y).toBeGreaterThanOrEqual(3);
        expect(point.y).toBeLessThan(crop.bandH);
    });
});

describe('the wash — a total function of ActivityState, lifted from the struck pools', () => {
    it.each(['idle', 'waiting'] as ActivityState[])('%s washes at ambient 0.4', (state) => {
        expect(washOpacity(state)).toBe(0.4);
    });

    it.each(['thinking', 'writing', 'reading', 'running', 'error'] as ActivityState[])(
        '%s washes bright at 0.85 — the crash burns, it does not dim',
        (state) => {
            expect(washOpacity(state)).toBe(0.85);
        },
    );

    it('rejects a state outside the union at runtime', () => {
        expect(() => washOpacity('exploding' as ActivityState)).toThrow('unreachable activity state');
    });

    it('lifts the selected figure a notch above its state', () => {
        expect(washStrength('idle', true)).toBeCloseTo(0.56);
        expect(washStrength('idle', false)).toBe(0.4);
    });
});

describe('floorPointToPage — the canvas offset', () => {
    it('is the canvas offset when the bench renders 1:1', () => {
        const rect = {left: 0, top: 700, width: 1440, height: 200};
        expect(floorPointToPage({x: 360, y: 50}, {w: 1440, h: 200}, rect)).toStrictEqual({x: 360, y: 750});
    });

    it('still honours a scaled host rather than lying about it', () => {
        const rect = {left: 10, top: 0, width: 2880, height: 400};
        expect(floorPointToPage({x: 360, y: 50}, {w: 1440, h: 200}, rect)).toStrictEqual({x: 730, y: 100});
    });
});

describe('the selectScientist wire format — one definition, two ends', () => {
    it('round-trips a scientist id through build and parse', () => {
        expect(parseSelectScientistAction(selectScientistAction('abc-123'))).toBe('abc-123');
    });

    it('returns null for an absent action', () => {
        expect(parseSelectScientistAction(undefined)).toBeNull();
    });

    it('returns null for foreign interaction actions', () => {
        expect(parseSelectScientistAction('pauseLab')).toBeNull();
        expect(parseSelectScientistAction('recallScientist:abc')).toBeNull();
    });

    it('returns null for an empty id — no phantom roster.select("")', () => {
        expect(parseSelectScientistAction('selectScientist:')).toBeNull();
    });
});

describe('the recallScientist wire format — the [ recall ] note’s pathway (#00059 J-3)', () => {
    it('round-trips a scientist id through build and parse', () => {
        expect(recallScientistAction('abc-123')).toBe('recallScientist:abc-123');
        expect(parseRecallScientistAction(recallScientistAction('abc-123'))).toBe('abc-123');
    });

    it('returns null for an absent action', () => {
        expect(parseRecallScientistAction(undefined)).toBeNull();
    });

    it('returns null for foreign interaction actions — selection never recalls', () => {
        expect(parseRecallScientistAction(selectScientistAction('abc'))).toBeNull();
    });

    it('returns null for an empty id — no phantom backend.recall("")', () => {
        expect(parseRecallScientistAction('recallScientist:')).toBeNull();
    });
});
