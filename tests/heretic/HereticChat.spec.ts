import {enableAutoUnmount, flushPromises, mount, type VueWrapper} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {computed, nextTick, ref} from 'vue';

import type {ChatItem, ChatTurn} from '../../src/heretic/types';

import HereticChat from '../../src/heretic/HereticChat.vue';
import {useHereticChat} from '../../src/heretic/useHereticChat';

vi.mock('../../src/heretic/useHereticChat', () => ({useHereticChat: vi.fn<typeof useHereticChat>()}));
enableAutoUnmount(afterEach);

function readingState() {
    const threadId = ref<string | null>(null);
    return {
        threadId,
        thread: computed(() => threadId.value),
        turns: ref<ChatTurn[]>([]),
        olderCursor: ref<string | null>(null),
        error: ref<string | null>(null),
        busy: ref(false),
        updated: ref(false),
        refresh: vi.fn<(older?: boolean) => Promise<void>>().mockResolvedValue(undefined),
    };
}
function item(id: string, kind: ChatItem['kind'], text: string, extra: Partial<ChatItem> = {}): ChatItem {
    return {id, kind, text, label: '', phase: null, truncated: false, ...extra};
}
function turn(id = 'turn-a', text = 'A useful recorded reply.'): ChatTurn {
    return {id, omittedItems: 0, items: [item('reply', 'assistant', text)]};
}
function button(wrapper: Pick<VueWrapper, 'findAll'>, label: string) {
    return wrapper.findAll('button').find((b) => b.text() === label)!;
}
function open() {
    return mount(HereticChat, {
        props: {scientistId: 'heretic-a', active: true},
        global: {stubs: {MarkdownReply: {props: ['text'], template: '<div data-reply>{{ text }}</div>'}}},
    });
}

