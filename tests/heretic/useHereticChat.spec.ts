import {invoke} from '@tauri-apps/api/core';
import {flushPromises, mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, nextTick, ref} from 'vue';

import type {ChatPage} from '../../src/heretic/types';

import {useHereticChat} from '../../src/heretic/useHereticChat';
import {useColleagues} from '../../src/roster/useColleagues';

function page(ids: string[], cursor: string | null = null, threadId = 'thread-a'): ChatPage {
    return {threadId, turns: ids.map((id) => ({id, items: [], omittedItems: 0})), nextCursor: cursor};
}
function bind(id = 'heretic', thread = 'thread-a'): void {
    useColleagues().connections.value = [{id, thread, identity: 'heretic', delivery: 'queue', error: null}];
}

describe('the exact Heretic reading view', () => {
    let wrapper: ReturnType<typeof mount>;
    const scientist = ref('heretic');
    const active = ref(true);
    let chat: ReturnType<typeof useHereticChat>;
    function open(): void {
        wrapper = mount(
            defineComponent({
                setup() {
                    chat = useHereticChat(scientist, active);
                    return () => null;
                },
            }),
        );
    }
    beforeEach(() => {
        vi.useFakeTimers();
        useColleagues().reset();
        scientist.value = 'heretic';
        active.value = true;
        vi.mocked(invoke)
            .mockReset()
            .mockResolvedValue(page(['b', 'c'], 'older'));
    });
    afterEach(() => {
        wrapper.unmount();
        vi.useRealTimers();
    });

    it('never substitutes another connection and pauses polling when hidden', async () => {
        bind('some-other-heretic');
        open();
        await flushPromises();
        expect(invoke).not.toHaveBeenCalled();
        bind();
        await flushPromises();
        expect(invoke).toHaveBeenCalledWith('read_heretic_chat', {
            scientistId: 'heretic',
            threadId: 'thread-a',
            cursor: null,
        });
        active.value = false;
        await nextTick();
        await vi.advanceTimersByTimeAsync(12000);
        expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('merges older pages without duplicates, replaces updated turns, and does not invent a missing gap', async () => {
        bind();
        open();
        await flushPromises();
        vi.mocked(invoke).mockResolvedValueOnce(page(['a', 'b']));
        await chat.refresh(true);
        expect(chat.turns.value.map((turn) => turn.id)).toStrictEqual(['a', 'b', 'c']);
        vi.mocked(invoke).mockResolvedValueOnce(page(['b', 'c', 'd'], 'older-b'));
        await chat.refresh();
        expect(chat.turns.value.map((turn) => turn.id)).toStrictEqual(['a', 'b', 'c', 'd']);
        expect(chat.olderCursor.value).toBeNull();
        vi.mocked(invoke).mockResolvedValueOnce(page(['x', 'y'], 'gap'));
        await chat.refresh();
        expect(chat.turns.value.map((turn) => turn.id)).toStrictEqual(['x', 'y']);
        expect(chat.olderCursor.value).toBe('gap');
    });

    it('ignores an old response after the scientist/thread changes', async () => {
        let finish: ((value: ChatPage) => void) | undefined;
        vi.mocked(invoke).mockReturnValueOnce(
            new Promise<ChatPage>((resolve) => {
                finish = resolve;
            }),
        );
        bind();
        open();
        await nextTick();
        vi.mocked(invoke).mockResolvedValue(page(['new'], null, 'thread-b'));
        scientist.value = 'replacement';
        bind('replacement', 'thread-b');
        await flushPromises();
        finish?.(page(['old']));
        await flushPromises();
        expect(chat.turns.value.map((turn) => turn.id)).toStrictEqual(['new']);
    });

    it('retains the last good view and exposes a failed read for retry', async () => {
        bind();
        open();
        await flushPromises();
        vi.mocked(invoke).mockRejectedValueOnce(new Error('pipe closed'));
        await chat.refresh();
        expect(chat.turns.value.map((turn) => turn.id)).toStrictEqual(['b', 'c']);
        expect(chat.error.value).toContain('pipe closed');
        await chat.refresh();
        expect(chat.error.value).toBeNull();
    });
});
