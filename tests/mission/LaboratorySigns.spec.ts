import {invoke} from '@tauri-apps/api/core';
import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {nextTick} from 'vue';

import {useBalconySigns} from '../../src/balcony/useBalconySigns';
import LaboratorySigns from '../../src/mission/LaboratorySigns.vue';

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

describe('LaboratorySigns — status belongs on Mission Control', () => {
    beforeEach(() => {
        useBalconySigns().reset();
        mockedInvoke.mockReset();
    });
    it('carries the two brass signs and drops the Reserved placeholder', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_WITH_CHAOS);
        const wrapper = mount(LaboratorySigns);
        await useBalconySigns().refresh();
        await nextTick();
        expect(wrapper.text()).toContain('Last Chaos');
        expect(wrapper.text()).toContain('Idea Ledger');
        expect(wrapper.text()).not.toContain('Reserved');
        expect(wrapper.text()).not.toContain('More signs coming.');
    });

    it('formats the Last Chaos sign with a padded report number when present', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_WITH_CHAOS);
        const wrapper = mount(LaboratorySigns);
        await useBalconySigns().refresh();
        await nextTick();
        expect(wrapper.text()).toContain('#00068');
        expect(wrapper.text()).toContain('Cardinal Candlelight');
        expect(wrapper.text()).toContain('8/10');
    });

    it('renders the empty-state copy when no chaos report is parsed', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const wrapper = mount(LaboratorySigns);
        await useBalconySigns().refresh();
        await nextTick();
        expect(wrapper.text()).toContain('No chaos report yet');
    });

    it('keeps a raw report readable when the parser has no number or metadata', async () => {
        mockedInvoke.mockResolvedValue({
            ...SIGNS_EMPTY,
            lastChaos: {reportNumber: null, raw: 'Unnumbered laboratory report', label: null, score: null},
        });
        const wrapper = mount(LaboratorySigns);
        await useBalconySigns().refresh();
        await nextTick();
        expect(wrapper.text()).toContain('Unnumbered laboratory report');
        expect(wrapper.text()).not.toContain('Last DELIVERED');
    });

    it('renders the Idea Ledger sign with CAND and SHELVED counts', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_WITH_CHAOS);
        const wrapper = mount(LaboratorySigns);
        await useBalconySigns().refresh();
        await nextTick();
        expect(wrapper.text()).toContain('4 CAND');
        expect(wrapper.text()).toContain('12 SHELVED');
        expect(wrapper.text()).toContain('Last DELIVERED 2026-05-12');
    });

    it('clicking a sign refresh button calls balcony signs refresh', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_WITH_CHAOS);
        const wrapper = mount(LaboratorySigns);
        await useBalconySigns().refresh();
        await nextTick();
        mockedInvoke.mockClear();
        await wrapper.get('[data-balcony-sign-refresh="Last Chaos"]').trigger('click');
        await Promise.resolve();
        expect(mockedInvoke).toHaveBeenCalledWith('read_balcony_signs');
    });
});
