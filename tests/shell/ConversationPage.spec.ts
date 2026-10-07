import {enableAutoUnmount, flushPromises, mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {defineComponent} from 'vue';

import {useObserver} from '../../src/observer/useObserver';
import {useRoster} from '../../src/roster/useRoster';
import ConversationPage from '../../src/shell/ConversationPage.vue';

enableAutoUnmount(afterEach);
const station = vi.fn<(id: string) => {x: number; y: number} | null>();
const Floor = defineComponent({
    props: ['active', 'collapsed', 'forced', 'sill'],
    emits: ['placed', 'update:collapsed', 'errand'],
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

    it('lays the sill canvas over the page without taking a click, a focus or a screen reader (AC-6)', () => {
        const sill = open().get('[data-errand-sill]');
        expect(sill.classes()).toContain('pointer-events-none');
        expect(sill.attributes('aria-hidden')).toBe('true');
        expect(sill.attributes('tabindex')).toBe('-1');
    });

    it('speaks the floor’s voice in one polite line, and says nothing until there is something to say (AC-10)', async () => {
        const wrapper = open();
        const voice = wrapper.get('[data-errand-voice]');
        expect(voice.attributes('aria-live')).toBe('polite');
        expect(voice.text()).toBe('');
        wrapper
            .getComponent(Floor)
            .vm.$emit('errand', {kind: 'volley', names: ['the Surgeon', 'the Librarian', 'the Scribe']});
        await flushPromises();
        expect(voice.text()).toBe('The Surgeon and 2 more are out on errands.');
        wrapper.getComponent(Floor).vm.$emit('errand', {kind: 'loose', others: 0});
        await flushPromises();
        expect(voice.text()).toBe('The Chaos Monkey is loose.');
    });

    it('leaves the sill unmeasured while the page cannot be measured — no sill, no grip', () => {
        // jsdom lays nothing out and the chrome here is stubbed: a required rect is missing
        expect((open().get('[data-errand-sill]').element as HTMLElement).style.display).toBe('none');
    });
});
