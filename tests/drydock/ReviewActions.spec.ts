import {invoke} from '@tauri-apps/api/core';
import {mount, flushPromises} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {DrydockPullRequest} from '../../src/drydock/types';

import ReviewActions from '../../src/drydock/ReviewActions.vue';
import {useDrydock} from '../../src/drydock/useDrydock';

const mockedInvoke = vi.mocked(invoke);

const PR: DrydockPullRequest = {
    repoFullName: 'Goosterhof/zmuuzn-strava',
    repoLabel: 'The Crucible',
    repoLocalPath: 'experiments/zmuuzn-strava',
    experimentScope: 'crucible',
    number: 7,
    title: 't',
    author: 'g',
    headRef: 'b',
    isDraft: false,
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    url: 'https://x',
};

describe('ReviewActions', () => {
    beforeEach(() => {
        useDrydock().reset();
        mockedInvoke.mockReset();
        mockedInvoke.mockImplementation(() => Promise.resolve(undefined));
    });

    it('Approve sends approve_pr with the entered body', async () => {
        const wrapper = mount(ReviewActions, {props: {pr: PR}});
        await wrapper.find('[data-test="review-body"]').setValue('LGTM');
        await wrapper.find('[data-test="review-approve"]').trigger('click');
        await flushPromises();

        const approveCall = mockedInvoke.mock.calls.find(([cmd]) => cmd === 'approve_pr');
        expect(approveCall).toBeDefined();
        expect(approveCall?.[1]).toStrictEqual({repoFullName: PR.repoFullName, number: PR.number, body: 'LGTM'});
        wrapper.unmount();
    });

    it('Approve allows an empty body — the verdict speaks for itself', async () => {
        const wrapper = mount(ReviewActions, {props: {pr: PR}});
        await wrapper.find('[data-test="review-approve"]').trigger('click');
        await flushPromises();

        const cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
        expect(cmds).toContain('approve_pr');
        expect(wrapper.find('[data-test="review-error"]').exists()).toBe(false);
        wrapper.unmount();
    });

    it('Comment requires a body and surfaces an inline error when empty', async () => {
        const wrapper = mount(ReviewActions, {props: {pr: PR}});
        await wrapper.find('[data-test="review-comment"]').trigger('click');
        await flushPromises();

        const cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
        expect(cmds).not.toContain('comment_pr');
        const err = wrapper.find('[data-test="review-error"]');
        expect(err.exists()).toBe(true);
        expect(err.text()).toContain('body is required');
        wrapper.unmount();
    });

    it('Request Changes requires a body', async () => {
        const wrapper = mount(ReviewActions, {props: {pr: PR}});
        await wrapper.find('[data-test="review-request-changes"]').trigger('click');
        await flushPromises();

        const cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
        expect(cmds).not.toContain('request_changes_pr');
        wrapper.unmount();
    });

    it('Comment with a body routes to comment_pr', async () => {
        const wrapper = mount(ReviewActions, {props: {pr: PR}});
        await wrapper.find('[data-test="review-body"]').setValue('A note.');
        await wrapper.find('[data-test="review-comment"]').trigger('click');
        await flushPromises();

        const cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
        expect(cmds).toContain('comment_pr');
        wrapper.unmount();
    });

    it('Request Changes with a body routes to request_changes_pr', async () => {
        const wrapper = mount(ReviewActions, {props: {pr: PR}});
        await wrapper.find('[data-test="review-body"]').setValue('Tighten this.');
        await wrapper.find('[data-test="review-request-changes"]').trigger('click');
        await flushPromises();

        const cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
        expect(cmds).toContain('request_changes_pr');
        wrapper.unmount();
    });

    it('clears the body after a successful submit', async () => {
        const wrapper = mount(ReviewActions, {props: {pr: PR}});
        const textarea = wrapper.find<HTMLTextAreaElement>('[data-test="review-body"]');
        await textarea.setValue('thought');
        await wrapper.find('[data-test="review-approve"]').trigger('click');
        await flushPromises();

        expect(textarea.element.value).toBe('');
        wrapper.unmount();
    });

    it('surfaces backend errors inline without crashing the panel', async () => {
        mockedInvoke.mockReset();
        mockedInvoke.mockRejectedValueOnce(new Error('gh refused'));
        const wrapper = mount(ReviewActions, {props: {pr: PR}});
        await wrapper.find('[data-test="review-approve"]').trigger('click');
        await flushPromises();

        const err = wrapper.find('[data-test="review-error"]');
        expect(err.exists()).toBe(true);
        expect(err.text()).toContain('gh refused');
        wrapper.unmount();
    });
});
