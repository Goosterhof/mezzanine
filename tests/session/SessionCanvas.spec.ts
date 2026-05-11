import {mount} from '@vue/test-utils';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import SessionCanvas from '../../src/session/SessionCanvas.vue';
import {EXPERIMENTS} from '../../src/session/types';
import {useSessions} from '../../src/session/useSessions';

// SessionCanvas mounts xterm.js Terminals into per-experiment wrappers
// at runtime. jsdom can't render xterm, so the useTerminals composable
// is stubbed; we only verify the structural / state-driven behavior of
// the Vue component itself.
vi.mock('../../src/session/useTerminals', () => {
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

describe('SessionCanvas', () => {
    beforeEach(() => {
        useSessions().reset();
    });

    it('shows the empty-bench prompt when no experiment is focused', () => {
        const wrapper = mount(SessionCanvas);
        expect(wrapper.text()).toContain('No session running');
        expect(wrapper.text()).toContain('Tools racked. Click an experiment to start a session.');
    });

    it('renders the active experiment header when one is focused', () => {
        const sessions = useSessions();
        sessions.focus('crucible');
        const wrapper = mount(SessionCanvas);
        expect(wrapper.text()).toContain('The Crucible');
        expect(wrapper.text()).toContain('experiments/zmuuzn-strava');
    });

    it('renders one wrapper div per experiment when an experiment is focused', () => {
        const sessions = useSessions();
        sessions.focus('parlour');
        const wrapper = mount(SessionCanvas);
        // Six absolutely-positioned wrappers, all stacked, only the
        // active one visible. Inactive wrappers stay in layout so the
        // FitAddon can compute correct dimensions on tab activation.
        const stack = wrapper.findAll('div.absolute.inset-0');
        expect(stack).toHaveLength(EXPERIMENTS.length);
    });

    it('does not render the active-bench header when no experiment is focused', () => {
        const wrapper = mount(SessionCanvas);
        expect(wrapper.text()).not.toContain('Active Bench');
    });
});
