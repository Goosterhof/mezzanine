import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it} from 'vitest';

import Balustrade from '../../src/shell/Balustrade.vue';
import {PAGES, useShell} from '../../src/shell/useShell';
describe('Balustrade — page navigation', () => {
    beforeEach(() => useShell().reset());
    it('names every page and marks the current destination', async () => {
        const wrapper = mount(Balustrade);
        expect(wrapper.get('nav').attributes('aria-label')).toBe('Mezzanine pages');
        expect(wrapper.findAll('button').map((b) => b.text())).toStrictEqual(PAGES.map((p) => p.label));
        for (const page of PAGES) {
            await wrapper.get(`[data-page-link="${page.id}"]`).trigger('click');
            expect(useShell().page.value).toBe(page.id);
            expect(wrapper.findAll('[aria-current="page"]')).toHaveLength(1);
            expect(wrapper.get('[aria-current="page"]').text()).toBe(page.label);
        }
    });
    it('keeps a page open when its navigation button is pressed again', async () => {
        const wrapper = mount(Balustrade);
        const button = wrapper.get('[data-page-link="drydock"]');
        await button.trigger('click');
        await button.trigger('click');
        expect(useShell().page.value).toBe('drydock');
    });
    it('keeps laboratory status signs off the conversation chrome', () => {
        const wrapper = mount(Balustrade);
        expect(wrapper.text()).toContain('The Mezzanine');
        expect(wrapper.text()).not.toContain('Last Chaos');
        expect(wrapper.text()).not.toContain('Idea Ledger');
    });
});
