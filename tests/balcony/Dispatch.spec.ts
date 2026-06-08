import {invoke} from '@tauri-apps/api/core';
import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {nextTick} from 'vue';

import Dispatch from '../../src/balcony/Dispatch.vue';
import {useDispatch} from '../../src/balcony/useDispatch';
import {useRoster} from '../../src/roster/useRoster';

const mockedInvoke = vi.mocked(invoke);

describe('Dispatch — minion-only dispatch', () => {
    beforeEach(() => {
        useDispatch().reset();
        useRoster().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(undefined);
    });

    it('does NOT render the sheet when dispatch is closed', () => {
        const wrapper = mount(Dispatch);
        expect(wrapper.find('[data-dispatch-sheet]').exists()).toBe(false);
    });

    it('renders the header and the minion radiogroup when open', async () => {
        useDispatch().show();
        const wrapper = mount(Dispatch);
        await nextTick();
        expect(wrapper.find('[data-dispatch-sheet]').exists()).toBe(true);
        expect(wrapper.text()).toContain('Send a scientist to the lab floor');
        // The "no minion" row plus one row per minion (Inspector seeds it).
        expect(wrapper.find('[data-dispatch-minion="none"]').exists()).toBe(true);
        expect(wrapper.find('[data-dispatch-minion="inspector"]').exists()).toBe(true);
    });

    it('clicking a minion row selects it', async () => {
        const d = useDispatch();
        d.show();
        const wrapper = mount(Dispatch);
        await nextTick();
        await wrapper.get('[data-dispatch-minion="surgeon"]').trigger('click');
        expect(d.minionSlug.value).toBe('surgeon');
        expect(wrapper.get('[data-dispatch-minion="surgeon"]').attributes('aria-checked')).toBe('true');
    });

    it('clicking "No minion" clears the selection back to a plain session', async () => {
        const d = useDispatch();
        d.show();
        d.selectMinion('muse');
        const wrapper = mount(Dispatch);
        await nextTick();
        await wrapper.get('[data-dispatch-minion="none"]').trigger('click');
        expect(d.minionSlug.value).toBeNull();
    });

    it('the submit button is enabled even with no minion selected', async () => {
        useDispatch().show();
        const wrapper = mount(Dispatch);
        await nextTick();
        expect(wrapper.get('[data-dispatch-submit]').attributes('disabled')).toBeUndefined();
    });

    it('clicking close hides the dispatch sheet', async () => {
        const d = useDispatch();
        d.show();
        const wrapper = mount(Dispatch);
        await nextTick();
        await wrapper.get('[data-dispatch-close]').trigger('click');
        expect(d.open.value).toBe(false);
    });

    it('clicking Cancel hides the dispatch sheet', async () => {
        const d = useDispatch();
        d.show();
        const wrapper = mount(Dispatch);
        await nextTick();
        await wrapper.get('[data-dispatch-cancel]').trigger('click');
        expect(d.open.value).toBe(false);
    });

    it('escape on the sheet hides the dispatch', async () => {
        const d = useDispatch();
        d.show();
        const wrapper = mount(Dispatch);
        await nextTick();
        await wrapper.get('[data-dispatch-sheet]').trigger('keydown', {key: 'Escape'});
        expect(d.open.value).toBe(false);
    });

    it('ctrl+enter on the sheet submits the dispatch', async () => {
        const d = useDispatch();
        d.show();
        d.selectMinion('inspector');
        mockedInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'dispatch_scientist') {
                return Promise.resolve({
                    id: '11111111-1111-4111-8111-111111111111',
                    target: {kind: 'lab-root'},
                    mission: '@agent-inspector',
                    state: 'working',
                    startedAt: '2026-06-08T10:00:00Z',
                    lastStateChange: '2026-06-08T10:00:00Z',
                });
            }
            return Promise.resolve(undefined);
        });
        const wrapper = mount(Dispatch);
        await nextTick();
        await wrapper.get('[data-dispatch-sheet]').trigger('keydown', {key: 'Enter', ctrlKey: true});
        await Promise.resolve();
        await Promise.resolve();
        const calls = mockedInvoke.mock.calls.map((c) => c[0]);
        expect(calls).toContain('dispatch_scientist');
    });

    it('renders the error banner when lastError is set', async () => {
        const d = useDispatch();
        d.show();
        d.lastError.value = 'Backend refused the dispatch.';
        const wrapper = mount(Dispatch);
        await nextTick();
        expect(wrapper.get('[data-dispatch-error]').text()).toContain('Backend refused the dispatch.');
    });
});
