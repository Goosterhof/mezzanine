// LabFloor — the permanent lower storey (#00057).
//
// The LabScene is mocked out (its scene.js host needs a Canvas 2D
// context jsdom does not provide). These specs assert the Overlook's
// non-negotiables: the floor exists in both states at >= 64px, the
// empty voice lives on the floor, the light pools are a total function
// of ActivityState, and RAF gating answers to window focus + reduced
// motion — not to any panel.

import {mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {nextTick} from 'vue';

import type {ActivityState} from '../../src/observer/types';
import type {Scientist} from '../../src/roster/types';

import LabFloor from '../../src/observer/LabFloor.vue';
import {useObserver} from '../../src/observer/useObserver';
import {useRoster} from '../../src/roster/useRoster';

const pauseRaf = vi.fn<() => void>();
const resumeRaf = vi.fn<() => void>();
const getStationPos = vi.fn<(id: string) => {x: number; y: number}>(() => ({x: 96, y: 80}));
const getFloorSize = vi.fn<() => {w: number; h: number}>(() => ({w: 448, h: 256}));
const fakeCanvas = typeof document === 'undefined' ? null : document.createElement('canvas');

// The chronicle-driven activity map, made directly steerable. The real
// useObserver only mutates its map through transcript inference; these
// specs need to place every member of the ActivityState union under a
// pool without forging seven transcript shapes.
const {activityFixture} = vi.hoisted(() => ({
    activityFixture: {map: new Map<string, {state: string; detail: string; lastEventAt: number}>()},
}));

vi.mock('../../src/observer/useObserver', async (importOriginal) => {
    // Type-only references to the top-level imports — erased at runtime,
    // so no circularity with the mocked module.
    const actual = (await importOriginal()) as {useObserver: typeof useObserver};
    return {
        ...actual,
        useObserver: () =>
            ({...actual.useObserver(), activities: {value: activityFixture.map}}) as unknown as ReturnType<
                typeof actual.useObserver
            >,
    };
});

vi.mock('../../src/observer/LabScene.vue', () => ({
    default: {
        name: 'LabScene',
        props: {strip: {type: Boolean, default: false}},
        setup(_props: unknown, {expose}: {expose: (api: Record<string, unknown>) => void}) {
            expose({pauseRaf, resumeRaf, getStationPos, getFloorSize, getCanvasEl: () => fakeCanvas});
            return {};
        },
        template: '<div data-mock-labscene :data-strip="strip"></div>',
    },
}));

function makeScientist(id: string, state: Scientist['state'] = 'working'): Scientist {
    return {
        id,
        target: {kind: 'experiment', codename: 'parlour'},
        mission: `mission ${id}`,
        state,
        startedAt: '2026-06-12T11:00:00Z',
        lastStateChange: '2026-06-12T11:00:00Z',
    };
}

function injectActivity(id: string, state: ActivityState): void {
    activityFixture.map.set(id, {state, detail: '...', lastEventAt: Date.now()});
}

describe('LabFloor — the Overlook #00057', () => {
    beforeEach(() => {
        useRoster().reset();
        useObserver().reset();
        activityFixture.map.clear();
        pauseRaf.mockClear();
        resumeRaf.mockClear();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders the floor as a section, never a dialog — no role, no close button', () => {
        const wrapper = mount(LabFloor);
        const floor = wrapper.get('[data-lab-floor]');
        expect(floor.element.tagName).toBe('SECTION');
        expect(floor.attributes('aria-label')).toBe('The lab floor below');
        expect(floor.attributes('role')).toBeUndefined();
        expect(wrapper.find('button[aria-label="Close the floor"]').exists()).toBe(false);
    });

    it('carries min-height 64px in the full state — the floor cannot reach zero', () => {
        const wrapper = mount(LabFloor, {props: {collapsed: false}});
        const floor = wrapper.get('[data-lab-floor]').element as HTMLElement;
        expect(floor.style.minHeight).toBe('64px');
        expect(floor.style.height).toBe('40vh');
    });

    it('carries min-height 64px in the strip state — collapsed is 64px, not nothing', () => {
        const wrapper = mount(LabFloor, {props: {collapsed: true}});
        const floor = wrapper.get('[data-lab-floor]').element as HTMLElement;
        expect(floor.style.minHeight).toBe('64px');
        expect(floor.style.height).toBe('64px');
    });

    it('carries no DOM empty-voice overlay — the canvas speaks now (#00059 J-3)', () => {
        const wrapper = mount(LabFloor);
        expect(wrapper.find('[data-floor-empty]').exists()).toBe(false);
    });

    it('lays the perspective gradient as an overlay in the full state only', () => {
        const full = mount(LabFloor, {props: {collapsed: false}});
        const gradient = full.get('[data-floor-gradient]');
        expect((gradient.element as HTMLElement).style.background).toContain('linear-gradient');
        const strip = mount(LabFloor, {props: {collapsed: true}});
        expect(strip.find('[data-floor-gradient]').exists()).toBe(false);
    });

    it('passes the strip projection down to the scene in the collapsed state', () => {
        const strip = mount(LabFloor, {props: {collapsed: true}});
        expect(strip.get('[data-mock-labscene]').attributes('data-strip')).toBe('true');
        const full = mount(LabFloor, {props: {collapsed: false}});
        expect(full.get('[data-mock-labscene]').attributes('data-strip')).toBe('false');
    });

    it('suppresses the light pools on the strip — sprites, and only sprites', () => {
        useRoster().upsert(makeScientist('s1'));
        const wrapper = mount(LabFloor, {props: {collapsed: true}});
        expect(wrapper.find('[data-light-pools]').exists()).toBe(false);
    });

    describe('light pools — a total function of ActivityState', () => {
        const dimStates: ActivityState[] = ['idle', 'waiting'];
        const litStates: ActivityState[] = ['thinking', 'writing', 'reading', 'running'];

        it.each(dimStates)('%s pools sit at ambient 0.4', async (state) => {
            useRoster().upsert(makeScientist('s1'));
            injectActivity('s1', state);
            const wrapper = mount(LabFloor);
            await nextTick();
            const pool = wrapper.get('[data-pool-id="s1"]');
            expect(pool.attributes('data-pool-state')).toBe(state);
            expect((pool.element as HTMLElement).style.opacity).toBe('0.4');
            expect(pool.attributes('data-pool-burning')).toBe('false');
        });

        it.each(litStates)('%s pools brighten to 0.85', async (state) => {
            useRoster().upsert(makeScientist('s1'));
            injectActivity('s1', state);
            const wrapper = mount(LabFloor);
            await nextTick();
            const pool = wrapper.get('[data-pool-id="s1"]');
            expect((pool.element as HTMLElement).style.opacity).toBe('0.85');
            expect(pool.attributes('data-pool-burning')).toBe('false');
        });

        it('error pools burn at 0.85 tinted with the crashed red — the crash does not dim', async () => {
            useRoster().upsert(makeScientist('s1'));
            injectActivity('s1', 'error');
            const wrapper = mount(LabFloor);
            await nextTick();
            const pool = wrapper.get('[data-pool-id="s1"]');
            expect((pool.element as HTMLElement).style.opacity).toBe('0.85');
            expect(pool.attributes('data-pool-burning')).toBe('true');
            expect((pool.element as HTMLElement).style.background).toContain('248, 113, 113');
        });

        it('falls back to the MissionState mapping when the chronicle is silent', async () => {
            useRoster().upsert(makeScientist('s1', 'working'));
            const wrapper = mount(LabFloor);
            await nextTick();
            // working → thinking → lit.
            const pool = wrapper.get('[data-pool-id="s1"]');
            expect(pool.attributes('data-pool-state')).toBe('thinking');
            expect((pool.element as HTMLElement).style.opacity).toBe('0.85');
        });

        it('renders one pool per dispatched scientist', async () => {
            useRoster().upsert(makeScientist('s1'));
            useRoster().upsert(makeScientist('s2'));
            const wrapper = mount(LabFloor);
            await nextTick();
            expect(wrapper.findAll('[data-light-pools] .light-pool')).toHaveLength(2);
        });

        it('re-centers on selection — the selected pool fades up, siblings dim a notch (§4)', async () => {
            useRoster().upsert(makeScientist('s1'));
            useRoster().upsert(makeScientist('s2'));
            injectActivity('s1', 'idle');
            injectActivity('s2', 'writing');
            useRoster().select('s1');
            const wrapper = mount(LabFloor);
            await nextTick();
            const selected = wrapper.get('[data-pool-id="s1"]');
            const sibling = wrapper.get('[data-pool-id="s2"]');
            // An idle-but-selected station is where the light lands.
            expect(selected.attributes('data-pool-selected')).toBe('true');
            expect((selected.element as HTMLElement).style.opacity).toBe('0.85');
            // The working sibling dims a notch, never below the floor glow.
            expect((sibling.element as HTMLElement).style.opacity).toBe('0.75');
        });
    });

    it('projects a station to page coordinates for the plumb-line', async () => {
        useRoster().upsert(makeScientist('s1'));
        const wrapper = mount(LabFloor);
        await nextTick();
        const api = wrapper.vm as unknown as {stationToPage: (id: string) => {x: number; y: number} | null};
        const point = api.stationToPage('s1');
        // jsdom rects measure 0, so the projection lands at the canvas
        // origin — what matters is that the seam answers with numbers,
        // CSS-scale-corrected through getBoundingClientRect.
        expect(point).toStrictEqual({x: 0, y: 0});
        expect(getStationPos).toHaveBeenCalledWith('s1');
    });

    it('re-reads station positions after the scene tick — a fresh dispatch cannot strand its pool (#00059)', async () => {
        // The scene assigns a character's station target inside its own
        // RAF tick. A recompute that runs only on `nextTick` reads the
        // *previous* station and the pool glows a station away from the
        // figure (surfaced by the #00059 runtime ratification). The floor
        // must schedule a re-read behind two animation frames.
        const frames: FrameRequestCallback[] = [];
        const raf = vi.fn<(cb: FrameRequestCallback) => number>((cb) => {
            frames.push(cb);
            return frames.length;
        });
        vi.stubGlobal('requestAnimationFrame', raf);
        try {
            useRoster().upsert(makeScientist('s1'));
            mount(LabFloor);
            await nextTick();
            await nextTick();
            const readsBeforeFrames = getStationPos.mock.calls.length;
            expect(readsBeforeFrames).toBeGreaterThan(0);
            // Drain the scheduled frames — the second pass hides behind
            // two of them, simulating the scene loop running in between.
            while (frames.length > 0) {
                const frame = frames.shift();
                if (frame) frame(0);
            }
            expect(getStationPos.mock.calls.length).toBeGreaterThan(readsBeforeFrames);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    describe('RAF gating — window focus + reduced motion, never a panel', () => {
        it('pauses the scene when the window blurs', async () => {
            mount(LabFloor);
            await nextTick();
            window.dispatchEvent(new Event('blur'));
            expect(pauseRaf).toHaveBeenCalled();
        });

        it('resumes the scene when the window refocuses', async () => {
            mount(LabFloor);
            await nextTick();
            window.dispatchEvent(new Event('blur'));
            window.dispatchEvent(new Event('focus'));
            expect(resumeRaf).toHaveBeenCalled();
        });

        it('does not resume under prefers-reduced-motion — the scene holds its static frame', async () => {
            const original = window.matchMedia;
            window.matchMedia = (query: string) =>
                ({
                    matches: query.includes('prefers-reduced-motion'),
                    media: query,
                    onchange: null,
                    addListener: () => {},
                    removeListener: () => {},
                    addEventListener: () => {},
                    removeEventListener: () => {},
                    dispatchEvent: () => false,
                }) as MediaQueryList;
            try {
                mount(LabFloor);
                await nextTick();
                window.dispatchEvent(new Event('focus'));
                expect(resumeRaf).not.toHaveBeenCalled();
            } finally {
                window.matchMedia = original;
            }
        });
    });

    describe('the strip affordance — a temporary look downstairs', () => {
        it('shows the "Expand the floor" affordance only on the strip', () => {
            const strip = mount(LabFloor, {props: {collapsed: true}});
            expect(strip.find('button[aria-label="Expand the floor"]').exists()).toBe(true);
            const full = mount(LabFloor, {props: {collapsed: false}});
            expect(full.find('[data-floor-expand]').exists()).toBe(false);
        });

        it('peeks the full floor on click and returns to the strip on mouseleave', async () => {
            const wrapper = mount(LabFloor, {props: {collapsed: true}});
            await wrapper.get('[data-floor-expand]').trigger('click');
            const floor = wrapper.get('[data-lab-floor]').element as HTMLElement;
            expect(floor.style.height).toBe('40vh');
            expect(floor.style.minHeight).toBe('64px');
            await wrapper.get('[data-lab-floor]').trigger('mouseleave');
            expect(floor.style.height).toBe('64px');
        });
    });

    // The empty voice migrated INTO the page (#00059 J-3): these specs
    // drive the ink renderer directly with a recording mock context —
    // jsdom has no Canvas 2D, so the canvas IS the mock — and assert
    // ctx.fillText received the locked voice strings. No DOM query: the
    // overlay these words used to live in no longer exists.
    describe('the empty voice — written on the page itself (#00059 J-3)', () => {
        interface SceneRosterEntry {
            id: string;
            activity: ActivityState;
            detail: string;
            target: string;
            mission: string;
            startedAtMs: number | null;
            idleWarn: boolean;
            crashed: boolean;
        }

        interface SceneController {
            setRoster: (entries: SceneRosterEntry[]) => void;
            setStrip: (on: boolean) => void;
            destroy: () => void;
        }

        function makeSceneCanvas(): {canvas: HTMLCanvasElement; writtenText: () => string[]} {
            const calls: unknown[][] = [];
            const noop = (): void => {};
            const ctx = {
                clearRect: noop,
                drawImage: noop,
                beginPath: noop,
                closePath: noop,
                moveTo: noop,
                lineTo: noop,
                stroke: noop,
                fill: noop,
                arc: noop,
                fillRect: noop,
                fillText: (...args: unknown[]) => {
                    calls.push(args);
                },
                measureText: (text: string) => ({width: text.length * 7}),
                save: noop,
                restore: noop,
                translate: noop,
                rotate: noop,
                strokeStyle: '',
                fillStyle: '',
                lineWidth: 0,
                globalAlpha: 1,
                lineCap: 'butt',
                lineJoin: 'miter',
                font: '',
                textAlign: 'start',
                textBaseline: 'alphabetic',
            };
            const canvas = {
                width: 0,
                height: 0,
                style: {},
                getContext: () => ctx,
                addEventListener: noop,
                removeEventListener: noop,
                getBoundingClientRect: () => ({left: 0, top: 0, width: 0, height: 0}),
            } as unknown as HTMLCanvasElement;
            return {canvas, writtenText: () => calls.map((args) => String(args[0]))};
        }

        async function bootScene(): Promise<{controller: SceneController; writtenText: () => string[]}> {
            const mod = (await import('../../src/observer/scene.js')) as unknown as {
                initScene: (opts: {canvas: HTMLCanvasElement}) => SceneController;
            };
            const {canvas, writtenText} = makeSceneCanvas();
            const controller = mod.initScene({canvas});
            return {controller, writtenText};
        }

        function makeEntry(id: string): SceneRosterEntry {
            return {
                id,
                activity: 'idle',
                detail: '...',
                target: 'The Crucible',
                mission: 'check phpstan',
                startedAtMs: Date.now(),
                idleWarn: false,
                crashed: false,
            };
        }

        it('writes "Balcony quiet. No scientists dispatched." on the empty page', async () => {
            const {controller, writtenText} = await bootScene();
            controller.setRoster([]);
            await vi.waitFor(() => {
                expect(writtenText()).toContain('Balcony quiet. No scientists dispatched.');
            });
            controller.destroy();
        });

        it('condenses to "Balcony quiet." on the empty strip', async () => {
            const {controller, writtenText} = await bootScene();
            controller.setRoster([]);
            controller.setStrip(true);
            await vi.waitFor(() => {
                expect(writtenText()).toContain('Balcony quiet.');
            });
            controller.destroy();
        });

        it('drops the empty voice once a scientist is on the page — the caption speaks instead', async () => {
            const {controller, writtenText} = await bootScene();
            controller.setRoster([makeEntry('s1')]);
            await vi.waitFor(() => {
                expect(writtenText()).toContain('The Crucible');
            });
            const sinceDispatch = writtenText().slice(writtenText().indexOf('The Crucible'));
            expect(sinceDispatch).not.toContain('Balcony quiet. No scientists dispatched.');
            controller.destroy();
        });
    });
});
