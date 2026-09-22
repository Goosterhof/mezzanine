// LabFloor — the Long Bench's band (#00041 §5).
//
// The LabScene is mocked out (its scene.js host needs a Canvas 2D context
// jsdom does not provide; the renderer itself is driven for real in
// scene.spec.ts). These specs assert the band's contract: 200 px expanded,
// a 64 px crop on the investor's word or forced by a short window, the ⌃
// control in both directions, the struck pools and gradient staying struck,
// and RAF gating answering to the page, window focus and reduced motion.

import {enableAutoUnmount, mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {nextTick} from 'vue';

import LabFloor from '../../src/observer/LabFloor.vue';

enableAutoUnmount(afterEach);

const pauseRaf = vi.fn<() => void>();
const resumeRaf = vi.fn<() => void>();
const getStationPos = vi.fn<(id: string) => {x: number; y: number} | null>(() => ({x: 360, y: 50}));
const getFloorSize = vi.fn<() => {w: number; h: number}>(() => ({w: 1440, h: 200}));
const fakeCanvas = typeof document === 'undefined' ? null : document.createElement('canvas');

vi.mock('../../src/observer/LabScene.vue', () => ({
    default: {
        name: 'LabScene',
        props: {strip: {type: Boolean, default: false}, active: {type: Boolean, default: true}},
        emits: ['placed'],
        setup(_props: unknown, {expose}: {expose: (api: Record<string, unknown>) => void}) {
            expose({pauseRaf, resumeRaf, getStationPos, getFloorSize, getCanvasEl: () => fakeCanvas});
            return {};
        },
        template: '<div data-mock-labscene :data-strip="strip" @click="$emit(\'placed\')"></div>',
    },
}));

function height(wrapper: {get: (selector: string) => {element: Element}}): string {
    return (wrapper.get('[data-lab-floor]').element as HTMLElement).style.height;
}

describe('LabFloor — the Long Bench band (#00041 §5)', () => {
    beforeEach(() => {
        pauseRaf.mockClear();
        resumeRaf.mockClear();
        getStationPos.mockClear();
    });

    it('renders the band as a section, never a dialog — no role, no close button', () => {
        const wrapper = mount(LabFloor);
        const floor = wrapper.get('[data-lab-floor]');
        expect(floor.element.tagName).toBe('SECTION');
        expect(floor.attributes('aria-label')).toBe('The lab floor below');
        expect(floor.attributes('role')).toBeUndefined();
        expect(wrapper.find('button[aria-label="Close the floor"]').exists()).toBe(false);
    });

    it('stands 200 px tall when expanded — fixed, never 40vh (§5.3)', () => {
        const wrapper = mount(LabFloor);
        expect(height(wrapper)).toBe('200px');
        expect(wrapper.get('[data-mock-labscene]').attributes('data-strip')).toBe('false');
        expect(wrapper.get('[data-lab-floor]').attributes('data-floor-collapsed')).toBe('false');
    });

    it('crops to 64 px on the investor’s word — the same drawing, cropped', () => {
        const wrapper = mount(LabFloor, {props: {collapsed: true}});
        expect(height(wrapper)).toBe('64px');
        expect(wrapper.get('[data-mock-labscene]').attributes('data-strip')).toBe('true');
    });

    it('crops to 64 px below the 820 px cliff whatever was chosen', () => {
        const wrapper = mount(LabFloor, {props: {collapsed: false, forced: true}});
        expect(height(wrapper)).toBe('64px');
    });

    it('lays paper, not dark chrome, behind the canvas — no dark flash on a re-cut', () => {
        const wrapper = mount(LabFloor);
        expect((wrapper.get('[data-lab-floor]').element as HTMLElement).style.background).toContain('243, 236, 220');
    });

    it('keeps the struck machinery struck: no light pools, no perspective gradient, in either posture', () => {
        for (const collapsed of [false, true]) {
            const wrapper = mount(LabFloor, {props: {collapsed}});
            expect(wrapper.find('[data-light-pools]').exists()).toBe(false);
            expect(wrapper.find('.light-pool').exists()).toBe(false);
            expect(wrapper.find('[data-floor-gradient]').exists()).toBe(false);
            expect(wrapper.find('[data-floor-empty]').exists()).toBe(false);
        }
    });

    describe('the ⌃ control', () => {
        it('folds the expanded bench to the crop on a tall window', async () => {
            const wrapper = mount(LabFloor);
            const control = wrapper.get('[data-floor-expand]');
            expect(control.attributes('aria-label')).toBe('Return to the strip');
            await control.trigger('click');
            expect(wrapper.emitted('update:collapsed')).toStrictEqual([[true]]);
        });

        it('opens the crop back to the whole bench on a tall window', async () => {
            const wrapper = mount(LabFloor, {props: {collapsed: true}});
            const control = wrapper.get('[data-floor-expand]');
            expect(control.attributes('aria-label')).toBe('Expand the floor');
            expect(control.text()).toBe('⌃');
            await control.trigger('click');
            expect(wrapper.emitted('update:collapsed')).toStrictEqual([[false]]);
        });

        it('peeks at the whole bench below the cliff and returns to the crop on mouseleave', async () => {
            const wrapper = mount(LabFloor, {props: {forced: true}});
            await wrapper.get('[data-floor-expand]').trigger('click');
            expect(height(wrapper)).toBe('200px');
            expect(wrapper.emitted('update:collapsed')).toBeUndefined();
            await wrapper.get('[data-lab-floor]').trigger('mouseleave');
            expect(height(wrapper)).toBe('64px');
        });

        it('drops the peek when the window grows past the cliff', async () => {
            const wrapper = mount(LabFloor, {props: {forced: true, collapsed: true}});
            await wrapper.get('[data-floor-expand]').trigger('click');
            expect(height(wrapper)).toBe('200px');
            await wrapper.setProps({forced: false});
            expect(height(wrapper)).toBe('64px');
            await wrapper.setProps({forced: true});
            expect(height(wrapper)).toBe('64px');
        });
    });

    it('carries the scene’s placement up to the page so the plumb follows the walk', async () => {
        const wrapper = mount(LabFloor);
        await wrapper.get('[data-mock-labscene]').trigger('click');
        expect(wrapper.emitted('placed')).toHaveLength(1);
    });

    it('projects the figure’s current position to page coordinates for the plumb-line', async () => {
        const wrapper = mount(LabFloor);
        await nextTick();
        const api = wrapper.vm as unknown as {stationToPage: (id: string) => {x: number; y: number} | null};
        vi.spyOn(fakeCanvas as HTMLCanvasElement, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 700,
            width: 1440,
            height: 200,
        } as DOMRect);
        expect(api.stationToPage('s1')).toStrictEqual({x: 360, y: 750});
        expect(getStationPos).toHaveBeenCalledWith('s1');
        getStationPos.mockReturnValueOnce(null);
        expect(api.stationToPage('s1')).toBeNull();
        getFloorSize.mockReturnValueOnce({w: 0, h: 0});
        expect(api.stationToPage('s1')).toBeNull();
        vi.restoreAllMocks();
    });

    describe('RAF gating — the page, window focus and reduced motion', () => {
        it('stays paused on another page even when the window regains focus', async () => {
            const wrapper = mount(LabFloor);
            await nextTick();
            await wrapper.setProps({active: false});
            expect(pauseRaf).toHaveBeenCalled();
            resumeRaf.mockClear();
            window.dispatchEvent(new Event('focus'));
            expect(resumeRaf).not.toHaveBeenCalled();
            await wrapper.setProps({active: true});
            await nextTick();
            expect(resumeRaf).toHaveBeenCalled();
        });

        it('pauses the scene when the window blurs, and resumes on focus', async () => {
            mount(LabFloor);
            await nextTick();
            window.dispatchEvent(new Event('blur'));
            expect(pauseRaf).toHaveBeenCalled();
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
                    addEventListener: () => {},
                    removeEventListener: () => {},
                    dispatchEvent: () => false,
                }) as unknown as MediaQueryList;
            try {
                mount(LabFloor);
                await nextTick();
                window.dispatchEvent(new Event('focus'));
                expect(resumeRaf).not.toHaveBeenCalled();
            } finally {
                window.matchMedia = original;
            }
        });

        it('stops listening to the window once unmounted', async () => {
            const wrapper = mount(LabFloor);
            await nextTick();
            wrapper.unmount();
            pauseRaf.mockClear();
            window.dispatchEvent(new Event('blur'));
            expect(pauseRaf).not.toHaveBeenCalled();
        });
    });
});
