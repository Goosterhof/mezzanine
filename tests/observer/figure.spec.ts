// drawScientist — the Field Journal's ink figure (#00059 J-1).
//
// jsdom has no Canvas 2D, so the figure is driven through a recording
// mock context. The specs are the acceptance criteria made executable:
// every ActivityState draws without throwing and lands at least one
// stroke; the construction ghosts add geometry only when asked for;
// figureHeadTop answers above the head, asserted against the exported
// Atelier proportions — not magic numbers.

import {describe, expect, it} from 'vitest';

import type {ActivityState} from '../../src/observer/types';

import {
    drawScientist,
    FIGURE_HEAD_CLEARANCE,
    FIGURE_HEAD_R,
    FIGURE_LEG,
    FIGURE_TORSO,
    type FigurePose,
    figureHeadTop,
} from '../../src/observer/figure';
import {SketchPen} from '../../src/observer/pen';

const ACTIVITIES: ActivityState[] = ['idle', 'thinking', 'writing', 'reading', 'running', 'waiting', 'error'];

interface RecordedCall {
    method: string;
    args: unknown[];
}

function makeRecordingContext(): {ctx: CanvasRenderingContext2D; calls: RecordedCall[]} {
    const calls: RecordedCall[] = [];
    const record =
        (method: string) =>
        (...args: unknown[]) => {
            calls.push({method, args});
        };
    const ctx = {
        beginPath: record('beginPath'),
        closePath: record('closePath'),
        moveTo: record('moveTo'),
        lineTo: record('lineTo'),
        stroke: record('stroke'),
        fill: record('fill'),
        fillRect: record('fillRect'),
        fillText: record('fillText'),
        measureText: (text: string) => ({width: text.length * 7}),
        save: record('save'),
        restore: record('restore'),
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 0,
        globalAlpha: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        font: '',
    } as unknown as CanvasRenderingContext2D;
    return {ctx, calls};
}

function pose(overrides: Partial<FigurePose> = {}): FigurePose {
    return {x: 200, groundY: 300, s: 1, activity: 'idle', walking: false, facing: 1, t: 0.5, frame: 10, ...overrides};
}

function draw(overrides: Partial<FigurePose> = {}): RecordedCall[] {
    const {ctx, calls} = makeRecordingContext();
    const pen = new SketchPen(ctx);
    pen.beginFrame(3);
    drawScientist(pen, pose(overrides));
    return calls;
}

describe('drawScientist — the figure in ink (#00059 J-1)', () => {
    describe('totality over the seven ActivityStates', () => {
        it.each(ACTIVITIES)('draws %s without throwing, with at least one stroke', (activity) => {
            const calls = draw({activity});
            expect(calls.filter((c) => c.method === 'stroke').length).toBeGreaterThan(0);
        });

        it.each(ACTIVITIES)('draws %s mid-walk without throwing', (activity) => {
            const calls = draw({activity, walking: true, facing: -1});
            expect(calls.filter((c) => c.method === 'stroke').length).toBeGreaterThan(0);
        });
    });

    describe('the construction ghosts — the signature under-drawing (§4)', () => {
        it('adds geometry when ghosts is true — the selected figure is being drawn', () => {
            const withGhosts = draw({ghosts: true});
            const withoutGhosts = draw({ghosts: false});
            expect(withGhosts.length).toBeGreaterThan(withoutGhosts.length);
        });

        it('draws no ghosts by default — unselected figures are pure ink', () => {
            const omitted = draw({});
            const explicit = draw({ghosts: false});
            expect(omitted.length).toBe(explicit.length);
        });

        it('ghosts survive every activity, error included', () => {
            for (const activity of ACTIVITIES) {
                const withGhosts = draw({activity, ghosts: true});
                const withoutGhosts = draw({activity, ghosts: false});
                expect(withGhosts.length).toBeGreaterThan(withoutGhosts.length);
            }
        });
    });

    describe('the acting — frame-dependent flourishes', () => {
        it('blinks around frame 185 — different geometry than open eyes', () => {
            const open = draw({frame: 10});
            const blinking = draw({frame: 185});
            expect(blinking).not.toStrictEqual(open);
        });

        it('flips the page late in the reading cycle', () => {
            const early = draw({activity: 'reading', frame: 10});
            const flipping = draw({activity: 'reading', frame: 140});
            expect(flipping.length).toBeGreaterThan(early.length);
        });

        it('accumulates written lines on the writing pad', () => {
            const firstLine = draw({activity: 'writing', frame: 10});
            const fourthLine = draw({activity: 'writing', frame: 230});
            expect(fourthLine.length).toBeGreaterThan(firstLine.length);
        });

        it('taps the waiting foot on alternating beats', () => {
            const tapDown = draw({activity: 'waiting', frame: 0});
            const tapUp = draw({activity: 'waiting', frame: 14});
            expect(tapDown).not.toStrictEqual(tapUp);
        });

        it('writes the thinking ? and the error !! in Caveat on the page', () => {
            const thinking = draw({activity: 'thinking'});
            const thinkingTexts = thinking.filter((c) => c.method === 'fillText').map((c) => c.args[0]);
            expect(thinkingTexts).toContain('?');

            const error = draw({activity: 'error'});
            const errorTexts = error.filter((c) => c.method === 'fillText').map((c) => c.args[0]);
            expect(errorTexts).toContain('!!');
        });

        it('splats ink when the experiment goes critical', () => {
            const calm = draw({activity: 'idle'});
            const critical = draw({activity: 'error'});
            const fills = (calls: RecordedCall[]) => calls.filter((c) => c.method === 'fill').length;
            expect(fills(critical)).toBeGreaterThan(fills(calm));
        });
    });

    describe('figureHeadTop — the plumb-line landing pad', () => {
        it('answers above the head-centre, per the exported Atelier proportions', () => {
            // The head centre sits at groundY − LEG − TORSO − CLEARANCE (s=1);
            // the top of the hair must be above it.
            expect(figureHeadTop(300, 1)).toBeLessThan(300 - FIGURE_LEG - FIGURE_TORSO - FIGURE_HEAD_CLEARANCE);
        });

        it('scales linearly with s', () => {
            const unit = 300 - figureHeadTop(300, 1);
            const doubled = 300 - figureHeadTop(300, 2);
            expect(doubled).toBeCloseTo(unit * 2);
        });

        it('derives from the exported proportions exactly', () => {
            const expected = 300 - FIGURE_LEG - FIGURE_TORSO - FIGURE_HEAD_CLEARANCE - FIGURE_HEAD_R * 1.55;
            expect(figureHeadTop(300, 1)).toBeCloseTo(expected);
        });
    });
});
