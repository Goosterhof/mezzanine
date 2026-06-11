// RailingNameplate — one brass plate on the railing (#00057).
//
// The data/selection logic is carried from ScientistRow; these specs
// re-assert it in the horizontal geometry and cover the net-new
// crashed-plate treatment the sidebar row never had.

import {invoke} from '@tauri-apps/api/core';
import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {Scientist} from '../../src/roster/types';

import {useIdleWarning} from '../../src/roster/useIdleWarning';
import {useRoster} from '../../src/roster/useRoster';
import RailingNameplate from '../../src/shell/RailingNameplate.vue';

const mockedInvoke = vi.mocked(invoke);

const ANCHOR = Date.parse('2026-06-12T12:00:00Z');

function makeScientist(overrides: Partial<Scientist> = {}): Scientist {
    return {
        id: 'plate-1',
        target: {kind: 'experiment', codename: 'gatekeeper'},
        mission: 'check phpstan',
        state: 'working',
        startedAt: '2026-06-12T11:57:46Z',
        lastStateChange: '2026-06-12T11:57:46Z',
        ...overrides,
    };
}

describe('RailingNameplate — the Overlook #00057', () => {
    beforeEach(() => {
        useRoster().reset();
        useIdleWarning()._resetForTests();
        useIdleWarning()._setNowForTests(ANCHOR);
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(undefined);
    });

    it('renders pulse dot, target label, mission, and right-aligned elapsed', () => {
        const wrapper = mount(RailingNameplate, {props: {scientist: makeScientist()}});
        expect(wrapper.find('[data-state="working"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('The Gatekeeper');
        expect(wrapper.get('[data-mission]').text()).toBe('check phpstan');
        expect(wrapper.get('[data-elapsed]').text()).toBe('2m 14s');
    });

    it('hides the Recall affordance by default and reveals it on hover via group-hover', () => {
        const wrapper = mount(RailingNameplate, {props: {scientist: makeScientist()}});
        const recall = wrapper.get('[data-recall]');
        expect(recall.classes()).toContain('opacity-0');
        expect(recall.classes()).toContain('group-hover:opacity-100');
    });

    it('keeps the Recall affordance visible when selected', () => {
        useRoster().select('plate-1');
        const wrapper = mount(RailingNameplate, {props: {scientist: makeScientist()}});
        expect(wrapper.get('[data-recall]').classes()).toContain('opacity-100');
    });

    it('shows the brass border and the plumb-anchor at bottom center when selected', () => {
        useRoster().select('plate-1');
        const wrapper = mount(RailingNameplate, {props: {scientist: makeScientist()}});
        expect(wrapper.classes()).toContain('border-mz-brass');
        const anchor = wrapper.get('[data-plumb-anchor]');
        expect(anchor.classes()).toContain('plumb-anchor');
        expect(anchor.classes()).toContain('left-1/2');
        expect(anchor.classes()).toContain('-bottom-px');
    });

    it('omits the plumb-anchor when not selected', () => {
        const wrapper = mount(RailingNameplate, {props: {scientist: makeScientist()}});
        expect(wrapper.find('[data-plumb-anchor]').exists()).toBe(false);
    });

    it('clicking the plate selects the scientist', async () => {
        const wrapper = mount(RailingNameplate, {props: {scientist: makeScientist()}});
        await wrapper.trigger('click');
        expect(useRoster().selected.value).toBe('plate-1');
    });

    it('clicking Recall invokes the backend without selecting the plate', async () => {
        const wrapper = mount(RailingNameplate, {props: {scientist: makeScientist()}});
        await wrapper.get('[data-recall]').trigger('click');
        expect(mockedInvoke).toHaveBeenCalledWith('recall_scientist', {id: 'plate-1'});
        expect(useRoster().selected.value).toBeNull();
    });

    describe('crashed plate (net-new — not carried from ScientistRow)', () => {
        const crashed = makeScientist({state: 'crashed'});

        it('shows the red crashed pulse dot', () => {
            const wrapper = mount(RailingNameplate, {props: {scientist: crashed}});
            const dot = wrapper.get('[data-state="crashed"]');
            expect(dot.classes()).toContain('bg-mz-pulse-crashed');
        });

        it('takes the hairline crashed border', () => {
            const wrapper = mount(RailingNameplate, {props: {scientist: crashed}});
            expect(wrapper.attributes('data-crashed')).toBe('true');
            expect(wrapper.classes()).toContain('border-mz-pulse-crashed/40');
        });

        it('replaces the mission line with the failure voice', () => {
            const wrapper = mount(RailingNameplate, {props: {scientist: crashed}});
            expect(wrapper.get('[data-mission]').text()).toBe('Mission ended in failure. Recall to clear.');
            expect(wrapper.find('[data-elapsed]').exists()).toBe(false);
        });

        it('keeps the Recall affordance always visible — not hover-gated', () => {
            const wrapper = mount(RailingNameplate, {props: {scientist: crashed}});
            const recall = wrapper.get('[data-recall]');
            expect(recall.classes()).toContain('opacity-100');
            expect(recall.classes()).not.toContain('opacity-0');
        });
    });

    describe('idle-warning plate', () => {
        // Dispatched 90 minutes before ANCHOR, idle the whole time.
        const idle = makeScientist({
            state: 'idle',
            startedAt: '2026-06-12T10:30:00Z',
            lastStateChange: '2026-06-12T10:30:00Z',
        });

        it('dims the plate and shows the Idle 1h+ label in place of elapsed', () => {
            const wrapper = mount(RailingNameplate, {props: {scientist: idle}});
            expect(wrapper.classes()).toContain('opacity-70');
            expect(wrapper.get('[data-idle-warning-label]').text()).toBe('Idle 1h+');
            expect(wrapper.find('[data-elapsed]').exists()).toBe(false);
        });
    });

    describe('condensed plate (heavy-overflow tier)', () => {
        it('drops the mission line and shrinks the plate', () => {
            const wrapper = mount(RailingNameplate, {props: {scientist: makeScientist(), condensed: true}});
            expect(wrapper.find('[data-mission]').exists()).toBe(false);
            expect(wrapper.classes()).toContain('w-[120px]');
            expect(wrapper.get('[data-elapsed]').text()).toBe('2m 14s');
        });
    });
});
