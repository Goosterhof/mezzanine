import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import MinionsDue from '../../src/mission/MinionsDue.vue';

describe('MinionsDue', () => {
    it('renders the empty state when no signals are pending', () => {
        const wrapper = mount(MinionsDue, {props: {signals: []}});
        expect(wrapper.text()).toContain('All minions recently active.');
    });

    it('renders one row per pending signal with date, type, target, message and dispatch', () => {
        const wrapper = mount(MinionsDue, {
            props: {
                signals: [
                    {
                        date: '2026-04-15',
                        source: 'The Inheritance',
                        signalType: 'Neglect Alert',
                        target: 'War Table',
                        message: 'Attention 28/100',
                        recommendedDispatch: '@muse war-table',
                    },
                ],
            },
        });
        expect(wrapper.text()).toContain('2026-04-15');
        expect(wrapper.text()).toContain('Neglect Alert');
        expect(wrapper.text()).toContain('War Table');
        expect(wrapper.text()).toContain('Attention 28/100');
        expect(wrapper.text()).toContain('@muse war-table');
    });
});
