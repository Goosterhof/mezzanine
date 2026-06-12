import {describe, expect, it} from 'vitest';

import {
    MINION_OFFSETS,
    STRIP_CSS_HEIGHT,
    STRIP_H,
    STRIP_SPRITE_Y,
    clampToFloorWalls,
    floorPointToPage,
    floorSize,
    isActivityState,
    minionStation,
    parseRecallScientistAction,
    parseSelectScientistAction,
    recallScientistAction,
    selectScientistAction,
    stationFor,
    stationTable,
    stripSlot,
} from '../../src/observer/projection';

// The scene's real plan: TILE 16, COLS 31, ROWS 16 (lab-core.js).
const PLAN = {tile: 16, w: 496, h: 256};

describe('stationTable', () => {
    it('carries a station for every one of the seven activity states', () => {
        const table = stationTable(PLAN.tile);
        for (const state of ['idle', 'thinking', 'writing', 'reading', 'running', 'waiting', 'error'] as const) {
            expect(table[state].x).toBeGreaterThan(0);
            expect(table[state].y).toBeGreaterThan(0);
        }
    });

    it('places the idle station at tile (9, 7) — the floor center the sprite returns to', () => {
        expect(stationTable(16).idle).toStrictEqual({x: 144, y: 112});
    });

    it('scales every station linearly with the tile size', () => {
        const single = stationTable(1);
        const double = stationTable(2);
        for (const state of ['idle', 'thinking', 'writing', 'reading', 'running', 'waiting', 'error'] as const) {
            expect(double[state]).toStrictEqual({x: single[state].x * 2, y: single[state].y * 2});
        }
    });
});

describe('isActivityState / stationFor', () => {
    it('recognizes all seven members of the union', () => {
        for (const state of ['idle', 'thinking', 'writing', 'reading', 'running', 'waiting', 'error']) {
            expect(isActivityState(state)).toBe(true);
        }
    });

    it('rejects strings outside the union', () => {
        expect(isActivityState('exploding')).toBe(false);
        expect(isActivityState('')).toBe(false);
    });

    it('returns the matching station for a known activity', () => {
        expect(stationFor('error', 16)).toStrictEqual({x: 240, y: 128});
    });

    it('falls back to the idle station for an unknown activity', () => {
        expect(stationFor('exploding', 16)).toStrictEqual(stationTable(16).idle);
    });
});

describe('clampToFloorWalls', () => {
    it('leaves a point already inside the walls untouched', () => {
        expect(clampToFloorWalls({x: 100, y: 100}, PLAN)).toStrictEqual({x: 100, y: 100});
    });

    it('clamps to the left and top walls', () => {
        expect(clampToFloorWalls({x: -50, y: -50}, PLAN)).toStrictEqual({x: PLAN.tile + 4, y: PLAN.tile * 3 + 4});
    });

    it('clamps to the right and bottom walls', () => {
        expect(clampToFloorWalls({x: 9999, y: 9999}, PLAN)).toStrictEqual({
            x: PLAN.w - PLAN.tile - 10,
            y: PLAN.h - PLAN.tile * 2 - 14,
        });
    });
});

describe('minionStation', () => {
    it('flanks the activity station with the first two offsets', () => {
        const base = stationFor('thinking', PLAN.tile);
        expect(minionStation('thinking', 0, PLAN)).toStrictEqual({x: base.x - 20, y: base.y + 8});
        expect(minionStation('thinking', 1, PLAN)).toStrictEqual({x: base.x + 20, y: base.y + 8});
    });

    it('wraps the offset table for the fifth minion onward', () => {
        expect(minionStation('writing', 4, PLAN)).toStrictEqual(minionStation('writing', 0, PLAN));
        expect(minionStation('writing', 7, PLAN)).toStrictEqual(minionStation('writing', 3, PLAN));
    });

    it('clamps stations near the walls so no sprite stands in the wainscoting', () => {
        // A cramped plan forces the clamp to bite on both axes: reading's
        // station y (80) + dy (8) = 88 exceeds the bottom wall at 82.
        const tinyPlan = {tile: 16, w: 64, h: 128};
        const pos = minionStation('reading', 1, tinyPlan);
        expect(pos.x).toBeGreaterThanOrEqual(tinyPlan.tile + 4);
        expect(pos.x).toBeLessThanOrEqual(tinyPlan.w - tinyPlan.tile - 10);
        expect(pos.y).toBeGreaterThanOrEqual(tinyPlan.tile * 3 + 4);
        expect(pos.y).toBeLessThanOrEqual(tinyPlan.h - tinyPlan.tile * 2 - 14);
    });

    it('never produces NaN coordinates, even from a negative index', () => {
        const pos = minionStation('idle', -1, PLAN);
        expect(Number.isFinite(pos.x)).toBe(true);
        expect(Number.isFinite(pos.y)).toBe(true);
        // Euclidean wrap: -1 lands on the last offset, not on undefined.
        expect(pos).toStrictEqual(minionStation('idle', MINION_OFFSETS.length - 1, PLAN));
    });
});

