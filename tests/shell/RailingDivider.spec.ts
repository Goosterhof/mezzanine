// RailingDivider — the brass-post edge and its pencil plumb-line
// (#00057, restyled by #00059 J-4).
//
// The divider is decorative chrome (aria-hidden) except for one column:
// the plumb-line that pierces it at the selected sprite's station x.
// The balustrade stays brass — the machine upstairs keeps its rail —
// but the line that drops to the page below is pencil now, asserted
// against the PENCIL constant imported from the pen itself: the plumb
// and the floor's construction ghosts share one graphite. The contract
// otherwise holds — present only on selection, 1.5px, draw-on via
// stroke-dashoffset during the drop window, instant under
// prefers-reduced-motion.

import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import {PENCIL} from '../../src/observer/pen';
import RailingDivider from '../../src/shell/RailingDivider.vue';

describe('RailingDivider — the Overlook #00057 · the Field Journal #00059', () => {
    it('renders the brass-post balustrade as decorative chrome — the rail stays brass', () => {
        const wrapper = mount(RailingDivider);
        const divider = wrapper.get('[data-railing-divider]');
        expect(divider.attributes('aria-hidden')).toBe('true');
        expect(wrapper.get('[data-divider-toprail]').attributes('fill')).toBe('#D4A24C');
    });

    it('draws no plumb-line when nothing is selected', () => {
        const wrapper = mount(RailingDivider, {props: {selectedX: null}});
        expect(wrapper.find('[data-plumb-line]').exists()).toBe(false);
    });

    it('drops the plumb-line at the selected station x — pencil, never brass (#00059 J-4)', () => {
        const wrapper = mount(RailingDivider, {props: {selectedX: 240, dropLength: 180}});
        const svg = wrapper.get('[data-plumb-line]');
        expect((svg.element as unknown as HTMLElement).style.left).toBe('240px');
        const line = svg.get('line');
        expect(line.attributes('stroke')).toBe(PENCIL);
        expect(line.attributes('stroke')).not.toBe('#D4A24C');
        expect(line.attributes('stroke-width')).toBe('1.5');
        expect(line.attributes('y2')).toBe('180');
    });

    it('hangs the line from a sketched nail mark at the top anchor', () => {
        const wrapper = mount(RailingDivider, {props: {selectedX: 240}});
        const nail = wrapper.get('[data-plumb-nail]');
        expect(nail.attributes('stroke')).toBe(PENCIL);
        expect(nail.attributes('fill')).toBe('none');
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

    it('lands with the graphite dot at the floor end of the line', () => {
        const wrapper = mount(RailingDivider, {props: {selectedX: 100, dropLength: 150}});
        const tip = wrapper.get('circle.plumb-tip');
        expect(tip.attributes('cy')).toBe('150');
        expect(tip.attributes('fill')).toBe(PENCIL);
    });
});
