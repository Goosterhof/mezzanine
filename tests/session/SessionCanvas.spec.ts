import {mount} from '@vue/test-utils';
import {describe, it, expect, beforeEach} from 'vitest';

import SessionCanvas from '../../src/session/SessionCanvas.vue';
import {useSessions} from '../../src/session/useSessions';

describe('SessionCanvas', () => {
    beforeEach(() => {
        useSessions().reset();
    });

    it('shows the empty-bench prompt when no experiment is focused', () => {
        const wrapper = mount(SessionCanvas);
        expect(wrapper.text()).toContain('No session running');
        expect(wrapper.text()).toContain('Tools racked. Click an experiment to start a session.');
    });

    it('renders the active experiment header when one is focused', async () => {
        const sessions = useSessions();
        sessions.focus('crucible');
        const wrapper = mount(SessionCanvas);
        expect(wrapper.text()).toContain('The Crucible');
        expect(wrapper.text()).toContain('experiments/zmuuzn-strava');
    });

    it('shows the booting message when the buffer is empty for the active experiment', () => {
        const sessions = useSessions();
        sessions.focus('crucible');
        const wrapper = mount(SessionCanvas);
        expect(wrapper.text()).toContain('Vise tightening… booting The Crucible.');
    });

    it('renders buffer lines as a pre block when output exists', () => {
        const sessions = useSessions();
        sessions.focus('parlour');
        sessions.appendOutput('parlour', 'hello world');
        sessions.appendOutput('parlour', 'second line');
        const wrapper = mount(SessionCanvas);
        const pre = wrapper.find('pre');
        expect(pre.exists()).toBe(true);
        expect(pre.text()).toContain('hello world');
        expect(pre.text()).toContain('second line');
        expect(wrapper.text()).not.toContain('Vise tightening');
    });

    it('does not render the active-bench header when no experiment is focused', () => {
        const wrapper = mount(SessionCanvas);
        expect(wrapper.text()).not.toContain('Active Bench');
    });
});
