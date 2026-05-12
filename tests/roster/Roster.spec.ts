import {invoke} from '@tauri-apps/api/core';
import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {RecalledScientist, Scientist} from '../../src/roster/types';

import Roster from '../../src/roster/Roster.vue';
import {useIdleWarning} from '../../src/roster/useIdleWarning';
import {useRoster} from '../../src/roster/useRoster';
import {useScientistTerminals} from '../../src/roster/useScientistTerminals';

const mockedInvoke = vi.mocked(invoke);

const ANCHOR = Date.parse('2026-05-12T12:00:00Z');

function makeScientist(id: string, startedAt: string): Scientist {
    return {
        id,
        target: {kind: 'experiment', codename: 'crucible'},
        mission: `mission ${id}`,
        state: 'working',
        startedAt,
        lastStateChange: startedAt,
    };
}

function makeRecalled(id: string, recalledAt: string): RecalledScientist {
    return {scientist: makeScientist(id, recalledAt), recalledAt};
}

describe('Roster — Phase 2A', () => {
    beforeEach(() => {
        useRoster().reset();
        useIdleWarning()._resetForTests();
        useIdleWarning()._setNowForTests(ANCHOR);
        useScientistTerminals().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(undefined);
    });

    it('renders the empty-state copy when no scientists are dispatched', () => {
        const wrapper = mount(Roster);
        expect(wrapper.find('[data-roster-empty]').text()).toContain('Balcony quiet. No scientists dispatched.');
    });

    it('does not render the scrolling list when empty', () => {
        const wrapper = mount(Roster);
        expect(wrapper.find('[data-roster-list]').exists()).toBe(false);
    });

    it('renders one row per dispatched scientist, sorted newest-first', () => {
        const roster = useRoster();
        roster.upsert(makeScientist('older', '2026-05-12T11:00:00Z'));
        roster.upsert(makeScientist('newer', '2026-05-12T11:30:00Z'));
        const wrapper = mount(Roster);
        const rows = wrapper.findAll('[data-scientist-id]');
        expect(rows).toHaveLength(2);
        expect(rows[0]!.attributes('data-scientist-id')).toBe('newer');
        expect(rows[1]!.attributes('data-scientist-id')).toBe('older');
    });

    it('hides the empty-state copy when at least one scientist is dispatched', () => {
        const roster = useRoster();
        roster.upsert(makeScientist('a', '2026-05-12T11:00:00Z'));
        const wrapper = mount(Roster);
        expect(wrapper.find('[data-roster-empty]').exists()).toBe(false);
    });

    it('renders the recalled strip when the strip is non-empty', () => {
        const roster = useRoster();
        roster.setRecalledStrip([makeRecalled('x', '2026-05-12T11:59:00Z')]);
        const wrapper = mount(Roster);
        expect(wrapper.find('[data-recalled-strip]').exists()).toBe(true);
    });

    it('omits the recalled strip when nothing has been recently recalled', () => {
        const wrapper = mount(Roster);
        expect(wrapper.find('[data-recalled-strip]').exists()).toBe(false);
    });
});