describe('Graphite reading controls', () => {
    let chat: ReturnType<typeof readingState>;
    beforeEach(() => {
        chat = readingState();
        vi.mocked(useHereticChat).mockReset().mockReturnValue(chat);
    });

    it('distinguishes connecting, connected-empty and recorded views, and keeps reader preferences local', async () => {
        const wrapper = open();
        expect(wrapper.text()).toContain('when its Speaking Tube connects');
        const args = vi.mocked(useHereticChat).mock.calls[0]!;
        expect(args[0].value).toBe('heretic-a');
        expect(args[1].value).toBe(true);
        await wrapper.setProps({scientistId: 'heretic-b', active: false});
        expect(args[0].value).toBe('heretic-b');
        expect(args[1].value).toBe(false);
        chat.threadId.value = 'thread-b';
        await nextTick();
        expect(wrapper.text()).toContain('Waiting for the first recorded reply');
        await button(wrapper, 'Compact').trigger('click');
        expect(wrapper.classes()).toContain('graphite-compact');
        expect(button(wrapper, 'Comfort').attributes('aria-pressed')).toBe('true');
        await button(wrapper, 'Comfort').trigger('click');
        expect(wrapper.classes()).not.toContain('graphite-compact');
        await button(wrapper, 'Margin · 0').trigger('click');
        expect(wrapper.get('[aria-label="Pinned replies"]').text()).toContain('Pin a reply');
        await wrapper.get('[aria-label="Close margin"]').trigger('click');
        expect(wrapper.find('[aria-label="Pinned replies"]').exists()).toBe(false);
        chat.turns.value = [turn()];
        chat.updated.value = true;
        await nextTick();
        expect(wrapper.find('.graphite-empty').exists()).toBe(false);
        expect(wrapper.text()).toContain('Recorded replies · refreshes every 4s');
    });

    it('distinguishes investor text, progress, final replies and folded work with truncation notices', async () => {
        chat.turns.value = [
            {
                id: 'mixed',
                omittedItems: 3,
                items: [
                    item('user', 'user', 'Inspect the plan'),
                    item('progress', 'assistant', 'Reading files', {phase: 'commentary'}),
                    item('answer', 'assistant', 'The result', {truncated: true}),
                    item('tool-a', 'tool', 'Test output', {label: 'Run tests', truncated: true}),
                    item('tool-b', 'tool', ''),
                ],
            },
        ];
        const wrapper = open();
        expect(wrapper.text()).toContain('3 earlier items');
        expect(wrapper.findAll('.graphite-message-label span').map((el) => el.text())).toStrictEqual([
            'YOU',
            '↳ PROGRESS',
            'THE HERETIC',
        ]);
        expect(wrapper.findAll('.graphite-message-label button')).toHaveLength(1);
        expect(wrapper.text()).toContain('Long message shortened');
        const work = wrapper.get('.graphite-work > button');
        expect(work.attributes('aria-expanded')).toBe('false');
        expect(wrapper.find('.graphite-work pre').exists()).toBe(false);
        await work.trigger('click');
        expect(work.attributes('aria-expanded')).toBe('true');
        expect(wrapper.findAll('.graphite-work summary').map((el) => el.text())).toStrictEqual([
            'Run tests',
            'Work detail',
        ]);
        expect(wrapper.findAll('.graphite-work pre').map((el) => el.text())).toStrictEqual([
            'Test output',
            'No output recorded.',
        ]);
        expect(wrapper.text()).toContain('Output shortened');
        await work.trigger('click');
        expect(wrapper.find('.graphite-work pre').exists()).toBe(false);
    });

    it('keeps pinned snapshots after a refreshed reply and clears them when the thread changes', async () => {
        chat.threadId.value = 'thread-a';
        const longReply = 'A'.repeat(120);
        chat.turns.value = [turn('a', longReply), turn('b', 'Short reply')];
        const wrapper = open();
        await wrapper.findAll('.graphite-message-label button')[0]!.trigger('click');
        await wrapper.findAll('.graphite-message-label button')[1]!.trigger('click');
        await button(wrapper, 'Margin · 2').trigger('click');
        const choices = wrapper.findAll('.graphite-margin > button');
        expect(choices.map((b) => b.text())).toStrictEqual([`${'A'.repeat(110)}…`, 'Short reply']);
        await choices[0]!.trigger('click');
        expect(wrapper.get('.graphite-pinned-reply [data-reply]').text()).toBe(longReply);
        expect(wrapper.find('.graphite-margin').exists()).toBe(false);
        chat.turns.value = [turn('a', 'Updated reply'), turn('b', 'Short reply')];
        await nextTick();
        expect(wrapper.get('.graphite-pinned-reply [data-reply]').text()).toBe(longReply);
        await button(wrapper, 'Back to conversation').trigger('click');
        expect(wrapper.text()).toContain('Updated reply');
        await wrapper.findAll('.graphite-message-label button')[0]!.trigger('click');
        expect(button(wrapper, 'Margin · 1').exists()).toBe(true);
        await button(wrapper, 'Margin · 1').trigger('click');
        await wrapper.get('.graphite-margin > button').trigger('click');
        chat.threadId.value = 'thread-b';
        chat.turns.value = [];
        await nextTick();
        expect(wrapper.find('.graphite-pinned-reply').exists()).toBe(false);
        expect(button(wrapper, 'Margin · 0').exists()).toBe(true);
    });

    it('retains readable replies on error and disables retry during an active read', async () => {
        chat.turns.value = [turn()];
        chat.error.value = 'Reader disconnected';
        chat.busy.value = true;
        const wrapper = open();
        expect(wrapper.get('[role="alert"]').text()).toContain('Reader disconnected');
        expect(wrapper.text()).toContain('A useful recorded reply');
        expect(wrapper.text()).toContain('Updates paused · retry available');
        expect(button(wrapper, 'Retry').attributes('disabled')).toBeDefined();
        chat.busy.value = false;
        await nextTick();
        await button(wrapper, 'Retry').trigger('click');
        expect(chat.refresh).toHaveBeenCalledWith();
        chat.error.value = null;
        chat.updated.value = true;
        await nextTick();
        expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    });

    it('preserves the reading position on older pages and follows new replies only at the live end', async () => {
        chat.turns.value = [turn()];
        chat.olderCursor.value = 'older-page';
        const wrapper = open();
        const viewport = wrapper.get('.graphite-reader').element as HTMLElement;
        let height = 1000;
        Object.defineProperties(viewport, {scrollHeight: {get: () => height}, clientHeight: {value: 400}});
        viewport.scrollTop = 200;
        await wrapper.get('.graphite-reader').trigger('scroll');
        expect(button(wrapper, 'Return to latest ↓').exists()).toBe(true);
        chat.refresh.mockImplementation((older) => {
            expect(older).toBe(true);
            height = 1500;
            chat.turns.value = [turn('earlier'), ...chat.turns.value];
            chat.olderCursor.value = null;
            return Promise.resolve();
        });
        await button(wrapper, 'Load earlier replies ↑').trigger('click');
        await flushPromises();
        expect(viewport.scrollTop).toBe(700);
        expect(wrapper.find('.graphite-older').exists()).toBe(false);
        chat.turns.value = [...chat.turns.value, turn('new')];
        await flushPromises();
        expect(viewport.scrollTop).toBe(700);
        await button(wrapper, 'Return to latest ↓').trigger('click');
        await flushPromises();
        expect(viewport.scrollTop).toBe(1500);
        viewport.scrollTop = 1100;
        await wrapper.get('.graphite-reader').trigger('scroll');
        height = 1600;
        chat.turns.value = [...chat.turns.value, turn('newer')];
        await flushPromises();
        expect(viewport.scrollTop).toBe(1600);
    });
});
