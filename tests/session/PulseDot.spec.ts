import {mount} from '@vue/test-utils';
import {describe, it, expect} from 'vitest';

import type {SessionState} from '../../src/session/types';

import PulseDot from '../../src/session/PulseDot.vue';

describe('PulseDot', () => {
    const cases: Array<{state: SessionState; classFragment: string}> = [
        {state: 'idle', classFragment: 'bg-wb-pulse-idle'},
        {state: 'awaiting', classFragment: 'bg-wb-pulse-awaiting'},
        {state: 'working', classFragment: 'bg-wb-pulse-working'},
        {state: 'completed-unseen', classFragment: 'bg-wb-pulse-flash'},
        {state: 'crashed', classFragment: 'bg-wb-pulse-crashed'},
    ];

    it.each(cases)('renders the $state state with the right pulse class', ({state, classFragment}) => {
        const wrapper = mount(PulseDot, {props: {state}});
        expect(wrapper.attributes('class')).toContain(classFragment);
    });

    it('reacts when the state prop changes', async () => {
        const wrapper = mount(PulseDot, {props: {state: 'idle'}});
        expect(wrapper.attributes('class')).toContain('bg-wb-pulse-idle');
        await wrapper.setProps({state: 'working'});
        expect(wrapper.attributes('class')).toContain('bg-wb-pulse-working');
        expect(wrapper.attributes('class')).not.toContain('bg-wb-pulse-idle');
    });

    it('attaches the working animation only in the working state', () => {
        const working = mount(PulseDot, {props: {state: 'working'}});
        const idle = mount(PulseDot, {props: {state: 'idle'}});
        expect(working.attributes('class')).toContain('animate-pulse-working');
        expect(idle.attributes('class')).not.toContain('animate-pulse-working');
    });
});
