import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import BalconySign from '../../src/balcony/BalconySign.vue';

describe('BalconySign', () => {
    it('renders the label and value', () => {
        const wrapper = mount(BalconySign, {props: {label: 'Last Chaos', value: '#00068'}});
        expect(wrapper.text()).toContain('Last Chaos');
        expect(wrapper.text()).toContain('#00068');
    });

    it('renders the sub line when provided', () => {
        const wrapper = mount(BalconySign, {
            props: {label: 'Last Chaos', value: '#00068', sub: 'Cardinal Candlelight · 8/10'},
        });
        expect(wrapper.text()).toContain('Cardinal Candlelight · 8/10');
    });

    it('emits a refresh event when the refresh button is clicked', async () => {
        const wrapper = mount(BalconySign, {props: {label: 'Idea Ledger', value: '4 CAND', refreshable: true}});
        const button = wrapper.find('[data-balcony-sign-refresh="Idea Ledger"]');
        await button.trigger('click');
        expect(wrapper.emitted('refresh')).toHaveLength(1);
    });

    it('hides the refresh button when refreshable is false', () => {
        const wrapper = mount(BalconySign, {props: {label: 'Reserved', value: 'More signs coming.'}});
        expect(wrapper.find('[data-balcony-sign-refresh]').exists()).toBe(false);
    });

    it('disables the refresh button while refreshing', () => {
        const wrapper = mount(BalconySign, {
            props: {label: 'Last Chaos', value: '#00068', refreshable: true, refreshing: true},
        });
        const button = wrapper.find('[data-balcony-sign-refresh="Last Chaos"]');
        expect(button.attributes('disabled')).toBeDefined();
    });

    it('marks the placeholder slot with a data attribute', () => {
        const wrapper = mount(BalconySign, {props: {label: 'Reserved', value: 'tbd', placeholder: true}});
        expect(wrapper.attributes('data-placeholder')).toBe('true');
    });
});
