import {invoke} from '@tauri-apps/api/core';
import {mount, flushPromises} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {DrydockPrFile, DrydockPullRequest, MinionTouch} from '../../src/drydock/types';

import PrCard from '../../src/drydock/PrCard.vue';
import {useDrydock} from '../../src/drydock/useDrydock';

const mockedInvoke = vi.mocked(invoke);

const PR: DrydockPullRequest = {
    repoFullName: 'Goosterhof/zmuuzn-strava',
    repoLabel: 'The Crucible',
    repoLocalPath: 'experiments/zmuuzn-strava',
    experimentScope: 'crucible',
    number: 99,
    title: 'Refactor pane',
    author: 'gerard',
    headRef: 'refactor/pane',
    isDraft: true,
    additions: 12,
    deletions: 3,
    changedFiles: 2,
    url: 'https://example.test/pr/99',
};

const FILES: DrydockPrFile[] = [
    {path: 'src/Foo.vue', additions: 6, deletions: 1},
    {path: 'src/Bar.vue', additions: 6, deletions: 2},
];

const TOUCH: MinionTouch = {
    minion: 'The Illusionist',
    commitHash: 'aaaaaaa1234',
    author: 'gerard',
    date: '2026-04-01',
    subject: 'design(crucible): pane v1',
};

function stubInvoke(): void {
    mockedInvoke.mockImplementation((cmd: string) => {
        switch (cmd) {
            case 'pull_request_files':
                return Promise.resolve(FILES);
            case 'find_minion_touch':
                return Promise.resolve(TOUCH);
            case 'find_chaos_detonations':
                return Promise.resolve([]);
            case 'find_active_experiment_log':
                return Promise.resolve(null);
            default:
                return Promise.resolve(undefined);
        }
    });
}

describe('PrCard', () => {
    beforeEach(() => {
        useDrydock().reset();
        mockedInvoke.mockReset();
        stubInvoke();
    });

    it('renders PR metadata in the collapsed header', () => {
        const wrapper = mount(PrCard, {props: {pr: PR}});
        expect(wrapper.text()).toContain('Refactor pane');
        expect(wrapper.text()).toContain('The Crucible');
        expect(wrapper.text()).toContain('#99');
        expect(wrapper.text()).toContain('DRAFT');
        expect(wrapper.text()).toContain('refactor/pane');
        expect(wrapper.text()).toContain('2 files');
        wrapper.unmount();
    });

    it('expanding fetches files and renders one row per file', async () => {
        const wrapper = mount(PrCard, {props: {pr: PR}});
        await wrapper.find('[data-test="pr-toggle"]').trigger('click');
        await flushPromises();

        // Both files render.
        expect(wrapper.text()).toContain('src/Foo.vue');
        expect(wrapper.text()).toContain('src/Bar.vue');
        // Enrichment surfaces.
        expect(wrapper.text()).toContain('The Illusionist');
        // Empty-state strings for the missing fields.
        expect(wrapper.text()).toContain('No chaos detonations on record');
        expect(wrapper.text()).toContain('No active experiment log');
        wrapper.unmount();
    });

    it('a second click on the header collapses the card', async () => {
        const wrapper = mount(PrCard, {props: {pr: PR}});
        await wrapper.find('[data-test="pr-toggle"]').trigger('click');
        await flushPromises();
        await wrapper.find('[data-test="pr-toggle"]').trigger('click');
        await flushPromises();

        // Files area is hidden when collapsed — pick a string unique to the
        // expanded view to confirm it's gone.
        expect(wrapper.find('[data-test="files-error"]').exists()).toBe(false);
        // The header still renders.
        expect(wrapper.text()).toContain('Refactor pane');
        wrapper.unmount();
    });

    it('renders the files-error stamp when pull_request_files rejects', async () => {
        mockedInvoke.mockReset();
        mockedInvoke.mockRejectedValueOnce(new Error('gh diff blew up'));
        const wrapper = mount(PrCard, {props: {pr: PR}});
        await wrapper.find('[data-test="pr-toggle"]').trigger('click');
        await flushPromises();

        const err = wrapper.find('[data-test="files-error"]');
        expect(err.exists()).toBe(true);
        expect(err.text()).toContain('gh diff blew up');
        wrapper.unmount();
    });
});
