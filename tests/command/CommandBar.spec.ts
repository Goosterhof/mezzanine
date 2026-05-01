import {mount} from '@vue/test-utils';
import {describe, it, expect} from 'vitest';

import CommandBar from '../../src/command/CommandBar.vue';

describe('CommandBar', () => {
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
});
