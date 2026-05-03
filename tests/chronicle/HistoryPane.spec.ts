import {invoke} from '@tauri-apps/api/core';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {ChronicleTurn} from '../../src/chronicle/types';

import HistoryPane from '../../src/chronicle/HistoryPane.vue';
import {useHistory} from '../../src/chronicle/useHistory';

const mockedInvoke = vi.mocked(invoke);

const TURNS: ChronicleTurn[] = [
    {ts: '2026-05-01T10:00:00Z', direction: 'in', payload: 'phpstan\n'},
    {ts: '2026-05-01T10:00:01Z', direction: 'out', payload: 'ok\n'},
];

describe('HistoryPane', () => {
    beforeEach(() => {
        useHistory().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(TURNS);
    });

    it('is hidden when not open', () => {
        const wrapper = mount(HistoryPane);
        expect(wrapper.find('[data-pane="history"]').exists()).toBe(false);
    });

    it('renders the experiment label, the turns, and the input/output stamps', async () => {
        await useHistory().show('crucible');
        const wrapper = mount(HistoryPane, {attachTo: document.body});
        await flushPromises();

        expect(wrapper.text()).toContain('The Crucible');
        expect(wrapper.text()).toContain('Chronicle — last 7 days');
        expect(wrapper.text()).toContain('phpstan');
        expect(wrapper.text()).toContain('ok');
        expect(wrapper.text()).toContain('INPUT');
        expect(wrapper.text()).toContain('OUTPUT');
        wrapper.unmount();
    });

    it('renders the empty state when no turns exist', async () => {
        mockedInvoke.mockResolvedValue([]);
        await useHistory().show('crucible');
        const wrapper = mount(HistoryPane, {attachTo: document.body});
        await flushPromises();

        expect(wrapper.text()).toContain('No transcripts yet. Start a session to begin the record.');
        wrapper.unmount();
    });

    it('Close button hides the pane', async () => {
        await useHistory().show('crucible');
        const wrapper = mount(HistoryPane, {attachTo: document.body});
        await flushPromises();

        await wrapper.get('[data-history-close]').trigger('click');
        expect(useHistory().open.value).toBe(false);
        wrapper.unmount();
    });

    it('Escape hides the pane', async () => {
        await useHistory().show('crucible');
        const wrapper = mount(HistoryPane, {attachTo: document.body});
        await flushPromises();

        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
        await flushPromises();
        expect(useHistory().open.value).toBe(false);
        wrapper.unmount();
    });

    it('Refresh button re-invokes read_chronicle_history', async () => {
        await useHistory().show('crucible');
        const wrapper = mount(HistoryPane, {attachTo: document.body});
        await flushPromises();
        const before = mockedInvoke.mock.calls.length;

        await wrapper.get('[data-history-refresh]').trigger('click');
        await flushPromises();
        expect(mockedInvoke.mock.calls.length).toBeGreaterThan(before);
        wrapper.unmount();
    });
});
