import {invoke} from '@tauri-apps/api/core';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {Scientist} from '../../src/roster/types';

import CommandBar from '../../src/command/CommandBar.vue';
import {useCommandDraft} from '../../src/command/useCommandDraft';
import {_resetForTests, useLastKeystroke} from '../../src/command/useLastKeystroke';
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
        useCommandDraft().draft.value = '';
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
        expect(mockedInvoke).toHaveBeenCalledWith('write_to_scientist', {id: 'a', input: 'hello\r'});
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

    it('sends a multiline prepared brief as one bracketed paste and leaves Shift+Enter for editing', async () => {
        useRoster().upsert(makeScientist('a'));
        useRoster().select('a');
        const wrapper = mount(CommandBar);
        const input = wrapper.get('[data-command-input]');
        await input.setValue('Inspect this task.\nSource: backlog');
        await input.trigger('keydown.enter', {shiftKey: true});
        expect(mockedInvoke).not.toHaveBeenCalledWith('write_to_scientist', expect.anything());
        await input.trigger('keydown.enter');
        await flushPromises();
        expect(mockedInvoke).toHaveBeenCalledWith('write_to_scientist', {
            id: 'a',
            input: '\x1b[200~Inspect this task.\nSource: backlog\x1b[201~\r',
        });
    });

    it('retains the failed brief and new typing when the terminal write rejects', async () => {
        useRoster().upsert(makeScientist('a'));
        useRoster().select('a');
        let rejectWrite!: (error: Error) => void;
        mockedInvoke.mockReturnValue(
            new Promise((_resolve, reject) => {
                rejectWrite = reject;
            }),
        );
        const wrapper = mount(CommandBar);
        const input = wrapper.get('[data-command-input]');
        await input.setValue('Original brief');
        await input.trigger('keydown.enter');
        await input.setValue('New thought');
        rejectWrite(new Error('Terminal unavailable'));
        await flushPromises();
        expect(useCommandDraft().draft.value).toBe('Original brief\n\nNew thought');
        expect(wrapper.get('[role="alert"]').text()).toContain('Terminal unavailable');
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

    it('notes every keystroke for the Errand Floor: a minion never climbs over a line being written (#00067 P2)', async () => {
        _resetForTests();
        const wrapper = mount(CommandBar);
        expect(useLastKeystroke().msSince()).toBe(Number.POSITIVE_INFINITY);
        await wrapper.get('[data-command-input]').trigger('keydown', {key: 'a'});
        expect(useLastKeystroke().msSince()).toBeLessThan(1000);
    });
});
