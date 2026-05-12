import {invoke} from '@tauri-apps/api/core';
import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {nextTick} from 'vue';

import {useBalconySigns} from '../../src/balcony/useBalconySigns';
import {useDispatch} from '../../src/balcony/useDispatch';
import BalconyRail from '../../src/shell/BalconyRail.vue';

const mockedInvoke = vi.mocked(invoke);

const SIGNS_WITH_CHAOS = {
    lastChaos: {
        reportNumber: 68,
        label: 'Cardinal Candlelight',
        score: '8/10',
        raw: '#00068 — Cardinal Candlelight — 8/10',
    },
    ideaLedger: {candidateCount: 4, shelvedCount: 12, mostRecentDelivered: '2026-05-12'},
};

const SIGNS_EMPTY = {
    lastChaos: {reportNumber: null, label: null, score: null, raw: null},
    ideaLedger: {candidateCount: 0, shelvedCount: 0, mostRecentDelivered: null},
};

describe('BalconyRail — Phase 2B', () => {
    beforeEach(() => {
        useBalconySigns().reset();
        useDispatch().reset();
        mockedInvoke.mockReset();
    });

    it('renders the Mezzanine label and posture line', () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const wrapper = mount(BalconyRail);
        expect(wrapper.text()).toContain('The Mezzanine');
        expect(wrapper.text()).toContain('Balcony overlooking the lab floor');
    });

    it('formats the Last Chaos sign with a padded report number when present', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_WITH_CHAOS);
        const wrapper = mount(BalconyRail);
        await useBalconySigns().refresh();
        await nextTick();
        expect(wrapper.text()).toContain('#00068');
        expect(wrapper.text()).toContain('Cardinal Candlelight');
        expect(wrapper.text()).toContain('8/10');
    });

    it('renders the empty-state copy when no chaos report is parsed', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const wrapper = mount(BalconyRail);
        await useBalconySigns().refresh();
        await nextTick();
        expect(wrapper.text()).toContain('No chaos report yet');
    });

    it('renders the Idea Ledger sign with CAND and SHELVED counts', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_WITH_CHAOS);
        const wrapper = mount(BalconyRail);
        await useBalconySigns().refresh();
        await nextTick();
        expect(wrapper.text()).toContain('4 CAND');
        expect(wrapper.text()).toContain('12 SHELVED');
        expect(wrapper.text()).toContain('Last DELIVERED 2026-05-12');
    });

    it('renders the Reserved placeholder sign', () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const wrapper = mount(BalconyRail);
        expect(wrapper.text()).toContain('More signs coming.');
    });

    it('clicking the Dispatch trigger toggles the useDispatch open state', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const wrapper = mount(BalconyRail);
        expect(useDispatch().open.value).toBe(false);
        await wrapper.get('[data-dispatch-trigger]').trigger('click');
        expect(useDispatch().open.value).toBe(true);
        await wrapper.get('[data-dispatch-trigger]').trigger('click');
        expect(useDispatch().open.value).toBe(false);
    });

    it('clicking the Last Chaos refresh button calls balcony signs refresh', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_WITH_CHAOS);
        const wrapper = mount(BalconyRail);
        await useBalconySigns().refresh();
        await nextTick();
        mockedInvoke.mockClear();
        const refreshButton = wrapper.get('[data-balcony-sign-refresh="Last Chaos"]');
        await refreshButton.trigger('click');
        await Promise.resolve();
        expect(mockedInvoke).toHaveBeenCalledWith('read_balcony_signs');
    });
});
