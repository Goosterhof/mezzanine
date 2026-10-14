<script setup lang="ts">
import {invoke} from '@tauri-apps/api/core';
import {computed, ref, watch} from 'vue';

import type {Colleague} from '../roster/types';
import type {BacklogItem} from './usePlanning';

import {useCommandDraft} from '../command/useCommandDraft';
import {useShell} from '../shell/useShell';
import {age, plain, usePlanning} from './usePlanning';

const shell = useShell();
const plan = usePlanning();
const query = ref('');
const handler = ref('');
const selected = ref<BacklogItem | null>(null);
const actionError = ref<string | null>(null);
const open = computed(() => shell.page.value === 'mission-control');
const handlers = computed(() => [...new Set(plan.snapshot.value.items.map((item) => item.handler))].sort());
const filtered = computed(() =>
    plan.snapshot.value.items.filter(
        (item) =>
            (!handler.value || item.handler === handler.value) &&
            `${item.item} ${item.source} ${item.handler}`.toLowerCase().includes(query.value.toLowerCase()),
    ),
);
const ids = computed(() => plan.snapshot.value.priorities.map((item) => item.id));
const busy = computed(() => plan.loading.value || plan.saving.value);
const present = (id: string) => plan.snapshot.value.items.some((item) => item.id === id);
watch(
    open,
    (visible) => {
        if (visible) void plan.refresh();
    },
    {immediate: true},
);
watch(
    () => plan.snapshot.value,
    (snapshot) => {
        if (selected.value)
            selected.value = snapshot.items.find((item) => item.id === selected.value?.id) ?? selected.value;
    },
);
function prioritize(item: BacklogItem): void {
    void plan.save([...ids.value, item.id]);
}
function remove(id: string): void {
    void plan.save(ids.value.filter((value) => value !== id));
}
function move(index: number, direction: number): void {
    const next = [...ids.value];
    const other = index + direction;
    if (other < 0 || other >= next.length) return;
    const a = next[index];
    const b = next[other];
    if (!a || !b) return;
    [next[index], next[other]] = [b, a];
    void plan.save(next);
}
function prepare(identity: Colleague): void {
    if (!selected.value) return;
    actionError.value = null;
    const item = selected.value;
    try {
        useCommandDraft().prepare(
            identity,
            `Work on this laboratory backlog item. Read its source and current state first.\n\n${plain(item.item)}\n\nSource: ${item.source}\nFiled: ${item.filed}; handler: ${item.handler}\nCanonical backlog: documents/lab-backlog.md`,
        );
    } catch (e) {
        actionError.value = String(e);
    }
}
async function openSource(): Promise<void> {
    actionError.value = null;
    try {
        await invoke('open_backlog_source');
    } catch (e) {
        actionError.value = String(e);
    }
}
</script>

