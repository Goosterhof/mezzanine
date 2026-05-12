import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import TargetPicker from '../../src/balcony/TargetPicker.vue';

describe('TargetPicker', () => {
    it('renders the four target groups', () => {
        const wrapper = mount(TargetPicker, {props: {selected: null}});
        expect(wrapper.text()).toContain('Experiments');
        expect(wrapper.text()).toContain('Gadgets');
        expect(wrapper.text()).toContain('Packages');
        expect(wrapper.text()).toContain('The Lab');
    });

    it('renders one button per target', () => {
        const wrapper = mount(TargetPicker, {props: {selected: null}});
        const buttons = wrapper.findAll('[data-target-key]');
        expect(buttons).toHaveLength(13);
    });

    it('marks the selected target with data-selected=true', () => {
        const wrapper = mount(TargetPicker, {props: {selected: {kind: 'experiment', codename: 'crucible'}}});
        const button = wrapper.get('[data-target-key="experiment:crucible"]');
        expect(button.attributes('data-selected')).toBe('true');
        const other = wrapper.get('[data-target-key="experiment:gatekeeper"]');
        expect(other.attributes('data-selected')).toBe('false');
    });

    it('marks the lab-root target correctly when selected', () => {
        const wrapper = mount(TargetPicker, {props: {selected: {kind: 'lab-root'}}});
        const labRoot = wrapper.get('[data-target-key="lab-root"]');
        expect(labRoot.attributes('data-selected')).toBe('true');
    });

    it('emits select with the target when a button is clicked', async () => {
        const wrapper = mount(TargetPicker, {props: {selected: null}});
        const button = wrapper.get('[data-target-key="gadget:mezzanine"]');
        await button.trigger('click');
        const events = wrapper.emitted('select') ?? [];
        expect(events).toHaveLength(1);
        expect(events[0]).toStrictEqual([{kind: 'gadget', codename: 'mezzanine'}]);
    });

    it('renders no selection state when selected is null', () => {
        const wrapper = mount(TargetPicker, {props: {selected: null}});
        const buttons = wrapper.findAll('[data-target-key]');
        for (const button of buttons) {
            expect(button.attributes('data-selected')).toBe('false');
        }
    });
});
