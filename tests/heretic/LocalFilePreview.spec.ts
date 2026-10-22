import {invoke} from '@tauri-apps/api/core';
import {flushPromises, mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import LocalFilePreview from '../../src/heretic/LocalFilePreview.vue';
import MarkdownReply from '../../src/heretic/MarkdownReply.vue';

vi.mock('@tauri-apps/plugin-opener', () => ({openUrl: vi.fn<(url: string) => Promise<void>>()}));
const path = '/home/lab/output/tavern.png';
describe('Conversation file preview', () => {
    beforeEach(() => {
        vi.mocked(invoke).mockReset();
        HTMLDialogElement.prototype.showModal = vi.fn<(this: HTMLDialogElement) => void>(function (
            this: HTMLDialogElement,
        ) {
            this.open = true;
        });
        HTMLDialogElement.prototype.close = vi.fn<(this: HTMLDialogElement) => void>(function (
            this: HTMLDialogElement,
        ) {
            this.open = false;
        });
        vi.stubGlobal(
            'URL',
            Object.assign(URL, {
                createObjectURL: vi.fn<() => string>(() => 'blob:preview'),
                revokeObjectURL: vi.fn<(url: string) => void>(),
            }),
        );
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });
    it('loads only on click, fits/zooms, reveals without executing, and revokes on close', async () => {
        vi.mocked(invoke).mockResolvedValue(new ArrayBuffer(8));
        const wrapper = mount(MarkdownReply, {props: {text: `[Tavern](${path})`}});
        expect(invoke).not.toHaveBeenCalled();
        await wrapper.get('a').trigger('click');
        await flushPromises();
        expect(invoke).toHaveBeenCalledWith('read_chat_image', {path});
        expect(wrapper.get('dialog').attributes('open')).toBeDefined();
        expect(wrapper.get('img').attributes('src')).toBe('blob:preview');
        const buttons = wrapper.findAll('dialog button');
        await buttons.find((b) => b.text() === 'Actual size')!.trigger('click');
        expect(wrapper.find('.graphite-image-actual').exists()).toBe(true);
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Fit image')!
            .trigger('click');
        expect(wrapper.find('.graphite-image-actual').exists()).toBe(false);
        await buttons.find((b) => b.text() === 'Show in folder')!.trigger('click');
        await flushPromises();
        expect(invoke).toHaveBeenCalledWith('reveal_chat_file', {path});
        await wrapper.get('[aria-label="Close preview"]').trigger('click');
        expect(wrapper.find('dialog').exists()).toBe(false);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
        wrapper.unmount();
    });
    it('shows native refusal and retries, and handles a bad image decoder', async () => {
        vi.mocked(invoke).mockRejectedValueOnce('Outside the laboratory').mockResolvedValue(new ArrayBuffer(8));
        const wrapper = mount(LocalFilePreview, {props: {path}});
        await flushPromises();
        expect(wrapper.get('[role="alert"]').text()).toContain('Outside the laboratory');
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Retry image')!
            .trigger('click');
        await flushPromises();
        await wrapper.get('img').trigger('error');
        expect(wrapper.get('[role="alert"]').text()).toContain('could not be displayed');
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
        wrapper.unmount();
    });
    it('does not load non-images and reports reveal failures', async () => {
        vi.mocked(invoke).mockRejectedValue('Missing file');
        const wrapper = mount(LocalFilePreview, {props: {path: '/home/lab/readme.md'}});
        await flushPromises();
        expect(invoke).not.toHaveBeenCalled();
        expect(wrapper.text()).toContain('Show in folder');
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Show in folder')!
            .trigger('click');
        await flushPromises();
        expect(wrapper.get('[role="alert"]').text()).toContain('Missing file');
        await wrapper.get('dialog').trigger('close');
        expect(wrapper.emitted('close')).toHaveLength(1);
        wrapper.unmount();
    });
    it('ignores an image response arriving after the dialog was closed', async () => {
        let finish!: (value: ArrayBuffer) => void;
        vi.mocked(invoke).mockImplementation(
            () =>
                new Promise<ArrayBuffer>((resolve) => {
                    finish = resolve;
                }),
        );
        const wrapper = mount(LocalFilePreview, {props: {path}});
        wrapper.unmount();
        finish(new ArrayBuffer(8));
        await flushPromises();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });
});
