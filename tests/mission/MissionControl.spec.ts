import {invoke} from '@tauri-apps/api/core';
import {enableAutoUnmount, mount, flushPromises} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {useCommandDraft} from '../../src/command/useCommandDraft';
import MissionControl from '../../src/mission/MissionControl.vue';
import {usePlanning} from '../../src/mission/usePlanning';
import {useRoster} from '../../src/roster/useRoster';
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
enableAutoUnmount(afterEach);
describe('Mission Control planning', () => {
    beforeEach(() => {
        usePlanning().reset();
        useShell().reset();
        useRoster().reset();
        useCommandDraft().draft.value = '';
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(snapshot);
    });

    it('reorders and removes persisted priorities, retaining the selected task across a refresh', async () => {
        const second = {...item, id: 'two', item: 'Check the deployment', handler: 'heretic'};
        let plan = {...snapshot, items: [item, second], priorities: [item, second]};
        mockedInvoke.mockImplementation((command, args) => {
            if (command === 'save_priorities') {
                const {ids} = args as {ids: string[]};
                plan = {...plan, revision: 'r2', priorities: ids.map((id) => plan.items.find((row) => row.id === id)!)};
            }
            return Promise.resolve(plan);
        });
        useShell().navigate('mission-control');
        const wrapper = mount(MissionControl);
        await flushPromises();
        await wrapper.get('.backlog-row').trigger('click');
        expect(wrapper.get('[aria-label="Move priority up"]').attributes('disabled')).toBeDefined();
        await wrapper.get('[aria-label="Move priority down"]').trigger('click');
        await flushPromises();
        expect(mockedInvoke).toHaveBeenCalledWith('save_priorities', {expectedRevision: 'r1', ids: ['two', 'one']});
        expect(wrapper.findAll('.priority-row .text-left').map((b) => b.text())).toStrictEqual([
            'Check the deployment',
            'Inspect the service',
        ]);
        await wrapper.findAll('[aria-label="Move priority up"]')[1]!.trigger('click');
        await flushPromises();
        expect(usePlanning().snapshot.value.priorities.map((row) => row.id)).toStrictEqual(['one', 'two']);
        await wrapper.get('[aria-label="Remove priority"]').trigger('click');
        await flushPromises();
        expect(usePlanning().snapshot.value.priorities.map((row) => row.id)).toStrictEqual(['two']);
        expect(wrapper.findAll('button').some((b) => b.text() === 'Make a priority')).toBe(true);
        await wrapper.get('[aria-label="Filter by handler"]').setValue('heretic');
        expect(wrapper.findAll('.backlog-row')).toHaveLength(1);
        expect(wrapper.get('.backlog-row').text()).toContain('Check the deployment');
        plan = {...plan, items: [{...item, handler: 'mad-scientist'}, second]};
        await wrapper.get('[data-mc-refresh]').trigger('click');
        await flushPromises();
        expect(wrapper.get('aside').text()).toContain('mad-scientist');
    });

    it('prepares a sourced brief for either colleague without sending or replacing unfinished words', async () => {
        for (const colleague of ['mad-scientist', 'heretic'] as const) {
            useRoster().upsert({
                id: colleague,
                colleague,
                target: {kind: 'lab-root'},
                mission: '',
                state: 'idle',
                startedAt: '',
                lastStateChange: '',
            });
        }
        useShell().navigate('mission-control');
        const wrapper = mount(MissionControl);
        await flushPromises();
        await wrapper.get('.backlog-row').trigger('click');
        const prepare = (label: string) => wrapper.findAll('button').find((b) => b.text() === label)!;
        useCommandDraft().draft.value = 'Still writing';
        await prepare('Heretic').trigger('click');
        expect(wrapper.get('aside [role="alert"]').text()).toContain('unfinished draft');
        expect(useCommandDraft().draft.value).toBe('Still writing');
        expect(useShell().page.value).toBe('mission-control');
        useCommandDraft().draft.value = '';
        await prepare('Heretic').trigger('click');
        expect(useShell().page.value).toBe('conversation');
        expect(useRoster().selected.value).toBe('heretic');
        expect(useCommandDraft().draft.value).toContain('Inspect the service');
        expect(useCommandDraft().draft.value).toContain('[Evidence](source.md)');
        expect(useCommandDraft().draft.value).toContain('documents/lab-backlog.md');
        useShell().navigate('mission-control');
        await flushPromises();
        useCommandDraft().draft.value = '';
        await prepare('Mad Scientist').trigger('click');
        expect(useRoster().selected.value).toBe('mad-scientist');
        expect(mockedInvoke.mock.calls.some(([command]) => command === 'write_to_scientist')).toBe(false);
    });

    it('opens the fixed source and surfaces opening or refresh failures without discarding the plan', async () => {
        useShell().navigate('mission-control');
        const wrapper = mount(MissionControl);
        await flushPromises();
        const source = wrapper.findAll('button').find((b) => b.text() === 'Open source')!;
        mockedInvoke.mockResolvedValueOnce(undefined);
        await source.trigger('click');
        expect(mockedInvoke).toHaveBeenLastCalledWith('open_backlog_source');
        mockedInvoke.mockRejectedValueOnce(new Error('Source unavailable'));
        await source.trigger('click');
        await flushPromises();
        expect(wrapper.get('aside [role="alert"]').text()).toContain('Source unavailable');
        mockedInvoke.mockRejectedValueOnce(new Error('Backlog unreadable'));
        await wrapper.get('[data-mc-refresh]').trigger('click');
        await flushPromises();
        expect(wrapper.text()).toContain('Backlog unreadable');
        expect(wrapper.findAll('.backlog-row')).toHaveLength(1);
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
