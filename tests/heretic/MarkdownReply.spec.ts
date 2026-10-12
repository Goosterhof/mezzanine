import {openUrl} from '@tauri-apps/plugin-opener';
import {flushPromises, mount} from '@vue/test-utils';
import {afterEach, describe, expect, it, vi} from 'vitest';

import MarkdownReply from '../../src/heretic/MarkdownReply.vue';

vi.mock('@tauri-apps/plugin-opener', () => ({openUrl: vi.fn<(url: string) => Promise<void>>(() => Promise.resolve())}));

describe('Graphite references and code', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });
    it('opens the real destination through Tauri rather than navigating the app', async () => {
        const wrapper = mount(MarkdownReply, {props: {text: '[Evidence](https://example.com/report)'}});
        await wrapper.get('a').trigger('click');
        expect(openUrl).toHaveBeenCalledWith('https://example.com/report');
        wrapper.unmount();
    });
    it('copies code text without its syntax markup and exposes failures', async () => {
        const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
        vi.stubGlobal('navigator', {clipboard: {writeText}});
        const wrapper = mount(MarkdownReply, {props: {text: '```typescript\nconst x = "<&>";\n```'}});
        await wrapper.get('[data-copy-code]').trigger('click');
        await flushPromises();
        expect(writeText).toHaveBeenCalledWith('const x = "<&>";\n');
        expect(wrapper.get('[role="status"]').text()).toBe('Code copied.');
        writeText.mockRejectedValueOnce(new Error('clipboard refused'));
        await wrapper.get('[data-copy-code]').trigger('click');
        await flushPromises();
        expect(wrapper.get('[role="status"]').text()).toContain('Could not copy');
        wrapper.unmount();
    });
});
