import {invoke} from '@tauri-apps/api/core';
import {computed, onBeforeUnmount, onMounted, ref, watch, type Ref} from 'vue';

import type {ChatPage, ChatTurn} from './types';

import {useColleagues} from '../roster/useColleagues';

/** Ordered, bounded pages from one exact thread. Never starts or resumes Codex. */
export function useHereticChat(scientistId: Ref<string>, active: Ref<boolean>) {
    const colleagues = useColleagues();
    const thread = computed(
        () =>
            colleagues.connections.value.find(
                (connection) =>
                    connection.id === scientistId.value &&
                    connection.identity === 'heretic' &&
                    (connection.delivery === 'queue' || connection.delivery === 'error'),
            )?.thread ?? null,
    );
    const turns = ref<ChatTurn[]>([]);
    const olderCursor = ref<string | null>(null);
    const error = ref<string | null>(null);
    const busy = ref(false);
    const updated = ref(false);
    let generation = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const canRefresh = computed(() => !!thread.value && !busy.value && active.value);
    const accepts = (current: number, threadId: string): boolean => current === generation && threadId === thread.value;

    function applyPage(page: ChatPage, older: boolean): void {
        if (older) {
            const known = new Set(turns.value.map((turn) => turn.id));
            turns.value = [...page.turns.filter((turn) => !known.has(turn.id)), ...turns.value];
            olderCursor.value = page.nextCursor;
        } else if (page.turns.length > 0) {
            const overlap = turns.value.findIndex((turn) => turn.id === page.turns[0]?.id);
            // A disconnected window may have a gap. Offer its actual older cursor.
            if (overlap < 0) olderCursor.value = page.nextCursor;
            turns.value = [...(overlap < 0 ? [] : turns.value.slice(0, overlap)), ...page.turns];
        }
        updated.value = true;
        error.value = null;
    }

    async function refresh(older = false): Promise<void> {
        if (!canRefresh.value) return;
        if (older && !olderCursor.value) return;
        const current = generation;
        const target = thread.value;
        busy.value = true;
        try {
            const page = await invoke<ChatPage>('read_heretic_chat', {
                scientistId: scientistId.value,
                threadId: target,
                cursor: older ? olderCursor.value : null,
            });
            if (!accepts(current, page.threadId)) return;
            applyPage(page, older);
        } catch (cause) {
            if (current === generation) error.value = String(cause);
        } finally {
            if (current === generation) busy.value = false;
        }
    }

    watch(
        [scientistId, thread],
        () => {
            generation++;
            turns.value = [];
            olderCursor.value = null;
            error.value = null;
            updated.value = false;
            busy.value = false;
            void refresh();
        },
        {immediate: true},
    );
    watch(active, (visible) => {
        if (visible) void refresh();
    });
    onMounted(() => {
        timer = setInterval(() => {
            if (!error.value) void refresh();
        }, 4000);
    });
    onBeforeUnmount(() => {
        generation++;
        clearInterval(timer);
    });
    return {thread, turns, olderCursor, error, busy, updated, refresh};
}
