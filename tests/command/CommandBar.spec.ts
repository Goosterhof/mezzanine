import {invoke} from '@tauri-apps/api/core';
import {mount} from '@vue/test-utils';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import CommandBar from '../../src/command/CommandBar.vue';
import {useSessions} from '../../src/session/useSessions';

const mockedInvoke = vi.mocked(invoke);

describe('CommandBar', () => {
    beforeEach(() => {
        useSessions().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(undefined);
    });

    it('renders the input with the laboratory placeholder', () => {
        const wrapper = mount(CommandBar);
        const input = wrapper.find('input');
        expect(input.exists()).toBe(true);
        expect(input.attributes('placeholder')).toBe('Direct the laboratory…');
    });

    it('renders the Direct stamp and the @<exp> routing hint', () => {
        const wrapper = mount(CommandBar);
        expect(wrapper.text()).toContain('Direct');
        expect(wrapper.text()).toContain('@<exp> routes by name');
    });

    it('disables autocomplete and spellcheck on the input', () => {
        const wrapper = mount(CommandBar);
        const input = wrapper.find('input');
        expect(input.attributes('autocomplete')).toBe('off');
        expect(input.attributes('spellcheck')).toBe('false');
    });

    it('v-models the typed value', async () => {
        const wrapper = mount(CommandBar);
        const input = wrapper.find('input');
        await input.setValue('@crucible run tests');
        expect((input.element as HTMLInputElement).value).toBe('@crucible run tests');
    });

    it('auto-focuses the input on mount', () => {
        const wrapper = mount(CommandBar, {attachTo: document.body});
        expect(document.activeElement).toBe(wrapper.find('input').element);
        wrapper.unmount();
    });

    describe('Enter dispatch', () => {
        it('invokes write_to_session with a trailing newline against the active bench', async () => {
            const sessions = useSessions();
            sessions.focus('crucible');
            const wrapper = mount(CommandBar);
            const input = wrapper.find('input');
            await input.setValue('phpstan');
            await input.trigger('keydown.enter');
            await Promise.resolve();
            expect(mockedInvoke).toHaveBeenCalledWith('write_to_session', {experiment: 'crucible', input: 'phpstan\n'});
        });

        it('clears the input after dispatch', async () => {
            useSessions().focus('crucible');
            const wrapper = mount(CommandBar);
            const input = wrapper.find('input');
            await input.setValue('phpstan');
            await input.trigger('keydown.enter');
            await Promise.resolve();
            expect((input.element as HTMLInputElement).value).toBe('');
        });

        it('is a no-op when there is no active bench', async () => {
            const wrapper = mount(CommandBar);
            const input = wrapper.find('input');
            await input.setValue('phpstan');
            await input.trigger('keydown.enter');
            expect(mockedInvoke).not.toHaveBeenCalled();
        });

        it('is a no-op when the input is empty', async () => {
            useSessions().focus('crucible');
            const wrapper = mount(CommandBar);
            const input = wrapper.find('input');
            await input.trigger('keydown.enter');
            expect(mockedInvoke).not.toHaveBeenCalled();
        });
    });

    describe('@<exp> prefix routing', () => {
        it('routes to the named bench regardless of the active one', async () => {
            useSessions().focus('gatekeeper');
            const wrapper = mount(CommandBar);
            const input = wrapper.find('input');
            await input.setValue('@crucible run phpstan');
            await input.trigger('keydown.enter');
            await Promise.resolve();
            expect(mockedInvoke).toHaveBeenCalledWith('write_to_session', {
                experiment: 'crucible',
                input: 'run phpstan\n',
            });
        });

        it('strips the prefix from the payload', async () => {
            useSessions().focus('gatekeeper');
            const wrapper = mount(CommandBar);
            const input = wrapper.find('input');
            await input.setValue('@war-table check OCR confidence');
            await input.trigger('keydown.enter');
            await Promise.resolve();
            expect(mockedInvoke).toHaveBeenCalledWith('write_to_session', {
                experiment: 'war-table',
                input: 'check OCR confidence\n',
            });
        });

        it('falls through to the active bench when the prefix names an unknown experiment', async () => {
            useSessions().focus('gatekeeper');
            const wrapper = mount(CommandBar);
            const input = wrapper.find('input');
            await input.setValue('@unknown-bench foo');
            await input.trigger('keydown.enter');
            await Promise.resolve();
            expect(mockedInvoke).toHaveBeenCalledWith('write_to_session', {
                experiment: 'gatekeeper',
                input: '@unknown-bench foo\n',
            });
        });

        it('treats a bare prefix without a payload as plain text', async () => {
            useSessions().focus('gatekeeper');
            const wrapper = mount(CommandBar);
            const input = wrapper.find('input');
            await input.setValue('@crucible');
            await input.trigger('keydown.enter');
            await Promise.resolve();
            expect(mockedInvoke).toHaveBeenCalledWith('write_to_session', {
                experiment: 'gatekeeper',
                input: '@crucible\n',
            });
        });
    });
});
