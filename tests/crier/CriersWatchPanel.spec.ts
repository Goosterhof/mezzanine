import {invoke} from '@tauri-apps/api/core';
import {openUrl} from '@tauri-apps/plugin-opener';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {CrierWatchState} from '../../src/crier/types';

import CriersWatchPanel from '../../src/crier/CriersWatchPanel.vue';
import {useCriersWatch} from '../../src/crier/useCriersWatch';
import {useShell} from '../../src/shell/useShell';

vi.mock('@tauri-apps/plugin-opener', () => ({openUrl: vi.fn(() => Promise.resolve())}));

const mockedInvoke = vi.mocked(invoke);
const mockedOpenUrl = vi.mocked(openUrl);

function stubState(state: CrierWatchState): void {
    mockedInvoke.mockImplementation((cmd: string) =>
        cmd === 'read_crier_watch_state' ? Promise.resolve(state) : Promise.resolve(undefined),
    );
}

const ARMED: CrierWatchState = {
    status: 'armed',
    queue: [
        {id: 42, prUrl: 'https://github.com/Goosterhof/zmuuzn-strava/pull/42', repo: 'zmuuzn-strava', reviewCount: 0},
        {id: 43, prUrl: 'https://github.com/Goosterhof/zmuuzn-auth/pull/43', repo: 'zmuuzn-auth', reviewCount: 1},
    ],
    lastReadAt: '2026-06-22T14:30:00Z',
    busError: null,
};

async function openPanel() {
    useShell().togglePanel('criers-watch');
    const wrapper = mount(CriersWatchPanel);
    await flushPromises();
    return wrapper;
}

