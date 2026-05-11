import {mount} from '@vue/test-utils';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import App from '../src/App.vue';
import {useSessions} from '../src/session/useSessions';
import {useShell} from '../src/shell/useShell';

// SessionCanvas opens xterm.js Terminals against the DOM. jsdom can't
// host xterm (no canvas, no matchMedia), so the per-experiment terminal
// pool is stubbed for App composition tests.
vi.mock('../src/session/useTerminals', () => {
    const stubSlot = {
        terminal: {
            element: document.createElement('div'),
            cols: 132,
            rows: 40,
            open: () => {},
            focus: () => {},
            write: () => {},
        },
        fit: {fit: () => {}},
        lastSize: null,
        dataDisposable: {dispose: () => {}},
    };
    return {
        useTerminals: () => ({
            get: () => stubSlot,
            has: () => true,
            setDataHandler: () => {},
            reset: () => {},
        }),
    };
});

describe('App', () => {
    beforeEach(() => {
        useSessions().reset();
        useShell().reset();
    });

    it('composes the four shell regions', () => {
        const wrapper = mount(App);
        // TopBar
        expect(wrapper.text()).toContain('Workbench');
        // ExperimentRail
        expect(wrapper.text()).toContain('The Gatekeeper');
        expect(wrapper.text()).toContain('The Horadrim');
        // SessionCanvas empty state
        expect(wrapper.text()).toContain('Tools racked. Click an experiment to start a session.');
        // CommandBar
        expect(wrapper.find('footer input').attributes('placeholder')).toBe('Direct the laboratory…');
    });

    it('clicking an experiment in the rail focuses it on the canvas', async () => {
        const wrapper = mount(App);
        const railButtons = wrapper.findAll('aside button');
        await railButtons[2]!.trigger('click');
        // Canvas swaps from empty state to the active-bench header — the
        // experiment label and its WSL relative path are visible there.
        expect(wrapper.text()).toContain('The Crucible');
        expect(wrapper.text()).toContain('experiments/zmuuzn-strava');
        // The unique "Click an experiment" suffix on SessionCanvas's
        // empty state — short "Tools racked." also appears in
        // WarRoomDispatch's empty state and would falsely match.
        expect(wrapper.text()).not.toContain('Click an experiment to start a session.');
    });
});
