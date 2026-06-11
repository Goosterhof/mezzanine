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

    it('speaks the empty voice on the floor when nobody is dispatched', () => {
        const wrapper = mount(LabFloor);
        expect(wrapper.get('[data-floor-empty]').text()).toBe('Balcony quiet. No scientists dispatched.');
    });

    it('condenses the empty voice on the strip — never silent and unlabelled', () => {
        const wrapper = mount(LabFloor, {props: {collapsed: true}});
        expect(wrapper.get('[data-floor-empty]').text()).toBe('Balcony quiet.');
    });

    it('drops the empty voice once a scientist is on the floor', async () => {
        useRoster().upsert(makeScientist('s1'));
        const wrapper = mount(LabFloor);
        await nextTick();
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
            window.matchMedia = ((query: string) =>
                ({
                    matches: query.includes('prefers-reduced-motion'),
                    media: query,
                    onchange: null,
                    addListener: () => {},
                    removeListener: () => {},
                    addEventListener: () => {},
                    removeEventListener: () => {},
                    dispatchEvent: () => false,
                }) as unknown as MediaQueryList) as typeof window.matchMedia;
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
});
