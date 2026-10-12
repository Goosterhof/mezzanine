<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue';

import type {ChatItem, ChatTurn, PinnedReply} from './types';

import MarkdownReply from './MarkdownReply.vue';
import {useHereticChat} from './useHereticChat';
import './graphite.css';

const {scientistId, active} = defineProps<{scientistId: string; active: boolean}>();
const chat = useHereticChat(
    computed(() => scientistId),
    computed(() => active),
);
const viewport = ref<HTMLElement | null>(null);
const margin = ref(false);
const compact = ref(false);
const pins = ref<PinnedReply[]>([]);
const follow = ref(true);
const selectedPin = ref<PinnedReply | null>(null);
const expanded = ref(new Set<string>());
const itemsCount = computed(() => chat.turns.value.reduce((sum, turn) => sum + turn.items.length, 0));

function noteScroll(): void {
    const el = viewport.value;
    if (el) follow.value = el.scrollHeight - el.clientHeight - el.scrollTop < 48;
}
function latest(): void {
    selectedPin.value = null;
    follow.value = true;
    void nextTick(() => {
        if (viewport.value) viewport.value.scrollTop = viewport.value.scrollHeight;
    });
}
function togglePin(turnId: string, item: ChatItem): void {
    const index = pins.value.findIndex((pin) => pin.turnId === turnId && pin.item.id === item.id);
    if (index < 0) pins.value.push({turnId, item: {...item}});
    else pins.value.splice(index, 1);
}
function isPinned(turnId: string, item: ChatItem): boolean {
    return pins.value.some((pin) => pin.turnId === turnId && pin.item.id === item.id);
}
function toggleWork(turnId: string): void {
    const next = new Set(expanded.value);
    if (next.has(turnId)) next.delete(turnId);
    else next.add(turnId);
    expanded.value = next;
}
function messages(turn: ChatTurn): ChatItem[] {
    return turn.items.filter((item) => item.kind !== 'tool');
}
function tools(turn: ChatTurn): ChatItem[] {
    return turn.items.filter((item) => item.kind === 'tool');
}
async function older(): Promise<void> {
    const el = viewport.value;
    const height = el?.scrollHeight ?? 0;
    follow.value = false;
    await chat.refresh(true);
    await nextTick();
    if (el) el.scrollTop += el.scrollHeight - height;
}
watch(chat.turns, async () => {
    const shouldFollow = follow.value;
    await nextTick();
    if (shouldFollow && viewport.value) viewport.value.scrollTop = viewport.value.scrollHeight;
});
watch(chat.thread, () => {
    pins.value = [];
    selectedPin.value = null;
    expanded.value = new Set();
    follow.value = true;
});
</script>

