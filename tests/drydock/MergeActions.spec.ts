import {invoke} from '@tauri-apps/api/core';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {DrydockPullRequest, MergeCandidate} from '../../src/drydock/types';

import MergeActions from '../../src/drydock/MergeActions.vue';

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
    beforeEach(() => vi.mocked(invoke).mockReset());
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
});
