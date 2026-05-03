import {invoke} from '@tauri-apps/api/core';
import {mount, flushPromises} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import MissionControl from '../../src/mission/MissionControl.vue';
import {useMissionControl} from '../../src/mission/useMissionControl';
import {useShell} from '../../src/shell/useShell';

const mockedInvoke = vi.mocked(invoke);

function stubInvoke(): void {
    mockedInvoke.mockImplementation((cmd: string) => {
        switch (cmd) {
            case 'read_vital_signs':
                return Promise.resolve({
                    experimentsActive: 6,
                    experimentsSummary: '6 active',
                    gadgetsCalibrated: 5,
                    gadgetsSummary: '5',
                    packagesPublished: 1,
                    packagesSummary: '1',
                    minionsOperational: 18,
                    minionsSummary: '18',
                    sentinelsWatching: 4,
                    sentinelsSummary: '4',
                    lastChaos: '#00068',
                    chaosFiled: '68',
                    enhanceFiled: '5',
                });
            case 'read_war_room_dispatch':
                return Promise.resolve([]);
            case 'read_inheritance_signals':
                return Promise.resolve([]);
            case 'read_wounds_at_threshold':
                return Promise.resolve([]);
            default:
                return Promise.resolve(undefined);
        }
    });
}

describe('MissionControl', () => {
    beforeEach(() => {
        useMissionControl().reset();
        useShell().reset();
        mockedInvoke.mockReset();
        stubInvoke();
    });

    it('is hidden when no panel is open', () => {
        const wrapper = mount(MissionControl);
        const panel = wrapper.get('aside');
        expect(panel.attributes('style') ?? '').toContain('display: none');
    });

    it('refreshes once on the open transition and renders all four sections', async () => {
        useShell().togglePanel('mission-control');
        const wrapper = mount(MissionControl, {attachTo: document.body});
        await flushPromises();

        const cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
        expect(cmds).toContain('read_vital_signs');
        expect(cmds).toContain('read_war_room_dispatch');
        expect(cmds).toContain('read_inheritance_signals');
        expect(cmds).toContain('read_wounds_at_threshold');

        expect(wrapper.text()).toContain('Mission Control');
        expect(wrapper.text()).toContain('Vital Signs');
        expect(wrapper.text()).toContain('War Room Dispatch');
        expect(wrapper.text()).toContain('Minions Due for Invocation');
        expect(wrapper.text()).toContain('Wounds at Threshold');
        // Empty states fire when their lists are empty.
        expect(wrapper.text()).toContain('No active dispatches. Tools racked.');
        expect(wrapper.text()).toContain('All minions recently active.');
        expect(wrapper.text()).toContain('No wounds at threshold.');
        wrapper.unmount();
    });

    it('refreshes when the Refresh button is clicked', async () => {
        useShell().togglePanel('mission-control');
        const wrapper = mount(MissionControl, {attachTo: document.body});
        await flushPromises();
        const callsBefore = mockedInvoke.mock.calls.length;

        await wrapper.get('[data-mc-refresh]').trigger('click');
        await flushPromises();

        expect(mockedInvoke.mock.calls.length).toBeGreaterThan(callsBefore);
        wrapper.unmount();
    });

    it('closes the panel when Escape is pressed', async () => {
        useShell().togglePanel('mission-control');
        const wrapper = mount(MissionControl, {attachTo: document.body});
        await flushPromises();
        expect(useShell().openPanel.value).toBe('mission-control');

        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
        await flushPromises();

        expect(useShell().openPanel.value).toBeNull();
        wrapper.unmount();
    });

    it('opens and closes the Compose Dispatch overlay', async () => {
        useShell().togglePanel('mission-control');
        const wrapper = mount(MissionControl, {attachTo: document.body});
        await flushPromises();

        await wrapper.get('[data-mc-compose]').trigger('click');
        expect(wrapper.text()).toContain('Compose Dispatch');
        expect(wrapper.find('textarea').exists()).toBe(true);

        await wrapper.get('[data-mc-cancel]').trigger('click');
        expect(wrapper.find('textarea').exists()).toBe(false);
        wrapper.unmount();
    });
});