<template>
    <section
        class="graphite"
        :class="{'graphite-compact': compact}"
        aria-label="Heretic conversation"
        data-heretic-chat
    >
        <header class="graphite-toolbar">
            <span class="graphite-handwriting">The Heretic’s margin</span>
            <div>
                <button :aria-pressed="compact" @click="compact = !compact">
                    {{ compact ? 'Comfort' : 'Compact' }}
                </button>
                <button :aria-expanded="margin" @click="margin = !margin">Margin · {{ pins.length }}</button>
            </div>
        </header>
        <aside v-if="margin" class="graphite-margin" aria-label="Pinned replies">
            <div class="graphite-eyebrow">
                THIS CONVERSATION <button aria-label="Close margin" @click="margin = false">×</button>
            </div>
            <p v-if="!pins.length">Pin a reply to keep it within reach.</p>
            <button
                v-for="pin in pins"
                :key="`${pin.turnId}:${pin.item.id}`"
                @click="
                    selectedPin = pin;
                    margin = false;
                "
            >
                {{ pin.item.text.slice(0, 110) }}{{ pin.item.text.length > 110 ? '…' : '' }}
            </button>
        </aside>
        <div ref="viewport" class="graphite-reader" tabindex="0" @scroll="noteScroll">
            <div v-if="chat.error.value" class="graphite-notice" role="alert">
                <p>The reading view could not update. The CLI controls below are still available.</p>
                <details>
                    <summary>Details</summary>
                    {{ chat.error.value }}
                </details>
                <button :disabled="chat.busy.value" @click="chat.refresh()">Retry</button>
            </div>
            <div v-if="selectedPin" class="graphite-pinned-reply">
                <div class="graphite-eyebrow">
                    PINNED REPLY <button @click="selectedPin = null">Back to conversation</button>
                </div>
                <MarkdownReply :text="selectedPin.item.text" />
            </div>
            <template v-else>
                <button v-if="chat.olderCursor.value" class="graphite-older" :disabled="chat.busy.value" @click="older">
                    Load earlier replies ↑
                </button>
                <div v-if="!itemsCount && !chat.error.value" class="graphite-empty">
                    <span class="graphite-eyebrow">THE HERETIC</span>
                    <h2>A little room<br />for a better idea.</h2>
                    <p>
                        {{
                            chat.thread.value
                                ? 'Waiting for the first recorded reply…'
                                : 'The reading view will join this conversation when its Speaking Tube connects.'
                        }}
                    </p>
                    <p class="graphite-subtle">The CLI below handles sign-in, questions, and permissions.</p>
                </div>
                <article v-for="turn in chat.turns.value" :key="turn.id" class="graphite-turn">
                    <p v-if="turn.omittedItems" class="graphite-subtle">
                        {{ turn.omittedItems }} earlier items in this long turn are available in the CLI transcript.
                    </p>
                    <div
                        v-for="item in messages(turn)"
                        :key="item.id"
                        class="graphite-message"
                        :class="[`graphite-${item.kind}`, {'graphite-progress': item.phase === 'commentary'}]"
                    >
                        <div class="graphite-message-label">
                            <span class="graphite-eyebrow">{{
                                item.kind === 'user'
                                    ? 'YOU'
                                    : item.phase === 'commentary'
                                      ? '↳ PROGRESS'
                                      : 'THE HERETIC'
                            }}</span>
                            <button
                                v-if="item.kind === 'assistant' && item.phase !== 'commentary'"
                                :aria-pressed="isPinned(turn.id, item)"
                                @click="togglePin(turn.id, item)"
                            >
                                {{ isPinned(turn.id, item) ? '◆ Pinned' : '◇ Pin reply' }}
                            </button>
                        </div>
                        <MarkdownReply :text="item.text" />
                        <p v-if="item.truncated" class="graphite-subtle">
                            Long message shortened here. Its full text remains in the CLI transcript.
                        </p>
                    </div>
                    <section v-if="tools(turn).length" class="graphite-work">
                        <button :aria-expanded="expanded.has(turn.id)" @click="toggleWork(turn.id)">
                            <span>↳ {{ tools(turn).length }} recorded work steps</span
                            ><span>{{ expanded.has(turn.id) ? '⌃' : '⌄' }}</span>
                        </button>
                        <div v-if="expanded.has(turn.id)">
                            <details v-for="item in tools(turn)" :key="item.id">
                                <summary>{{ item.label || 'Work detail' }}</summary>
                                <pre tabindex="0">{{ item.text || 'No output recorded.' }}</pre>
                                <p v-if="item.truncated" class="graphite-subtle">
                                    Output shortened. Full details are in the CLI transcript.
                                </p>
                            </details>
                        </div>
                    </section>
                </article>
            </template>
        </div>
        <footer class="graphite-status">
            <span>{{
                chat.error.value
                    ? 'Updates paused · retry available'
                    : chat.updated.value
                      ? 'Recorded replies · refreshes every 4s'
                      : 'Connecting the reading view…'
            }}</span
            ><button @click="latest">{{ follow ? 'Latest ↓' : 'Return to latest ↓' }}</button>
        </footer>
    </section>
</template>
