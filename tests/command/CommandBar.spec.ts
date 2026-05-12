import {invoke} from '@tauri-apps/api/core';
import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {Scientist} from '../../src/roster/types';

import CommandBar from '../../src/command/CommandBar.vue';
import {useRoster} from '../../src/roster/useRoster';
import {useRosterBackend} from '../../src/roster/useRosterBackend';
import {useScientistTerminals} from '../../src/roster/useScientistTerminals';

const mockedInvoke = vi.mocked(invoke);

function makeScientist(id: string): Scientist {
    return {
        id,
        target: {kind: 'experiment', codename: 'crucible'},
        mission: 'm',
        state: 'awaiting',
        startedAt: '2026-05-12T10:00:00Z',
        lastStateChange: '2026-05-12T10:00:00Z',
    };
}

describe('CommandBar — Phase 2A', () => {
    beforeEach(() => {
        useRoster().reset();
        useScientistTerminals().reset();
        useRosterBackend()._resetSubscriptionForTests();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(undefined);
    });

    it('renders the bench-quiet copy and the input', () => {
        const wrapper = mount(CommandBar);
        expect(wrapper.text()).toContain('Direct');
        expect(wrapper.find('[data-command-input]').exists()).toBe(true);
    });

    it('input v-model updates as the investor types', async () => {
        const wrapper = mount(CommandBar);
        const input = wrapper.get('[data-command-input]');
        await input.setValue('check phpstan');
        expect((input.element as HTMLInputElement).value).toBe('check phpstan');
    });

    it('Enter dispatches write_to_scientist with a trailing newline to the selected scientist', async () => {
        const roster = useRoster();
        roster.upsert(makeScientist('a'));
        roster.select('a');
        const wrapper = mount(CommandBar);
        const input = wrapper.get('[data-command-input]');
        await input.setValue('hello');
        await input.trigger('keydown.enter');
        await Promise.resolve();
        expect(mockedInvoke).toHaveBeenCalledWith('write_to_scientist', {id: 'a', input: 'hello\n'});
    });

    it('Enter clears the input on dispatch', async () => {
        const roster = useRoster();
        roster.upsert(makeScientist('a'));
        roster.select('a');
        const wrapper = mount(CommandBar);
        const input = wrapper.get('[data-command-input]');
        await input.setValue('hello');
        await input.trigger('keydown.enter');
        await Promise.resolve();
        expect((input.element as HTMLInputElement).value).toBe('');
    });

    it('Enter is a no-op when the input is empty', async () => {
        const roster = useRoster();
        roster.upsert(makeScientist('a'));
        roster.select('a');
        const wrapper = mount(CommandBar);
        const input = wrapper.get('[data-command-input]');
        await input.trigger('keydown.enter');
        await Promise.resolve();
        expect(mockedInvoke).not.toHaveBeenCalledWith('write_to_scientist', expect.anything());
    });

    it('Enter is a no-op when no scientist is selected', async () => {
        const wrapper = mount(CommandBar);
        const input = wrapper.get('[data-command-input]');
        await input.setValue('hello');
        await input.trigger('keydown.enter');
        await Promise.resolve();
        expect(mockedInvoke).not.toHaveBeenCalledWith('write_to_scientist', expect.anything());
    });
});
