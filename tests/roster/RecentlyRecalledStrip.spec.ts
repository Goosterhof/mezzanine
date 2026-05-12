import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it} from 'vitest';

import type {RecalledScientist, Scientist} from '../../src/roster/types';

import RecentlyRecalledStrip from '../../src/roster/RecentlyRecalledStrip.vue';
import {useIdleWarning} from '../../src/roster/useIdleWarning';
import {useRoster} from '../../src/roster/useRoster';

const ANCHOR = Date.parse('2026-05-12T12:00:00Z');

function makeRecalled(id: string, recalledAt: string, mission = 'check phpstan'): RecalledScientist {
    const scientist: Scientist = {
        id,
        target: {kind: 'experiment', codename: 'crucible'},
        mission,
        state: 'done',
        startedAt: '2026-05-12T11:00:00Z',
        lastStateChange: recalledAt,
    };
    return {scientist, recalledAt};
}

describe('RecentlyRecalledStrip — Phase 2A', () => {
    beforeEach(() => {
        useRoster().reset();
        useIdleWarning()._resetForTests();
        useIdleWarning()._setNowForTests(ANCHOR);
    });

    it('renders one row per recalled scientist, sorted newest-first', () => {
        const roster = useRoster();
        roster.setRecalledStrip([makeRecalled('a', '2026-05-12T11:55:00Z'), makeRecalled('b', '2026-05-12T11:59:30Z')]);
        const wrapper = mount(RecentlyRecalledStrip);
        const rows = wrapper.findAll('[data-recalled-id]');
        expect(rows).toHaveLength(2);
        expect(rows[0]!.attributes('data-recalled-id')).toBe('b');
        expect(rows[1]!.attributes('data-recalled-id')).toBe('a');
    });

    it('renders the seconds-ago label under 60 seconds', () => {
        const roster = useRoster();
        roster.setRecalledStrip([makeRecalled('a', '2026-05-12T11:59:30Z')]);
        const wrapper = mount(RecentlyRecalledStrip);
        expect(wrapper.text()).toContain('30s ago');
    });

    it('renders the minutes-ago label past 60 seconds', () => {
        const roster = useRoster();
        roster.setRecalledStrip([makeRecalled('a', '2026-05-12T11:57:00Z')]);
        const wrapper = mount(RecentlyRecalledStrip);
        expect(wrapper.text()).toContain('3m ago');
    });

    it('renders em dash for unparseable recalledAt', () => {
        const roster = useRoster();
        roster.setRecalledStrip([makeRecalled('a', 'nope')]);
        const wrapper = mount(RecentlyRecalledStrip);
        expect(wrapper.text()).toContain('—');
    });

    it('renders mission text or em dash when empty', () => {
        const roster = useRoster();
        roster.setRecalledStrip([makeRecalled('a', '2026-05-12T11:59:30Z', '')]);
        const wrapper = mount(RecentlyRecalledStrip);
        expect(wrapper.text()).toContain('—');
    });

    it('shows the Recently Recalled header', () => {
        const roster = useRoster();
        roster.setRecalledStrip([makeRecalled('a', '2026-05-12T11:59:30Z')]);
        const wrapper = mount(RecentlyRecalledStrip);
        expect(wrapper.text()).toContain('Recently Recalled');
    });
});