<template>
    <section v-show="open" data-page="mission-control" class="h-full min-h-0 bg-mz-panel flex flex-col">
        <header class="flex items-center justify-between px-6 py-4 border-b border-mz-edge">
            <div>
                <div class="mz-stamp-label">Mission Control · Planning</div>
                <h2 class="font-display text-xl mt-1">What shall we put on the bench?</h2>
            </div>
            <div class="flex gap-2">
                <button class="mz-button" @click="openSource">Open source</button>
                <button class="mz-button" data-mc-refresh :disabled="busy" @click="plan.refresh()">
                    {{ plan.loading.value ? 'Reading…' : 'Refresh' }}
                </button>
            </div>
        </header>
        <p v-if="plan.error.value" role="alert" class="px-6 py-3 text-mz-pulse-crashed">{{ plan.error.value }}</p>
        <div class="planning-layout flex-1 min-h-0">
            <div class="overflow-y-auto p-6 space-y-6">
                <section>
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="mz-stamp-label">Current priorities</h3>
                        <span class="text-xs text-mz-text-mute">Your order · saved</span>
                    </div>
                    <p
                        v-if="!ids.length"
                        class="border border-dashed border-mz-edge rounded p-5 text-mz-text-mute text-sm"
                    >
                        Choose a backlog item below and make it a priority. Your next session starts here.
                    </p>
                    <ol class="space-y-2">
                        <li
                            v-for="(item, index) in plan.snapshot.value.priorities"
                            :key="item.id"
                            class="priority-row border border-mz-edge bg-mz-rail p-3 flex gap-3 items-start"
                        >
                            <span class="font-mono text-mz-brass">{{ String(index + 1).padStart(2, '0') }}</span>
                            <button class="text-left flex-1 min-w-0" @click="selected = item">
                                <span class="task-title">{{ plain(item.item) }}</span
                                ><span v-if="!present(item.id)" class="block text-mz-signal text-xs mt-1"
                                    >Changed or removed from backlog · reconcile before briefing</span
                                >
                            </button>
                            <div class="flex gap-1">
                                <button
                                    class="mz-button"
                                    :disabled="busy || index === 0"
                                    aria-label="Move priority up"
                                    @click="move(index, -1)"
                                >
                                    ↑</button
                                ><button
                                    class="mz-button"
                                    :disabled="busy || index === ids.length - 1"
                                    aria-label="Move priority down"
                                    @click="move(index, 1)"
                                >
                                    ↓</button
                                ><button
                                    class="mz-button"
                                    :disabled="busy"
                                    aria-label="Remove priority"
                                    @click="remove(item.id)"
                                >
                                    ×
                                </button>
                            </div>
                        </li>
                    </ol>
                </section>
                <section>
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="mz-stamp-label">Laboratory backlog</h3>
                        <span class="font-mono text-xs text-mz-text-mute"
                            >{{ filtered.length }} / {{ plan.snapshot.value.items.length }}</span
                        >
                    </div>
                    <div class="flex gap-2 mb-3">
                        <input
                            v-model="query"
                            class="mz-input flex-1 min-w-0"
                            placeholder="Find a task, project or source…"
                            aria-label="Search backlog"
                        /><select v-model="handler" class="mz-input max-w-48" aria-label="Filter by handler">
                            <option value="">All handlers</option>
                            <option v-for="value in handlers" :key="value">{{ value }}</option>
                        </select>
                    </div>
                    <p v-if="!filtered.length && !plan.loading.value" class="text-sm text-mz-text-mute py-4">
                        No matching backlog items.
                    </p>
                    <button
                        v-for="item in filtered"
                        :key="item.id"
                        class="backlog-row w-full text-left px-3 py-3 border-b border-mz-edge hover:bg-mz-rail"
                        :class="{'bg-mz-rail': selected?.id === item.id}"
                        @click="selected = item"
                    >
                        <span class="task-title">{{ plain(item.item) }}</span
                        ><span class="block text-xs text-mz-text-mute mt-2"
                            >{{ item.handler }} · {{ age(item.filed) }} old
                            <span v-if="ids.includes(item.id)" class="text-mz-brass"
                                >· Priority {{ ids.indexOf(item.id) + 1 }}</span
                            ></span
                        >
                    </button>
                </section>
            </div>
            <aside class="border-l border-mz-edge p-6 overflow-y-auto bg-mz-rail">
                <template v-if="selected">
                    <div class="mz-stamp-label mb-3">The brief</div>
                    <h3 class="text-base leading-relaxed whitespace-pre-wrap">{{ plain(selected.item) }}</h3>
                    <dl class="text-xs mt-5 space-y-3 text-mz-text-mute">
                        <div>
                            <dt class="mz-stamp-label">Filed</dt>
                            <dd>{{ selected.filed }}</dd>
                        </div>
                        <div>
                            <dt class="mz-stamp-label">Handler</dt>
                            <dd>{{ selected.handler }}</dd>
                        </div>
                        <div>
                            <dt class="mz-stamp-label">Source</dt>
                            <dd class="break-words mt-1">{{ selected.source }}</dd>
                        </div>
                    </dl>
                    <div class="flex flex-wrap gap-2 mt-5">
                        <button
                            v-if="!ids.includes(selected.id)"
                            class="mz-button"
                            :disabled="busy || !present(selected.id)"
                            @click="prioritize(selected)"
                        >
                            Make a priority</button
                        ><button v-else class="mz-button" :disabled="busy" @click="remove(selected.id)">
                            Remove priority</button
                        ><button class="mz-button" @click="openSource">Open backlog source</button>
                    </div>
                    <div class="mt-8">
                        <div class="mz-stamp-label mb-3">Prepare brief</div>
                        <div class="flex flex-wrap gap-2">
                            <button
                                class="mz-button"
                                :disabled="!present(selected.id)"
                                @click="prepare('mad-scientist')"
                            >
                                Mad Scientist</button
                            ><button class="mz-button" :disabled="!present(selected.id)" @click="prepare('heretic')">
                                Heretic
                            </button>
                        </div>
                        <p class="text-xs text-mz-text-mute mt-3">
                            Added to your conversation draft. You decide when to send.
                        </p>
                    </div>
                </template>
                <p v-else class="text-mz-text-mute text-sm leading-relaxed">
                    Select a task to read its context, put it among your priorities, or prepare a brief for either
                    colleague.
                </p>
                <p v-if="actionError" role="alert" class="text-sm text-mz-pulse-crashed mt-4">{{ actionError }}</p>
            </aside>
        </div>
    </section>
</template>
<style scoped>
.planning-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
}
.task-title {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 13px;
    line-height: 1.6;
}
@media (max-width: 800px) {
    .planning-layout {
        grid-template-columns: 1fr;
        overflow-y: auto;
    }
    .planning-layout > * {
        overflow: visible;
    }
}
</style>
