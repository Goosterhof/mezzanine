import {invoke} from '@tauri-apps/api/core';
import {mount, flushPromises} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import MissionControl from '../../src/mission/MissionControl.vue';
import {usePlanning} from '../../src/mission/usePlanning';
import {useShell} from '../../src/shell/useShell';

const item = {
    id: 'one',
    filed: '2026-10-01',
    source: '[Evidence](source.md)',
    item: '**Inspect the service**',
    handler: 'investor',
};
const snapshot = {items: [item], priorities: [], revision: 'r1', backlogPath: '/lab/documents/lab-backlog.md'};
const mockedInvoke = vi.mocked(invoke);
describe('Mission Control planning', () => {
    beforeEach(() => {
        usePlanning().reset();
        useShell().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(snapshot);
    });
    it('reads the canonical backlog on entry and filters tasks', async () => {
        useShell().navigate('mission-control');
        const wrapper = mount(MissionControl);
        await flushPromises();
        expect(mockedInvoke).toHaveBeenCalledWith('read_planning');
        expect(wrapper.text()).toContain('Current priorities');
        expect(wrapper.findAll('.backlog-row')).toHaveLength(1);
        await wrapper.get('[aria-label="Search backlog"]').setValue('missing');
        expect(wrapper.findAll('.backlog-row')).toHaveLength(0);
        wrapper.unmount();
    });
    it('saves a priority against the revision read, and retains the plan on conflicts', async () => {
        useShell().navigate('mission-control');
        const wrapper = mount(MissionControl);
        await flushPromises();
        await wrapper.get('.backlog-row').trigger('click');
        mockedInvoke.mockRejectedValueOnce(new Error('Priorities changed at another bench. Refresh before editing.'));
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Make a priority')!
            .trigger('click');
        await flushPromises();
        expect(mockedInvoke).toHaveBeenCalledWith('save_priorities', {expectedRevision: 'r1', ids: ['one']});
        expect(wrapper.text()).toContain('Priorities changed at another bench');
        expect(usePlanning().snapshot.value.revision).toBe('r1');
        wrapper.unmount();
    });
    it('shows removed priorities and prevents preparing a stale task', async () => {
        mockedInvoke.mockResolvedValue({...snapshot, items: [], priorities: [item]});
        useShell().navigate('mission-control');
        const wrapper = mount(MissionControl);
        await flushPromises();
        expect(wrapper.text()).toContain('Changed or removed from backlog');
        await wrapper.get('.priority-row .text-left').trigger('click');
        expect(
            wrapper
                .findAll('button')
                .find((b) => b.text() === 'Heretic')!
                .attributes('disabled'),
        ).toBeDefined();
        wrapper.unmount();
    });
});