describe('stripSlot — the 64px single-row projection', () => {
    it('centers a lone sprite at half the floor width', () => {
        expect(stripSlot(0, 1, PLAN.w)).toStrictEqual({x: PLAN.w / 2, y: STRIP_SPRITE_Y});
    });

    it('spaces N sprites evenly along one row', () => {
        const count = 3;
        const xs = [0, 1, 2].map((i) => stripSlot(i, count, PLAN.w).x);
        expect(xs).toStrictEqual([124, 248, 372]);
    });

    it('keeps every slot on the single strip row', () => {
        for (let i = 0; i < 8; i++) {
            expect(stripSlot(i, 8, PLAN.w).y).toBe(STRIP_SPRITE_Y);
        }
    });

    it('rounds slot positions to whole pixels — pixel-art never sits between pixels', () => {
        for (let i = 0; i < 7; i++) {
            expect(Number.isInteger(stripSlot(i, 7, PLAN.w).x)).toBe(true);
        }
    });

    it('keeps every slot inside the floor width', () => {
        for (const count of [1, 2, 5, 12, 99]) {
            for (let i = 0; i < count; i++) {
                const {x} = stripSlot(i, count, PLAN.w);
                expect(x).toBeGreaterThan(0);
                expect(x).toBeLessThan(PLAN.w);
            }
        }
    });
});

describe('floorSize', () => {
    it('reports the full floor plan when the strip is off', () => {
        expect(floorSize(false, PLAN)).toStrictEqual({w: PLAN.w, h: PLAN.h});
    });

    it('reports the strip height when the strip is on — width never changes', () => {
        expect(floorSize(true, PLAN)).toStrictEqual({w: PLAN.w, h: STRIP_H});
    });

    it('blits the strip at exactly twice its logical height — the 64px contract', () => {
        expect(STRIP_CSS_HEIGHT).toBe(STRIP_H * 2);
        expect(STRIP_CSS_HEIGHT).toBe(64);
    });
});

describe('floorPointToPage — the CSS-scale correction (§11)', () => {
    const size = {w: 496, h: 256};

    it('is the identity when the canvas renders at logical size at the page origin', () => {
        const rect = {left: 0, top: 0, width: 496, height: 256};
        expect(floorPointToPage({x: 144, y: 112}, size, rect)).toStrictEqual({x: 144, y: 112});
    });

    it('scales with the canvas when CSS displays it larger than logical', () => {
        const rect = {left: 0, top: 0, width: 992, height: 512};
        expect(floorPointToPage({x: 144, y: 112}, size, rect)).toStrictEqual({x: 288, y: 224});
    });

    it('offsets by the canvas position on the page', () => {
        const rect = {left: 10, top: 600, width: 496, height: 256};
        expect(floorPointToPage({x: 144, y: 112}, size, rect)).toStrictEqual({x: 154, y: 712});
    });

    it('projects strip coordinates through the strip-height denominator', () => {
        // Strip: logical 32 tall, blitted at 64 CSS px → y 12 lands at 24.
        const rect = {left: 0, top: 0, width: 496, height: STRIP_CSS_HEIGHT};
        const projected = floorPointToPage({x: 248, y: STRIP_SPRITE_Y}, {w: 496, h: STRIP_H}, rect);
        expect(projected).toStrictEqual({x: 248, y: 24});
    });
});

describe('the selectScientist wire format — one definition, two ends', () => {
    it('round-trips a scientist id through build and parse', () => {
        expect(parseSelectScientistAction(selectScientistAction('sci-42'))).toBe('sci-42');
    });

    it('returns null for an absent action', () => {
        expect(parseSelectScientistAction(undefined)).toBeNull();
    });

    it('returns null for foreign interaction actions', () => {
        expect(parseSelectScientistAction('openPanel:holotable')).toBeNull();
        expect(parseSelectScientistAction('teslaCoil')).toBeNull();
    });

    it('returns null for an empty id — no phantom roster.select("")', () => {
        expect(parseSelectScientistAction('selectScientist:')).toBeNull();
    });
});

describe('the recallScientist wire format — the [ recall ] note\u2019s pathway (#00059 J-3)', () => {
    it('round-trips a scientist id through build and parse', () => {
        expect(parseRecallScientistAction(recallScientistAction('42'))).toBe('42');
        expect(parseRecallScientistAction(recallScientistAction('sci-uuid-7'))).toBe('sci-uuid-7');
    });

    it('returns null for an absent action', () => {
        expect(parseRecallScientistAction(undefined)).toBeNull();
    });

    it('returns null for foreign interaction actions — selection never recalls', () => {
        expect(parseRecallScientistAction(selectScientistAction('sci-42'))).toBeNull();
        expect(parseRecallScientistAction('openPanel:holotable')).toBeNull();
    });

    it('returns null for an empty id — no phantom backend.recall("")', () => {
        expect(parseRecallScientistAction('recallScientist:')).toBeNull();
    });

    it('never collides with the selection prefix — the two wires stay distinct', () => {
        expect(parseSelectScientistAction(recallScientistAction('sci-42'))).toBeNull();
    });
});
