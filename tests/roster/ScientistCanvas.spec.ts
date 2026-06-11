import {invoke} from '@tauri-apps/api/core';
import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {nextTick} from 'vue';

import type {Scientist} from '../../src/roster/types';

import ScientistCanvas from '../../src/roster/ScientistCanvas.vue';
import {useIdleWarning} from '../../src/roster/useIdleWarning';
import {useRoster} from '../../src/roster/useRoster';
import {useRosterBackend} from '../../src/roster/useRosterBackend';
import {useScientistTerminals} from '../../src/roster/useScientistTerminals';

const mockedInvoke = vi.mocked(invoke);

function makeScientist(id: string, mission = 'check phpstan'): Scientist {
    return {
        id,
        target: {kind: 'experiment', codename: 'crucible'},
        mission,
        state: 'working',
        startedAt: '2026-05-12T11:00:00Z',
        lastStateChange: '2026-05-12T11:00:00Z',
    };
}

describe('ScientistCanvas — Phase 2A', () => {
    beforeEach(() => {
        useRoster().reset();
        useIdleWarning()._resetForTests();
        useScientistTerminals().reset();
        useRosterBackend()._resetSubscriptionForTests();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(undefined);
    });

    it('renders the balcony-quiet empty state when no scientist is selected', () => {
        const wrapper = mount(ScientistCanvas);
        expect(wrapper.text()).toContain('Balcony quiet');
        expect(wrapper.text()).toContain('No scientist selected');
    });

    it('renders the header with the target label and mission when a scientist is selected', async () => {
        const roster = useRoster();
        const s = makeScientist('a');
        roster.upsert(s);
        roster.select('a');
        const wrapper = mount(ScientistCanvas, {attachTo: document.body});
        await nextTick();
        expect(wrapper.text()).toContain('The Crucible');
        expect(wrapper.text()).toContain('check phpstan');
        wrapper.unmount();
    });

    it('header mission falls back to em dash when mission is empty', async () => {
        const roster = useRoster();
        const s = makeScientist('a', '');
        roster.upsert(s);
        roster.select('a');
        const wrapper = mount(ScientistCanvas, {attachTo: document.body});
        await nextTick();
        expect(wrapper.text()).toContain('—');
        wrapper.unmount();
    });

    it('renders one wrapper div per dispatched scientist, only the selected one visible', async () => {
        const roster = useRoster();
        roster.upsert(makeScientist('a'));
        roster.upsert(makeScientist('b'));
        roster.select('a');
        const wrapper = mount(ScientistCanvas, {attachTo: document.body});
        await nextTick();
        const wrappers = wrapper.findAll('section .relative > div');
        expect(wrappers).toHaveLength(2);
        wrapper.unmount();
    });

    it('switches the visible wrapper when the selected scientist changes', async () => {
        const roster = useRoster();
        roster.upsert(makeScientist('a', 'first mission'));
        roster.upsert(makeScientist('b', 'second mission'));
        roster.select('a');
        const wrapper = mount(ScientistCanvas, {attachTo: document.body});
        await nextTick();
        expect(wrapper.text()).toContain('first mission');
        roster.select('b');
        await nextTick();
        await nextTick();
        // After switching, header should reflect the new selection's mission.
        expect(wrapper.text()).toContain('second mission');
        wrapper.unmount();
    });

    it('amends the no-selection prompt for the Overlook selection affordances', () => {
        const wrapper = mount(ScientistCanvas);
        expect(wrapper.text()).toContain('click a nameplate, or a scientist on the floor');
        expect(wrapper.text()).not.toContain('roster row');
    });

    describe('the xterm rise (#00057 §4)', () => {
        // One mount helper so selectedWrapper shares the exact wrapper
        // type — `ReturnType<typeof mount>` resolves to the default
        // VueWrapper instantiation and trips no-unsafe-argument.
        function mountCanvas() {
            return mount(ScientistCanvas, {attachTo: document.body});
        }

        function selectedWrapper(wrapper: ReturnType<typeof mountCanvas>, id: string): HTMLElement {
            const roster = useRoster();
            const index = roster.scientists.value.findIndex((s) => s.id === id);
            const el = wrapper.findAll('section .relative > div')[index]?.element as HTMLElement | undefined;
            if (!el) {
                throw new Error(`no wrapper for scientist ${id}`);
            }
            return el;
        }

        it('plays the rise on the newly-selected wrapper — wrapper class, never xterm internals', async () => {
            const roster = useRoster();
            roster.upsert(makeScientist('a'));
            roster.upsert(makeScientist('b'));
            roster.select('a');
            const wrapper = mountCanvas();
            await nextTick();
            roster.select('b');
            await nextTick();
            await nextTick();
            const risen = selectedWrapper(wrapper, 'b');
            expect(risen.classList.contains('mz-rise-play')).toBe(true);
            expect(risen.classList.contains('mz-rise-prep')).toBe(false);
            wrapper.unmount();
        });

        it('settles on transitionend: the rise class drops and the terminal re-fits', async () => {
            const roster = useRoster();
            roster.upsert(makeScientist('a'));
            roster.upsert(makeScientist('b'));
            roster.select('a');
            const wrapper = mountCanvas();
            await nextTick();
            roster.select('b');
            await nextTick();
            await nextTick();
            const risen = selectedWrapper(wrapper, 'b');
            const slot = useScientistTerminals().get('b');
            const fitSpy = vi.spyOn(slot.fit, 'fit');
            risen.dispatchEvent(new Event('transitionend'));
            expect(risen.classList.contains('mz-rise-play')).toBe(false);
            // FitAddon re-fit fires on transitionend — cols/rows settle
            // against final geometry, not mid-transition.
            expect(fitSpy).toHaveBeenCalled();
            wrapper.unmount();
        });
    });
});
