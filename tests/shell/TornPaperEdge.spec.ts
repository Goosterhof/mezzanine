// TornPaperEdge — the seam between the storeys (#00059 J-4).
//
// The brass railing holds the page; the paper tears away below it.
// The fill is asserted against the PAPER constant imported from the
// pen — exact equality, not "in range": the torn edge and the canvas
// paper background share one definition and the spec is the enforcement
// mechanism (§10 divergence #6).
//
// Stacking note (acceptance §7 J-4): the pencil plumb-line in
// RailingDivider renders ABOVE this edge — the line carries z-10, the
// edge z-[5]; the line hangs over the page, never under it.

import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import {PAPER} from '../../src/observer/pen';
import TornPaperEdge from '../../src/shell/TornPaperEdge.vue';

describe('TornPaperEdge — the Field Journal #00059 J-4', () => {
    it('renders the torn edge as decorative chrome — aria-hidden, no pointer surface', () => {
        const wrapper = mount(TornPaperEdge);
        const edge = wrapper.get('[data-torn-paper-edge]');
        expect(edge.attributes('aria-hidden')).toBe('true');
        expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true');
    });

    it('fills the zigzag with PAPER — the exact constant from the pen, no drift possible', () => {
        const wrapper = mount(TornPaperEdge);
        const fill = wrapper.get('[data-torn-paper-fill]').attributes('fill');
        expect(fill).toBe(PAPER);
        expect(fill).toBe('#f3ecdc');
    });

    it('tears in a non-uniform zigzag — a hand tore this page, not a machine', () => {
        const wrapper = mount(TornPaperEdge);
        const d = wrapper.get('[data-torn-paper-fill]').attributes('d') ?? '';
        // More than a dozen jag points, and irregular y-values — the
        // mock's hand-drawn tear, ported verbatim.
        const points = d.match(/L\d+/g) ?? [];
        expect(points.length).toBeGreaterThan(12);
    });

    it('stacks below the plumb-line — the pencil hangs over the page', () => {
        const wrapper = mount(TornPaperEdge);
        // The edge claims z-[5]; RailingDivider's plumb svg claims z-10.
        expect(wrapper.get('[data-torn-paper-edge]').classes().join(' ')).toContain('z-[5]');
    });
});
