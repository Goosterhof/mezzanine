// Balustrade — the merged brass cap of the Overlook (#00057).
//
// Inherits the assertions worth keeping from the retired BalconyRail and
// TopBar specs (both components merged into this one), and adds the
// Overlook's structural guarantees: one header, no Reserved placeholder,
// no OB glyph anywhere in the chrome.

import {invoke} from '@tauri-apps/api/core';
import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {nextTick} from 'vue';

import {useBalconySigns} from '../../src/balcony/useBalconySigns';
import {useDispatch} from '../../src/balcony/useDispatch';
import {useCriersWatch} from '../../src/crier/useCriersWatch';
import Balustrade from '../../src/shell/Balustrade.vue';
import {useShell} from '../../src/shell/useShell';

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

describe('Balustrade — the Overlook #00057', () => {
    beforeEach(() => {
        useBalconySigns().reset();
        useDispatch().reset();
        useShell().reset();
        useCriersWatch().reset();
        mockedInvoke.mockReset();
    });

    it('renders as a single header at the 76px cap height', () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const wrapper = mount(Balustrade);
        const header = wrapper.get('[data-balustrade]');
        expect(header.element.tagName).toBe('HEADER');
        expect((header.element as HTMLElement).style.minHeight).toBe('76px');
        // One top edge — the component is itself the only header.
        expect(wrapper.findAll('header')).toHaveLength(1);
    });

    it('renders the Mezzanine identity and posture line', () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const wrapper = mount(Balustrade);
        expect(wrapper.text()).toContain('The Mezzanine');
        expect(wrapper.text()).toContain('Balcony overlooking the lab floor');
        expect(wrapper.text()).not.toContain('Workbench');
    });

    it('carries the two brass signs and drops the Reserved placeholder', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_WITH_CHAOS);
        const wrapper = mount(Balustrade);
        await useBalconySigns().refresh();
        await nextTick();
        expect(wrapper.text()).toContain('Last Chaos');
        expect(wrapper.text()).toContain('Idea Ledger');
        expect(wrapper.text()).not.toContain('Reserved');
        expect(wrapper.text()).not.toContain('More signs coming.');
    });

    it('formats the Last Chaos sign with a padded report number when present', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_WITH_CHAOS);
        const wrapper = mount(Balustrade);
        await useBalconySigns().refresh();
        await nextTick();
        expect(wrapper.text()).toContain('#00068');
        expect(wrapper.text()).toContain('Cardinal Candlelight');
        expect(wrapper.text()).toContain('8/10');
    });

    it('renders the empty-state copy when no chaos report is parsed', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const wrapper = mount(Balustrade);
        await useBalconySigns().refresh();
        await nextTick();
        expect(wrapper.text()).toContain('No chaos report yet');
    });

    it('renders the Idea Ledger sign with CAND and SHELVED counts', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_WITH_CHAOS);
        const wrapper = mount(Balustrade);
        await useBalconySigns().refresh();
        await nextTick();
        expect(wrapper.text()).toContain('4 CAND');
        expect(wrapper.text()).toContain('12 SHELVED');
        expect(wrapper.text()).toContain('Last DELIVERED 2026-05-12');
    });

    it('renders the four surviving panel glyphs plus TC — the OB glyph is retired', () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const wrapper = mount(Balustrade);
        const glyphButtons = wrapper.findAll('button[title]');
        // The Crier's Watch (#00060) — TC follows GR, before Dispatch.
        expect(glyphButtons.map((b) => b.text())).toStrictEqual(['MC', 'DD', 'HT', 'GR', 'TC']);
        expect(wrapper.text()).not.toContain('OB');
        expect(wrapper.text()).not.toContain('Observer');
    });

    it('places the TC glyph between GR and Dispatch (#00060)', () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const wrapper = mount(Balustrade);
        const labels = wrapper.findAll('button[title]').map((b) => b.text());
        expect(labels.indexOf('TC')).toBe(labels.indexOf('GR') + 1);
        expect(wrapper.find('[data-test="balustrade-tc"]').exists()).toBe(true);
    });

    it("clicking TC toggles The Crier's Watch panel open and closed", async () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const wrapper = mount(Balustrade);
        const tc = wrapper.get('[data-test="balustrade-tc"]');
        await tc.trigger('click');
        expect(useShell().openPanel.value).toBe('criers-watch');
        await tc.trigger('click');
        expect(useShell().openPanel.value).toBeNull();
    });

    it('hides the Patrol Lamp while the crier is off (idle / token-missing)', () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        useCriersWatch().state.value = {status: 'idle', queue: [], lastReadAt: null, busError: null};
        const wrapper = mount(Balustrade);
        expect(wrapper.find('[data-patrol-lamp]').exists()).toBe(false);
    });

    it('shows the Patrol Lamp when the crier is on patrol', () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const crier = useCriersWatch();
        crier.state.value = {status: 'armed', queue: [], lastReadAt: null, busError: null};
        crier.lastNudgeAt.value = null;
        const wrapper = mount(Balustrade);
        const lamp = wrapper.find('[data-patrol-lamp]');
        expect(lamp.exists()).toBe(true);
        expect(lamp.attributes('data-patrol-lamp')).toBe('watching');
    });

    it('clicking a glyph opens the corresponding panel', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const wrapper = mount(Balustrade);
        await wrapper.get('button[title="Mission Control"]').trigger('click');
        expect(useShell().openPanel.value).toBe('mission-control');
    });

    it("clicking the open panel's glyph closes it", async () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const wrapper = mount(Balustrade);
        const drydock = wrapper.get('button[title="Drydock"]');
        await drydock.trigger('click');
        await drydock.trigger('click');
        expect(useShell().openPanel.value).toBeNull();
    });

    it("highlights the open panel's glyph with the brass border, one at a time", async () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const wrapper = mount(Balustrade);
        const holotable = wrapper.get('button[title="Holotable"]');
        const grind = wrapper.get('button[title="Grind"]');
        await holotable.trigger('click');
        expect(holotable.classes()).toContain('border-mz-brass');
        await grind.trigger('click');
        expect(holotable.classes()).not.toContain('border-mz-brass');
        expect(grind.classes()).toContain('border-mz-brass');
    });

    it('clicking the Dispatch trigger toggles the useDispatch open state', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_EMPTY);
        const wrapper = mount(Balustrade);
        expect(useDispatch().open.value).toBe(false);
        await wrapper.get('[data-dispatch-trigger]').trigger('click');
        expect(useDispatch().open.value).toBe(true);
        await wrapper.get('[data-dispatch-trigger]').trigger('click');
        expect(useDispatch().open.value).toBe(false);
    });

    it('clicking a sign refresh button calls balcony signs refresh', async () => {
        mockedInvoke.mockResolvedValue(SIGNS_WITH_CHAOS);
        const wrapper = mount(Balustrade);
        await useBalconySigns().refresh();
        await nextTick();
        mockedInvoke.mockClear();
        await wrapper.get('[data-balcony-sign-refresh="Last Chaos"]').trigger('click');
        await Promise.resolve();
        expect(mockedInvoke).toHaveBeenCalledWith('read_balcony_signs');
    });
});
