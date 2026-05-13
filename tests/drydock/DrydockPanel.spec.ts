import {invoke} from '@tauri-apps/api/core';
import {mount, flushPromises} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {DrydockPullRequest, GhAuthStatus} from '../../src/drydock/types';

import DrydockPanel from '../../src/drydock/DrydockPanel.vue';
import {useDrydock} from '../../src/drydock/useDrydock';
import {useShell} from '../../src/shell/useShell';

const mockedInvoke = vi.mocked(invoke);

const AUTH_OK: GhAuthStatus = {authenticated: true, message: ''};
const AUTH_BAD: GhAuthStatus = {authenticated: false, message: 'not authed'};

const PR: DrydockPullRequest = {
    repoFullName: 'Goosterhof/zmuuzn-strava',
    repoLabel: 'The Crucible',
    repoLocalPath: 'experiments/zmuuzn-strava',
    experimentScope: 'crucible',
    number: 7,
    title: 'Tighten the forge',
    author: 'gerard',
    headRef: 'feat/tighten',
    isDraft: false,
    additions: 4,
    deletions: 2,
    changedFiles: 1,
    url: 'https://example.test/pr/7',
};

function stubInvoke(opts: {auth?: GhAuthStatus; prs?: DrydockPullRequest[]} = {}): void {
    mockedInvoke.mockImplementation((cmd: string) => {
        switch (cmd) {
            case 'gh_auth_status':
                return Promise.resolve(opts.auth ?? AUTH_OK);
            case 'list_open_prs':
                return Promise.resolve(opts.prs ?? [PR]);
            default:
                return Promise.resolve(undefined);
        }
    });
}

describe('DrydockPanel', () => {
    beforeEach(() => {
        useDrydock().reset();
        useShell().reset();
        mockedInvoke.mockReset();
        stubInvoke();
    });

    it('is hidden when no panel is open', () => {
        const wrapper = mount(DrydockPanel);
        const panel = wrapper.get('aside');
        expect(panel.attributes('style') ?? '').toContain('display: none');
        wrapper.unmount();
    });

    it('refreshes on open and renders the PR list', async () => {
        useShell().togglePanel('drydock');
        const wrapper = mount(DrydockPanel, {attachTo: document.body});
        await flushPromises();

        const cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
        expect(cmds).toContain('gh_auth_status');
        expect(cmds).toContain('list_open_prs');
        expect(wrapper.text()).toContain('Tighten the forge');
        expect(wrapper.text()).toContain('The Crucible');
        wrapper.unmount();
    });

    it('renders the unauthenticated prompt and skips list_open_prs', async () => {
        stubInvoke({auth: AUTH_BAD});
        useShell().togglePanel('drydock');
        const wrapper = mount(DrydockPanel, {attachTo: document.body});
        await flushPromises();

        expect(wrapper.find('[data-test="drydock-unauth"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('gh CLI not authenticated');
        const cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
        expect(cmds).not.toContain('list_open_prs');
        wrapper.unmount();
    });

    it('renders the empty state when no open PRs', async () => {
        stubInvoke({prs: []});
        useShell().togglePanel('drydock');
        const wrapper = mount(DrydockPanel, {attachTo: document.body});
        await flushPromises();

        expect(wrapper.find('[data-test="drydock-empty"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('No open PRs across the laboratory. Clean slate.');
        wrapper.unmount();
    });

    it('Escape closes the panel', async () => {
        useShell().togglePanel('drydock');
        const wrapper = mount(DrydockPanel, {attachTo: document.body});
        await flushPromises();

        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
        expect(useShell().openPanel.value).toBeNull();
        wrapper.unmount();
    });

    it('the ✕ button closes the panel', async () => {
        useShell().togglePanel('drydock');
        const wrapper = mount(DrydockPanel, {attachTo: document.body});
        await flushPromises();
        expect(useShell().openPanel.value).toBe('drydock');

        await wrapper.get('[data-test="drydock-close"]').trigger('click');
        expect(useShell().openPanel.value).toBeNull();
        wrapper.unmount();
    });

    it('Refresh button triggers a fresh fetch', async () => {
        useShell().togglePanel('drydock');
        const wrapper = mount(DrydockPanel, {attachTo: document.body});
        await flushPromises();

        mockedInvoke.mockClear();
        stubInvoke();
        await wrapper.find('[data-test="drydock-refresh"]').trigger('click');
        await flushPromises();
        const cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
        expect(cmds).toContain('list_open_prs');
        wrapper.unmount();
    });

    it('surfaces lastError via data-test stamp', async () => {
        mockedInvoke.mockReset();
        mockedInvoke.mockRejectedValueOnce(new Error('bridge collapsed'));
        useShell().togglePanel('drydock');
        const wrapper = mount(DrydockPanel, {attachTo: document.body});
        await flushPromises();

        const err = wrapper.find('[data-test="drydock-error"]');
        expect(err.exists()).toBe(true);
        expect(err.text()).toContain('bridge collapsed');
        wrapper.unmount();
    });
});
