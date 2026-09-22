import {enableAutoUnmount, flushPromises, mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {defineComponent} from 'vue';

import {useObserver} from '../../src/observer/useObserver';
import {useRoster} from '../../src/roster/useRoster';
import ConversationPage from '../../src/shell/ConversationPage.vue';

enableAutoUnmount(afterEach);
const station = vi.fn<(id: string) => {x: number; y: number} | null>();
const Floor = defineComponent({
    props: ['active', 'collapsed', 'forced'],
    emits: ['placed', 'update:collapsed'],
    setup(_props, {expose}) {
        expose({stationToPage: station});
    },
    template: '<div data-floor-stub />',
});

function open() {
    return mount(ConversationPage, {
        global: {
            stubs: {
                LabFloor: Floor,
                ColleagueBenches: true,
                ScientistCanvas: true,
                CommandBar: true,
                RecentlyRecalledStrip: true,
            },
        },
    });
}

describe('conversation floor geometry survives page navigation', () => {
    beforeEach(() => {
        useRoster().reset();
        useObserver().reset();
        station.mockReset().mockReturnValue({x: 300, y: 400});
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({left: 20, top: 100} as DOMRect);
        for (const id of ['claude', 'codex'])
            useRoster().upsert({
                id,
                target: {kind: 'lab-root'},
                state: 'idle',
                mission: '',
                startedAt: '',
                lastStateChange: '',
            });
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('retargets the plumb-line on selection, walking and deselection', async () => {
        const wrapper = open();
        useRoster().select('claude');
        await flushPromises();
        expect(wrapper.get('[data-plumb-line]').attributes('style')).toContain('left: 280px');
        expect(wrapper.get('[data-plumb-line]').attributes('style')).toContain('height: 300px');
        useRoster().select('codex');
        await flushPromises();
        expect(station).toHaveBeenLastCalledWith('codex');
        station.mockReturnValue({x: 500, y: 450});
        useObserver().activities.value.set('codex', {state: 'writing', detail: '', lastEventAt: 0});
        await flushPromises();
        expect(wrapper.get('[data-plumb-line]').attributes('style')).toContain('left: 480px');
        useRoster().select(null);
        await flushPromises();
        expect(wrapper.find('[data-plumb-line]').exists()).toBe(false);
    });
    it('does not measure hidden geometry and projects the current station on return', async () => {
        const wrapper = open();
        useRoster().select('claude');
        await flushPromises();
        await wrapper.setProps({active: false});
        station.mockClear();
        useRoster().select('codex');
        window.dispatchEvent(new Event('resize'));
        await flushPromises();
        expect(station).not.toHaveBeenCalled();
        station.mockReturnValue({x: 650, y: 350});
        await wrapper.setProps({active: true});
        await flushPromises();
        expect(wrapper.get('[data-plumb-line]').attributes('style')).toContain('left: 630px');
        expect(wrapper.get('[data-plumb-line]').attributes('style')).toContain('height: 250px');
    });
    it('reprojects on resize and on a posture change', async () => {
        const wrapper = open();
        useRoster().select('claude');
        await flushPromises();
        station.mockReturnValue({x: 700, y: 500});
        window.dispatchEvent(new Event('resize'));
        await flushPromises();
        expect(wrapper.get('[data-plumb-line]').attributes('style')).toContain('left: 680px');
        station.mockReturnValue({x: 750, y: 550});
        await wrapper.setProps({compactFloor: true});
        await flushPromises();
        expect(wrapper.get('[data-plumb-line]').attributes('style')).toContain('height: 450px');
        expect(wrapper.getComponent(Floor).props('collapsed')).toBe(true);
    });
    it('opens on the whole bench by default — the ruling (#00041 §8)', () => {
        vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900);
        const floor = open().getComponent(Floor);
        expect(floor.props('collapsed')).toBe(false);
        expect(floor.props('forced')).toBe(false);
    });
    it('takes the investor’s ⌃ choice from the band in both directions', async () => {
        const wrapper = open();
        wrapper.getComponent(Floor).vm.$emit('update:collapsed', true);
        await flushPromises();
        expect(wrapper.getComponent(Floor).props('collapsed')).toBe(true);
        wrapper.getComponent(Floor).vm.$emit('update:collapsed', false);
        await flushPromises();
        expect(wrapper.getComponent(Floor).props('collapsed')).toBe(false);
    });
    it('forces the crop below the 820px cliff and lifts it above', async () => {
        const wrapper = open();
        vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(819);
        window.dispatchEvent(new Event('resize'));
        await flushPromises();
        expect(wrapper.getComponent(Floor).props('forced')).toBe(true);
        vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(821);
        window.dispatchEvent(new Event('resize'));
        await flushPromises();
        expect(wrapper.getComponent(Floor).props('forced')).toBe(false);
    });
    it('re-reads the plumb on every placement — the line walks with the figure (trip-wire 8)', async () => {
        const wrapper = open();
        useRoster().select('claude');
        await flushPromises();
        station.mockReturnValue({x: 410, y: 400});
        wrapper.getComponent(Floor).vm.$emit('placed');
        await flushPromises();
        expect(wrapper.get('[data-plumb-line]').attributes('style')).toContain('left: 390px');
        station.mockReturnValue({x: 402, y: 400});
        wrapper.getComponent(Floor).vm.$emit('placed');
        await flushPromises();
        expect(wrapper.get('[data-plumb-line]').attributes('style')).toContain('left: 382px');
    });
    it('waits for a missing station instead of drawing a false plumb-line', async () => {
        station.mockReturnValue(null);
        const wrapper = open();
        useRoster().select('claude');
        await flushPromises();
        expect(wrapper.find('[data-plumb-line]').exists()).toBe(false);
    });
    it('settles the selection gesture and leaves no timer after unmount', async () => {
        vi.useFakeTimers();
        const wrapper = open();
        useRoster().select('claude');
        await flushPromises();
        expect(wrapper.find('.dropping').exists()).toBe(true);
        await vi.advanceTimersByTimeAsync(320);
        expect(wrapper.find('.dropping').exists()).toBe(false);
        useRoster().select('codex');
        await flushPromises();
        wrapper.unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});
