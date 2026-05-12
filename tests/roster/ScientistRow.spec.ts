import {invoke} from '@tauri-apps/api/core';
import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {nextTick} from 'vue';

import type {Scientist} from '../../src/roster/types';

import ScientistRow from '../../src/roster/ScientistRow.vue';
import {useIdleWarning} from '../../src/roster/useIdleWarning';
import {useRoster} from '../../src/roster/useRoster';
import {useScientistTerminals} from '../../src/roster/useScientistTerminals';

const mockedInvoke = vi.mocked(invoke);

const ANCHOR = Date.parse('2026-05-12T12:00:00Z');

function makeScientist(overrides: Partial<Scientist> = {}): Scientist {
    return {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        target: {kind: 'experiment', codename: 'crucible'},
        mission: 'check phpstan',
        state: 'working',
        startedAt: '2026-05-12T11:55:30Z',
        lastStateChange: '2026-05-12T11:55:30Z',
        ...overrides,
    };
}

describe('ScientistRow — Phase 2A', () => {
    beforeEach(() => {
        useRoster().reset();
        useIdleWarning()._resetForTests();
        useIdleWarning()._setNowForTests(ANCHOR);
        useScientistTerminals().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(undefined);
    });

    it('renders the target label and mission text', () => {
        const wrapper = mount(ScientistRow, {props: {scientist: makeScientist()}});
        expect(wrapper.text()).toContain('The Crucible');
        expect(wrapper.text()).toContain('check phpstan');
    });

    it('falls back to em dash when mission is empty', () => {
        const wrapper = mount(ScientistRow, {props: {scientist: makeScientist({mission: ''})}});
        expect(wrapper.get('[data-mission]').text()).toBe('—');
    });

    it('renders seconds-then-minutes-then-hours elapsed', () => {
        const wrapper = mount(ScientistRow, {props: {scientist: makeScientist({startedAt: '2026-05-12T11:59:30Z'})}});
        // 30 seconds before ANCHOR
        expect(wrapper.get('[data-elapsed]').text()).toBe('30s');
    });

    it('renders minutes-and-seconds past the 60s mark', () => {
        const wrapper = mount(ScientistRow, {props: {scientist: makeScientist({startedAt: '2026-05-12T11:57:46Z'})}});
        // 2m 14s before ANCHOR
        expect(wrapper.get('[data-elapsed]').text()).toBe('2m 14s');
    });

    it('renders hours-and-minutes past the hour mark', () => {
        const wrapper = mount(ScientistRow, {props: {scientist: makeScientist({startedAt: '2026-05-12T09:15:00Z'})}});
        // 2h 45m before ANCHOR
        expect(wrapper.get('[data-elapsed]').text()).toBe('2h 45m');
    });

    it('renders em dash when startedAt is unparseable', () => {
        const wrapper = mount(ScientistRow, {props: {scientist: makeScientist({startedAt: 'nope'})}});
        expect(wrapper.get('[data-elapsed]').text()).toBe('—');
    });

    it('flags the row with data-selected when the roster has it selected', async () => {
        const roster = useRoster();
        const s = makeScientist();
        roster.upsert(s);
        roster.select(s.id);
        const wrapper = mount(ScientistRow, {props: {scientist: s}});
        await nextTick();
        expect(wrapper.attributes('data-selected')).toBe('true');
    });

    it('clicking the row selects the scientist on the roster singleton', async () => {
        const roster = useRoster();
        const s = makeScientist();
        roster.upsert(s);
        const wrapper = mount(ScientistRow, {props: {scientist: s}});
        await wrapper.trigger('click');
        expect(roster.selected.value).toBe(s.id);
    });

    it('clicking Recall invokes recall_scientist and does NOT bubble selection', async () => {
        const roster = useRoster();
        const s = makeScientist();
        roster.upsert(s);
        const wrapper = mount(ScientistRow, {props: {scientist: s}});
        const recallButton = wrapper.get('[data-recall]');
        await recallButton.trigger('click');
        const calls = mockedInvoke.mock.calls.map((c) => c[0]);
        expect(calls).toContain('recall_scientist');
        // The row click handler should NOT fire — selection stays null.
        expect(roster.selected.value).toBeNull();
    });

    it('paints the row with the idle-warning treatment past 1 hour idle', () => {
        const oneHourAgo = new Date(ANCHOR - 60 * 60 * 1000).toISOString();
        const s = makeScientist({state: 'idle', lastStateChange: oneHourAgo});
        const wrapper = mount(ScientistRow, {props: {scientist: s}});
        expect(wrapper.attributes('data-idle-warning')).toBe('true');
        expect(wrapper.find('[data-idle-warning-label]').exists()).toBe(true);
    });

    it('does NOT paint the idle-warning treatment for a recently-idle scientist', () => {
        const fiveMinutesAgo = new Date(ANCHOR - 5 * 60 * 1000).toISOString();
        const s = makeScientist({state: 'idle', lastStateChange: fiveMinutesAgo});
        const wrapper = mount(ScientistRow, {props: {scientist: s}});
        expect(wrapper.attributes('data-idle-warning')).toBe('false');
        expect(wrapper.find('[data-idle-warning-label]').exists()).toBe(false);
    });
});
