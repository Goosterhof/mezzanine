import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import type {MissionState} from '../../src/roster/types';

import PulseDot from '../../src/roster/PulseDot.vue';

describe('PulseDot', () => {
    it('renders the state on data-state for every MissionState', () => {
        const states: MissionState[] = ['idle', 'working', 'awaiting', 'done', 'crashed'];
        for (const state of states) {
            const wrapper = mount(PulseDot, {props: {state}});
            expect(wrapper.attributes('data-state')).toBe(state);
            expect(wrapper.attributes('aria-label')).toContain(state);
        }
    });

    it('uses the idle pulse class by default', () => {
        const wrapper = mount(PulseDot, {props: {state: 'idle'}});
        expect(wrapper.classes()).toContain('bg-mz-pulse-idle');
    });

    it('switches to the signal colour when idle-warning is set', () => {
        const wrapper = mount(PulseDot, {props: {state: 'idle', idleWarning: true}});
        expect(wrapper.classes()).toContain('bg-mz-signal');
        expect(wrapper.attributes('data-idle-warning')).toBe('true');
    });

    it('working state carries the pulse animation class', () => {
        const wrapper = mount(PulseDot, {props: {state: 'working'}});
        expect(wrapper.classes()).toContain('bg-mz-pulse-working');
    });

    it('crashed state shows the crashed pulse colour', () => {
        const wrapper = mount(PulseDot, {props: {state: 'crashed'}});
        expect(wrapper.classes()).toContain('bg-mz-pulse-crashed');
    });

    it('done state shows the flash colour', () => {
        const wrapper = mount(PulseDot, {props: {state: 'done'}});
        expect(wrapper.classes()).toContain('bg-mz-pulse-flash');
    });

    it('awaiting state shows the awaiting pulse colour', () => {
        const wrapper = mount(PulseDot, {props: {state: 'awaiting'}});
        expect(wrapper.classes()).toContain('bg-mz-pulse-awaiting');
    });
});