describe('CriersWatchPanel', () => {
    beforeEach(() => {
        useCriersWatch().reset();
        useShell().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockResolvedValue(undefined);
        mockedOpenUrl.mockReset();
        mockedOpenUrl.mockResolvedValue(undefined);
    });

    it('is hidden when no panel is open', () => {
        stubState(ARMED);
        const wrapper = mount(CriersWatchPanel);
        const panel = wrapper.get('aside');
        expect(panel.attributes('style') ?? '').toContain('display: none');
        wrapper.unmount();
    });

    it('reads the watch state on open', async () => {
        stubState(ARMED);
        await openPanel();
        expect(mockedInvoke).toHaveBeenCalledWith('read_crier_watch_state');
    });

    it('renders the ON PATROL status with the Stand Down and Take a turn buttons (armed)', async () => {
        stubState(ARMED);
        // Mark a live crier session so Take a turn is enabled.
        useCriersWatch().scientistId.value = 'sid-1';
        const wrapper = await openPanel();
        expect(wrapper.text()).toContain('ON PATROL');
        expect(wrapper.find('[data-test="crier-stand-down"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="crier-take-turn"]').exists()).toBe(true);
        // The Arm Patrol button is absent while armed.
        expect(wrapper.find('[data-test="crier-arm"]').exists()).toBe(false);
    });

    it('renders the queue rows with the review counts (armed)', async () => {
        stubState(ARMED);
        const wrapper = await openPanel();
        const rows = wrapper.findAll('[data-test="crier-queue-row"]');
        expect(rows).toHaveLength(2);
        expect(wrapper.text()).toContain('Open Reviews (2)');
        expect(wrapper.text()).toContain('#42');
        expect(wrapper.text()).toContain('#43');
    });

    it('opens the PR on GitHub when a queue row is clicked', async () => {
        stubState(ARMED);
        const wrapper = await openPanel();
        const rows = wrapper.findAll('[data-test="crier-queue-row"]');
        await rows[0]!.trigger('click');
        await flushPromises();
        expect(mockedOpenUrl).toHaveBeenCalledWith('https://github.com/Goosterhof/zmuuzn-strava/pull/42');
    });

    it('voices the open affordance on each queue row', async () => {
        stubState(ARMED);
        const wrapper = await openPanel();
        const row = wrapper.find('[data-test="crier-queue-row"]');
        // The row is an interactive opener, not an inert article.
        expect(row.element.tagName).toBe('BUTTON');
        expect(row.classes()).toContain('cursor-pointer');
        expect(row.text()).toContain('Open on GitHub');
    });

    it('tints a non-zero review count with the signal colour', async () => {
        stubState(ARMED);
        const wrapper = await openPanel();
        // The second row (#43, reviewCount 1) carries the signal tint.
        expect(wrapper.html()).toContain('text-mz-signal');
    });

    it('renders the STOOD DOWN status with an Arm Patrol button (idle)', async () => {
        stubState({status: 'idle', queue: [], lastReadAt: null, busError: null});
        const wrapper = await openPanel();
        expect(wrapper.text()).toContain('STOOD DOWN');
        expect(wrapper.find('[data-test="crier-arm"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="crier-stand-down"]').exists()).toBe(false);
        // The watch glass shows the stood-down placeholder.
        expect(wrapper.text()).toContain('Patrol stood down. Arm to resume.');
    });

    it('renders the NO TOKEN status with the exact config path (token-missing)', async () => {
        stubState({status: 'token-missing', queue: [], lastReadAt: null, busError: null});
        const wrapper = await openPanel();
        expect(wrapper.text()).toContain('NO TOKEN');
        expect(wrapper.text()).toContain('~/.config/zmuuzn/town-crier-token');
        expect(wrapper.find('[data-test="crier-arm"]').exists()).toBe(true);
    });

    it('renders the bus-unreachable strip while staying ON PATROL', async () => {
        stubState({
            status: 'armed',
            queue: [],
            lastReadAt: '2026-06-22T14:30:00Z',
            busError: 'GET /open → timeout after 10s',
        });
        const wrapper = await openPanel();
        // Relay status and bus reachability are two different facts.
        expect(wrapper.text()).toContain('ON PATROL');
        expect(wrapper.find('[data-test="crier-bus-error"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('Bus unreachable');
        expect(wrapper.text()).toContain('still on patrol');
    });

    it('uses balcony-voiced copy, not control-room generics', async () => {
        stubState(ARMED);
        const wrapper = await openPanel();
        const text = wrapper.text();
        expect(text).not.toContain('ARMED');
        expect(text).not.toContain('IDLE');
        expect(text).not.toContain('Error');
    });

    it('Stand Down calls recall_crier', async () => {
        stubState(ARMED);
        useCriersWatch().scientistId.value = 'sid-x';
        const wrapper = await openPanel();
        await wrapper.get('[data-test="crier-stand-down"]').trigger('click');
        await flushPromises();
        expect(mockedInvoke).toHaveBeenCalledWith('recall_crier');
    });

    it('Take a turn now writes /town-crier to the crier PTY', async () => {
        stubState(ARMED);
        useCriersWatch().scientistId.value = 'sid-turn';
        const wrapper = await openPanel();
        await wrapper.get('[data-test="crier-take-turn"]').trigger('click');
        await flushPromises();
        expect(mockedInvoke).toHaveBeenCalledWith('write_to_scientist', {id: 'sid-turn', input: '/town-crier\n'});
    });

    it('disables Take a turn now while no crier session is active', async () => {
        stubState(ARMED);
        useCriersWatch().scientistId.value = null;
        const wrapper = await openPanel();
        expect(wrapper.get('[data-test="crier-take-turn"]').attributes('disabled')).toBeDefined();
    });

    it('Refresh re-invokes read_crier_watch_state', async () => {
        stubState(ARMED);
        const wrapper = await openPanel();
        mockedInvoke.mockClear();
        await wrapper.get('[data-test="crier-refresh"]').trigger('click');
        await flushPromises();
        expect(mockedInvoke).toHaveBeenCalledWith('read_crier_watch_state');
    });
});
