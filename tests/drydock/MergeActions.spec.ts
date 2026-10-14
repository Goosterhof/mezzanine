import {invoke} from '@tauri-apps/api/core';
import {openUrl} from '@tauri-apps/plugin-opener';
import {enableAutoUnmount, flushPromises, mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {DrydockPullRequest, MergeCandidate} from '../../src/drydock/types';

import {useCommandDraft} from '../../src/command/useCommandDraft';
import MergeActions from '../../src/drydock/MergeActions.vue';
import {useDrydock} from '../../src/drydock/useDrydock';
import {useRoster} from '../../src/roster/useRoster';
import {useShell} from '../../src/shell/useShell';

vi.mock('@tauri-apps/plugin-opener', () => ({openUrl: vi.fn<typeof openUrl>()}));
enableAutoUnmount(afterEach);

const pr: DrydockPullRequest = {
    repoFullName: 'Goosterhof/mezzanine',
    repoLabel: 'Mezzanine',
    repoLocalPath: 'gadgets/mezzanine',
    experimentScope: 'mezzanine',
    number: 1,
    title: 'Bump vue from 3.5.1 to 3.5.2',
    author: 'app/dependabot',
    headRef: 'dependabot/vue',
    headOid: 'a'.repeat(40),
    isDraft: false,
    additions: 1,
    deletions: 1,
    changedFiles: 1,
    url: 'https://example.test/pr/1',
};
const candidate: MergeCandidate = {
    headOid: 'a'.repeat(40),
    title: pr.title,
    body: 'Release notes',
    method: 'merge',
    ready: true,
    reason: 'Ready',
    checks: [],
};
describe('Dependabot merge control', () => {
    beforeEach(() => {
        vi.mocked(invoke).mockReset();
        vi.mocked(openUrl).mockReset().mockResolvedValue(undefined);
        useDrydock().reset();
        useRoster().reset();
        useShell().reset();
        useCommandDraft().draft.value = '';
    });
    it('never merges while loading or merely opening the detail', async () => {
        vi.mocked(invoke).mockResolvedValue(candidate);
        const wrapper = mount(MergeActions, {props: {pr}});
        expect(wrapper.find('[data-merge-dependency]').exists()).toBe(false);
        await flushPromises();
        expect(vi.mocked(invoke).mock.calls.map(([cmd]) => cmd)).toStrictEqual(['read_merge_candidate']);
        wrapper.unmount();
    });
    it('passes the inspected head, reports a race and requires new evidence after refusal', async () => {
        vi.mocked(invoke).mockResolvedValueOnce(candidate).mockRejectedValueOnce(new Error('The PR changed.'));
        const wrapper = mount(MergeActions, {props: {pr}});
        await flushPromises();
        await wrapper.get('[data-merge-dependency]').trigger('click');
        await flushPromises();
        expect(invoke).toHaveBeenLastCalledWith('merge_dependabot_pr', {
            repoFullName: pr.repoFullName,
            number: 1,
            expectedHead: candidate.headOid,
        });
        expect(wrapper.text()).toContain('The PR changed.');
        expect(wrapper.find('[data-merge-dependency]').exists()).toBe(false);
        wrapper.unmount();
    });
    it('will not mix new merge evidence with an older dock revision', async () => {
        vi.mocked(invoke).mockResolvedValue({...candidate, headOid: 'b'.repeat(40)});
        const wrapper = mount(MergeActions, {props: {pr}});
        await flushPromises();
        expect(wrapper.text()).toContain('Refresh the dock');
        expect(wrapper.find('[data-merge-dependency]').exists()).toBe(false);
        wrapper.unmount();
    });

    it('retries unavailable evidence and opens only HTTPS check links, showing opener failures', async () => {
        vi.mocked(invoke).mockRejectedValueOnce(new Error('GitHub unavailable'));
        const wrapper = mount(MergeActions, {props: {pr}});
        await flushPromises();
        expect(wrapper.get('[role="alert"]').text()).toContain('GitHub unavailable');
        vi.mocked(invoke).mockResolvedValueOnce({
            ...candidate,
            ready: false,
            method: 'rebase',
            body: '',
            reason: 'Checks pending',
            checks: [
                {name: 'Pending', state: 'PENDING', url: ''},
                {name: 'Unsafe', state: 'FAILURE', url: 'file:///private'},
                {name: 'CI', state: 'SUCCESS', url: 'https://example.test/check'},
            ],
        });
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Refresh evidence')!
            .trigger('click');
        await flushPromises();
        expect(wrapper.find('[role="alert"]').exists()).toBe(false);
        expect(wrapper.text()).toContain('rebase');
        expect(wrapper.find('details').exists()).toBe(false);
        expect(wrapper.find('[data-merge-dependency]').exists()).toBe(false);
        expect(
            wrapper
                .findAll('button')
                .find((b) => b.text() === 'Pending')!
                .attributes('disabled'),
        ).toBeDefined();
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Unsafe')!
            .trigger('click');
        expect(openUrl).not.toHaveBeenCalled();
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'CI')!
            .trigger('click');
        expect(openUrl).toHaveBeenCalledWith('https://example.test/check');
        vi.mocked(openUrl).mockRejectedValueOnce(new Error('Browser unavailable'));
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Inspect diff on GitHub')!
            .trigger('click');
        await flushPromises();
        expect(openUrl).toHaveBeenLastCalledWith(`${pr.url}/files`);
        expect(wrapper.get('[role="alert"]').text()).toContain('Browser unavailable');
    });

    it('discards late evidence from an older PR revision', async () => {
        let oldResult!: (value: MergeCandidate) => void;
        let newResult!: (value: MergeCandidate) => void;
        vi.mocked(invoke)
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        oldResult = resolve;
                    }),
            )
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        newResult = resolve;
                    }),
            );
        const wrapper = mount(MergeActions, {props: {pr}});
        const head = 'b'.repeat(40);
        await wrapper.setProps({pr: {...pr, headOid: head}});
        oldResult(candidate);
        await flushPromises();
        expect(wrapper.find('[data-merge-dependency]').exists()).toBe(false);
        expect(wrapper.text()).toContain('Reading the current revision');
        newResult({...candidate, headOid: head});
        await flushPromises();
        expect(wrapper.text()).toContain('bbbbbbbbbbbb');
        expect(wrapper.find('[data-merge-dependency]').exists()).toBe(true);
    });

    it('keeps a queued outcome distinct from merged and refreshes once after the investor acts', async () => {
        let finish!: (value: string) => void;
        vi.mocked(invoke).mockImplementation((command) => {
            if (command === 'read_merge_candidate') return Promise.resolve(candidate);
            if (command === 'merge_dependabot_pr')
                return new Promise((resolve) => {
                    finish = resolve;
                });
            if (command === 'gh_auth_status') return Promise.resolve({authenticated: true, message: ''});
            if (command === 'list_open_prs') return Promise.resolve({prs: [pr], warnings: []});
            return Promise.reject(new Error(`Unexpected command: ${command}`));
        });
        const wrapper = mount(MergeActions, {props: {pr}});
        await flushPromises();
        const merge = wrapper.get('[data-merge-dependency]');
        await merge.trigger('click');
        expect(merge.text()).toBe('Merging…');
        expect(merge.attributes('disabled')).toBeDefined();
        await merge.trigger('click');
        expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'merge_dependabot_pr')).toHaveLength(1);
        finish('Queued for merge by GitHub. It has not merged yet.');
        await flushPromises();
        expect(useDrydock().mergeOutcome.value).toContain('It has not merged yet');
        expect(useDrydock().prs.value).toStrictEqual([pr]);
        expect(wrapper.find('[data-merge-dependency]').exists()).toBe(false);
        expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'list_open_prs')).toHaveLength(1);
    });

    it('prepares held work in an existing colleague draft and explains when that colleague is unavailable', async () => {
        vi.mocked(invoke).mockResolvedValue({...candidate, ready: false, reason: 'Major update held'});
        const wrapper = mount(MergeActions, {props: {pr}});
        await flushPromises();
        const prepare = wrapper.findAll('button').find((b) => b.text() === 'Prepare updates')!;
        await prepare.trigger('click');
        expect(wrapper.get('[role="alert"]').text()).toContain('Open this colleague');
        useRoster().upsert({
            id: 'mad-scientist',
            colleague: 'mad-scientist',
            target: {kind: 'lab-root'},
            mission: '',
            state: 'idle',
            startedAt: '',
            lastStateChange: '',
        });
        await prepare.trigger('click');
        expect(useCommandDraft().draft.value).toContain(pr.url);
        expect(wrapper.find('[role="alert"]').exists()).toBe(false);
        expect(useCommandDraft().draft.value).toContain('does not authorize pushing, merging');
        expect(useRoster().selected.value).toBe('mad-scientist');
        expect(useShell().page.value).toBe('conversation');
        expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toStrictEqual(['read_merge_candidate']);
    });
});
