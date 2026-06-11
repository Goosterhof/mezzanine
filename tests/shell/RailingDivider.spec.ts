// RailingDivider — the brass-post edge and its plumb-line (#00057).
//
// The divider is decorative chrome (aria-hidden) except for one column:
// the plumb-line that pierces it at the selected sprite's station x.
// These specs assert the line's contract — present only on selection,
// brass, 1.5px, draw-on via stroke-dashoffset during the drop window.

import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import RailingDivider from '../../src/shell/RailingDivider.vue';

describe('RailingDivider — the Overlook #00057', () => {
    it('renders the brass-post balustrade as decorative chrome', () => {
        const wrapper = mount(RailingDivider);
        const divider = wrapper.get('[data-railing-divider]');
        expect(divider.attributes('aria-hidden')).toBe('true');
        expect(wrapper.get('[data-divider-toprail]').attributes('fill')).toBe('#D4A24C');
    });

    it('draws no plumb-line when nothing is selected', () => {
        const wrapper = mount(RailingDivider, {props: {selectedX: null}});
        expect(wrapper.find('[data-plumb-line]').exists()).toBe(false);
    });

    it('drops the plumb-line at the selected station x', () => {
        const wrapper = mount(RailingDivider, {props: {selectedX: 240, dropLength: 180}});
        const svg = wrapper.get('[data-plumb-line]');
        expect((svg.element as unknown as HTMLElement).style.left).toBe('240px');
        const line = svg.get('line');
        expect(line.attributes('stroke')).toBe('#D4A24C');
        expect(line.attributes('stroke-width')).toBe('1.5');
        expect(line.attributes('y2')).toBe('180');
    });

    it('arms the draw-on during the drop window via the dropping class', () => {
        const dropping = mount(RailingDivider, {props: {selectedX: 240, dropping: true}});
        expect(dropping.get('line').classes()).toContain('dropping');
        const settled = mount(RailingDivider, {props: {selectedX: 240, dropping: false}});
        expect(settled.get('line').classes()).not.toContain('dropping');
    });

    it('feeds the draw-on length through the --len custom property', () => {
        const wrapper = mount(RailingDivider, {props: {selectedX: 100, dropLength: 222}});
        const line = wrapper.get('line').element as unknown as HTMLElement;
        expect(line.style.getPropertyValue('--len')).toBe('222px');
    });

    it('lands with the attention glow at the floor end of the line', () => {
        const wrapper = mount(RailingDivider, {props: {selectedX: 100, dropLength: 150}});
        const tip = wrapper.get('circle.plumb-tip');
        expect(tip.attributes('cy')).toBe('150');
        expect(tip.attributes('fill')).toBe('#D4A24C');
    });
});
